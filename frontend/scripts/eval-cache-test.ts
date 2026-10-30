// Offline tests for the Meta eval's cache, call cap and call plan. No API calls:
// the "API" here is a fake send function.
// Usage: npx tsx scripts/eval-cache-test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildRequest, createMetaProvider, META_PROMPTS, META_SCHEMAS, MetaOutputTruncated, type ChatRequest, type ChatResult } from "../src/lib/ai/meta";
import { qualityProblems } from "../src/lib/pipeline/quality";
import type { Check } from "../src/lib/pipeline/types";
import { getDefaultPolicy } from "../src/lib/policy/defaults";
import { cacheKey, CallCapReached, createEvalCall, type CallRecord } from "./eval-meta/cache";
import { planCase } from "./eval-meta/estimate";

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
  const fakeSend = async (_b: ChatRequest) => {
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

  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}

main();
