// Run once: npx tsx --env-file=.env.local scripts/vault-init.ts
async function main() {
  const base = process.env.VAULT_ADDR!;
  const h = { "X-Vault-Token": process.env.VAULT_TOKEN!, "Content-Type": "application/json" };
  const r = await fetch(`${base}/v1/sys/mounts/transit`, { method: "POST", headers: h, body: JSON.stringify({ type: "transit" }) });
  // 204 on success; a 400 saying the path is already in use is fine.
  console.log("enable transit:", r.status, r.ok ? "" : await r.text());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
