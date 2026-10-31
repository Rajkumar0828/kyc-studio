// Offline tests for the Meta eval's cache, call cap and call plan. No API calls:
// the "API" here is a fake send function.
// Usage: npx tsx scripts/eval-cache-test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildRequest, createMetaProvider, META_PROMPTS, META_SCHEMAS, MetaOutputTruncated, type ChatResult } from "../src/lib/ai/meta";
import { qualityProblems } from "../src/lib/pipeline/quality";
import type { Check } from "../src/lib/pipeline/types";
import { getDefaultPolicy } from "../src/lib/policy/defaults";
import { cacheKey, CallCapReached, createEvalCall, type CallRecord } from "./eval-meta/cache";
import { planCase } from "./eval-meta/estimate";
import { planExtractOnly, summarise, uniqueDocs } from "./eval-meta/experiment";
import { scoreField } from "./eval-meta/score";

let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message.split("\n").join("\n      ") : e}`);
  }
}

const img = (b: string) => ({ filename: "x.png", mime: "image/png", bytes: Buffer.from(b) });
const body = (opts = {}, bytes = "image-a") => buildRequest("doc_class", META_SCHEMAS.doc_class, META_PROMPTS.doc_class(), img(bytes), opts);
const reply: ChatResult = { content: '{"docType":"passport","confidence":0.9}', finishReason: "stop", usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, completion_tokens_details: { reasoning_tokens: 7 } } };

async function main() {
  await test("cache key is stable for the same request", () => assert.equal(cacheKey(body()), cacheKey(body())));
  await test("cache key changes with image bytes, reasoning effort and output cap", () => {
    assert.notEqual(cacheKey(body()), cacheKey(body({}, "image-b")));
    assert.notEqual(cacheKey(body()), cacheKey(body({ reasoningEffort: { doc_class: "high" } })));
    assert.notEqual(cacheKey(body()), cacheKey(body({ maxCompletionTokens: { doc_class: 10 } })));
  });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kyc-eval-cache-"));
  const records: CallRecord[] = [];
  let sends = 0;
  const fakeSend = async () => {
    sends++;
    return reply;
  };
  const ec = createEvalCall({ cacheDir: dir, useCache: true, refresh: false, maxCalls: 2, caseId: () => "c1", docFor: () => "c1/id.png", onRecord: (r) => records.push(r) });

  await test("first call is live, second identical call is cached and does not hit the API", async () => {
    await ec.callStep("doc_class", body(), fakeSend);
    await ec.callStep("doc_class", body(), fakeSend);
    assert.equal(sends, 1);
    assert.deepEqual(records.map((r) => r.cached), [false, true]);
    assert.equal(ec.liveCalls(), 1);
  });

  await test("logged usage includes input, output and reasoning tokens; cached hits keep the stored usage", () => {
    assert.equal(records[0].inputTokens, 100);
    assert.equal(records[0].outputTokens, 20);
    assert.equal(records[0].reasoningTokens, 7);
    assert.equal(records[1].inputTokens, 100);
    assert.equal(records[1].latencyMs, null);
  });

  await test("the cache file stores the response and usage, not the image", () => {
    const stored = fs.readFileSync(path.join(dir, `${cacheKey(body())}.json`), "utf8");
    assert.match(stored, /"usage"/);
    assert.doesNotMatch(stored, /base64/);
  });

  await test("cached calls do not count toward the cap; live calls beyond it are refused", async () => {
    await ec.callStep("doc_class", body({}, "image-b"), fakeSend); // live #2
    await ec.callStep("doc_class", body(), fakeSend); // cached, allowed
    await assert.rejects(ec.callStep("doc_class", body({}, "image-c"), fakeSend), CallCapReached);
    assert.equal(sends, 2);
  });
  fs.rmSync(dir, { recursive: true, force: true });

  await test("finish_reason=length surfaces as MetaOutputTruncated, not a JSON error", async () => {
    const provider = createMetaProvider({ call: async () => ({ content: '{"docType":"pass', finishReason: "length" }) });
    await assert.rejects(provider.classifyDocument(img("image-a")), MetaOutputTruncated);
  });

  await test("call plan per specimen case matches the pipeline (blurry: 2 calls)", async () => {
    const root = path.resolve(__dirname, "..", "..", "eval", "specimens");
    const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8")) as { cases: Array<{ case_id: string; files: Array<{ file: string; role: string; document_type?: string; truth?: string }> }> };
    const counts: Record<string, number> = {};
    for (const c of index.cases) {
      const cf = JSON.parse(fs.readFileSync(path.join(root, c.case_id, "case.json"), "utf8"));
      const docs = c.files.filter((f) => f.role === "document").map((f) => ({
        name: f.file, documentType: f.document_type!, file: { filename: path.basename(f.file), mime: "image/png", bytes: fs.readFileSync(path.join(root, f.file)) },
        truth: JSON.parse(fs.readFileSync(path.join(root, f.truth!), "utf8")).fields,
      }));
      const qualityChecks: Check[] = (await Promise.all(docs.map((d) => qualityProblems(d.file)))).flat()
        .map((m) => ({ step: "quality", code: "quality_failed", status: "fail", category: "customer_fixable", message: m }));
      counts[c.case_id] = planCase({ caseId: c.case_id, policy: getDefaultPolicy(cf.policy_id)!, expectedDecision: cf.expected.decision, expectedCodes: cf.expected.flag_codes, docs, qualityChecks }, {}).length;
    }
    assert.deepEqual(counts, { "p1-clean": 5, "p2-clean": 5, "p1-expired": 6, "p2-name-mismatch": 6, "p1-address-mismatch": 6, "p2-blurry": 2 });
  });

  await test("repeat index changes the cache key; plain runs keep their old key", () => {
    const k = [cacheKey(body()), cacheKey(body(), 0), cacheKey(body(), 1), cacheKey(body(), 2)];
    assert.equal(new Set(k).size, 4);
    assert.equal(cacheKey(body(), undefined), k[0]);
  });

  await test("a repeat is cached only under its own index", async () => {
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "kyc-eval-repeat-"));
    let rep = 0;
    const recs: CallRecord[] = [];
    const ec2 = createEvalCall({ cacheDir: d2, useCache: true, refresh: false, maxCalls: 10, caseId: () => "x", repeat: () => rep, docFor: () => null, onRecord: (r) => recs.push(r) });
    await ec2.callStep("extraction", body(), async () => reply); // repeat 0 live
    rep = 1;
    await ec2.callStep("extraction", body(), async () => reply); // repeat 1 live, not a cache hit
    rep = 0;
    await ec2.callStep("extraction", body(), async () => reply); // repeat 0 again: cached
    assert.deepEqual(recs.map((r) => [r.repeat, r.cached]), [[0, false], [1, false], [0, true]]);
    assert.equal(ec2.isCached(body(), 2), false);
    fs.rmSync(d2, { recursive: true, force: true });
  });

  await test("extract-only plan: 10 unique specimen documents x 2 efforts x 3 repeats = 60 calls", () => {
    const root = path.resolve(__dirname, "..", "..", "eval", "specimens");
    const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8")) as { cases: Array<{ files: Array<{ file: string; role: string; document_type?: string }> }> };
    const docs = index.cases.flatMap((c) => c.files.filter((f) => f.role === "document"))
      .map((f) => ({
        name: f.file, documentType: f.document_type!, file: { filename: path.basename(f.file), mime: "image/png", bytes: fs.readFileSync(path.join(root, f.file)) },
        ...(({ fields, defects }) => ({ truth: fields, defects }))(JSON.parse(fs.readFileSync(path.join(root, f.file.replace(/\.png$/, ".truth.json")), "utf8"))),
      }));
    const unique = uniqueDocs(docs);
    assert.equal(docs.length, 12);
    assert.equal(unique.length, 10); // two cases reuse an ID with identical printed content
    assert.deepEqual(unique.filter((d) => d.documentType === "national_id").map((d) => d.name), ["p1-clean/id.png", "p2-clean/id.png", "p1-expired/id.png", "p2-blurry/id.png"]);
    const plan = planExtractOnly(unique, ["medium", "low"], 3, {});
    assert.equal(plan.length, 60);
    assert.deepEqual([...new Set(plan.map((p) => p.body.reasoning_effort))], ["medium", "low"]);
    assert.equal(new Set(plan.map((p) => cacheKey(p.body, p.repeat))).size, 60);
  });

  await test("experiment summary: per-repeat range, ID/bill split, agreement and failed-box diagnostics", () => {
    const truth = { found: true, value: "A", normalized: "A", box: [100, 100, 300, 200] as [number, number, number, number] };
    const good = (v = "A") => scoreField("full_name", { found: true, value: v, box: [110, 110, 290, 190] }, truth);
    const bad = () => scoreField("full_name", { found: true, value: "A", box: [500, 500, 700, 600] }, truth);
    const docR = (doc: string, type: string, fields: ReturnType<typeof good>[]) => ({ doc, truthType: type, predictedType: null, classPass: null, extractionCached: false, fields });
    const runs = [
      { effort: "low", repeat: 0, docs: [docR("a/id.png", "national_id", [good()]), docR("a/bill.png", "utility_bill", [good()])], failures: [] },
      { effort: "low", repeat: 1, docs: [docR("a/id.png", "national_id", [good()]), docR("a/bill.png", "utility_bill", [bad()])], failures: [] },
      { effort: "low", repeat: 2, docs: [docR("a/id.png", "national_id", [good("B")]), docR("a/bill.png", "utility_bill", [good()])], failures: [{ doc: "x", type: "length" as const, message: "cut" }] },
    ];
    const rec = (latencyMs: number): CallRecord => ({ caseId: "x", doc: null, step: "extraction", model: "m", effort: "low", repeat: 0, inputTokens: 100, outputTokens: 10, reasoningTokens: 5, cachedInputTokens: 0, latencyMs, cached: false, finishReason: "stop" });
    const [s] = summarise(runs, [rec(100), rec(300)], { input: 1, cachedInput: 0, output: 1 });
    assert.equal(s.boxRate!.min, 0.5);
    assert.equal(s.boxRate!.max, 1);
    assert.ok(Math.abs(s.boxRate!.mean - 5 / 6) < 1e-9);
    assert.equal(s.boxRateId!.mean, 1);
    assert.ok(Math.abs(s.boxRateBill!.mean - 2 / 3) < 1e-9);
    assert.deepEqual(s.agreement, { agreed: 1, total: 2 }); // bill value stable, ID changed in repeat 2
    assert.equal(s.meanLatencyMs, 200);
    assert.equal(s.lengthFailures, 1);
    assert.equal(s.failedBoxes.n, 1);
    assert.equal(s.failedBoxes.dx!.mean, 40);
  });

  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}

main();
