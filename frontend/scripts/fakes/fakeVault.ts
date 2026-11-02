// In-memory stand-in for the Vault HTTP API (Transit + health + token lookup),
// for offline tests. Plug it in with setVaultFetch(fake.fetch). Ciphertext uses
// real AES-256-GCM per key, so plaintext never appears in it.
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

interface Key {
  secret: Buffer;
  deletionAllowed: boolean;
}

export function createFakeVault(opts: { token: string }) {
  let keys = new Map<string, Key>();
  let clusterId = randomUUID();
  let sealed = false;
  let up = true;
  let tokenValid = true;
  const calls: string[] = [];

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const err = (status: number, msg: string) => json(status, { errors: [msg] });

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (!up) throw new TypeError("fetch failed");
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v1\//, "");
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path === "sys/health") return json(200, { initialized: true, sealed, cluster_id: clusterId });
    if (sealed) return err(503, "Vault is sealed");
    const token = new Headers(init?.headers).get("X-Vault-Token");
    if (!tokenValid || token !== opts.token) return err(403, "permission denied");
    if (path === "auth/token/lookup-self") return json(200, { data: { ttl: 2592000 } });

    let m: RegExpMatchArray | null;
    if (path === "transit/keys" && url.searchParams.get("list") === "true")
      return keys.size ? json(200, { data: { keys: [...keys.keys()] } }) : err(404, "");
    if ((m = path.match(/^transit\/keys\/([^/]+)\/config$/)) && method === "POST") {
      const k = keys.get(m[1]);
      if (!k) return err(404, "no existing key found");
      k.deletionAllowed = Boolean(body.deletion_allowed);
      return new Response(null, { status: 204 });
    }
    if ((m = path.match(/^transit\/keys\/([^/]+)$/))) {
      if (method === "POST") {
        if (!keys.has(m[1])) keys.set(m[1], { secret: randomBytes(32), deletionAllowed: false });
        return new Response(null, { status: 204 });
      }
      if (method === "DELETE") {
        const k = keys.get(m[1]);
        if (!k) return err(404, "");
        if (!k.deletionAllowed) return err(400, "deletion is not allowed for this key");
        keys.delete(m[1]);
        return new Response(null, { status: 204 });
      }
    }
    if ((m = path.match(/^transit\/encrypt\/([^/]+)$/))) {
      const k = keys.get(m[1]);
      if (!k) return err(400, "encryption key not found"); // the app token has no 'create' on encrypt, so no upsert
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", k.secret, iv);
      const enc = Buffer.concat([c.update(Buffer.from(body.plaintext, "base64")), c.final()]);
      return json(200, { data: { ciphertext: `vault:v1:${Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64")}` } });
    }
    if ((m = path.match(/^transit\/decrypt\/([^/]+)$/))) {
      const k = keys.get(m[1]);
      if (!k) return err(400, "encryption key not found");
      const raw = Buffer.from(String(body.ciphertext).replace(/^vault:v1:/, ""), "base64");
      const d = createDecipheriv("aes-256-gcm", k.secret, raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      try {
        return json(200, { data: { plaintext: Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("base64") } });
      } catch {
        return err(400, "cipher: message authentication failed");
      }
    }
    return err(404, "unsupported path");
  };

  return {
    fetch: fetchImpl as typeof fetch,
    calls,
    keyNames: () => [...keys.keys()],
    // A dev-mode restart: every key is lost and the cluster id changes.
    restart() {
      keys = new Map();
      clusterId = randomUUID();
    },
    setSealed: (v: boolean) => void (sealed = v),
    setUp: (v: boolean) => void (up = v),
    setTokenValid: (v: boolean) => void (tokenValid = v),
    clusterId: () => clusterId,
  };
}
