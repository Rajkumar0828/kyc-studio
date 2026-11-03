// Live test of docker/caddy/Caddyfile with the real Caddy image: a client-supplied
// X-Forwarded-For is replaced (so the rate limiter can't be bypassed), the body
// cap rejects oversize requests and allows the largest legitimate one, and the
// security headers are set. Runs Caddy in front of a throwaway echo server on a
// throwaway network; removes both afterwards. Needs Docker; skipped otherwise.
// Usage: npm run test:caddy
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MAX_REQUEST_BYTES } from "../src/lib/uploadLimits";

const ROOT = path.resolve(__dirname, "..", "..");
const CADDY_IMAGE = /image: (caddy:\S+)/.exec(fs.readFileSync(path.join(ROOT, "docker-compose.prod.yml"), "utf8"))![1];
const NODE_IMAGE = "node:24-trixie-slim";
const id = randomBytes(4).toString("hex");
const NET = `kyc-caddy-test-${id}`, UP = `kyc-caddy-test-app-${id}`, PROXY = `kyc-caddy-test-proxy-${id}`;
const PORT = 18000 + Math.floor(Math.random() * 1000);

const docker = (...args: string[]) => spawnSync("docker", args, { encoding: "utf8" });
if (docker("info", "--format", "{{.ServerVersion}}").status !== 0) {
  console.log("SKIP  Docker is not available");
  process.exit(0);
}

let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message.split("\n").join("\n      ") : e}`);
  }
}

// Echo upstream: answers with the forwarding headers it received and the body length.
const ECHO = `require("http").createServer((q, s) => { let n = 0; q.on("data", (c) => (n += c.length)); q.on("end", () => { s.setHeader("content-type", "application/json"); s.end(JSON.stringify({ xff: q.headers["x-forwarded-for"] ?? null, xri: q.headers["x-real-ip"] ?? null, bytes: n })); }); }).listen(3000);`;

const must = (r: ReturnType<typeof docker>, what: string) => assert.equal(r.status, 0, `${what}: ${r.stderr}`);

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/`)).status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Caddy did not answer: ${docker("logs", PROXY).stderr.slice(-800)}`);
}

async function main() {
  try {
    must(docker("network", "create", NET), "network");
    must(docker("run", "-d", "--name", UP, "--network", NET, "--network-alias", "app", NODE_IMAGE, "node", "-e", ECHO), "echo upstream");
    must(docker("run", "-d", "--name", PROXY, "--network", NET, "-p", `127.0.0.1:${PORT}:80`, "-e", "SITE_DOMAIN=:80",
      "--mount", `type=bind,source=${path.join(ROOT, "docker", "caddy", "Caddyfile")},target=/etc/caddy/Caddyfile,readonly`, CADDY_IMAGE), "caddy");
    await waitReady();

    await test("a forged X-Forwarded-For / X-Real-IP is replaced by the address Caddy saw", async () => {
      const honest = await (await fetch(`http://127.0.0.1:${PORT}/`)).json();
      const forged = await (await fetch(`http://127.0.0.1:${PORT}/`, { headers: { "x-forwarded-for": "6.6.6.6, 7.7.7.7", "x-real-ip": "6.6.6.6" } })).json();
      assert.match(honest.xff, /^[0-9a-f.:]+$/, `one address expected, got ${honest.xff}`);
      assert.equal(forged.xff, honest.xff, "the forged header changed the forwarded client address");
      assert.equal(forged.xri, honest.xff);
      assert.ok(!String(forged.xff).includes("6.6.6.6") && !String(forged.xff).includes("7.7.7.7"));
    });

    await test("the largest legitimate request passes the body cap", async () => {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/apply/x`, { method: "POST", body: new Uint8Array(MAX_REQUEST_BYTES) });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).bytes, MAX_REQUEST_BYTES);
    });

    await test("a request over the cap is refused with 413", async () => {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/apply/x`, { method: "POST", body: new Uint8Array(64 * 1024 * 1024 + 1) }).catch((e) => e);
      // Caddy answers 413; some clients see the connection close before reading it.
      if (res instanceof Error) assert.match(String(res.cause ?? res), /EPIPE|ECONNRESET|other side closed|socket/i);
      else assert.equal(res.status, 413);
    });

    await test("security headers are set and Server is removed", async () => {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      assert.equal(res.headers.get("strict-transport-security"), "max-age=31536000");
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      assert.equal(res.headers.get("content-security-policy"), "frame-ancestors 'none'");
      assert.equal(res.headers.get("server"), null);
    });
  } finally {
    docker("rm", "-f", PROXY, UP);
    docker("network", "rm", NET);
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
void main();
