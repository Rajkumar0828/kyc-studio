import { buildRequest, META_PROMPTS, META_SCHEMAS, type ChatRequest, type MetaProviderOptions, type ReasoningEffort } from "../../src/lib/ai/meta";
import type { InputFile } from "../../src/lib/ai/types";
import { sha256, type CallRecord } from "./cache";
import type { Prices } from "./estimate";
import { callLines, docLines, esc, headerLines, isIdentity, totals, writeRunFiles, type DocResult, type FailureType, type RunInfo } from "./report";
import { normText, type FieldScore } from "./score";

// Repeatability experiment (--extract-only --repeat N): extraction only, the
// truth document_type is passed in, each unique document is extracted N times
// per reasoning effort.

export interface ExperimentDoc {
  name: string; // "case/file.png" of the first case that uses this document
  file: InputFile;
  documentType: string;
  truth: Record<string, unknown>;
  defects: string[]; // from the truth file, e.g. ["blurry"]: same printed content, different image
}

// Documents with the same printed content and image defects (document type,
// ground-truth fields, defects) are extracted once. Some cases reuse the same ID card; the re-rendered PNGs
// differ only in a few bytes of rendering noise, so bytes are not compared.
export function uniqueDocs<T extends ExperimentDoc>(docs: T[]): T[] {
  const seen = new Set<string>();
  return docs.filter((d) => {
    const key = sha256(JSON.stringify({ type: d.documentType, truth: d.truth, defects: [...d.defects].sort() }));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface PlannedExtraction {
  doc: string;
  effort: ReasoningEffort;
  repeat: number;
  body: ChatRequest;
}

// One extraction request per effort × repeat × document. The repeat index is
// not in the body; the runner adds it to the cache key.
export function planExtractOnly(docs: ExperimentDoc[], efforts: ReasoningEffort[], repeat: number, opts: MetaProviderOptions): PlannedExtraction[] {
  const out: PlannedExtraction[] = [];
  for (const effort of efforts) {
    const o: MetaProviderOptions = { ...opts, reasoningEffort: { ...opts.reasoningEffort, extraction: effort } };
    for (let r = 0; r < repeat; r++)
      for (const d of docs) out.push({ doc: d.name, effort, repeat: r, body: buildRequest("extraction", META_SCHEMAS.extraction, META_PROMPTS.extraction(d.documentType), d.file, o) });
  }
  return out;
}

export interface RepeatRun {
  effort: string;
  repeat: number;
  docs: DocResult[]; // successful extractions
  failures: Array<{ doc: string; type: FailureType; message: string }>;
}

export interface Stat {
  mean: number;
  min: number;
  max: number;
  n: number;
}

export const stat = (xs: number[]): Stat | null =>
  xs.length ? { mean: xs.reduce((a, b) => a + b, 0) / xs.length, min: Math.min(...xs), max: Math.max(...xs), n: xs.length } : null;

const rate = (fields: FieldScore[], ok: (f: FieldScore) => boolean | null) => {
  const present = fields.filter((f) => f.truthFound);
  return present.length ? present.filter((f) => ok(f) === true).length / present.length : null;
};
const nonNull = <T,>(xs: Array<T | null>) => xs.filter((x): x is T => x !== null);

export interface EffortSummary {
  effort: string;
  repeats: number;
  liveCalls: number;
  cachedCalls: number;
  boxRate: Stat | null; // per-repeat pass rates over fields present in truth
  boxRateId: Stat | null;
  boxRateBill: Stat | null;
  valueRate: Stat | null;
  agreement: { agreed: number; total: number } | null; // fields identical in every repeat
  meanLatencyMs: number | null; // live calls only
  tokens: { input: number; output: number; reasoning: number };
  usd: number;
  lengthFailures: number;
  otherFailures: number;
  failedBoxes: { n: number; dx: Stat | null; dy: Stat | null; width: Stat | null; height: Stat | null };
}

export function summarise(runs: RepeatRun[], calls: CallRecord[], prices: Prices): EffortSummary[] {
  const efforts = [...new Set(runs.map((r) => r.effort))];
  return efforts.map((effort) => {
    const rs = runs.filter((r) => r.effort === effort);
    const perRepeat = (pick: (d: DocResult) => boolean, ok: (f: FieldScore) => boolean | null) =>
      stat(nonNull(rs.map((r) => rate(r.docs.filter(pick).flatMap((d) => d.fields), ok))));

    // Agreement: a (document, field) agrees when found/value are identical in every repeat.
    let agreed = 0, total = 0;
    const docNames = [...new Set(rs.flatMap((r) => r.docs.map((d) => d.doc)))];
    for (const doc of docNames) {
      const versions = rs.map((r) => r.docs.find((d) => d.doc === doc));
      if (versions.some((v) => !v)) continue; // a repeat failed for this document
      for (const field of versions[0]!.fields.map((f) => f.field)) {
        const vals = versions.map((v) => {
          const f = v!.fields.find((x) => x.field === field)!;
          return f.modelFound ? normText(f.model) : "\u0000absent";
        });
        total++;
        if (vals.every((v) => v === vals[0])) agreed++;
      }
    }

    const mine = calls.filter((c) => c.step === "extraction" && c.effort === effort && c.repeat !== null);
    const live = mine.filter((c) => !c.cached && !c.error);
    const t = totals(mine, prices);
    const failed = rs.flatMap((r) => r.docs.flatMap((d) => d.fields)).map((f) => f.diagnostics).filter((d): d is NonNullable<typeof d> => d !== null);
    return {
      effort,
      repeats: rs.length,
      liveCalls: t.live,
      cachedCalls: t.cached,
      boxRate: perRepeat(() => true, (f) => f.boxPass),
      boxRateId: perRepeat((d) => isIdentity(d.truthType), (f) => f.boxPass),
      boxRateBill: perRepeat((d) => !isIdentity(d.truthType), (f) => f.boxPass),
      valueRate: perRepeat(() => true, (f) => f.valuePass),
      agreement: total ? { agreed, total } : null,
      meanLatencyMs: live.length ? live.reduce((a, c) => a + (c.latencyMs ?? 0), 0) / live.length : null,
      tokens: { input: t.input, output: t.output, reasoning: t.reasoning },
      usd: t.usd,
      lengthFailures: rs.flatMap((r) => r.failures).filter((f) => f.type === "length").length,
      otherFailures: rs.flatMap((r) => r.failures).filter((f) => f.type !== "length").length,
      failedBoxes: {
        n: failed.length,
        dx: stat(failed.map((d) => d.dxPct)),
        dy: stat(failed.map((d) => d.dyPct)),
        width: stat(nonNull(failed.map((d) => d.widthRatio))),
        height: stat(nonNull(failed.map((d) => d.heightRatio))),
      },
    };
  });
}

const p = (s: Stat | null) => (s ? `${(100 * s.mean).toFixed(1)}% (${(100 * s.min).toFixed(1)}–${(100 * s.max).toFixed(1)}%)` : "–");
const signed = (s: Stat | null, unit: string) =>
  s ? `${s.mean >= 0 ? "+" : ""}${s.mean.toFixed(1)}${unit} (${s.min.toFixed(1)} to ${s.max.toFixed(1)})` : "–";
const ratio = (s: Stat | null) => (s ? `${s.mean.toFixed(2)}× (${s.min.toFixed(2)}–${s.max.toFixed(2)})` : "–");

export function experimentLines(summaries: EffortSummary[], docs: number, repeat: number): string[] {
  const md = ["## Repeatability experiment", ""];
  md.push(`Extraction only, ${docs} unique documents × ${repeat} repeats per reasoning effort; the truth document_type is passed in, so classification is not tested. ` +
    "Documents with identical printed content and defects (same type, ground truth and image defects) are extracted once, even when their PNG bytes differ by rendering noise. " +
    "Rates are over fields present in the truth: the mean across repeats with the range (lowest–highest repeat) in brackets.", "");
  md.push(`| Effort | Calls live / cached | Box pass rate | Box pass: ID | Box pass: bills | Value accuracy | Agreement across repeats | Mean latency (live) | Tokens in / out / reasoning | Cost (live) | length failures | Other failures |`);
  md.push(`|---|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const s of summaries)
    md.push(`| ${s.effort} | ${s.liveCalls} / ${s.cachedCalls} | ${p(s.boxRate)} | ${p(s.boxRateId)} | ${p(s.boxRateBill)} | ${p(s.valueRate)} | ` +
      `${s.agreement ? `${s.agreement.agreed}/${s.agreement.total} (${Math.round((100 * s.agreement.agreed) / s.agreement.total)}%)` : "–"} | ` +
      `${s.meanLatencyMs === null ? "–" : `${Math.round(s.meanLatencyMs)} ms`} | ${s.tokens.input} / ${s.tokens.output} / ${s.tokens.reasoning} | $${s.usd.toFixed(4)} | ${s.lengthFailures} | ${s.otherFailures} |`);
  md.push("", "### Failed boxes: where they land", "");
  md.push("Mean with range in brackets, over every failed box the model returned. Offset is the model box centre minus the truth box centre in percent of the 0-1000 grid (positive = right / down); size is model ÷ truth.", "");
  md.push(`| Effort | Failed boxes | Offset dx | Offset dy | Width ratio | Height ratio |`, `|---|---|---|---|---|---|`);
  for (const s of summaries)
    md.push(`| ${s.effort} | ${s.failedBoxes.n} | ${signed(s.failedBoxes.dx, "%")} | ${signed(s.failedBoxes.dy, "%")} | ${ratio(s.failedBoxes.width)} | ${ratio(s.failedBoxes.height)} |`);
  md.push("");
  return md;
}

export function writeExperimentReport(dir: string, run: RunInfo, runs: RepeatRun[], calls: CallRecord[], docs: number, repeat: number) {
  const summaries = summarise(runs, calls, run.prices);
  const md = headerLines(run, "Meta extraction repeatability report", [
    `- **Mode:** --extract-only, ${repeat} repeats, efforts ${[...new Set(runs.map((r) => r.effort))].join(", ")}. The repeat index is part of the cache key (never sent to Meta).`,
  ]);
  md.push(...experimentLines(summaries, docs, repeat));
  const failures = runs.flatMap((r) => r.failures.map((f) => ({ ...f, effort: r.effort, repeat: r.repeat })));
  if (failures.length) {
    md.push("## Failures", "", `| Effort | Repeat | Document | Type | Message |`, `|---|---|---|---|---|`);
    for (const f of failures) md.push(`| ${f.effort} | ${f.repeat} | ${f.doc} | **${f.type}** | ${esc(f.message)} |`);
    md.push("");
  }
  md.push("## Documents and fields", "");
  for (const r of runs)
    for (const d of r.docs) md.push(...docLines(d, `${d.doc} · effort ${r.effort} · repeat ${r.repeat}`, `Truth type \`${d.truthType}\` (passed in) · extraction ${d.extractionCached ? "**cached**" : "live"}`));
  md.push(...callLines(calls));
  writeRunFiles(dir, md, { run, summaries, runs }, calls);
  return summaries;
}
