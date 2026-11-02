// Vault Transit client. One key per customer (cust-<uuid>) enables crypto-shredding:
// deleting the key makes that customer's ciphertext unreadable.
//
// Lazy: configuration (VAULT_ADDR, VAULT_TOKEN) is read on each call, so nothing
// happens at import or during `next build`. Errors are typed so callers can degrade
// ("unreadable: key missing") instead of crashing. Error messages never include
// plaintext or ciphertext.

export class VaultError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
  }
}
export class VaultNotConfigured extends VaultError {}
export class VaultUnavailable extends VaultError {} // unreachable, sealed or 5xx
export class VaultAuthError extends VaultError {} // token missing, expired or lacking a capability
export class VaultKeyMissing extends VaultError {} // the customer key does not exist (deleted, or lost on a dev-mode restart)

export const KEY_NAME = /^cust-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const keyNameFor = (customerId: string) => `cust-${customerId}`;
function checkKey(name: string) {
  if (!KEY_NAME.test(name)) throw new VaultError("Invalid key name");
}

// Swappable for offline tests.
type Fetch = typeof fetch;
const g = globalThis as unknown as { _vaultFetch?: Fetch };
export const setVaultFetch = (f: Fetch | undefined) => {
  g._vaultFetch = f;
};

function config() {
  const addr = process.env.VAULT_ADDR, token = process.env.VAULT_TOKEN;
  if (!addr || !token) throw new VaultNotConfigured("VAULT_ADDR and VAULT_TOKEN must be set");
  return { addr: addr.replace(/\/+$/, ""), token };
}

async function call(method: string, path: string, body?: unknown, opts: { auth?: boolean } = {}): Promise<Response> {
  const { addr, token } = config();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) headers["X-Vault-Token"] = token;
  try {
    return await (g._vaultFetch ?? fetch)(`${addr}/v1/${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new VaultUnavailable("Vault is unreachable");
  }
}

// Vault error bodies look like {"errors": ["..."]}; only short, content-free text is kept.
async function fail(res: Response, op: string): Promise<never> {
  const text = await res.text().catch(() => "");
  const missing = /not found|no existing key|encryption key not found|unsupported path/i.test(text);
  if (res.status === 503) throw new VaultUnavailable(`Vault is sealed or unavailable (${op})`, 503);
  if (res.status >= 500) throw new VaultUnavailable(`Vault error ${res.status} (${op})`, res.status);
  if (res.status === 401 || res.status === 403) throw new VaultAuthError(`Vault token invalid or not allowed (${op})`, res.status);
  if ((res.status === 400 || res.status === 404) && missing) throw new VaultKeyMissing(`Encryption key missing (${op})`, res.status);
  throw new VaultError(`Vault error ${res.status} (${op})`, res.status);
}

// Creates the key if it does not exist (idempotent).
export async function ensureKey(name: string) {
  checkKey(name);
  const r = await call("POST", `transit/keys/${name}`, {});
  if (!r.ok) await fail(r, "create key");
}

export async function encrypt(name: string, plain: string): Promise<string> {
  checkKey(name);
  const r = await call("POST", `transit/encrypt/${name}`, { plaintext: Buffer.from(plain, "utf8").toString("base64") });
  if (!r.ok) await fail(r, "encrypt");
  return (await r.json()).data.ciphertext as string;
}

export async function decrypt(name: string, ciphertext: string): Promise<string> {
  checkKey(name);
  const r = await call("POST", `transit/decrypt/${name}`, { ciphertext });
  if (!r.ok) await fail(r, "decrypt");
  return Buffer.from((await r.json()).data.plaintext as string, "base64").toString("utf8");
}

export const encryptJson = (name: string, value: unknown) => encrypt(name, JSON.stringify(value));
export const decryptJson = async <T>(name: string, ciphertext: string): Promise<T> => JSON.parse(await decrypt(name, ciphertext)) as T;

// Crypto-shredding. Vault refuses to delete a key until deletion_allowed is set
// on its config. Deleting a key that is already gone counts as success.
export async function deleteKey(name: string) {
  checkKey(name);
  const cfg = await call("POST", `transit/keys/${name}/config`, { deletion_allowed: true });
  if (!cfg.ok) {
    try {
      await fail(cfg, "allow deletion");
    } catch (e) {
      if (e instanceof VaultKeyMissing) return;
      throw e;
    }
  }
  const del = await call("DELETE", `transit/keys/${name}`);
  if (!del.ok && del.status !== 404) await fail(del, "delete key");
}

export async function listKeys(): Promise<string[]> {
  const r = await call("GET", "transit/keys?list=true");
  if (r.status === 404) return [];
  if (!r.ok) await fail(r, "list keys");
  return ((await r.json()).data?.keys ?? []) as string[];
}

export interface VaultHealth {
  status: "up" | "sealed" | "down" | "not_configured";
  tokenValid: boolean | null; // null when Vault is not reachable or not configured
  clusterId: string | null; // changes when a dev-mode Vault restarts
}

// sys/health needs no token; auth/token/lookup-self checks the app token (allowed by Vault's default policy).
export async function vaultHealth(): Promise<VaultHealth> {
  try {
    config();
  } catch {
    return { status: "not_configured", tokenValid: null, clusterId: null };
  }
  let clusterId: string | null = null;
  try {
    const h = await call("GET", "sys/health?standbyok=true&sealedcode=200&uninitcode=200", undefined, { auth: false });
    const body = (await h.json().catch(() => ({}))) as { sealed?: boolean; cluster_id?: string };
    clusterId = body.cluster_id ?? null;
    if (body.sealed) return { status: "sealed", tokenValid: null, clusterId };
  } catch {
    return { status: "down", tokenValid: null, clusterId: null };
  }
  try {
    const t = await call("GET", "auth/token/lookup-self");
    return { status: "up", tokenValid: t.ok, clusterId };
  } catch {
    return { status: "down", tokenValid: null, clusterId };
  }
}
