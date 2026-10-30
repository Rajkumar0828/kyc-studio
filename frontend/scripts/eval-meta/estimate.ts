import fs from "node:fs";
import path from "node:path";
import { buildRequest, META_PROMPTS, META_SCHEMAS, type ChatRequest, type MetaProviderOptions, type MetaStep } from "../../src/lib/ai/meta";
import type { InputFile } from "../../src/lib/ai/types";
import { getMeta } from "../../src/lib/meta/client";
import { decide, scoreRisk } from "../../src/lib/pipeline/risk";
import type { Check } from "../../src/lib/pipeline/types";
import type { PolicySpec } from "../../src/lib/policy/schema";
import { cacheKey } from "./cache";

// Pre-run cost estimate. Meta documents no token-count endpoint for Chat
// Completions (the format the provider uses), so each request is converted to
// the Responses format and counted with POST /v1/responses/input_tokens. The
// docs say these counts include Meta-injected context and are for context fit,
// not billing, so treat them as approximate. Output is bounded by
// max_completion_tokens, which is used as the worst case.

export interface Prices {
  input: number; // USD per 1M tokens
  cachedInput: number;
  output: number; // also applies to reasoning tokens
}
// muse-spark-1.3 standard mode, from https://dev.meta.ai/docs/pricing-rate-limits (checked 2026-10-30).
export const DEFAULT_PRICES: Prices = { input: 1.25, cachedInput: 0.15, output: 4.25 };
export const PRICES_SOURCE = "https://dev.meta.ai/docs/pricing-rate-limits, checked 2026-10-30";
export const COUNT_DISCLOSURE =
  "Meta's token-counting docs (https://dev.meta.ai/docs/token-counting, checked 2026-10-30) do not say whether count requests are billed or rate-limited; " +
  "they only say counting does not generate output or record generation usage. This report does not assume they are free.";

export const usdOf = (p: Prices, input: number, cachedInput: number, output: number) =>
  ((input - cachedInput) * p.input + cachedInput * p.cachedInput + output * p.output) / 1e6;

// One request the run is expected to make.
export interface PlannedCall {
  caseId: string;
  doc: string | null;
  step: MetaStep;
  basis: "exact" | "approx"; // approx: the real body depends on earlier model output
  body: ChatRequest;
}

export interface CaseForPlan {
  caseId: string;
  policy: PolicySpec;
  expectedDecision: string;
  expectedCodes: string[];
  docs: Array<{ name: string; file: InputFile; documentType: string; truth: Record<string, { found: boolean; value: string; normalized: string }> }>;
  qualityChecks: Check[]; // from the real, local quality gate
}

export function planCase(c: CaseForPlan, opts: MetaProviderOptions): PlannedCall[] {
  const calls: PlannedCall[] = [];
  const add = (step: MetaStep, basis: PlannedCall["basis"], text: string, doc: CaseForPlan["docs"][number] | null) =>
    calls.push({ caseId: c.caseId, doc: doc?.name ?? null, step, basis, body: buildRequest(step, META_SCHEMAS[step], text, doc?.file, opts) });

  if (c.qualityChecks.length) {
    // The gate stops the pipeline, but finish() still asks for a summary and customer guidance.
    // Both inputs are deterministic here, so these bodies are exact.
    const { score, reasons } = scoreRisk(c.qualityChecks);
    const decision = decide(c.qualityChecks, score, c.policy);
    add("summary", "exact", META_PROMPTS.summary(score, decision, reasons), null);
    if (decision === "request_info") add("guidance", "exact", META_PROMPTS.guidance(c.qualityChecks.map((q) => q.message)), null);
    return calls;
  }
  for (const d of c.docs) add("doc_class", "exact", META_PROMPTS.doc_class(), d);
  for (const d of c.docs) add("extraction", "approx", META_PROMPTS.extraction(d.documentType), d); // exact if classified correctly
  for (const field of ["full_name", "address"] as const) {
    if (!c.expectedCodes.includes(`${field}_mismatch`)) continue;
    const [a, b] = c.docs.map((d) => d.truth[field]?.value ?? "");
    add("compare", "approx", META_PROMPTS.compare(field, a, b), null);
  }
  add("summary", "approx", META_PROMPTS.summary(0, c.expectedDecision, c.expectedCodes), null);
  if (c.expectedDecision === "request_info") add("guidance", "approx", META_PROMPTS.guidance(c.expectedCodes), null);
  return calls;
}

// Chat Completions body -> Responses input_tokens body (same text, image, schema and effort).
function toResponsesCount(body: ChatRequest) {
  const parts = (body.messages[0].content as Array<{ type: string; text?: string; image_url?: { url: string } }>).map((p) =>
    p.type === "text" ? { type: "input_text", text: p.text } : { type: "input_image", image_url: p.image_url!.url, detail: "auto" });
  const fmt = body.response_format as { json_schema: { name: string; strict: boolean; schema: object } };
  return {
    model: body.model,
    input: [{ role: "user", content: parts }],
    reasoning: { effort: body.reasoning_effort },
    text: { format: { type: "json_schema", name: fmt.json_schema.name, strict: fmt.json_schema.strict, schema: fmt.json_schema.schema } },
  };
}

export function createCounter(cacheDir: string) {
  let live = 0, cached = 0;
  fs.mkdirSync(cacheDir, { recursive: true });
  return {
    async count(body: ChatRequest): Promise<{ tokens: number | null; error?: string }> {
      const file = path.join(cacheDir, `${cacheKey(body)}.json`);
      if (fs.existsSync(file)) {
        cached++;
        return { tokens: (JSON.parse(fs.readFileSync(file, "utf8")) as { inputTokens: number }).inputTokens };
      }
      live++;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = await getMeta().responses.inputTokens.count(toResponsesCount(body) as any);
        fs.writeFileSync(file, JSON.stringify({ inputTokens: r.input_tokens, countedAt: new Date().toISOString() }));
        return { tokens: r.input_tokens };
      } catch (e) {
        return { tokens: null, error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) };
      }
    },
    stats: () => ({ live, cached }),
  };
}
