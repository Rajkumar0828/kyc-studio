// npx tsx --env-file=.env.local scripts/mongo-test.ts
// Saves a fake test document with PII fields stored as Vault ciphertext, then reads it back.
import { mongo, db } from "../src/lib/db/mongo";
import { ensureKey, encrypt, decrypt } from "../src/lib/vault/transit";

async function main() {
  const customerId = "test-001";
  const key = `cust-${customerId}`;
  await ensureKey(key);

  const pii = { full_name: "Jane Specimen", date_of_birth: "1990-01-01", document_number: "X0000000" };
  const enc = Object.fromEntries(await Promise.all(Object.entries(pii).map(async ([k, v]) => [k, await encrypt(key, v)])));

  const col = (await db()).collection("documents");
  const { insertedId } = await col.insertOne({ customerId, document_type: "specimen", pii: enc, createdAt: new Date() });
  const saved = await col.findOne({ _id: insertedId });
  console.log("stored:", JSON.stringify(saved, null, 2));

  for (const [k, ct] of Object.entries(saved!.pii as Record<string, string>)) {
    if (!ct.startsWith("vault:v")) throw new Error(`${k} is not ciphertext`);
    console.log(`${k} ->`, await decrypt(key, ct));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => (await mongo).close());
