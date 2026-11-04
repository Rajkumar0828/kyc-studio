// Regression test for "Broken at event #4: the event has fields the schema does
// not allow". Runs real route handlers (compile, draft, publish, archive, apply)
// against in-memory stores, with the in-memory audit chain storing events the way
// MongoDB does (undefined -> null), then verifies the chain. Also checks that a
// case_received event written before the fix (data: null, no schemaVersion)
// still verifies, and that nothing else is let through.
// No network, no files written. Usage: npx tsx scripts/audit-regression-test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalJson } from "../src/lib/canonicalJson";
import { createChainLog, createMemoryBackend, GENESIS, parseStoredEvent, type AuditEvent } from "../src/lib/audit/chain";
import { createHash } from "node:crypto";

process.env.AI_PROVIDER = "mock";
process.env.AUDIT_LOG = "memory";
process.env.POLICY_STORE = "file";
process.env.APPLICATION_LOG = "file";
process.env.AI_CALL_LOG = "memory";
process.env.DEMO_ACCESS_CODE = "audit-regression-code";
process.env.RATE_LIMIT_PER_MINUTE = "1000";

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

const SPECIMENS = path.join(__dirname, "..", "..", "eval", "specimens");
const COOKIE = { cookie: `kyc_demo_access=${process.env.DEMO_ACCESS_CODE}` };
const json = (body: unknown) => ({ method: "POST", headers: { ...COOKIE, "content-type": "application/json" }, body: JSON.stringify(body) });
const params = <T>(p: T) => ({ params: Promise.resolve(p) }) as never;
const file = (caseId: string, name: string) => new File([fs.readFileSync(path.join(SPECIMENS, caseId, name))], name, { type: "image/png" });

// The pre-fix hash: no schemaVersion, data absent (canonicalJson drops undefined).
const legacyHash = (e: Omit<AuditEvent, "hash" | "schemaVersion">) => {
  const { seq, at, type, actor, caseId, policyId, policyVersion, data, prevHash } = e;
  return createHash("sha256").update(prevHash + canonicalJson({ seq, at, type, actor, caseId, policyId, policyVersion, data, prevHash })).digest("hex");
};

async function main() {
  // In-memory stores behind the app's own globals, so nothing touches data/.
  const { createCollectionStore, memoryCollections } = await import("../src/lib/policy/store/collectionStore");
  const g = globalThis as unknown as { _policyStore?: unknown; _applicationLog?: unknown };
  g._policyStore = { kind: "file", store: createCollectionStore(memoryCollections()) };
  const applications: unknown[] = [];
  g._applicationLog = { record: async (r: unknown) => void applications.push(r), recent: async () => applications };

  const { getAuditLog } = await import("../src/lib/audit");
  const audit = getAuditLog();
  assert.equal(audit.kind, "memory");

  await test("policy compile -> draft -> publish -> archive through the real routes", async () => {
    const { EXAMPLE_PROMPTS } = await import("../src/lib/policy/defaults");
    const compile = await (await import("../app/api/policies/compile/route")).POST(new Request("http://app/api/policies/compile", json({ text: EXAMPLE_PROMPTS[0].text })));
    assert.equal(compile.status, 200, await compile.clone().text());
    const c = await compile.json();
    const save = await (await import("../app/api/policies/route")).POST(new Request("http://app/api/policies", json({
      name: "Audit regression", customerCategory: "retail", sourceText: EXAMPLE_PROMPTS[0].text, consentText: "Synthetic consent text.",
      rules: c.rules, compile: c.compile, compileToken: c.token,
    })));
    assert.equal(save.status, 201, await save.clone().text());
    const { draft } = await save.json();
    const publish = await (await import("../app/api/policies/[id]/publish/route")).POST(new Request(`http://app/api/policies/${draft.id}/publish`, { method: "POST", headers: COOKIE }), params({ id: draft.id }));
    assert.equal(publish.status, 200, await publish.clone().text());
    const archive = await (await import("../app/api/policies/[id]/archive/route")).POST(new Request(`http://app/api/policies/${draft.id}/archive`, { method: "POST", headers: COOKIE }), params({ id: draft.id }));
    assert.ok(archive.status < 300, await archive.clone().text());
  });

  const { POST: apply } = await import("../app/api/apply/[policyId]/route");
  const run = async (caseId: string) => {
    const form = new FormData();
    form.set("policyVersion", "1");
    form.set("consent", "true");
    form.set("consentAt", new Date().toISOString());
    form.append("documents", file(caseId, "id.png"));
    form.append("documentTypes", "national_id");
    form.append("documents", file(caseId, "bill.png"));
    form.append("documentTypes", "utility_bill");
    form.set("selfie", file(caseId, "selfie.png"));
    const res = await apply(new Request("http://app/api/apply/housing-loan", { method: "POST", headers: COOKIE, body: form }), params({ policyId: "housing-loan" }));
    assert.equal(res.status, 200, await res.clone().text());
    return (await res.json()).decision as string;
  };

  await test("applications through /api/apply: pass, request_info and the quality gate", async () => {
    assert.equal(await run("p1-clean"), "auto_approve");
    assert.equal(await run("p1-expired"), "request_info");
    assert.equal(await run("p2-blurry"), "request_info");
  });

  await test("the whole chain verifies intact, with case_received events stored without data", async () => {
    const result = await audit.verify();
    assert.deepEqual(result?.firstBroken, null, JSON.stringify(result?.firstBroken));
    const events = await audit.recent(200);
    const types = new Set(events.map((e) => e.type));
    for (const t of ["policy_draft_saved", "policy_published", "policy_archived", "consent_recorded", "case_received", "quality_gate_failed", "document_processed", "checks_completed", "decision_proposed"])
      assert.ok(types.has(t as AuditEvent["type"]), `missing ${t}`);
    const received = events.filter((e) => e.type === "case_received");
    assert.equal(received.length, 3);
    for (const e of received) {
      assert.ok(!("data" in e), `case_received stored data: ${JSON.stringify(e)}`);
      assert.equal(e.schemaVersion, 2);
    }
    assert.ok(events.every((e) => e.schemaVersion === 2));
  });

  // A chain as production holds it: v1 events, including a case_received exactly
  // as the old code stored it, then v2 events appended by the new code.
  const legacyChain = () => {
    const { backend, events } = createMemoryBackend();
    const caseId = randomUUID();
    const v1 = (seq: number, prevHash: string, fields: Partial<AuditEvent>): AuditEvent => {
      const base = { seq, at: new Date(Date.UTC(2026, 10, 3, 10, 0, seq)).toISOString(), prevHash, actor: "system", ...fields } as Omit<AuditEvent, "hash">;
      return { ...base, hash: legacyHash(base) } as AuditEvent;
    };
    const e1 = v1(1, GENESIS, { type: "policy_draft_saved", actor: "officer:demo", policyId: "test-general" });
    const e2 = v1(2, e1.hash, { type: "policy_published", actor: "officer:demo", policyId: "test-general", policyVersion: 1 });
    const e3 = v1(3, e2.hash, { type: "consent_recorded", actor: "customer", caseId, policyId: "test-general", policyVersion: 1 });
    const e4 = v1(4, e3.hash, { type: "case_received", caseId, policyId: "test-general", policyVersion: 1 });
    // Stored the way MongoDB stored the old append({ ..., data: undefined }).
    events.push(e1, e2, e3, { ...e4, data: null } as unknown as AuditEvent);
    return { backend, events, caseId };
  };

  await test("a legacy case_received event (data: null, no schemaVersion) verifies, and new events chain on", async () => {
    const { backend, caseId } = legacyChain();
    const log = createChainLog("memory", backend);
    assert.equal((await log.verify())?.ok, true, JSON.stringify((await log.verify())?.firstBroken));
    await log.append({ type: "case_received", actor: "system", caseId, policyId: "test-general", policyVersion: 1 });
    await log.append({ type: "decision_proposed", actor: "ai:mock", caseId, policyId: "test-general", policyVersion: 1, data: { decision: "auto_approve", riskScore: 0, flagCodes: [] } });
    const r = await log.verify();
    assert.equal(r?.ok, true, JSON.stringify(r?.firstBroken));
    assert.equal(r?.count, 6);
  });

  await test("the legacy allowance is exact: other types, extra keys, personal data and v2 nulls are rejected", () => {
    const { events } = legacyChain();
    const legacy = events[3] as unknown as Record<string, unknown>;
    assert.ok(parseStoredEvent(legacy), "the exact legacy shape is accepted");
    assert.equal(parseStoredEvent({ ...legacy, type: "decision_proposed" }), null, "data: null only for case_received");
    assert.equal(parseStoredEvent({ ...legacy, fullName: "Elin Thornquist" }), null, "unknown keys rejected");
    assert.equal(parseStoredEvent({ ...legacy, data: { note: "Elin Thornquist" } }), null, "free text in data rejected");
    assert.equal(parseStoredEvent({ ...legacy, schemaVersion: 2 }), null, "a v2 event may not carry data: null");
    assert.equal(parseStoredEvent({ ...legacy, schemaVersion: 3 }), null, "unknown schema versions rejected");
  });

  await test("append never stores an undefined key, even when the caller passes one", async () => {
    const { backend, events } = createMemoryBackend();
    const log = createChainLog("memory", backend);
    await log.append({ type: "case_received", actor: "system", caseId: randomUUID(), policyId: "housing-loan", policyVersion: 1, data: undefined });
    assert.ok(!("data" in events[0]), JSON.stringify(events[0]));
    assert.equal((await log.verify())?.ok, true);
    await assert.rejects(log.append({ type: "case_received", actor: "system", fullName: "x" } as never));
  });

  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
void main();
