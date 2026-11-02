// npx tsx --env-file=.env.local scripts/vault-test.ts
// Round trip through Vault Transit, then crypto-shredding: after deleteKey the ciphertext is unreadable.
import { randomUUID } from "node:crypto";
import { decrypt, deleteKey, encrypt, ensureKey, keyNameFor, VaultKeyMissing } from "../src/lib/vault/transit";

async function main() {
  const key = keyNameFor(randomUUID());
  await ensureKey(key);
  const ct = await encrypt(key, "hello");
  console.log("ciphertext:", ct.slice(0, 12) + "…");
  if ((await decrypt(key, ct)) !== "hello") throw new Error("round-trip mismatch");
  console.log("round trip ok");
  await deleteKey(key);
  try {
    await decrypt(key, ct);
    throw new Error("decrypt still worked after the key was deleted");
  } catch (e) {
    if (!(e instanceof VaultKeyMissing)) throw e;
    console.log("after deleteKey: unreadable (key missing), as expected");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
  process.exit(1);
});
