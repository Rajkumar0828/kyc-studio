// Offline tests for recordAiCall: metadata only, correlation ids, metering. No API calls.
// Usage: AI_CALL_LOG=memory npx tsx scripts/ai-call-log-test.ts
import assert from "node:assert/strict";
import { buildRequest, META_SCHEMAS, type ChatResult } from "../src/lib/ai/meta";
import { AiCallRecord, recordingWrapper, setAiCallSink, type AiCallSink } from "../src/lib/ai/recordAiCall";
import { AiBudgetExceeded } from "../src/lib/security/aiBudget";

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

const MARKER = "ZEBRA-MARKER-7731";
const captured: AiCallRecord[] = [];
const sink: AiCallSink = { write: (r) => void captured.push(r), recent: () => captured };
setAiCallSink(sink);

const image = { filename: "x.png", mime: "image/png", bytes: Buffer.from(`image bytes ${MARKER}`) };
const body = buildRequest("extraction", META_SCHEMAS.extraction, `Policy text and prompt with ${MARKER}`, image);
const reply: ChatResult = {
  content: `{"answer":"${MARKER}"}`, finishReason: "stop",
  usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500, completion_tokens_details: { reasoning_tokens: 120 }, prompt_tokens_details: { cached_tokens: 0 } },
};
const ALLOWED = Object.keys(AiCallRecord.shape).sort();

async function main() {
  await test("a call is recorded with step, model, tokens and latency, and nothing from the prompt, image or response", async () => {
    const wrap = recordingWrapper({ caseId: "apply-1", policyId: "housing-loan", meter: false });
    await wrap("extraction", body, async () => reply);
    const r = captured.at(-1)!;
    assert.equal(r.step, "extraction");
    assert.equal(r.model, body.model);
    assert.equal(r.inputTokens, 1200);
    assert.equal(r.outputTokens, 300);
    assert.equal(r.reasoningTokens, 120);
    assert.equal(typeof r.latencyMs, "number");
    assert.equal(r.caseId, "apply-1");
    assert.equal(r.policyId, "housing-loan");
    const json = JSON.stringify(r);
    assert.doesNotMatch(json, new RegExp(MARKER));
    assert.doesNotMatch(json, /base64/);
    assert.ok(Object.keys(r).every((k) => ALLOWED.includes(k)), Object.keys(r).join(","));
  });

  await test("a failed call records only the error class and status, not its message", async () => {
    const wrap = recordingWrapper({ meter: false });
    const err = Object.assign(new Error(`upstream echoed ${MARKER}`), { status: 400 });
    await assert.rejects(wrap("compile" as never, body, async () => { throw err; }));
    const r = captured.at(-1)!;
    assert.equal(r.error, "Error 400");
    assert.doesNotMatch(JSON.stringify(r), new RegExp(MARKER));
  });

  await test("the record schema refuses content fields", () => {
    const ok = captured[0];
    assert.throws(() => AiCallRecord.parse({ ...ok, prompt: "x" }));
    assert.throws(() => AiCallRecord.parse({ ...ok, content: "x" }));
  });

  await test("each Meta API call counts toward the daily AI cap", async () => {
    process.env.AI_DAILY_CALL_CAP = "1";
    const wrap = recordingWrapper({});
    await wrap("extraction", body, async () => reply);
    await assert.rejects(wrap("extraction", body, async () => reply), AiBudgetExceeded);
  });

  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}

main();
