// Offline tests: storage errors reach clients as coded responses and reach the
// server log as error class (and code) only: never a message, URI, host or credential.
// Usage: npx tsx scripts/error-logging-test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SECRET_PASSWORD = "S3cretPassw0rd99";
const URI = `mongodb://kycapp:${SECRET_PASSWORD}@127.0.0.1:1/kyc_studio?authSource=kyc_studio`;
const VAULT_TOKEN = "deadbeefcafe0123456789";
const FORBIDDEN = [SECRET_PASSWORD, "mongodb://", "127.0.0.1", "kycapp", VAULT_TOKEN, "vault.internal"];

let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message.split("\n").join("\n      ") : e}`);
  }
}

// Captures everything written through console.* while fn runs.
async function captured<T>(fn: () => Promise<T>): Promise<{ result: T; logged: string }> {
  const lines: string[] = [];
  const orig = { error: console.error, warn: console.warn, log: console.log, info: console.info };
  const grab = (...args: unknown[]) => lines.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}\n${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  Object.assign(console, { error: grab, warn: grab, log: grab, info: grab });
  try {
    return { result: await fn(), logged: lines.join("\n") };
  } finally {
    Object.assign(console, orig);
  }
}
const clean = (text: string, where: string) => {
  for (const f of FORBIDDEN) assert.ok(!text.includes(f), `${where} contains "${f}":\n${text.slice(0, 400)}`);
};

async function main() {
  process.env.POLICY_STORE = "mongo";
  process.env.MONGODB_URI = URI;

  await test("GET /api/policies with Mongo unreachable: 503 storage_unavailable, nothing secret logged", async () => {
    const { GET } = await import("../app/api/policies/route");
    const { result: res, logged } = await captured(() => GET(new Request("http://localhost/api/policies")));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.code, "storage_unavailable");
    clean(JSON.stringify(body), "response body");
    clean(logged, "server log");
  });

  await test("GET /api/policies/[id] with Mongo unreachable: 503, nothing secret logged", async () => {
    const { GET } = await import("../app/api/policies/[id]/route");
    const ctx = { params: Promise.resolve({ id: "housing-loan" }) } as Parameters<typeof GET>[1];
    const { result: res, logged } = await captured(() => GET(new Request("http://localhost/api/policies/housing-loan"), ctx));
    assert.equal(res.status, 503);
    clean(JSON.stringify(await res.json()), "response body");
    clean(logged, "server log");
  });

  const { errorResponse } = await import("../src/lib/security/errors");
  const { VaultUnavailable, VaultAuthError } = await import("../src/lib/vault/transit");

  await test("errorResponse: Mongo and Vault errors carrying URIs and tokens log nothing secret", async () => {
    const mongo = Object.assign(new Error(`connect ECONNREFUSED ${URI}`), { name: "MongoServerSelectionError", code: undefined });
    const auth = Object.assign(new Error(`Authentication failed for ${URI}`), { name: "MongoServerError", code: 18 });
    const vault = new VaultUnavailable(`http://vault.internal:8200 unreachable with token ${VAULT_TOKEN}`);
    const vaultAuth = new VaultAuthError(`token ${VAULT_TOKEN} denied`);
    for (const e of [mongo, auth, vault, vaultAuth]) {
      const { result: res, logged } = await captured(async () => errorResponse(e));
      clean(JSON.stringify(await res.json()), `response for ${e.name}`);
      clean(logged, `log for ${e.name}`);
    }
  });

  await test("errorResponse: an unexpected error logs its class and code only", async () => {
    const e = Object.assign(new Error(`boom ${URI}`), { name: "MongoServerError", code: 18 });
    const { result: res, logged } = await captured(async () => errorResponse(e));
    assert.equal(res.status, 500);
    assert.equal(logged, "[error] MongoServerError code=18");
  });

  await test("no server code passes a raw error object to console.*", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(ent.name)) {
          fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
            // console.x(..., e) / (err) / (error) with the bare error as an argument
            if (/console\.(error|warn|log|info)\((?:[^)]*,\s*)?(e|err|error)\s*\)/.test(line)) offenders.push(`${path.relative(process.cwd(), p)}:${i + 1}`);
          });
        }
      }
    };
    for (const d of ["app", "src"]) walk(path.join(__dirname, "..", d));
    assert.deepEqual(offenders, []);
  });

  const { closeMongo } = await import("../src/lib/db/mongo");
  await closeMongo();
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
void main();
