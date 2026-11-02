// Offline tests for the file PolicyStore and the no-direct-file-access rule.
// Usage: npx tsx scripts/policy-store-test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileEnglish } from "../src/lib/ai/mockPolicyCompiler";
import { createFileApplicationLog } from "../src/lib/applications/log";
import { templateSteps } from "../src/lib/ai/mockCustomerGuide";
import { DEFAULT_POLICIES, EXAMPLE_PROMPTS } from "../src/lib/policy/defaults";
import { createFileStore } from "../src/lib/policy/store/fileStore";
import { PolicyStoreError, specFromDraft, type StoredGuide } from "../src/lib/policy/store/types";

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kyc-store-"));
const file = path.join(dir, "policies.json");
const store = createFileStore(file);
const { rules } = compileEnglish(EXAMPLE_PROMPTS[1].text);
const input = { name: "Student account", customerCategory: "retail", sourceText: EXAMPLE_PROMPTS[1].text, consentText: "Consent text written by the officer.", rules, compile: null };
const guide = (steps = templateSteps(rules)): StoredGuide => ({ steps, source: "template", provider: "mock", model: null, effort: null, note: null, generatedAt: new Date().toISOString() });
const rejects409 = (p: Promise<unknown>) => assert.rejects(p, (e: unknown) => e instanceof PolicyStoreError && e.status === 409);

async function main() {
  await test("seeds are listed and readable as published version 1", async () => {
    const list = await store.list();
    for (const s of DEFAULT_POLICIES) {
      const row = list.find((r) => r.id === s.id)!;
      assert.equal(row.latestVersion, 1);
      assert.equal(row.seed, true);
      assert.equal((await store.get(s.id))!.spec.version, 1);
    }
  });

  await test("a draft has no version number until published", async () => {
    const draft = await store.saveDraft(input);
    assert.equal(draft.id, "student-account");
    assert.equal("version" in draft, false);
    assert.equal(await store.get("student-account"), null);
    assert.deepEqual(await store.versions("student-account"), []);
    const row = (await store.list()).find((r) => r.id === "student-account")!;
    assert.equal(row.latestVersion, null);
    assert.ok(row.draftUpdatedAt);
  });

  await test("publish creates version 1 and removes the draft", async () => {
    const d = (await store.getDraft("student-account"))!;
    const v = await store.publish("student-account", { guide: guide(), version: 1, draftUpdatedAt: d.updatedAt });
    assert.equal(v.spec.version, 1);
    assert.equal(v.spec.status, "published");
    assert.equal(await store.getDraft("student-account"), null);
  });

  await test("publishing again appends version 2 and leaves version 1 byte-identical", async () => {
    const before = JSON.stringify(await store.getVersion("student-account", 1));
    const d = await store.saveDraft({ ...input, id: "student-account", consentText: "Updated consent." });
    await store.publish("student-account", { guide: guide(), version: 2, draftUpdatedAt: d.updatedAt });
    assert.equal(JSON.stringify(await store.getVersion("student-account", 1)), before);
    assert.deepEqual(await store.versions("student-account"), [1, 2]);
    assert.equal((await store.get("student-account"))!.spec.consentText, "Updated consent.");
  });

  await test("a publish prepared for the wrong version or a stale draft is refused", async () => {
    const d = await store.saveDraft({ ...input, id: "student-account" });
    await rejects409(store.publish("student-account", { guide: guide(), version: 2, draftUpdatedAt: d.updatedAt }));
    await rejects409(store.publish("student-account", { guide: guide(), version: 3, draftUpdatedAt: "2000-01-01T00:00:00.000Z" }));
  });

  await test("specFromDraft builds exactly the spec that publish stores", async () => {
    const d = (await store.getDraft("student-account"))!;
    const now = new Date().toISOString();
    const expected = specFromDraft(d, 3, now);
    const v = await store.publish("student-account", { guide: guide(), version: 3, draftUpdatedAt: d.updatedAt });
    assert.deepEqual({ ...v.spec, updatedAt: "" }, { ...expected, updatedAt: "" });
  });

  await test("seeds are read-only and can't be archived", async () => {
    await rejects409(store.saveDraft({ ...input, id: "housing-loan" }));
    await rejects409(store.archive("general-account"));
  });

  await test("a new policy can't reuse the name of a published one", async () => {
    await rejects409(store.saveDraft(input));
  });

  await test("archive is one-way: get returns null, versions stay readable, edits are refused", async () => {
    await store.archive("student-account");
    assert.equal(await store.get("student-account"), null);
    assert.equal((await store.getVersion("student-account", 1))!.spec.version, 1);
    assert.equal(await store.isArchived("student-account"), true);
    assert.equal((await store.list()).find((r) => r.id === "student-account")!.archived, true);
    await rejects409(store.saveDraft({ ...input, id: "student-account" }));
  });

  await test("files from before immutable versions are migrated on read", async () => {
    const legacyFile = path.join(dir, "legacy.json");
    const spec = { ...DEFAULT_POLICIES[0], id: "legacy-policy", name: "Legacy" };
    fs.writeFileSync(legacyFile, JSON.stringify([spec, { ...spec, version: 2, status: "draft" }]));
    const legacy = createFileStore(legacyFile);
    assert.equal((await legacy.get("legacy-policy"))!.guide.source, "template_fallback");
    assert.equal((await legacy.getDraft("legacy-policy"))!.name, "Legacy");
  });

  await test("nothing under app/ reads or writes files directly", () => {
    const appDir = path.resolve(__dirname, "..", "app");
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          const src = fs.readFileSync(p, "utf8");
          if (/from ["'](node:)?fs(\/promises)?["']|store\/fileStore|policies\.json|applications\.jsonl|ai-calls\.jsonl/.test(src)) offenders.push(path.relative(appDir, p));
        }
      }
    };
    walk(appDir);
    assert.deepEqual(offenders, []);
  });

  await test("application log records policy id and version, and nothing personal", async () => {
    const log = createFileApplicationLog(path.join(dir, "applications.jsonl"));
    const rec = {
      caseId: "apply-1", channel: "apply" as const, policyId: "housing-loan", policyVersion: 1, decision: "manual_review" as const,
      provider: "mock", consentAt: null, submittedAt: new Date().toISOString(), decidedAt: new Date().toISOString(),
    };
    await log.record(rec);
    assert.deepEqual(await log.recent(), [rec]);
    await assert.rejects(log.record({ ...rec, fullName: "Elin Thornquist" } as typeof rec)); // strict schema: no extra fields
    await assert.rejects(log.record({ ...rec, policyVersion: 0 }));
  });

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}

main();
