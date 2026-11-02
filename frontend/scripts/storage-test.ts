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

  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}

main();
