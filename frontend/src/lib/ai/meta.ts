import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { CompletionUsage } from "openai/resources/completions";
import { getMeta, MODEL } from "../meta/client";
import { DocType } from "../policy/schema";
import { z } from "zod";
import type { AiProvider, Extraction, InputFile } from "./types";

// Real provider. Same structured-output pattern as meta/extractId.ts.
// Untested until credits arrive: run scripts/day1.ts first, then flip AI_PROVIDER=meta.
const clamp = (n: number) => Math.min(1000, Math.max(0, Math.round(n)));

export const META_STEPS = ["doc_class", "extraction", "compare", "summary", "guidance"] as const;
export type MetaStep = (typeof META_STEPS)[number];

// "none" is rejected by Muse Spark (HTTP 400), so it is not offered.
export const REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type ChatRequest = ChatCompletionCreateParamsNonStreaming & { reasoning_effort: ReasoningEffort; max_completion_tokens: number };
export interface ChatResult {
  content: string | null;
  finishReason: string | null;
  usage?: CompletionUsage;
}
export type ChatSend = (body: ChatRequest) => Promise<ChatResult>;
// Optional hook around the single API call (e.g. the eval's cache and meter).
export type ChatWrapper = (step: MetaStep, body: ChatRequest, send: ChatSend) => Promise<ChatResult>;

export interface MetaProviderOptions {
  call?: ChatWrapper;
  reasoningEffort?: Partial<Record<MetaStep, ReasoningEffort>>;
  maxCompletionTokens?: Partial<Record<MetaStep, number>>;
}

// The model stopped at max_completion_tokens, so the JSON is incomplete.
export class MetaOutputTruncated extends Error {
  constructor(readonly step: MetaStep, readonly maxCompletionTokens: number) {
    super(`Meta output for ${step} was cut off at max_completion_tokens=${maxCompletionTokens}`);
  }
}

// Defaults: low effort except extraction (medium); caps generous enough that
// structured JSON is not truncated. Env overrides: META_EFFORT_CLASSIFY,
// META_EFFORT_EXTRACT, META_EFFORT_OTHER (compare, summary, guidance).
const DEFAULT_EFFORT: Record<MetaStep, ReasoningEffort> = { doc_class: "low", extraction: "medium", compare: "low", summary: "low", guidance: "low" };
const DEFAULT_MAX_TOKENS: Record<MetaStep, number> = { doc_class: 2000, extraction: 4000, compare: 2000, summary: 2000, guidance: 2000 };
const EFFORT_ENV: Record<MetaStep, string> = {
  doc_class: "META_EFFORT_CLASSIFY", extraction: "META_EFFORT_EXTRACT", compare: "META_EFFORT_OTHER", summary: "META_EFFORT_OTHER", guidance: "META_EFFORT_OTHER",
};

function envEffort(step: MetaStep): ReasoningEffort | undefined {
  const v = process.env[EFFORT_ENV[step]];
  if (!v) return undefined;
  if (!(REASONING_EFFORTS as readonly string[]).includes(v)) throw new Error(`${EFFORT_ENV[step]} must be one of ${REASONING_EFFORTS.join(", ")}; got "${v}"`);
  return v as ReasoningEffort;
}

// The settings each step will use, resolved option > env > default. Reports record these.
export function metaSettings(opts: MetaProviderOptions = {}) {
  return {
    model: MODEL,
    reasoningEffort: Object.fromEntries(META_STEPS.map((s) => [s, opts.reasoningEffort?.[s] ?? envEffort(s) ?? DEFAULT_EFFORT[s]])) as Record<MetaStep, ReasoningEffort>,
    maxCompletionTokens: Object.fromEntries(META_STEPS.map((s) => [s, opts.maxCompletionTokens?.[s] ?? DEFAULT_MAX_TOKENS[s]])) as Record<MetaStep, number>,
  };
}

const send: ChatSend = async (body) => {
  const res = await getMeta().chat.completions.create(body);
  return { content: res.choices[0]?.message.content ?? null, finishReason: res.choices[0]?.finish_reason ?? null, usage: res.usage };
};

// Builds the chat request for a step. Exported so the eval can estimate tokens for the exact same body.
export function buildRequest(step: MetaStep, schema: object, text: string, file: InputFile | undefined, opts: MetaProviderOptions = {}): ChatRequest {
  const settings = metaSettings(opts);
  const content: Array<Record<string, unknown>> = [{ type: "text", text }];
  if (file) content.push({ type: "image_url", image_url: { url: `data:${file.mime};base64,${file.bytes.toString("base64")}` } });
  return {
    model: settings.model,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: [{ role: "user", content: content as any }],
    response_format: { type: "json_schema", json_schema: { name: step, strict: true, schema: schema as Record<string, unknown> } },
    reasoning_effort: settings.reasoningEffort[step],
    max_completion_tokens: settings.maxCompletionTokens[step],
  };
}

const fieldSchema = {
  type: "object",
  properties: {
    found: { type: "boolean" }, value: { type: "string" }, confidence: { type: "number" },
    box: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4 },
  },
  required: ["found", "value", "confidence", "box"], additionalProperties: false,
};
const FIELDS = ["full_name", "date_of_birth", "document_number", "expiry_date", "issue_date", "address"] as const;
const ZField = z.object({
  found: z.boolean(), value: z.string(), confidence: z.number().min(0).max(1),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).transform((b) => b.map(clamp) as [number, number, number, number]),
});

export const META_SCHEMAS = {
  doc_class: {
    type: "object",
    properties: { docType: { type: "string", enum: DocType.options }, confidence: { type: "number" } },
    required: ["docType", "confidence"], additionalProperties: false,
  },
  extraction: { type: "object", properties: Object.fromEntries(FIELDS.map((k) => [k, fieldSchema])), required: [...FIELDS], additionalProperties: false },
  compare: {
    type: "object",
    properties: { same: { type: "boolean" }, confidence: { type: "number" }, reason: { type: "string" } },
    required: ["same", "confidence", "reason"], additionalProperties: false,
  },
  summary: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false },
  guidance: { type: "object", properties: { message: { type: "string" } }, required: ["message"], additionalProperties: false },
} satisfies Record<MetaStep, object>;

export const META_PROMPTS = {
  doc_class: () => "Classify this KYC document. Use unknown if it is none of the listed types. confidence is 0-1.",
  extraction: (docType: string) =>
    `This is a ${docType}. For each field return found, the exact text as printed, confidence 0-1, and box as ` +
    "[x_min, y_min, x_max, y_max] on a normalized 0-1000 grid with (0,0) at top-left. Dates as YYYY-MM-DD. " +
    'If a field is absent set found=false, value="", confidence=0, box=[0,0,0,0].',
  compare: (field: string, a: string, b: string) =>
    `Do these two ${field} values from different KYC documents refer to the same thing? Allow formatting, ` +
    `abbreviation and transliteration differences only.\nA: ${a}\nB: ${b}`,
  summary: (score: number, decision: string, reasons: string[]) =>
    `Write a 2-3 sentence neutral summary for a KYC analyst. Only use these facts; do not add new ones.\n` +
    `Score: ${score}\nProposed outcome: ${decision}\nFindings:\n- ${reasons.join("\n- ") || "none"}`,
  guidance: (issues: string[]) =>
    `Write a short, friendly message asking a bank customer to fix these onboarding issues. Do not mention fraud or risk scores.\n- ${issues.join("\n- ")}`,
};

export function createMetaProvider(opts: MetaProviderOptions = {}): AiProvider {
  async function jsonCall<T>(step: MetaStep, parse: (v: unknown) => T, text: string, file?: InputFile): Promise<T> {
    const body = buildRequest(step, META_SCHEMAS[step], text, file, opts);
    const res = opts.call ? await opts.call(step, body, send) : await send(body);
    if (res.finishReason === "length") throw new MetaOutputTruncated(step, body.max_completion_tokens);
    return parse(JSON.parse(res.content ?? "{}"));
  }

  return {
    name: "meta",

    classifyDocument: (file) =>
      jsonCall("doc_class", (v) => z.object({ docType: DocType, confidence: z.number() }).parse(v), META_PROMPTS.doc_class(), file),

    extractFields: (file, docType) =>
      jsonCall("extraction", (v) => ({ document_type: docType, ...z.object(Object.fromEntries(FIELDS.map((k) => [k, ZField]))).parse(v) }) as Extraction,
        META_PROMPTS.extraction(docType), file),

    compareValues: (field, a, b) =>
      jsonCall("compare", (v) => z.object({ same: z.boolean(), confidence: z.number(), reason: z.string() }).parse(v), META_PROMPTS.compare(field, a, b)),

    summarizeForReviewer: async ({ score, reasons, decision }) =>
      (await jsonCall("summary", (v) => z.object({ summary: z.string() }).parse(v), META_PROMPTS.summary(score, decision, reasons))).summary,

    customerGuidance: async (issues) =>
      (await jsonCall("guidance", (v) => z.object({ message: z.string() }).parse(v), META_PROMPTS.guidance(issues))).message,
  };
}

export const metaProvider = createMetaProvider();
