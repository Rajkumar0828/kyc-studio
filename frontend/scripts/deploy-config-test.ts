// Offline checks of the deployment files: Caddyfile, Dockerfile, .dockerignore and
// docker-compose.prod.yml (the compose part uses `docker compose config` and is
// skipped without Docker). The live proxy behaviour is in caddy-proxy-test.ts.
// Usage: npx tsx scripts/deploy-config-test.ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clientIp } from "../src/lib/security/guard";
import { MAX_REQUEST_BYTES } from "../src/lib/uploadLimits";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const caddyfile = read("docker/caddy/Caddyfile");
const dockerfile = read("Dockerfile");
const dockerignore = read(".dockerignore").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message.split("\n").join("\n      ") : e}`);
  }
}

const UNITS: Record<string, number> = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3 };
const bytes = (s: string) => {
  const m = /^(\d+)\s*([A-Za-z]*)$/.exec(s);
  assert.ok(m, `unparsable size ${s}`);
  return Number(m[1]) * (UNITS[(m[2] || "B").toUpperCase()] ?? NaN);
};

test("Caddy body cap covers the largest legitimate upload with a bounded margin", () => {
  const m = /request_body\s*\{\s*max_size\s+(\S+)\s*\}/.exec(caddyfile);
  assert.ok(m, "request_body max_size not found");
  const cap = bytes(m[1]);
  assert.ok(cap >= MAX_REQUEST_BYTES + 1024 ** 2, `cap ${cap} leaves under 1 MiB over MAX_REQUEST_BYTES ${MAX_REQUEST_BYTES}`);
  assert.ok(cap <= MAX_REQUEST_BYTES + 8 * 1024 ** 2, `cap ${cap} is more than 8 MiB over MAX_REQUEST_BYTES ${MAX_REQUEST_BYTES}`);
});

test("Caddy sets HSTS (no includeSubDomains or preload), nosniff and frame-ancestors 'none'", () => {
  const hsts = /Strict-Transport-Security\s+"([^"]+)"/.exec(caddyfile)?.[1];
  assert.ok(hsts && /max-age=\d+/.test(hsts), "HSTS missing");
  assert.ok(!/includeSubDomains|preload/i.test(hsts), `HSTS must not include subdomains or preload: ${hsts}`);
  assert.match(caddyfile, /X-Content-Type-Options\s+"nosniff"/);
  assert.match(caddyfile, /Content-Security-Policy\s+"frame-ancestors 'none'"/);
});

test("Caddy replaces X-Forwarded-For and X-Real-IP with the address it saw", () => {
  assert.match(caddyfile, /reverse_proxy app:3000 \{[^}]*header_up X-Forwarded-For \{remote_host\}/);
  assert.match(caddyfile, /header_up X-Real-IP \{remote_host\}/);
  assert.ok(!/header_up \+X-Forwarded-For/.test(caddyfile), "must replace, not append (+)");
});

test("the rate limiter keys on the first X-Forwarded-For entry (the one Caddy sets)", () => {
  const req = (h: Record<string, string>) => new Request("http://app/api/x", { headers: h });
  assert.equal(clientIp(req({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
  assert.equal(clientIp(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.2" })), "203.0.113.9");
  assert.equal(clientIp(req({ "x-real-ip": "203.0.113.7" })), "203.0.113.7");
});

test(".dockerignore keeps secrets, local data and build output out of the context", () => {
  for (const p of [".git", ".env", ".env.*", "**/.env", "**/.env.*", "frontend/.env.local", "data", "**/data", "eval/.cache", "eval/reports", "node_modules", "**/node_modules", ".next", "**/.next"])
    assert.ok(dockerignore.includes(p), `.dockerignore lacks ${p}`);
  assert.ok(!dockerignore.some((l) => l.startsWith("!")), "no re-includes: an exception could let an env file back in");
});

test("Dockerfile: Node 24 Debian slim, non-root, liveness healthcheck, sharp and no-env-file checks, specimens inside", () => {
  assert.match(dockerfile, /^ARG NODE_IMAGE=node:24-(bookworm|trixie)-slim$/m);
  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /^HEALTHCHECK[\s\S]*\/api\/health\/live/m);
  assert.match(dockerfile, /require\('sharp'\)/);
  assert.match(dockerfile, /find \/app -name '\.env\*'/);
  assert.match(dockerfile, /^COPY eval\/specimens eval\/specimens$/m);
  assert.ok(!/^COPY .*\.env/m.test(dockerfile), "Dockerfile copies an env file");
});

const docker = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
if (docker.status !== 0) console.log("SKIP  compose checks: docker compose not available");
else {
  // Dummy env files in a temp project dir (the real ones are never read).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kyc-compose-"));
  fs.writeFileSync(path.join(dir, ".env"), "SITE_DOMAIN=kyc.example.com\nVAULT_DEV_TOKEN=a1\nVAULT_APP_TOKEN=b2\nMONGO_ROOT_USER=r\nMONGO_ROOT_PASSWORD=00112233445566778899\nMONGO_APP_USER=u\nMONGO_APP_PASSWORD=99887766554433221100\n");
  fs.writeFileSync(path.join(dir, ".env.app"), "AI_PROVIDER=mock\nPOLICY_STORE=file\nAPPLICATION_LOG=mongo\n");
  const r = spawnSync("docker", ["compose", "-f", path.join(ROOT, "docker-compose.prod.yml"), "--project-directory", dir, "config", "--format", "json"], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  const c = r.status === 0 ? JSON.parse(r.stdout) : null;

  test("compose: only Caddy publishes ports, and only 80 and 443", () => {
    assert.ok(c, `docker compose config failed: ${r.stderr}`);
    for (const [name, s] of Object.entries<{ ports?: Array<{ published: string; target: number }> }>(c.services)) {
      if (name === "caddy") assert.deepEqual([...new Set(s.ports!.map((p) => `${p.published}:${p.target}`))].sort(), ["443:443", "80:80"]);
      else assert.equal(s.ports?.length ?? 0, 0, `${name} publishes ports`);
    }
  });

  test("compose: MongoDB, Vault and vault-init are only on the internal network, which is internal", () => {
    assert.equal(c.networks.internal.internal, true);
    for (const n of ["mongo", "vault", "vault-init"]) assert.deepEqual(Object.keys(c.services[n].networks), ["internal"], n);
    assert.deepEqual(Object.keys(c.services.caddy.networks), ["edge"]);
  });

  test("compose: every service restarts unless-stopped; Mongo cache is 0.5 GB", () => {
    for (const [name, s] of Object.entries<{ restart?: string }>(c.services)) assert.equal(s.restart, "unless-stopped", name);
    assert.deepEqual(c.services.mongo.command, ["--wiredTigerCacheSizeGB", "0.5"]);
  });

  test("compose: the storage setup is fixed and wins over .env.app", () => {
    const env = c.services.app.environment;
    assert.equal(env.POLICY_STORE, "mongo");
    assert.equal(env.AI_CALL_LOG, "mongo");
    assert.equal(env.AUDIT_LOG, "mongo");
    assert.equal(env.APPLICATION_LOG, "file");
    assert.equal(env.VAULT_ADDR, "http://vault:8200");
    assert.match(env.MONGODB_URI, /^mongodb:\/\/u:99887766554433221100@mongo:27017\/kyc_studio\?authSource=kyc_studio$/);
  });
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
