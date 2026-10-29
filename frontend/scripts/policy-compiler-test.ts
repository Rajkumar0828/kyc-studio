// Pins the mock policy compiler's behaviour. Usage: npx tsx scripts/policy-compiler-test.ts
import assert from "node:assert/strict";
import { compileEnglish } from "../src/lib/ai/mockPolicyCompiler";
import { DEFAULT_POLICIES, EXAMPLE_PROMPTS } from "../src/lib/policy/defaults";
import { CompiledRules, RuleKind } from "../src/lib/policy/schema";

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
const compile = (t: string) => {
  const r = compileEnglish(t);
  CompiledRules.parse(r.rules); // every output must validate
  return r;
};
const RULE_FIELDS = ["requiredDocuments", "minAge", "proofOfAddressMaxAgeDays", "selfieRequired", "authorityLookup", "autoApproveEnabled", "autoApproveMaxScore", "retentionDays", "provenance"] as const;
const pick = (o: Record<string, unknown>) => Object.fromEntries(RULE_FIELDS.map((k) => [k, o[k]]));

for (const seed of DEFAULT_POLICIES)
  test(`seed ${seed.id}: its sourceText compiles back to the seed`, () => {
    const r = compile(seed.sourceText);
    assert.deepEqual(r.warnings, []);
    assert.deepEqual(pick(r.rules), pick(seed));
  });

test("the three clean examples compile without warnings", () => {
  for (const ex of EXAMPLE_PROMPTS.slice(0, 3)) assert.deepEqual(compile(ex.text).warnings, [], ex.title);
});

test("the clean examples together use all nine rule kinds", () => {
  const used = new Set(EXAMPLE_PROMPTS.slice(0, 3).flatMap((ex) => compile(ex.text).rules.provenance.map((p) => p.rule)));
  assert.deepEqual([...used].sort(), [...RuleKind.options].sort());
});

test("private banking example: no auto-approve, passport only, 5-year retention", () => {
  const { rules } = compile(EXAMPLE_PROMPTS[2].text);
  assert.equal(rules.autoApproveEnabled, false);
  assert.deepEqual(rules.requiredDocuments[0].anyOf, ["passport"]);
  assert.deepEqual(rules.requiredDocuments[1].anyOf, ["bank_statement"]);
  assert.equal(rules.proofOfAddressMaxAgeDays, 60);
  assert.equal(rules.minAge, 25);
  assert.equal(rules.retentionDays, 1825);
});

test("unsupported example: exactly one 'unsupported' warning, for the sanctions sentence", () => {
  const { rules, warnings } = compile(EXAMPLE_PROMPTS[3].text);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].kind, "unsupported");
  assert.match(warnings[0].sentence ?? "", /sanctions/);
  assert.equal(rules.selfieRequired, false);
  assert.equal(rules.retentionDays, 180);
});

test("conflicting minimum ages keep the first and warn", () => {
  const { rules, warnings } = compile("Require a passport. Applicants must be at least 18 years old. Applicants must be at least 21 years old.");
  assert.equal(rules.minAge, 18);
  assert.ok(warnings.some((w) => w.kind === "conflict"));
});

test("'score below 20' means a maximum of 19", () => {
  assert.equal(compile("Require a passport. Auto-approve when the risk score is below 20.").rules.autoApproveMaxScore, 19);
});

test("empty text falls back to defaults, each with a warning", () => {
  const { rules, warnings } = compile("");
  assert.equal(rules.requiredDocuments[0].label, "Government photo ID");
  assert.ok(warnings.length >= 5 && warnings.every((w) => w.kind === "default"));
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
