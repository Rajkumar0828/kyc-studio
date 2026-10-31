import fs from "node:fs";
import path from "node:path";
import type { MetaStep, ReasoningEffort } from "../../src/lib/ai/meta";
import type { CallRecord } from "./cache";
import { COUNT_DISCLOSURE, PRICES_SOURCE, usdOf, type Prices } from "./estimate";
import { BOX_RULE, VALUE_RULE, type FieldScore } from "./score";

export type FailureType = "length" | "model_error" | "invalid_output" | "cap";

export interface DocResult {
  doc: string;
  truthType: string;
  predictedType: string | null; // null when classification did not run
  classPass: boolean | null;
  extractionCached: boolean | null;
  fields: FieldScore[];
  overlay?: string; // link relative to the report directory
}

export interface CaseResult {
  caseId: string;
  policyId: string;
  asOf: string;
  expectedDecision: string;
  decision: string | null;
  expectedCodes: string[];
  codes: string[];
  decisionPass: boolean;
  codesPass: boolean;
  plannedCalls: number;
  liveCalls: number;
  cachedCalls: number;
  docs: DocResult[];
  failure: { type: FailureType; message: string } | null;
}

export interface RunInfo {
  startedAt: string;
  finishedAt: string;
  model: string;
  reasoningEffort: Record<MetaStep, ReasoningEffort>;
  maxCompletionTokens: Record<MetaStep, number>;
  prices: Prices;
  maxCalls: number;
  cache: string;
  counting: { live: number; cached: number; enabled: boolean };
  guard: string[];
  preflight: string;
  experiment?: { efforts: string[]; repeat: number; documents: number };
}

export const isIdentity = (docType: string) => ["passport", "drivers_license", "national_id"].includes(docType);
const pctNum = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const ratio = (n: number | null) => (n === null ? "–" : `${n.toFixed(2)}×`);
const diag = (f: FieldScore) => (f.diagnostics ? `${pctNum(f.diagnostics.dxPct)} / ${pctNum(f.diagnostics.dyPct)} | ${ratio(f.diagnostics.widthRatio)} / ${ratio(f.diagnostics.heightRatio)}` : "– | –");
export const yn = (v: boolean | null) => (v === null ? "–" : v ? "✓" : "✗");
export const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function totals(calls: CallRecord[], prices: Prices) {
  const live = calls.filter((c) => !c.cached);
  const sum = (k: keyof CallRecord) => live.reduce((a, c) => a + ((c[k] as number | null) ?? 0), 0);
  const input = sum("inputTokens"), output = sum("outputTokens"), reasoning = sum("reasoningTokens"), cachedIn = sum("cachedInputTokens");
  return { live: live.length, cached: calls.length - live.length, input, output, reasoning, cachedIn, usd: usdOf(prices, input, cachedIn, output) };
}

export const pct = (n: number, d: number) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : "–");

// Rules and settings shared by every report.
export function headerLines(run: RunInfo, title: string, extra: string[] = []): string[] {
  return [
    `# ${title}`, "",
    `Run ${run.startedAt} → ${run.finishedAt} · model \`${run.model}\``, "",
    "## Rules and settings", "",
    `- **Box rule:** ${BOX_RULE}`,
    `- **Box diagnostics (failed boxes only):** centre offset dx / dy of the model box from the truth box, in percent of the 0-1000 grid (positive = right / down), and size ratio width / height (model ÷ truth).`,
    `- **Overlays:** each document heading links to a page with model boxes in red and truth boxes in green.`,
    `- **Value rule:** ${VALUE_RULE}`,
    ...extra,
    `- **Reasoning effort used:** ${Object.entries(run.reasoningEffort).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    `- **max_completion_tokens:** ${Object.entries(run.maxCompletionTokens).map(([k, v]) => `${k}=${v}`).join(", ")}. A finish_reason of \`length\` is reported as its own failure type.`,
    `- **Prices (USD per 1M tokens):** input ${run.prices.input}, cached input ${run.prices.cachedInput}, output incl. reasoning ${run.prices.output} (${PRICES_SOURCE}).`,
    `- **Call cap:** ${run.maxCalls} live calls. Cached responses do not count toward the cap or the token totals.`,
    `- **Cache:** ${run.cache}`,
    `- **Token counting:** ${run.counting.enabled ? `${run.counting.live} live count requests, ${run.counting.cached} served from cache` : "disabled (--no-count)"}. ${COUNT_DISCLOSURE}`,
    `- **Provider guard:** ${run.guard.join(" ")}`,
    `- **Preflight:** ${run.preflight}`,
    `- **Selfies:** never sent to the model; the pipeline only quality-checks them.`, "",
  ];
}

// One document: heading (linked to its overlay), status line, field table.
export function docLines(d: DocResult, heading: string, status: string): string[] {
  const md = [`### ${d.overlay ? `[${heading}](${d.overlay})` : heading}`, "", status, ""];
  if (!d.fields.length) return md;
  md.push(`| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |`);
  md.push(`|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const f of d.fields)
    md.push(`| ${f.field} | ${esc(f.truthFound ? f.truth : "(absent)")} | ${esc(f.modelFound ? f.model : "(absent)")} | ${yn(f.valuePass)} | ${yn(f.isoFormat)} | ${f.iou === null ? "–" : f.iou.toFixed(2)} | ${yn(f.centreInside)} | ${yn(f.boxPass)} | ${diag(f)} | ${yn(f.pass)} |`);
  md.push("");
  return md;
}

export function callLines(calls: CallRecord[]): string[] {
  const md = ["## Calls", ""];
  md.push(`| # | Case | Step | Doc | Model | Effort | Repeat | Input | Output | Reasoning | Latency ms | Cached | finish_reason |`);
  md.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
  calls.forEach((r, i) =>
    md.push(`| ${i + 1} | ${r.caseId} | ${r.step} | ${r.doc ?? "–"} | ${r.model} | ${r.effort ?? "–"} | ${r.repeat ?? "–"} | ${r.inputTokens ?? "–"} | ${r.outputTokens ?? "–"} | ${r.reasoningTokens ?? "–"} | ${r.latencyMs ?? "–"} | ${r.cached ? "cached" : "live"} | ${r.error ? `error: ${esc(r.error)}` : r.finishReason ?? "–"} |`));
  return md;
}

export function writeRunFiles(dir: string, md: string[], results: unknown, calls: CallRecord[]) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "report.md"), md.join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(results, null, 2) + "\n");
  // One line per call for the later "Meta usage" panel. No headers, keys or images.
  fs.writeFileSync(path.join(dir, "calls.jsonl"), calls.map((c) => JSON.stringify(c)).join("\n") + (calls.length ? "\n" : ""));
}

export function writeReport(dir: string, run: RunInfo, cases: CaseResult[], calls: CallRecord[]) {
  const t = totals(calls, run.prices);
  const fields = cases.flatMap((c) => c.docs.flatMap((d) => d.fields));
  const present = fields.filter((f) => f.truthFound);
  const dates = present.filter((f) => f.isoFormat !== null);
  const classified = cases.flatMap((c) => c.docs).filter((d) => d.classPass !== null);

  const md = headerLines(run, "Meta eval report", [`- **Classification:** \`classifyDocument\` compared with truth.document_type for every document.`]);
  md.push("## Summary", "");
  md.push(`| Metric | Result |`, `|---|---|`);
  md.push(`| Decisions as expected | ${pct(cases.filter((c) => c.decisionPass).length, cases.length)} |`);
  md.push(`| Expected flag codes raised | ${pct(cases.filter((c) => c.codesPass).length, cases.length)} |`);
  md.push(`| Classification correct | ${pct(classified.filter((d) => d.classPass).length, classified.length)} |`);
  md.push(`| Field values correct (present in truth) | ${pct(present.filter((f) => f.valuePass).length, present.length)} |`);
  md.push(`| Boxes passing (present in truth) | ${pct(present.filter((f) => f.boxPass).length, present.length)} |`);
  for (const [label, isId] of [["ID documents", true], ["Bills", false]] as const) {
    const fs_ = cases.flatMap((c) => c.docs).filter((d) => isIdentity(d.truthType) === isId).flatMap((d) => d.fields).filter((f) => f.truthFound);
    md.push(`| Boxes passing: ${label} | ${pct(fs_.filter((f) => f.boxPass).length, fs_.length)} |`);
  }
  md.push(`| Absent fields reported absent | ${pct(fields.filter((f) => !f.truthFound && f.pass).length, fields.filter((f) => !f.truthFound).length)} |`);
  md.push(`| Dates returned as YYYY-MM-DD | ${pct(dates.filter((f) => f.isoFormat).length, dates.length)} |`);
  md.push(`| Live calls / cached | ${t.live} / ${t.cached} |`);
  md.push(`| Tokens (live calls): input / output / reasoning / cached input | ${t.input} / ${t.output} / ${t.reasoning} / ${t.cachedIn} |`);
  md.push(`| Cost of live calls (from reported usage) | $${t.usd.toFixed(4)} |`, "");

  md.push("## Cases", "");
  md.push(`| Case | Policy | as_of | Expected | Got | Decision | Codes expected → raised | Calls planned / live / cached | Failure |`);
  md.push(`|---|---|---|---|---|---|---|---|---|`);
  for (const c of cases)
    md.push(`| ${c.caseId} | ${c.policyId} | ${c.asOf} | ${c.expectedDecision} | ${c.decision ?? "–"} | ${yn(c.decisionPass)} | ${c.expectedCodes.join(", ") || "none"} → ${c.codes.join(", ") || "none"} ${yn(c.codesPass)} | ${c.plannedCalls} / ${c.liveCalls} / ${c.cachedCalls} | ${c.failure ? `**${c.failure.type}**: ${esc(c.failure.message)}` : "–"} |`);
  const off = cases.filter((c) => c.liveCalls + c.cachedCalls !== c.plannedCalls && !c.failure);
  if (off.length) md.push("", `Calls differed from the plan for: ${off.map((c) => `${c.caseId} (planned ${c.plannedCalls}, made ${c.liveCalls + c.cachedCalls})`).join("; ")}.`);
  md.push("");

  md.push("## Documents and fields", "");
  for (const c of cases)
    for (const d of c.docs)
      md.push(...docLines(d, d.doc, `Classification: predicted \`${d.predictedType ?? "not run"}\`, truth \`${d.truthType}\` ${yn(d.classPass)} · extraction ${d.extractionCached === null ? "not run" : d.extractionCached ? "**cached**" : "live"}`));

  md.push(...callLines(calls));
  writeRunFiles(dir, md, { run, totals: t, cases }, calls);
  return t;
}
