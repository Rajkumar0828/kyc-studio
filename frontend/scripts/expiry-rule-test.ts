// expiry_date applies only to identity documents. Offline: pure rule checks and eval scoring.
// Usage: npx tsx scripts/expiry-rule-test.ts
import assert from "node:assert/strict";
import type { Extraction, Field } from "../src/lib/ai/types";
import { ruleChecks } from "../src/lib/pipeline/checks";
import type { ProcessedDoc } from "../src/lib/pipeline/types";
import { getDefaultPolicy } from "../src/lib/policy/defaults";
import type { DocType } from "../src/lib/policy/schema";
import { scoreField } from "./eval-meta/score";

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

const f = (value: string, confidence = 0.97): Field => ({ found: value !== "", value, confidence, box: value ? [100, 100, 300, 140] : [0, 0, 0, 0] });
const doc = (index: number, docType: DocType, fields: Partial<Record<keyof Omit<Extraction, "document_type">, Field>>): ProcessedDoc => ({
  index, filename: `${docType}.png`, docType, classConfidence: 0.99,
  extraction: {
    document_type: docType,
    full_name: f("Elin Thornquist"), date_of_birth: f(""), document_number: f("QW-1"), issue_date: f("2026-10-01"),
    expiry_date: f(""), address: f("14 Quillfeather Row, Ambermoor 20417"),
    ...fields,
  },
});
const ID = (fields: Parameters<typeof doc>[2] = {}) =>
  doc(0, "national_id", { date_of_birth: f("1988-06-14"), document_number: f("VD4K7Q2M9T"), expiry_date: f("2031-05-09"), ...fields });
const policy = getDefaultPolicy("housing-loan")!;
const asOf = new Date("2026-11-01T00:00:00Z");
const codesFor = (docs: ProcessedDoc[], index: number) => ruleChecks(docs, policy, asOf).filter((c) => c.evidence?.docIndex === index);

// A bill where the model copied the payment due date into expiry_date, with low confidence.
const billWithDueDate = doc(1, "utility_bill", { expiry_date: f("2026-11-04", 0.5) });

test("a bill's filled-in expiry_date raises no low-confidence warning and no expiry check", () => {
  const bill = codesFor([ID(), billWithDueDate], 1);
  assert.equal(bill.some((c) => c.evidence?.field === "expiry_date"), false, JSON.stringify(bill));
});

test("an expired ID is still flagged", () => {
  const codes = codesFor([ID({ expiry_date: f("2026-08-18") }), billWithDueDate], 0).map((c) => c.code);
  assert.ok(codes.includes("document_expired"), codes.join(","));
});

test("a low-confidence expiry_date on an ID still warns", () => {
  const checks = codesFor([ID({ expiry_date: f("2031-05-09", 0.5) })], 0);
  assert.ok(checks.some((c) => c.code === "low_confidence" && c.evidence?.field === "expiry_date"));
});

test("the pipeline does not alter the raw extraction", () => {
  const before = JSON.stringify(billWithDueDate.extraction);
  ruleChecks([ID(), billWithDueDate], policy, asOf);
  assert.equal(JSON.stringify(billWithDueDate.extraction), before);
});

test("eval scoring still reports a bill's filled-in expiry_date as a failure", () => {
  const x = billWithDueDate.extraction!.expiry_date;
  const s = scoreField("expiry_date", { found: x.found, value: x.value, box: x.box }, { found: false, value: "", normalized: "", box: [0, 0, 0, 0] });
  assert.equal(s.pass, false);
  assert.equal(s.truthFound, false);
  assert.equal(s.modelFound, true);
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
