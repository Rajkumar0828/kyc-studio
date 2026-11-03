// Offline tests for the publish-time guide wording when Meta's answer is cut off.
// Every model answer is faked; nothing is written to data/. Usage: npx tsx scripts/guide-fallback-test.ts
import assert from "node:assert/strict";
import type { ChatRequest, ChatResult, MetaStep } from "../src/lib/ai/meta";
import { metaSettings } from "../src/lib/ai/meta";
import { createMetaCustomerGuide } from "../src/lib/ai/metaCustomerGuide";
import { compileEnglish } from "../src/lib/ai/mockPolicyCompiler";
import { recordingWrapper, type AiCallRecord } from "../src/lib/ai/recordAiCall";
import { JOURNEY_STEPS } from "../src/lib/ai/types";
import { summarizeUsage } from "../src/lib/ai/usage";
import { EXAMPLE_PROMPTS } from "../src/lib/policy/defaults";
import { generateGuide, TEMPLATE_FALLBACK_LABEL } from "../src/lib/policy/guide";
import { createCollectionStore, memoryCollections } from "../src/lib/policy/store/collectionStore";
import { specFromDraft } from "../src/lib/policy/store/types";

// Keep recorded calls in memory: never append to data/ai-calls.jsonl.
process.env.AI_CALL_LOG = "memory";
delete process.env.META_MAX_TOKENS_GUIDE;
delete process.env.META_EFFORT_GUIDE;

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

// The live failure: low effort, 1,874 reasoning tokens, cut off at the cap.
const LENGTH: ChatResult = {
  content: '{"consent":"We need your consent to',
  finishReason: "length",
  usage: { prompt_tokens: 310, completion_tokens: 2000, total_tokens: 2310, completion_tokens_details: { reasoning_tokens: 1874 } },
};
const OK: ChatResult = {
  content: JSON.stringify(Object.fromEntries(JOURNEY_STEPS.map((s) => [s, `Help for ${s}.`]))),
  finishReason: "stop",
  usage: { prompt_tokens: 310, completion_tokens: 900, total_tokens: 1210, completion_tokens_details: { reasoning_tokens: 700 } },
};

// A Meta guide whose API call is faked but still goes through the production recording wrapper.
function fakeGuide(answer: ChatResult) {
  const records: AiCallRecord[] = [];
  const bodies: ChatRequest[] = [];
  const record = recordingWrapper({ meter: false, onRecord: (r) => records.push(r) });
  const guide = createMetaCustomerGuide({
    call: (step: MetaStep, body: ChatRequest) => record(step, body, async (b) => (bodies.push(b), answer)),
  });
  return { guide, records, bodies };
}

const { rules } = compileEnglish(EXAMPLE_PROMPTS[1].text);
const input = { name: "Student account", customerCategory: "retail", sourceText: EXAMPLE_PROMPTS[1].text, consentText: "Consent text written by the officer.", rules, compile: null };

async function main() {
  await test("the guide call uses effort low and max_completion_tokens 6000 by default", async () => {
    const s = metaSettings();
    assert.equal(s.reasoningEffort.guide, "low");
    assert.equal(s.maxCompletionTokens.guide, 6000);
    const { guide, bodies } = fakeGuide(OK);
    const draft = await createCollectionStore(memoryCollections()).saveDraft(input);
    await generateGuide(specFromDraft(draft, 1, new Date().toISOString()), guide);
    assert.equal(bodies[0].max_completion_tokens, 6000);
    assert.equal(bodies[0].reasoning_effort, "low");
  });

  await test("META_MAX_TOKENS_GUIDE overrides the cap and rejects nonsense", () => {
    process.env.META_MAX_TOKENS_GUIDE = "8000";
    try {
      assert.equal(metaSettings().maxCompletionTokens.guide, 8000);
      assert.equal(metaSettings().maxCompletionTokens.compile, 6000, "other steps are unaffected");
      process.env.META_MAX_TOKENS_GUIDE = "lots";
      assert.throws(() => metaSettings(), /META_MAX_TOKENS_GUIDE must be an integer/);
    } finally {
      delete process.env.META_MAX_TOKENS_GUIDE;
    }
  });

  await test("a length-truncated guide answer: publish succeeds with the template guide, clearly marked", async () => {
    const store = createCollectionStore(memoryCollections());
    const draft = await store.saveDraft(input);
    const { guide: fake, records } = fakeGuide(LENGTH);
    // Same sequence as POST /api/policies/[id]/publish.
    const version = ((await store.versions(draft.id)).at(-1) ?? 0) + 1;
    const guide = await generateGuide(specFromDraft(draft, version, new Date().toISOString()), fake);
    const published = await store.publish(draft.id, { guide, version, draftUpdatedAt: draft.updatedAt });

    assert.equal(published.spec.version, 1);
    assert.equal(published.guide.source, "template_fallback");
    assert.equal(published.guide.provider, "template");
    assert.match(published.guide.note ?? "", /cut off at 6000 tokens \(finish_reason "length"\)/);
    for (const s of JOURNEY_STEPS) assert.ok(published.guide.steps[s].length > 0, `template wording for ${s}`);
    assert.equal(TEMPLATE_FALLBACK_LABEL, "template (AI wording unavailable)");
    assert.equal(records.length, 1);
    assert.equal(records[0].finishReason, "length");
    assert.equal(records[0].reasoningTokens, 1874);
  });

  await test("the usage summary counts a length-truncated call as failed", () => {
    const at = new Date().toISOString();
    const base = { at, source: "app", model: "muse-spark-1.3", effort: "low", inputTokens: 300, outputTokens: 900, reasoningTokens: 700, cachedInputTokens: null, latencyMs: 4000 } as const;
    const u = summarizeUsage([
      { ...base, step: "guide", finishReason: "length", error: null },
      { ...base, step: "guide", finishReason: "stop", error: null },
      { ...base, step: "compile", finishReason: null, error: "APIConnectionError" },
      { ...base, step: "compile", finishReason: "stop", error: null },
    ]);
    assert.equal(u.calls, 4);
    assert.equal(u.errors, 2);
    assert.equal(u.steps.find((s) => s.step === "guide")!.errors, 1);
    assert.equal(u.steps.find((s) => s.step === "compile")!.errors, 1);
  });

  await test("a complete answer is stored as AI wording", async () => {
    const draft = await createCollectionStore(memoryCollections()).saveDraft(input);
    const { guide: fake } = fakeGuide(OK);
    const guide = await generateGuide(specFromDraft(draft, 1, new Date().toISOString()), fake);
    assert.equal(guide.source, "ai");
    assert.equal(guide.effort, "low");
    assert.equal(guide.steps.consent, "Help for consent.");
  });

  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
void main();
