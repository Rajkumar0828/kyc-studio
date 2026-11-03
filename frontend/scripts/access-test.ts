// Offline tests for the demo and admin access guards. Usage: npx tsx scripts/access-test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { actorOf, ADMIN_COOKIE, DEMO_COOKIE, requireAdminAccess, requireDemoAccess } from "../src/lib/security/guard";

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

const req = (cookies: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ") } });
const status = (r: Response | null) => r?.status ?? 200;

process.env.DEMO_ACCESS_CODE = "demo-code-1234";

test("admin actions are refused when ADMIN_ACCESS_CODE is unset (fail closed)", () => {
  delete process.env.ADMIN_ACCESS_CODE;
  assert.equal(status(requireAdminAccess(req({ [DEMO_COOKIE]: "demo-code-1234", [ADMIN_COOKIE]: "anything" }))), 403);
});

test("an admin code equal to the demo code is not a second secret: refused", () => {
  process.env.ADMIN_ACCESS_CODE = "demo-code-1234";
  assert.equal(status(requireAdminAccess(req({ [DEMO_COOKIE]: "demo-code-1234", [ADMIN_COOKIE]: "demo-code-1234" }))), 403);
});

test("admin actions need BOTH codes", () => {
  process.env.ADMIN_ACCESS_CODE = "admin-code-5678";
  assert.equal(status(requireAdminAccess(req())), 401); // no demo code
  assert.equal(status(requireAdminAccess(req({ [ADMIN_COOKIE]: "admin-code-5678" }))), 401); // admin without demo
  assert.equal(status(requireAdminAccess(req({ [DEMO_COOKIE]: "demo-code-1234" }))), 401); // demo without admin
  assert.equal(status(requireAdminAccess(req({ [DEMO_COOKIE]: "demo-code-1234", [ADMIN_COOKIE]: "wrong" }))), 401);
  assert.equal(requireAdminAccess(req({ [DEMO_COOKIE]: "demo-code-1234", [ADMIN_COOKIE]: "admin-code-5678" })), null);
});

test("read-only and reveal actions need only the demo code", () => {
  assert.equal(requireDemoAccess(req({ [DEMO_COOKIE]: "demo-code-1234" })), null);
});

test("the audit actor is officer:admin only with a valid admin code", () => {
  assert.equal(actorOf(req({ [DEMO_COOKIE]: "demo-code-1234" })), "officer:demo");
  assert.equal(actorOf(req({ [DEMO_COOKIE]: "demo-code-1234", [ADMIN_COOKIE]: "wrong" })), "officer:demo");
  assert.equal(actorOf(req({ [DEMO_COOKIE]: "demo-code-1234", [ADMIN_COOKIE]: "admin-code-5678" })), "officer:admin");
});

// /api/demo-access imports guard.ts and runs on every page, so guard.ts must not
// pull in the AI, store, Mongo or Vault layers (those belong in errors.ts).
test("guard.ts imports only node:crypto and ./aiBudget", () => {
  const src = readFileSync(new URL("../src/lib/security/guard.ts", import.meta.url), "utf8");
  const from = [...src.matchAll(/^(?:import|export)[^;]*?from "([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual([...new Set(from)].sort(), ["./aiBudget", "node:crypto"]);
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
