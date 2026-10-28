// One Transit key per customer (e.g. cust-<id>) enables crypto-shredding:
// deleting the key makes that customer's ciphertext unreadable.
const base = process.env.VAULT_ADDR!;
const h = () => ({ "X-Vault-Token": process.env.VAULT_TOKEN!, "Content-Type": "application/json" });

export async function ensureKey(name: string) {
  const r = await fetch(`${base}/v1/transit/keys/${name}`, { method: "POST", headers: h(), body: "{}" });
  if (!r.ok) throw new Error(`vault ensureKey ${r.status}: ${await r.text()}`);
}
export async function encrypt(key: string, plain: string) {
  const r = await fetch(`${base}/v1/transit/encrypt/${key}`, {
    method: "POST", headers: h(),
    body: JSON.stringify({ plaintext: Buffer.from(plain).toString("base64") }),
  });
  if (!r.ok) throw new Error(`vault encrypt ${r.status}: ${await r.text()}`);
  return (await r.json()).data.ciphertext as string;
}
export async function decrypt(key: string, ciphertext: string) {
  const r = await fetch(`${base}/v1/transit/decrypt/${key}`, { method: "POST", headers: h(), body: JSON.stringify({ ciphertext }) });
  if (!r.ok) throw new Error(`vault decrypt ${r.status}: ${await r.text()}`);
  return Buffer.from((await r.json()).data.plaintext, "base64").toString();
}
