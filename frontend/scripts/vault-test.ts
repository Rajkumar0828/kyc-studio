// npx tsx --env-file=.env.local scripts/vault-test.ts
import { ensureKey, encrypt, decrypt } from "../src/lib/vault/transit";

async function main() {
  await ensureKey("cust-test");
  const ct = await encrypt("cust-test", "hello");
  console.log("ciphertext:", ct);
  const pt = await decrypt("cust-test", ct);
  console.log("decrypted:", pt);
  if (pt !== "hello") throw new Error("round-trip mismatch");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
