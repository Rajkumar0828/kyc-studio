// Offline tests for the persistence layer (no Docker, no Meta): Vault client,
// lazy Mongo client, health. Usage: npx tsx scripts/storage-test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createFakeVault } from "./fakes/fakeVault";

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

const TOKEN = "a1b2c3d4e5f6";

async function main() {
  // Importing must not connect or read config: run with nothing configured.
  delete process.env.MONGODB_URI;
  delete process.env.VAULT_ADDR;
  delete process.env.VAULT_TOKEN;
  const mongo = await import("../src/lib/db/mongo");
  const vault = await import("../src/lib/vault/transit");

  await test("importing the Mongo and Vault clients connects to nothing; unconfigured calls fail clearly", async () => {
    assert.equal(await mongo.pingMongo(), "not_configured");
    await assert.rejects(mongo.getDb(), mongo.MongoNotConfigured);
    assert.deepEqual(await vault.vaultHealth(), { status: "not_configured", tokenValid: null, clusterId: null });
    await assert.rejects(vault.ensureKey(vault.keyNameFor(randomUUID())), vault.VaultNotConfigured);
  });

  process.env.VAULT_ADDR = "http://vault.test:8200";
  process.env.VAULT_TOKEN = TOKEN;
  const fake = createFakeVault({ token: TOKEN });
  vault.setVaultFetch(fake.fetch);
  const key = vault.keyNameFor(randomUUID());

  await test("encryption round trip; the ciphertext does not contain the plaintext", async () => {
    await vault.ensureKey(key);
    const secret = { full_name: "Elin Thornquist", document_number: "VD4K7Q2M9T" };
    const ct = await vault.encryptJson(key, secret);
    assert.match(ct, /^vault:v1:/);
    assert.doesNotMatch(ct, /Thornquist|VD4K7Q2M9T/);
    assert.deepEqual(await vault.decryptJson(key, ct), secret);
  });

  await test("key names must be cust-<uuid> (no path injection)", async () => {
    await assert.rejects(vault.ensureKey("cust-../sys/seal"), vault.VaultError);
    await assert.rejects(vault.encrypt("other-key", "x"), vault.VaultError);
  });

  await test("deleteKey sets deletion_allowed first, then deletes; the ciphertext becomes unreadable (key missing)", async () => {
    const ct = await vault.encrypt(key, "hello");
    fake.calls.length = 0;
    await vault.deleteKey(key);
    assert.deepEqual(fake.calls, [`POST transit/keys/${key}/config`, `DELETE transit/keys/${key}`]);
    await assert.rejects(vault.decrypt(key, ct), vault.VaultKeyMissing);
    await vault.deleteKey(key); // already gone: still succeeds
  });

  await test("encrypt with a missing key fails instead of silently creating it", async () => {
    await assert.rejects(vault.encrypt(vault.keyNameFor(randomUUID()), "x"), vault.VaultKeyMissing);
  });

  await test("errors are typed: unreachable, sealed and invalid token", async () => {
    const k = vault.keyNameFor(randomUUID());
    fake.setUp(false);
    await assert.rejects(vault.ensureKey(k), vault.VaultUnavailable);
    fake.setUp(true);
    fake.setSealed(true);
    await assert.rejects(vault.ensureKey(k), vault.VaultUnavailable);
    fake.setSealed(false);
    fake.setTokenValid(false);
    await assert.rejects(vault.ensureKey(k), vault.VaultAuthError);
    fake.setTokenValid(true);
  });

  await test("error messages never contain plaintext or ciphertext", async () => {
    const k = vault.keyNameFor(randomUUID());
    await vault.ensureKey(k);
    const ct = await vault.encrypt(k, "Elin Thornquist");
    await vault.deleteKey(k);
    const e = await vault.decrypt(k, ct).catch((x: unknown) => x as Error);
    assert.ok(e instanceof Error);
    assert.doesNotMatch(e.message, /Thornquist|vault:v1/);
  });

  await test("vaultHealth reports up, sealed, down, an invalid token and the cluster id", async () => {
    assert.deepEqual(await vault.vaultHealth(), { status: "up", tokenValid: true, clusterId: fake.clusterId() });
    fake.setTokenValid(false);
    assert.equal((await vault.vaultHealth()).tokenValid, false);
    fake.setTokenValid(true);
    fake.setSealed(true);
    assert.equal((await vault.vaultHealth()).status, "sealed");
    fake.setSealed(false);
    fake.setUp(false);
    assert.equal((await vault.vaultHealth()).status, "down");
    fake.setUp(true);
    const before = fake.clusterId();
    fake.restart();
    assert.notEqual((await vault.vaultHealth()).clusterId, before);
  });

  await test("listKeys returns customer key names and [] when there are none", async () => {
    fake.restart();
    assert.deepEqual(await vault.listKeys(), []);
    const k = vault.keyNameFor(randomUUID());
    await vault.ensureKey(k);
    assert.deepEqual(await vault.listKeys(), [k]);
  });

  const { configWarnings, healthReport, storageRequirement, RESTART_WARNING } = await import("../src/lib/health");
  const up = { status: "up" as const, tokenValid: true, clusterId: "c1" };
  const allMongo = { policy: "mongo" as const, applications: "mongo" as const, aiCalls: "mongo" as const, audit: "mongo" as const };

  await test("health: a consistent all-mongo setup has no warnings", () => {
    assert.deepEqual(configWarnings(allMongo, "up", up, null), []);
  });

  await test("health: cases on mongo but audit not is flagged", () => {
    const w = configWarnings({ ...allMongo, audit: "console" }, "up", up, null);
    assert.ok(w.some((x) => /audit log is not \(AUDIT_LOG=console\)/.test(x)));
  });

  await test("health: cases on mongo with Vault down, sealed or a bad token are flagged", () => {
    assert.ok(configWarnings(allMongo, "up", { status: "down", tokenValid: null, clusterId: null }, null).some((x) => /Vault is down/.test(x)));
    assert.ok(configWarnings(allMongo, "up", { status: "sealed", tokenValid: null, clusterId: null }, null).some((x) => /Vault is sealed/.test(x)));
    assert.ok(configWarnings(allMongo, "up", { ...up, tokenValid: false }, null).some((x) => /token .* invalid or expired/.test(x)));
  });

  await test("health: mongo switches with Mongo down, an in-memory audit chain, and a Vault restart are flagged", () => {
    assert.ok(configWarnings(allMongo, "down", up, null).some((x) => /MongoDB is down, but policy, applications, aiCalls, audit are set to mongo/.test(x)));
    assert.ok(configWarnings({ policy: "file", applications: "file", aiCalls: "file", audit: "memory" }, "not_configured", up, null).some((x) => /in memory/.test(x)));
    assert.ok(configWarnings(allMongo, "up", up, RESTART_WARNING).includes(RESTART_WARNING));
  });

  await test("health: with nothing configured the report degrades instead of throwing", async () => {
    const saved = { ...process.env };
    for (const k of ["MONGODB_URI", "VAULT_ADDR", "VAULT_TOKEN", "POLICY_STORE", "APPLICATION_LOG", "AI_CALL_LOG", "AUDIT_LOG"]) delete process.env[k];
    const r = await healthReport();
    assert.equal(r.mongo, "not_configured");
    assert.equal(r.vault.status, "not_configured");
    assert.deepEqual(r.stores, { policy: "file", applications: "file", aiCalls: "file", audit: "console" });
    assert.equal(r.status, "ok");
    assert.equal(storageRequirement("cases") !== null && storageRequirement("audit") !== null && storageRequirement("usage") !== null, true);
    Object.assign(process.env, saved);
  });

  await test("health: a Vault restart warning means degraded, and liveness stays 200", async () => {
    const { healthStatus } = await import("../src/lib/health");
    const up = { status: "up" as const, tokenValid: true, clusterId: "c2" };
    const allMongo = { policy: "mongo", applications: "mongo", aiCalls: "mongo", audit: "mongo" } as const;
    assert.equal(healthStatus(configWarnings(allMongo, "up", up, RESTART_WARNING)), "degraded");
    assert.equal(healthStatus(configWarnings(allMongo, "up", up, null)), "ok");
    const { GET } = await import("../app/api/health/live/route");
    const res = GET();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { live: true });
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  const { summarizeUsage } = await import("../src/lib/ai/usage");
  await test("usage: totals, per-step averages and an estimated cost from list prices", () => {
    const rec = (step: string, latencyMs: number, inputTokens: number, outputTokens: number, error: string | null = null) => ({
      at: new Date(Date.now() + latencyMs).toISOString(), source: "app" as const, step, model: "muse-spark-1.3", effort: "low",
      inputTokens, outputTokens, reasoningTokens: 10, cachedInputTokens: 0, latencyMs, finishReason: "stop", error,
    });
    const s = summarizeUsage([rec("compile", 1000, 400, 2000), rec("compile", 3000, 600, 4000), rec("extraction", 2000, 1000, 500, "Error 500")], { input: 1, cachedInput: 0, output: 2 });
    assert.equal(s.calls, 3);
    assert.equal(s.errors, 1);
    assert.equal(s.inputTokens, 2000);
    assert.equal(s.outputTokens, 6500);
    const compile = s.steps.find((x) => x.step === "compile")!;
    assert.deepEqual([compile.calls, compile.avgLatencyMs, compile.avgInputTokens, compile.avgOutputTokens], [2, 2000, 500, 3000]);
    assert.ok(Math.abs(s.estimatedUsd - (2000 * 1 + 6500 * 2) / 1e6) < 1e-12);
    assert.match(s.pricesSource, /dev\.meta\.ai/);
  });

  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}

main();
