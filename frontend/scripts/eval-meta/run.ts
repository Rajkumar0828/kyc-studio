// Runs the synthetic specimens through the real pipeline with the REAL Meta
// provider and scores classification, values, boxes and decisions.
//
//   npx tsx --env-file=.env.local scripts/eval-meta/run.ts          # plan + cost estimate only
//   npx tsx --env-file=.env.local scripts/eval-meta/run.ts --yes    # make the calls
//
// Flags: --yes  --max-calls N (80)  --cases a,b  --no-cache  --refresh  --no-count
//        --overlays-from <reportDir>   rebuild overlay pages from a report's results.json (no API)
//        --extract-only  --repeat N    repeatability experiment: extraction only, N repeats per effort
//        --effort-classify X  --effort-extract X[,Y]  --effort-other X   (a list only with --extract-only)
//        --price-input N  --price-cached N  --price-output N   (USD per 1M tokens)
import fs from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { providerName } from "../../src/lib/ai/provider";
import {
  createMetaProvider, metaSettings, MetaOutputTruncated, REASONING_EFFORTS, sendChatCompletion,
  type ChatRequest, type MetaProviderOptions, type MetaStep, type ReasoningEffort,
} from "../../src/lib/ai/meta";
import { matchSpecimen } from "../../src/lib/ai/specimens";
import type { InputFile } from "../../src/lib/ai/types";
import { qualityProblems } from "../../src/lib/pipeline/quality";
import { runPipeline } from "../../src/lib/pipeline/run";
import type { Check } from "../../src/lib/pipeline/types";
import type { DocType, PolicySpec } from "../../src/lib/policy/schema";
import { latestPublished } from "../../src/lib/policy/store";
import { CallCapReached, createEvalCall, sha256, type CallRecord } from "./cache";
import { COUNT_DISCLOSURE, createCounter, DEFAULT_PRICES, planCase, usdOf, type CaseForPlan, type PlannedCall, type Prices } from "./estimate";
import { planExtractOnly, uniqueDocs, writeExperimentReport, type RepeatRun } from "./experiment";
import { overlayName, writeOverlay } from "./overlays";
import { writeReport, type CaseResult, type DocResult, type FailureType, type RunInfo } from "./report";
import { scoreField, type ModelField, type TruthField } from "./score";

const REPO = path.resolve(__dirname, "..", "..", "..");
const SPECIMENS = path.join(REPO, "eval", "specimens");
const CACHE = path.join(REPO, "eval", ".cache", "meta");
const REPORTS = path.join(REPO, "eval", "reports");
const FIELDS = ["full_name", "date_of_birth", "document_number", "issue_date", "expiry_date", "address"] as const;

function die(msg: string, code = 2): never {
  console.error(`\n${msg}\n`);
  process.exit(code);
}

// ---- flags ----
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const num = (name: string, fallback: number) => {
  const v = opt(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) die(`--${name} must be a non-negative number`);
  return n;
};
const effort = (name: string): ReasoningEffort | undefined => {
  const v = opt(name);
  if (v !== undefined && !(REASONING_EFFORTS as readonly string[]).includes(v)) die(`--${name} must be one of ${REASONING_EFFORTS.join(", ")}`);
  return v as ReasoningEffort | undefined;
};

const yes = flag("yes"), useCache = !flag("no-cache"), refresh = flag("refresh"), counting = !flag("no-count");
const maxCalls = num("max-calls", 80);
const prices: Prices = { input: num("price-input", DEFAULT_PRICES.input), cachedInput: num("price-cached", DEFAULT_PRICES.cachedInput), output: num("price-output", DEFAULT_PRICES.output) };
const extractOnly = flag("extract-only");
const repeat = num("repeat", 1);
if (!Number.isInteger(repeat) || repeat < 1) die("--repeat must be a whole number of at least 1");
if (repeat > 1 && !extractOnly) die("--repeat needs --extract-only");
const extractEfforts = (opt("effort-extract") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
for (const e of extractEfforts) if (!(REASONING_EFFORTS as readonly string[]).includes(e)) die(`--effort-extract values must be among ${REASONING_EFFORTS.join(", ")}`);
if (extractEfforts.length > 1 && !extractOnly) die("Several --effort-extract values need --extract-only");
const eClassify = effort("effort-classify"), eExtract = extractEfforts[0] as ReasoningEffort | undefined, eOther = effort("effort-other");
const providerOpts: MetaProviderOptions = {
  reasoningEffort: {
    ...(eClassify && { doc_class: eClassify }),
    ...(eExtract && { extraction: eExtract }),
    ...(eOther && { compare: eOther, summary: eOther, guidance: eOther }),
  },
};

// Overlay pages for every scored document, linked from the report (no API calls).
function addOverlays(dir: string, run: Pick<RunInfo, "model" | "reasoningEffort">, cases: CaseResult[]) {
  let n = 0;
  for (const c of cases)
    for (const d of c.docs) {
      if (!d.fields.some((f) => f.truthBox || f.modelBox)) continue; // nothing to draw (not extracted, or an older report)
      const name = overlayName(d.doc);
      writeOverlay({
        htmlFile: path.join(dir, "overlays", name),
        imageFile: path.join(SPECIMENS, d.doc),
        title: d.doc,
        subtitle: [`case ${c.caseId}`, `predicted ${d.predictedType ?? "not classified"}, truth ${d.truthType}`, `model ${run.model}`, `extraction effort ${run.reasoningEffort.extraction}`],
        fields: d.fields,
      });
      d.overlay = `overlays/${encodeURIComponent(name)}`;
      n++;
    }
  return n;
}

const overlaysFrom = opt("overlays-from");
if (overlaysFrom) {
  const dir = path.resolve(overlaysFrom);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8")) as { run: RunInfo; cases: CaseResult[] };
  const calls = fs.existsSync(path.join(dir, "calls.jsonl"))
    ? fs.readFileSync(path.join(dir, "calls.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as CallRecord)
    : [];
  const n = addOverlays(dir, saved.run, saved.cases);
  writeReport(dir, saved.run, saved.cases, calls);
  console.log(n ? `Wrote ${n} overlay pages to ${path.join(dir, "overlays")} and relinked report.md.` : "No documents with boxes in this report (it may predate overlays).");
  process.exit(0);
}

// Tiny call proving reasoning_effort works with a strict json_schema on Chat
// Completions; Meta's docs do not document the combination.
function preflightRequest(model: string, effortValue: ReasoningEffort, maxTokens: number): ChatRequest {
  return {
    model,
    messages: [{ role: "user", content: "Return ok=true and nums=[1,2]." }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "preflight", strict: true,
        schema: { type: "object", properties: { ok: { type: "boolean" }, nums: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 } }, required: ["ok", "nums"], additionalProperties: false },
      },
    },
    reasoning_effort: effortValue,
    max_completion_tokens: maxTokens,
  };
}

async function runPreflight(evalCall: ReturnType<typeof createEvalCall>, body: ChatRequest, records: CallRecord[]): Promise<string> {
  try {
    const res = await evalCall.callStep("preflight", body, sendChatCompletion);
    if (res.finishReason === "length") throw new Error("finish_reason=length");
    const v = JSON.parse(res.content ?? "") as { ok?: unknown; nums?: unknown };
    if (v.ok !== true || !Array.isArray(v.nums) || v.nums.length !== 2) throw new Error(`unexpected output ${JSON.stringify(v).slice(0, 120)}`);
    const msg = `reasoning_effort=${body.reasoning_effort} with a strict json_schema (incl. minItems/maxItems) returned valid output${records.at(-1)?.cached ? " (cached result)" : ""}.`;
    console.log(`Preflight OK: ${msg}`);
    return msg;
  } catch (e) {
    die(`Preflight failed: Chat Completions with reasoning_effort=${body.reasoning_effort} and a strict json_schema did not work (${e instanceof Error ? e.message.slice(0, 200) : e}). ` +
      "The eval was not run. Check the effort value or Meta's docs before retrying.", 3);
  }
}

// ---- provider guard: Meta only, never the mock or its specimen shortcut ----
const requested = process.env.AI_PROVIDER;
if (requested && requested !== "meta") die(`AI_PROVIDER is "${requested}". This eval only runs against the Meta provider; unset AI_PROVIDER or set it to meta. Refusing to run.`);
process.env.AI_PROVIDER = "meta";
if (providerName() !== "meta") die("The provider did not resolve to meta. Refusing to run.");
if (!process.env.MODEL_API_KEY) die("MODEL_API_KEY is not set. Run with --env-file=.env.local (the key is never printed or logged).");

const read = (p: string) => fs.readFileSync(path.join(SPECIMENS, p));
const readJson = <T>(p: string) => JSON.parse(read(p).toString("utf8")) as T;

interface IndexFile {
  cases: Array<{ case_id: string; files: Array<{ file: string; role: "document" | "selfie"; document_type?: string; truth?: string }> }>;
}
interface CaseFile {
  case_id: string;
  as_of: string;
  policy_id: string;
  expected: { decision: string; flag_codes: string[] };
}
interface TruthFile {
  document_type: string;
  defects: string[];
  fields: Record<string, TruthField>;
}
interface LoadedCase {
  cf: CaseFile;
  policy: PolicySpec;
  docs: Array<{ name: string; file: InputFile; documentType: string; truth: Record<string, TruthField>; defects: string[] }>;
  selfie: InputFile | undefined;
  qualityChecks: Check[];
}

async function main() {
  const startedAt = new Date().toISOString();
  const settings = metaSettings(providerOpts);
  if (/contributor/.test(settings.model)) console.warn(`Warning: ${settings.model} is priced differently from muse-spark-1.3; pass --price-* flags to match.`);

  // ---- load cases ----
  const index = readJson<IndexFile>("index.json");
  const only = opt("cases")?.split(",").map((s) => s.trim()).filter(Boolean);
  const selected = index.cases.filter((c) => !only || only.includes(c.case_id));
  if (only) for (const id of only) if (!index.cases.some((c) => c.case_id === id)) die(`Unknown case ${id}`);
  if (!selected.length) die("No cases selected.");

  const docName = new Map<string, string>(); // file hash -> "case/file.png"
  const loaded: LoadedCase[] = [];
  for (const entry of selected) {
    const cf = readJson<CaseFile>(`${entry.case_id}/case.json`);
    const policy = await latestPublished(cf.policy_id);
    if (!policy) die(`${entry.case_id}: policy "${cf.policy_id}" from case.json is not published.`);
    const docs = entry.files.filter((f) => f.role === "document").map((f) => {
      const bytes = read(f.file);
      docName.set(sha256(bytes), f.file);
      const truth = readJson<TruthFile>(f.truth!);
      const file: InputFile = { filename: path.basename(f.file), mime: "image/png", bytes };
      return { name: f.file, file, documentType: truth.document_type, truth: truth.fields, defects: truth.defects ?? [] };
    });
    const selfieEntry = entry.files.find((f) => f.role === "selfie");
    const selfie: InputFile | undefined = selfieEntry ? { filename: path.basename(selfieEntry.file), mime: "image/png", bytes: read(selfieEntry.file) } : undefined;
    // The real quality gate, run locally (no API) so the plan knows which cases stop early.
    const qualityChecks: Check[] = (await Promise.all(docs.map((d) => qualityProblems(d.file)))).flat()
      .map((m) => ({ step: "quality", code: "quality_failed", status: "fail", category: "customer_fixable", message: m }));
    loaded.push({ cf, policy, docs, selfie, qualityChecks });
  }

  // The mock specimen shortcut must be inactive: a real specimen must not be recognised.
  if (await matchSpecimen(loaded[0].docs[0].file.bytes)) die("The mock specimen shortcut is active. Refusing to run.");
  const guard = [
    "AI_PROVIDER resolved to meta (refuses to run otherwise).",
    "Verified that the mock specimen shortcut does not recognise a real specimen.",
    "The mock provider is not used.",
  ];

  // ---- plan and estimate ----
  const records: CallRecord[] = [];
  let currentCase = "preflight";
  let currentRepeat: number | undefined;
  const evalCall = createEvalCall({
    cacheDir: CACHE, useCache, refresh, maxCalls,
    caseId: () => currentCase,
    repeat: () => currentRepeat,
    docFor: (h) => docName.get(h) ?? null,
    onRecord: (r) => records.push(r),
  });
  const counter = createCounter(path.join(CACHE, "counts"));

  if (extractOnly) {
    await extractOnlyRun({
      loaded, settings, guard, records, evalCall, counter, startedAt,
      setContext: (caseId, r) => {
        currentCase = caseId;
        currentRepeat = r;
      },
    });
    return;
  }

  const plans: PlannedCall[] = loaded.flatMap((l) =>
    planCase({ caseId: l.cf.case_id, policy: l.policy, expectedDecision: l.cf.expected.decision, expectedCodes: l.cf.expected.flag_codes, docs: l.docs, qualityChecks: l.qualityChecks } satisfies CaseForPlan, providerOpts));
  const preflightBody = preflightRequest(settings.model, settings.reasoningEffort.extraction, settings.maxCompletionTokens.compare);

  console.log(`\nMeta eval · model ${settings.model}`);
  console.log(`Reasoning effort: ${Object.entries(settings.reasoningEffort).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`max_completion_tokens: ${Object.entries(settings.maxCompletionTokens).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`Prices per 1M tokens: input $${prices.input}, cached input $${prices.cachedInput}, output $${prices.output}`);
  console.log(`Cache: ${useCache ? (refresh ? "refresh (ignore hits, rewrite)" : "on") : "off"} · cap: ${maxCalls} live calls`);
  console.log(`Token counting: ${counting ? "Responses-format input_tokens endpoint (approximate: the provider uses Chat Completions, which has no count endpoint)" : "off (--no-count)"}`);
  if (counting) console.log(COUNT_DISCLOSURE);
  console.log("");

  const rows: Array<{ p: Pick<PlannedCall, "caseId" | "step" | "doc" | "basis" | "body">; cached: boolean; tokens: number | null; worstUsd: number | null }> = [];
  for (const p of [{ caseId: "preflight", step: "preflight" as unknown as MetaStep, doc: null, basis: "exact" as const, body: preflightBody }, ...plans]) {
    const cached = evalCall.isCached(p.body);
    const counted = cached || !counting ? { tokens: null } : await counter.count(p.body);
    const worstUsd = cached ? 0 : counted.tokens === null ? null : usdOf(prices, counted.tokens, 0, p.body.max_completion_tokens);
    rows.push({ p, cached, tokens: counted.tokens, worstUsd });
  }
  console.log("Case                  Step        Doc                         Basis   Cached  Est. input  Max output  Worst $");
  for (const r of rows)
    console.log(
      `${r.p.caseId.padEnd(21)} ${String(r.p.step).padEnd(11)} ${(r.p.doc ?? "–").padEnd(27)} ${r.p.basis.padEnd(7)} ${(r.cached ? "yes" : "no").padEnd(7)} ` +
      `${String(r.tokens ?? "–").padStart(10)}  ${String(r.cached ? 0 : r.p.body.max_completion_tokens).padStart(10)}  ${r.worstUsd === null ? "      –" : r.worstUsd.toFixed(4).padStart(7)}`);
  const liveRows = rows.filter((r) => !r.cached);
  const estInput = liveRows.reduce((a, r) => a + (r.tokens ?? 0), 0);
  const worst = liveRows.reduce((a, r) => a + (r.worstUsd ?? 0), 0);
  const uncounted = liveRows.filter((r) => r.tokens === null).length;
  const gatedOff = loaded.filter((l) => !l.qualityChecks.length).length;
  console.log(`\nPlanned calls: ${rows.length} (${liveRows.length} not cached, ${rows.length - liveRows.length} cached).`);
  console.log(`Possible extra compare calls: up to ${2 * gatedOff} more, if the model formats a name or address differently on the two documents.`);
  console.log(`Estimated input tokens (not cached): ${estInput}${uncounted ? ` (+${uncounted} calls not counted)` : ""}.`);
  console.log(`Worst-case cost of non-cached calls (input + full max_completion_tokens as output): $${worst.toFixed(4)}.`);
  const cs = counter.stats();
  console.log(`Token-counting requests this run: ${cs.live} live, ${cs.cached} from cache.`);
  for (const l of loaded.filter((x) => x.qualityChecks.length))
    console.log(`Note: ${l.cf.case_id} stops at the quality gate, but the pipeline still makes ${plans.filter((p) => p.caseId === l.cf.case_id).length} AI calls (reviewer summary and customer guidance).`);
  if (liveRows.length > maxCalls) die(`The plan needs ${liveRows.length} live calls but --max-calls is ${maxCalls}. Raise the cap or select fewer cases.`);
  if (!yes) {
    console.log("\nNo calls made yet. Re-run with --yes to run the eval.\n");
    return;
  }

  const preflight = await runPreflight(evalCall, preflightBody, records);

  // ---- run cases ----
  const results: CaseResult[] = [];
  let stopped = false;
  for (const l of loaded) {
    if (stopped) break;
    currentCase = l.cf.case_id;
    const planned = plans.filter((p) => p.caseId === currentCase).length;
    const before = records.length;
    console.log(`\n${currentCase} …`);
    let failure: CaseResult["failure"] = null;
    let decision: string | null = null, codes: string[] = [];
    let docsOut: DocResult[] = l.docs.map((d) => ({ doc: d.name, truthType: d.documentType, predictedType: null, classPass: null, extractionCached: null, fields: [] }));
    try {
      const provider = createMetaProvider({ ...providerOpts, call: evalCall.call });
      const r = await runPipeline(
        { caseId: currentCase, documents: l.docs.map((d) => d.file), selfie: l.selfie, asOf: new Date(`${l.cf.as_of}T00:00:00Z`) },
        l.policy, provider, async () => {},
      );
      decision = r.decision;
      codes = [...new Set(r.checks.filter((c) => c.status !== "pass").map((c) => c.code))];
      const caseRecords = records.slice(before);
      docsOut = l.docs.map((d, i) => {
        const pd = r.docs.find((x) => x.index === i);
        const x = pd?.extraction as unknown as Record<string, ModelField> | undefined;
        const ext = caseRecords.find((c) => c.step === "extraction" && c.doc === d.name);
        return {
          doc: d.name,
          truthType: d.documentType,
          predictedType: pd?.docType ?? null,
          classPass: pd ? pd.docType === d.documentType : null,
          extractionCached: ext ? ext.cached : null,
          fields: x ? FIELDS.map((f) => scoreField(f, x[f], d.truth[f])) : [],
        };
      });
    } catch (e) {
      const type: FailureType = e instanceof MetaOutputTruncated ? "length" : e instanceof CallCapReached ? "cap" : e instanceof ZodError || e instanceof SyntaxError ? "invalid_output" : "model_error";
      failure = { type, message: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) };
      if (type === "cap") stopped = true;
      console.log(`  failed: ${type}: ${failure.message}`);
    }
    const caseRecords = records.slice(before);
    const res: CaseResult = {
      caseId: currentCase,
      policyId: l.cf.policy_id,
      asOf: l.cf.as_of,
      expectedDecision: l.cf.expected.decision,
      decision,
      expectedCodes: l.cf.expected.flag_codes,
      codes,
      decisionPass: decision === l.cf.expected.decision,
      codesPass: decision !== null && l.cf.expected.flag_codes.every((c) => codes.includes(c)),
      plannedCalls: planned,
      liveCalls: caseRecords.filter((c) => !c.cached).length,
      cachedCalls: caseRecords.filter((c) => c.cached).length,
      docs: docsOut,
      failure,
    };
    results.push(res);
    console.log(`  ${res.decision ?? "no decision"} (expected ${res.expectedDecision}) · calls ${res.liveCalls} live, ${res.cachedCalls} cached, ${planned} planned`);
  }

  const dir = path.join(REPORTS, startedAt.replace(/[:.]/g, "-"));
  const runInfo: RunInfo = {
    startedAt, finishedAt: new Date().toISOString(), model: settings.model,
    reasoningEffort: settings.reasoningEffort, maxCompletionTokens: settings.maxCompletionTokens, prices, maxCalls,
    cache: useCache ? (refresh ? "refresh: hits ignored, responses rewritten" : `on (${path.relative(REPO, CACHE)})`) : "off",
    counting: { ...counter.stats(), enabled: counting }, guard, preflight,
  };
  addOverlays(dir, runInfo, results);
  const t = writeReport(dir, runInfo, results, records);
  console.log(`\nLive calls ${t.live}, cached ${t.cached}; tokens in ${t.input} / out ${t.output} / reasoning ${t.reasoning}; cost $${t.usd.toFixed(4)}.`);
  console.log(`Report: ${path.relative(process.cwd(), path.join(dir, "report.md"))}\n`);
  if (stopped) process.exitCode = 4;
}

// ---- repeatability experiment: --extract-only [--repeat N] [--effort-extract a,b] ----
async function extractOnlyRun(ctx: {
  loaded: LoadedCase[];
  settings: ReturnType<typeof metaSettings>;
  guard: string[];
  records: CallRecord[];
  evalCall: ReturnType<typeof createEvalCall>;
  counter: ReturnType<typeof createCounter>;
  startedAt: string;
  setContext: (caseId: string, repeat: number | undefined) => void;
}) {
  const { settings, records, evalCall, counter } = ctx;
  const efforts = (extractEfforts.length ? extractEfforts : [settings.reasoningEffort.extraction]) as ReasoningEffort[];
  const docs = uniqueDocs(ctx.loaded.flatMap((l) => l.docs));
  const plan = planExtractOnly(docs, efforts, repeat, providerOpts);
  const preflights = efforts.map((e) => preflightRequest(settings.model, e, settings.maxCompletionTokens.compare));

  console.log(`\nMeta extraction repeatability · model ${settings.model}`);
  console.log(`${docs.length} unique documents × ${repeat} repeats × efforts ${efforts.join(", ")} (truth document_type passed in; no classification)`);
  console.log(`max_completion_tokens: extraction=${settings.maxCompletionTokens.extraction}, preflight=${settings.maxCompletionTokens.compare}`);
  console.log(`Prices per 1M tokens: input $${prices.input}, cached input $${prices.cachedInput}, output $${prices.output}`);
  console.log(`Cache: ${useCache ? (refresh ? "refresh (ignore hits, rewrite)" : "on") : "off"}; the repeat index is part of the cache key · cap: ${maxCalls} live calls`);
  console.log(`Token counting: ${counting ? "Responses-format input_tokens endpoint (approximate; one count per document and effort, shared by repeats)" : "off (--no-count)"}`);
  if (counting) console.log(COUNT_DISCLOSURE);
  console.log("");

  // Estimate per (effort, document): repeats share one token count.
  let liveCount = 0, estInput = 0, worst = 0, uncounted = 0;
  console.log("Effort   Document                    Repeats  Cached  Est. input  Max output  Worst $ (not cached)");
  for (const [i, body] of preflights.entries()) {
    const cached = evalCall.isCached(body);
    const tokens = cached || !counting ? null : (await counter.count(body)).tokens;
    if (!cached) {
      liveCount++;
      if (tokens === null) uncounted++;
      estInput += tokens ?? 0;
      worst += usdOf(prices, tokens ?? 0, 0, body.max_completion_tokens);
    }
    console.log(`${efforts[i].padEnd(8)} ${"(preflight)".padEnd(27)} ${"1".padStart(7)}  ${(cached ? "1" : "0").padStart(6)}  ${String(tokens ?? "–").padStart(10)}  ${String(body.max_completion_tokens).padStart(10)}  ${cached ? "0.0000" : usdOf(prices, tokens ?? 0, 0, body.max_completion_tokens).toFixed(4)}`);
  }
  for (const effortValue of efforts)
    for (const d of docs) {
      const mine = plan.filter((p) => p.effort === effortValue && p.doc === d.name);
      const notCached = mine.filter((p) => !evalCall.isCached(p.body, p.repeat));
      const tokens = !notCached.length || !counting ? null : (await counter.count(mine[0].body)).tokens;
      const cost = notCached.length * usdOf(prices, tokens ?? 0, 0, mine[0].body.max_completion_tokens);
      liveCount += notCached.length;
      if (tokens === null) uncounted += notCached.length;
      estInput += (tokens ?? 0) * notCached.length;
      worst += cost;
      console.log(`${effortValue.padEnd(8)} ${d.name.padEnd(27)} ${String(mine.length).padStart(7)}  ${String(mine.length - notCached.length).padStart(6)}  ${String(tokens ?? "–").padStart(10)}  ${String(mine[0].body.max_completion_tokens).padStart(10)}  ${cost.toFixed(4)}`);
    }
  const total = plan.length + preflights.length;
  console.log(`\nPlanned calls: ${total} (${liveCount} not cached, ${total - liveCount} cached): ${plan.length} extractions + ${preflights.length} preflight.`);
  console.log(`Estimated input tokens (not cached): ${estInput}${uncounted ? ` (+${uncounted} calls not counted)` : ""}.`);
  console.log(`Worst-case cost of non-cached calls (input + full max_completion_tokens as output${uncounted ? "; uncounted calls priced on output only" : ""}): $${worst.toFixed(4)}.`);
  const cs = counter.stats();
  console.log(`Token-counting requests this run: ${cs.live} live, ${cs.cached} from cache.`);
  if (liveCount > maxCalls) die(`The plan needs ${liveCount} live calls but --max-calls is ${maxCalls}. Raise the cap or use fewer repeats or efforts.`);
  if (!yes) {
    console.log("\nNo calls made yet. Re-run with --yes to run the experiment.\n");
    return;
  }

  ctx.setContext("preflight", undefined);
  const preflightNotes: string[] = [];
  for (const body of preflights) preflightNotes.push(await runPreflight(evalCall, body, records));

  const runs: RepeatRun[] = [];
  let stopped = false;
  for (const effortValue of efforts) {
    const provider = createMetaProvider({ ...providerOpts, reasoningEffort: { ...providerOpts.reasoningEffort, extraction: effortValue }, call: evalCall.call });
    for (let r = 0; r < repeat && !stopped; r++) {
      const run: RepeatRun = { effort: effortValue, repeat: r, docs: [], failures: [] };
      runs.push(run);
      for (const d of docs) {
        ctx.setContext(`extract-${effortValue}-r${r}`, r);
        const before = records.length;
        try {
          const x = (await provider.extractFields(d.file, d.documentType as DocType)) as unknown as Record<string, ModelField>;
          run.docs.push({
            doc: d.name, truthType: d.documentType, predictedType: null, classPass: null,
            extractionCached: records[before]?.cached ?? null,
            fields: FIELDS.map((f) => scoreField(f, x[f], d.truth[f])),
          });
        } catch (e) {
          const type: FailureType = e instanceof MetaOutputTruncated ? "length" : e instanceof CallCapReached ? "cap" : e instanceof ZodError || e instanceof SyntaxError ? "invalid_output" : "model_error";
          run.failures.push({ doc: d.name, type, message: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) });
          if (type === "cap") {
            stopped = true;
            break;
          }
        }
      }
      console.log(`  effort ${effortValue} repeat ${r}: ${run.docs.length} extracted, ${run.failures.length} failed`);
    }
  }

  const dir = path.join(REPORTS, `${ctx.startedAt.replace(/[:.]/g, "-")}-extract`);
  const runInfo: RunInfo = {
    startedAt: ctx.startedAt, finishedAt: new Date().toISOString(), model: settings.model,
    reasoningEffort: { ...settings.reasoningEffort, extraction: efforts.join(",") as ReasoningEffort },
    maxCompletionTokens: settings.maxCompletionTokens, prices, maxCalls,
    cache: useCache ? (refresh ? "refresh: hits ignored, responses rewritten" : `on (${path.relative(REPO, CACHE)})`) : "off",
    counting: { ...counter.stats(), enabled: counting }, guard: ctx.guard, preflight: preflightNotes.join(" "),
    experiment: { efforts, repeat, documents: docs.length },
  };
  for (const run of runs)
    for (const d of run.docs) {
      const name = overlayName(d.doc, `_${run.effort}_r${run.repeat}`);
      writeOverlay({
        htmlFile: path.join(dir, "overlays", name), imageFile: path.join(SPECIMENS, d.doc), title: d.doc,
        subtitle: [`truth ${d.truthType}`, `model ${settings.model}`, `extraction effort ${run.effort}`, `repeat ${run.repeat}`], fields: d.fields,
      });
      d.overlay = `overlays/${encodeURIComponent(name)}`;
    }
  const summaries = writeExperimentReport(dir, runInfo, runs, records, docs.length, repeat);
  for (const s of summaries)
    console.log(`\n${s.effort}: box pass ${s.boxRate ? (100 * s.boxRate.mean).toFixed(1) : "–"}% · values ${s.valueRate ? (100 * s.valueRate.mean).toFixed(1) : "–"}% · ` +
      `${s.liveCalls} live / ${s.cachedCalls} cached · $${s.usd.toFixed(4)}${s.lengthFailures ? ` · ${s.lengthFailures} length failures` : ""}`);
  console.log(`\nReport: ${path.relative(process.cwd(), path.join(dir, "report.md"))}\n`);
  if (stopped) process.exitCode = 4;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
