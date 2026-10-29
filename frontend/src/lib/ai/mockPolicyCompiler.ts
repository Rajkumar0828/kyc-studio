import type { CompiledRules, RealDocType, RuleKind } from "../policy/schema";
import type { CompileWarning, PolicyCompiler } from "./types";

// Deterministic English -> rules mapper over the closed RuleKind vocabulary.
// Each sentence is matched against simple patterns; anything that matches no
// rule kind is reported, never guessed.

type Rules = Omit<CompiledRules, "provenance">;
type Setter = Partial<Rules>;

const REQUIRE = /\b(require[sd]?|must (provide|upload|submit|show)|needs? to (provide|upload|submit)|ask for|collect)\b/i;
const NEGATE = /\b(no|not|never|don'?t|without|skip|optional)\b/i;
const DATE_LIMIT = /\b(older than|dated within|issued within)\b/i;

const ID_TYPES: Array<[RegExp, RealDocType]> = [
  [/\bpassports?\b/i, "passport"],
  [/\bdriver'?s'? licen[cs]es?\b/i, "drivers_license"],
  [/\bnational id\b/i, "national_id"],
];
const ADDRESS_TYPES: Array<[RegExp, RealDocType]> = [
  [/\butility bills?\b/i, "utility_bill"],
  [/\bbank statements?\b/i, "bank_statement"],
];
const found = (s: string, table: Array<[RegExp, RealDocType]>) => table.filter(([re]) => re.test(s)).map(([, t]) => t);

const toDays = (n: number, unit: string) => n * (/^y/i.test(unit) ? 365 : /^m/i.test(unit) ? 30 : /^w/i.test(unit) ? 7 : 1);

// One matcher per rule kind. Returns the settings it implies, or null.
const MATCHERS: Record<RuleKind, (s: string) => Setter | null> = {
  require_identity_doc: (s) => {
    if (!REQUIRE.test(s) || DATE_LIMIT.test(s) || NEGATE.test(s)) return null;
    const types = found(s, ID_TYPES);
    if (!types.length && !/\b(photo id|government[- ]issued id|identity document|id card)\b/i.test(s)) return null;
    return { requiredDocuments: [{ label: "Government photo ID", anyOf: types.length ? types : ["passport", "drivers_license", "national_id"] }] };
  },
  require_address_doc: (s) => {
    if (!REQUIRE.test(s) || DATE_LIMIT.test(s) || NEGATE.test(s)) return null;
    const types = found(s, ADDRESS_TYPES);
    if (!types.length && !/\bproof of address\b/i.test(s)) return null;
    return { requiredDocuments: [{ label: "Proof of address", anyOf: types.length ? types : ["utility_bill", "bank_statement"] }] };
  },
  min_age: (s) => {
    const m = s.match(/\b(?:at least|minimum age(?: is| of)?)\s+(\d{1,3})\b/i) ?? s.match(/\b(\d{1,3})\s*(?:\+|years? (?:old|of age) or (?:older|over))/i);
    return m && /\b(age|old|years?|adults?)\b|\+/i.test(s) ? { minAge: Number(m[1]) } : null;
  },
  poa_max_age: (s) => {
    const m = s.match(/\b(?:no older than|not older than|dated within|issued within)(?: the last)?\s+(\d{1,4})\s*(days?|weeks?|months?)\b/i);
    return m && /\b(address|bill|statement)\b/i.test(s) ? { proofOfAddressMaxAgeDays: toDays(Number(m[1]), m[2]) } : null;
  },
  selfie_required: (s) => (/\bselfie\b/i.test(s) ? { selfieRequired: !NEGATE.test(s) } : null),
  authority_lookup: (s) =>
    /\b(registry|issuing authority|government database)\b/i.test(s) ? { authorityLookup: !/\b(no|not|never|don'?t|skip)\b/i.test(s) } : null,
  auto_approve_threshold: (s) => {
    if (!/\bauto[- ]?approv/i.test(s) || /\bnever\b|\bno auto/i.test(s)) return null;
    const m = s.match(/\bscore (?:is )?(?:of )?(\d{1,3}) or (?:lower|less|below)\b/i) ?? s.match(/\bscore (?:is )?(?:at most|up to|no more than|<=)\s*(\d{1,3})\b/i);
    const below = s.match(/\bscore (?:is )?(?:below|under|less than|<)\s*(\d{1,3})\b/i);
    if (m) return { autoApproveEnabled: true, autoApproveMaxScore: Number(m[1]) };
    if (below) return { autoApproveEnabled: true, autoApproveMaxScore: Math.max(0, Number(below[1]) - 1) };
    return null;
  },
  no_auto_approve: (s) =>
    /\b(never auto[- ]?approve|no auto[- ]?approv\w*|(all|every) (cases?|applications?) (must |should )?(be |go(es)? to )?(manually reviewed|manual review))\b/i.test(s)
      ? { autoApproveEnabled: false }
      : null,
  retention: (s) => {
    const m = s.match(/\b(?:keep|retain|store|hold)\w*\b.*?\b(?:for|up to)\s+(\d{1,4})\s*(days?|months?|years?)\b/i);
    return m && /\b(data|records?|documents?|information)\b/i.test(s) ? { retentionDays: toDays(Number(m[1]), m[2]) } : null;
  },
};

const DEFAULTS: Rules = {
  requiredDocuments: [],
  minAge: 18,
  proofOfAddressMaxAgeDays: 90,
  selfieRequired: true,
  authorityLookup: true,
  autoApproveEnabled: true,
  autoApproveMaxScore: 25,
  retentionDays: 365,
};
const DEFAULT_NOTES: Array<[RuleKind, string]> = [
  ["min_age", "No minimum age stated; using 18."],
  ["selfie_required", "Selfie not mentioned; requiring one."],
  ["authority_lookup", "Registry check not mentioned; enabling it."],
  ["retention", "No retention period stated; using 365 days."],
];

export const splitSentences = (text: string) =>
  text.split(/(?<=[.;!?])\s+|\n+/).map((s) => s.replace(/^[\s\-*•\d.)]+/, "").trim()).filter((s) => s.length > 1);

export function compileEnglish(text: string): { rules: CompiledRules; warnings: CompileWarning[] } {
  const rules: Rules = { ...DEFAULTS, requiredDocuments: [] };
  const provenance: CompiledRules["provenance"] = [];
  const warnings: CompileWarning[] = [];
  const setBy = new Map<string, string>(); // setting -> sentence that set it

  for (const sentence of splitSentences(text)) {
    let matched = false;
    for (const [kind, match] of Object.entries(MATCHERS) as Array<[RuleKind, (s: string) => Setter | null]>) {
      const set = match(sentence);
      if (!set) continue;
      matched = true;
      provenance.push({ rule: kind, sentence: sentence.slice(0, 500) });
      for (const [key, value] of Object.entries(set) as Array<[keyof Rules, unknown]>) {
        if (key === "requiredDocuments") {
          for (const doc of value as Rules["requiredDocuments"]) {
            if (rules.requiredDocuments.some((d) => d.label === doc.label))
              warnings.push({ kind: "conflict", sentence, message: `${doc.label} is already required by an earlier sentence; kept the first.` });
            else rules.requiredDocuments.push(doc);
          }
          continue;
        }
        const prev = setBy.get(key);
        if (prev !== undefined && JSON.stringify(rules[key]) !== JSON.stringify(value)) {
          warnings.push({ kind: "conflict", sentence, message: `Conflicts with an earlier sentence ("${prev}"); kept the first value.` });
          continue;
        }
        (rules as Record<string, unknown>)[key] = value;
        setBy.set(key, sentence);
      }
    }
    if (!matched) warnings.push({ kind: "unsupported", sentence, message: "Not a supported rule; it was ignored." });
  }

  if (!rules.requiredDocuments.length) {
    rules.requiredDocuments.push({ label: "Government photo ID", anyOf: ["passport", "drivers_license", "national_id"] });
    warnings.push({ kind: "default", message: "No document requirement found; requiring a government photo ID." });
  }
  const hasAddressDoc = rules.requiredDocuments.some((d) => d.label === "Proof of address");
  if (hasAddressDoc && !setBy.has("proofOfAddressMaxAgeDays"))
    warnings.push({ kind: "default", message: "No age limit for proof of address; using 90 days." });
  if (!hasAddressDoc && setBy.has("proofOfAddressMaxAgeDays"))
    warnings.push({ kind: "conflict", message: "A proof-of-address age limit is set but no proof of address is required." });
  if (!setBy.has("autoApproveEnabled"))
    warnings.push({ kind: "default", message: "Auto-approval not mentioned; auto-approving risk scores of 25 or lower." });
  const keyFor: Partial<Record<RuleKind, keyof Rules>> = { min_age: "minAge", selfie_required: "selfieRequired", authority_lookup: "authorityLookup", retention: "retentionDays" };
  for (const [kind, note] of DEFAULT_NOTES) if (!setBy.has(keyFor[kind]!)) warnings.push({ kind: "default", message: note });

  return { rules: { ...rules, provenance }, warnings };
}

export const mockPolicyCompiler: PolicyCompiler = {
  name: "mock",
  compile: async (text) => compileEnglish(text),
};
