// Offline tests for the audit hash chain. Usage: npx tsx scripts/audit-chain-test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  AuditAppendFailed, createChainLog, createMemoryBackend, DuplicateSeq, GENESIS, type AuditBackend, type AuditInput,
} from "../src/lib/audit/chain";
import { pipelineAuditSink } from "../src/lib/audit";
import { getAi } from "../src/lib/ai";
import { getDefaultPolicy } from "../src/lib/policy/defaults";
import { runPipeline } from "../src/lib/pipeline/run";

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

const caseId = randomUUID();
const ev = (i: number): AuditInput => ({ type: "decision_proposed", actor: "system", caseId, policyId: "housing-loan", policyVersion: 1, data: { decision: "manual_review", count: i } });

async function chainOf(n: number) {
  const mem = createMemoryBackend();
  const log = createChainLog("memory", mem.backend);
  for (let i = 0; i < n; i++) await log.append(ev(i));
  return { log, events: mem.events };
}

async function main() {
  await test("appends form a valid chain from the genesis hash", async () => {
    const { log, events } = await chainOf(5);
    assert.deepEqual(events.map((e) => e.seq), [1, 2, 3, 4, 5]);
    assert.equal(events[0].prevHash, GENESIS);
    assert.equal(events[1].prevHash, events[0].hash);
    const v = (await log.verify())!;
    assert.equal(v.ok, true);
    assert.equal(v.count, 5);
    assert.equal(v.lastHash, events[4].hash);
  });

  await test("tampering with a stored field is reported at that event", async () => {
    const { log, events } = await chainOf(5);
    events[2].data = { decision: "auto_approve", count: 2 };
    const v = (await log.verify())!;
    assert.equal(v.ok, false);
    assert.deepEqual([v.firstBroken!.seq, v.firstBroken!.reason], [3, "hash_mismatch"]);
  });

  await test("a forged hash breaks the next link", async () => {
    const { log, events } = await chainOf(5);
    events[1].hash = "f".repeat(64);
    const v = (await log.verify())!;
    assert.deepEqual([v.firstBroken!.seq, v.firstBroken!.reason], [2, "hash_mismatch"]);
  });

  await test("a deleted event shows as a sequence gap", async () => {
    const { log, events } = await chainOf(5);
    events.splice(3, 1);
    const v = (await log.verify())!;
    assert.deepEqual([v.firstBroken!.seq, v.firstBroken!.reason], [5, "seq_gap"]);
  });

  await test("swapping two events (with renumbered seqs) is detected", async () => {
    const { log, events } = await chainOf(5);
    [events[1].data, events[2].data] = [events[2].data, events[1].data];
    assert.equal((await log.verify())!.ok, false);
  });

  for (const lock of [true, false]) {
    await test(`20 concurrent appends ${lock ? "WITH" : "WITHOUT"} the in-process lock stay consistent`, async () => {
      const mem = createMemoryBackend();
      const log = createChainLog("memory", mem.backend, { lock });
      await Promise.all(Array.from({ length: 20 }, (_, i) => log.append(ev(i))));
      assert.deepEqual(mem.events.map((e) => e.seq).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
      assert.equal((await log.verify())!.ok, true);
      if (!lock) assert.ok(log.stats().retries > 0, "without the lock, writers must actually have collided");
      else assert.equal(log.stats().retries, 0);
    });
  }

  await test("two separate writers (like two server processes) sharing one store stay consistent", async () => {
    const mem = createMemoryBackend();
    const a = createChainLog("memory", mem.backend), b = createChainLog("memory", mem.backend);
    await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).append(ev(i))));
    assert.equal(mem.events.length, 20);
    assert.equal((await a.verify())!.ok, true);
  });

  await test("retrying stops after about 2 s and fails loudly (never skipped)", async () => {
    const stuck: AuditBackend = { ...createMemoryBackend().backend, insert: async () => { throw new DuplicateSeq(); } };
    const log = createChainLog("memory", stuck, { retryForMs: 300 });
    const t0 = Date.now();
    await assert.rejects(log.append(ev(0)), AuditAppendFailed);
    assert.ok(Date.now() - t0 < 1500);
  });

  await test("events cannot carry personal data: unknown fields and free text are rejected", async () => {
    const { log } = await chainOf(0);
    await assert.rejects(log.append({ ...ev(0), data: { decision: "manual_review", fullName: "Elin Thornquist" } } as unknown as AuditInput));
    await assert.rejects(log.append({ ...ev(0), message: "Elin Thornquist" } as unknown as AuditInput));
    await assert.rejects(log.append({ ...ev(0), caseId: "elin-thornquist" }));
    await assert.rejects(log.append({ ...ev(0), data: { flagCodes: ["Name differs: Elin"] } }));
  });

  await test("a full mock pipeline run writes ids and codes only (no names from check messages)", async () => {
    const mem = createMemoryBackend();
    const log = createChainLog("memory", mem.backend);
    const png = async (name: string) => ({ filename: name, mime: "image/png", bytes: await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#888", noise: { type: "gaussian", mean: 128, sigma: 40 } } }).png().toBuffer() });
    const policy = getDefaultPolicy("housing-loan")!;
    const id = randomUUID();
    const r = await runPipeline(
      { caseId: id, documents: [await png("passport.png"), await png("utility_bill_mismatch.png")], selfie: await png("selfie.png") },
      policy, getAi(), pipelineAuditSink(log, { caseId: id, policyId: policy.id, policyVersion: policy.version }),
    );
    assert.ok(r.checks.some((c) => /Jonathan Mercer|Emily Carter/.test(c.message) || c.code === "full_name_mismatch"));
    const json = JSON.stringify(mem.events);
    assert.doesNotMatch(json, /Emily|Carter|Jonathan|Mercer|Willow|1991-04-12|P8234519/);
    const decision = mem.events.find((e) => e.type === "decision_proposed")!;
    assert.ok(decision.data!.flagCodes!.includes("full_name_mismatch"));
    assert.equal((await log.verify())!.ok, true);
  });

  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}

main();
