// npx tsx --env-file=.env.local scripts/mongo-test.ts
// Saves a fake test document with its personal fields as one Vault ciphertext, reads it back, then cleans up.
import { randomUUID } from "node:crypto";
import { closeMongo, getDb } from "../src/lib/db/mongo";
import { decryptJson, deleteKey, encryptJson, ensureKey, keyNameFor } from "../src/lib/vault/transit";

async function main() {
  const customerId = randomUUID();
  const key = keyNameFor(customerId);
  await ensureKey(key);

  const pii = { full_name: "Jane Specimen", date_of_birth: "1990-01-01", document_number: "X0000000" };
  const col = (await getDb()).collection("connectivity_test");
  const { insertedId } = await col.insertOne({ customerId, envelope: await encryptJson(key, pii), createdAt: new Date() });
  const saved = await col.findOne({ _id: insertedId });
  if (!String(saved!.envelope).startsWith("vault:v")) throw new Error("envelope is not ciphertext");
  const back = await decryptJson<typeof pii>(key, saved!.envelope);
  if (back.full_name !== pii.full_name) throw new Error("round-trip mismatch");
  console.log("Mongo + Vault round trip ok");

  await col.deleteOne({ _id: insertedId });
  await deleteKey(key);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
    process.exitCode = 1;
  })
  .finally(closeMongo);
