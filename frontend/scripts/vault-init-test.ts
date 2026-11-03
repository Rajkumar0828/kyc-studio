// Runs docker/vault/init.sh against a fake `vault` CLI (scripts/fakes/vault-cli.sh)
// to check it re-initialises only what is missing and stays quiet otherwise.
// Needs a POSIX sh (Git Bash on Windows); skipped when none is found.
// Usage: npx tsx scripts/vault-init-test.ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const INIT = path.join(ROOT, "docker", "vault", "init.sh");
const FAKE = path.join(ROOT, "frontend", "scripts", "fakes", "vault-cli.sh");

const SH = [process.env.SH, "sh", "D:/Git/bin/sh.exe", "C:/Program Files/Git/bin/sh.exe"].find(
  (c) => c && spawnSync(c, ["-c", "exit 0"]).status === 0,
);
if (!SH) {
  console.log("SKIP  no POSIX sh found (set SH=/path/to/sh)");
  process.exit(0);
}
const toSh = (p: string) => p.replace(/\\/g, "/");

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

// Runs init.sh for `passes` passes with the given scenario files; returns its log and the fake's call list.
function run(passes: number, scenario: Record<string, number> = {}, preset: string[] = []) {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "kyc-vault-init-"));
  const bin = path.join(state, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "vault"), `#!/bin/sh\nexec sh "${toSh(FAKE)}" "$@"\n`, { mode: 0o755 });
  for (const [k, v] of Object.entries(scenario)) fs.writeFileSync(path.join(state, k), String(v));
  for (const f of preset) fs.writeFileSync(path.join(state, f), "");
  const r = spawnSync(SH!, [toSh(INIT)], {
    env: {
      ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_STATE: toSh(state),
      VAULT_APP_TOKEN: "0123abcd", VAULT_INIT_PASSES: String(passes), VAULT_INIT_SLEEP: "0",
    },
    encoding: "utf8",
  });
  const calls = fs.existsSync(path.join(state, "calls")) ? fs.readFileSync(path.join(state, "calls"), "utf8").trim().split("\n").filter(Boolean) : [];
  fs.rmSync(state, { recursive: true, force: true });
  assert.equal(r.status, 0, `init.sh exited ${r.status}: ${r.stderr}`);
  return { log: r.stdout.trim().split("\n").filter(Boolean), calls };
}
const count = (xs: string[], re: RegExp | string) => xs.filter((x) => (typeof re === "string" ? x === re : re.test(x))).length;

test("fresh Vault: creates transit, policy and token once, then stays silent", () => {
  const { log, calls } = run(4);
  assert.deepEqual(calls, ["enable", "policy_write", "token_create"]);
  assert.deepEqual(log, [
    "[vault-init] Vault is reachable",
    "[vault-init] enabled the transit engine",
    "[vault-init] wrote policy kyc-app",
    "[vault-init] created the app token (period 720h)",
  ]);
});

test("already initialised: nothing is re-enabled, rewritten or logged", () => {
  const { log, calls } = run(3, {}, ["transit", "policy", "token"]);
  assert.deepEqual(calls, []);
  assert.deepEqual(log, ["[vault-init] Vault is reachable"]);
});

test("one Vault restart: one restart line, one re-init, then silent", () => {
  const { log, calls } = run(6, { restart_at: 3 });
  assert.equal(count(calls, "enable"), 2, `calls: ${calls.join(", ")}`);
  assert.equal(count(calls, "policy_write"), 2);
  assert.equal(count(calls, "token_create"), 2);
  assert.equal(count(log, /Vault restarted \(new cluster id\)/), 1);
  assert.equal(count(log, /enabled the transit engine/), 2, "once at start, once after the restart");
  const afterRestart = log.slice(log.findIndex((l) => /Vault restarted/.test(l)) + 1);
  assert.equal(afterRestart.length, 3, `expected exactly the three re-creations after the restart: ${afterRestart.join(" | ")}`);
});

test("a failed secrets list is a retry, not a missing mount", () => {
  const { log, calls } = run(4, { faillist_at: 2 }, ["transit", "policy", "token"]);
  assert.deepEqual(calls, []);
  assert.equal(count(log, /could not list secrets engines; retrying/), 1);
  assert.equal(count(log, /enabled the transit engine/), 0);
});

test("a failed policy read is a retry, not a missing policy", () => {
  const { calls, log } = run(3, { failpolicy_at: 2 }, ["transit", "policy", "token"]);
  assert.deepEqual(calls, []);
  assert.equal(count(log, /could not read policy kyc-app; retrying/), 1);
});

test("Vault down for several passes: 'waiting' is logged once", () => {
  const { log, calls } = run(5, { down_until: 3 });
  assert.equal(count(log, /waiting for Vault/), 1);
  assert.equal(count(log, /Vault is reachable/), 1);
  assert.deepEqual(calls, ["enable", "policy_write", "token_create"]);
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
