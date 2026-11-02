import type { CompiledRules, RealDocType, RuleKind } from "./schema";

// Shared by every policy compiler (mock and Meta): input limits, sentence
// splitting, number grounding and the deterministic assembly of labelled
// sentences into CompiledRules plus warnings.

export const MAX_POLICY_CHARS = 8000;
export const MAX_POLICY_SENTENCES = 60;

export class CompileInputError extends Error {}

export type Rules = Omit<CompiledRules, "provenance">;
export type Setter = Partial<Rules>;

// Why a sentence (or part of one) was not applied. Mapped to plain English in the UI.
export const UNSUPPORTED_REASONS = ["vague_no_number", "unsupported_requirement", "not_a_policy_requirement", "negated_requirement", "not_labelled"] as const;
export type UnsupportedReason = (typeof UNSUPPORTED_REASONS)[number];
export const REASON_TEXT: Record<UnsupportedReason, string> = {
  vague_no_number: "no specific number or period is stated",
  unsupported_requirement: "the platform doesn't support this kind of requirement",
  not_a_policy_requirement: "this isn't a requirement the platform can apply",
  negated_requirement: "it makes a document optional or not required, which the platform doesn't support",
  not_labelled: "the compiler didn't label this sentence",
};
export const notAppliedText = (r: UnsupportedReason, detail?: string) => `Not applied: ${REASON_TEXT[r]}${detail ? ` (${detail})` : ""}.`;

// Checks the platform always performs, whatever the policy says. A sentence
// asking for one creates no rule; the read-back says so.
export const PLATFORM_CHECKS = ["name_match", "address_match", "id_not_expired"] as const;
export type PlatformCheck = (typeof PLATFORM_CHECKS)[number];
export const PLATFORM_CHECK_TEXT: Record<PlatformCheck, string> = {
  name_match: "Names must match across documents",
  address_match: "Addresses must match across documents",
  id_not_expired: "The ID must not have expired",
};
const AGREE = /\b(match(es|ing)?|same|consistent|agree(s)?|identical|correspond(s)?)\b/i;
const PLATFORM_GROUNDING: Record<PlatformCheck, (s: string) => boolean> = {
  name_match: (s) => /\bnames?\b/i.test(s) && AGREE.test(s),
  address_match: (s) => /\baddress(es)?\b/i.test(s) && AGREE.test(s),
  id_not_expired: (s) => /\b(expir\w*|valid|in date|out of date)\b/i.test(s) && /\b(ids?|passports?|licen[cs]es?|identity|documents?)\b/i.test(s),
};
// True when the sentence itself is about that check (keyword grounding).
export const isPlatformCheckGrounded = (sentence: string, check: PlatformCheck) => PLATFORM_GROUNDING[check](sentence);
export const platformChecksIn = (sentence: string) => PLATFORM_CHECKS.filter((c) => PLATFORM_GROUNDING[c](sentence));

export interface CompileWarning {
  kind: "unsupported" | "conflict" | "default";
  sentence?: string;
  message: string;
  reason?: UnsupportedReason; // unsupported warnings only
}

// A supported rule found in one sentence. `as` is the period as written when
// code converted it to days (e.g. "3 months").
export interface Label {
  index: number;
  kind: RuleKind;
  set: Setter;
  as?: string;
}
export interface AppliedLabel extends Label {
  conflict: boolean; // an earlier sentence already set this, so its value is not used
}
// A sentence (or part of one) that produced no rule, and why.
export interface Unsupported {
  index: number;
  reason: UnsupportedReason;
  detail?: string;
}
export interface PlatformLabel {
  index: number;
  check: PlatformCheck;
}

// "3 months" for a period code converted to days; undefined when written in days.
export const periodAsWritten = (n: number, unit: "days" | "weeks" | "months" | "years") =>
  unit === "days" ? undefined : `${n} ${n === 1 ? unit.slice(0, -1) : unit}`;

export const splitSentences = (text: string) =>
  text.split(/(?<=[.;!?])\s+|\n+/).map((s) => s.replace(/^[\s\-*•\d.)]+/, "").trim()).filter((s) => s.length > 1);

// Splits and enforces the limits; throws CompileInputError with a clear message.
export function checkCompileInput(text: string): string[] {
  if (!text.trim()) throw new CompileInputError("Enter the policy text to compile.");
  if (text.length > MAX_POLICY_CHARS) throw new CompileInputError(`Policy text is limited to ${MAX_POLICY_CHARS} characters (this one has ${text.length}).`);
  const sentences = splitSentences(text);
  if (sentences.length > MAX_POLICY_SENTENCES) throw new CompileInputError(`Policies are limited to ${MAX_POLICY_SENTENCES} sentences (this one has ${sentences.length}). Split it into several policies.`);
  return sentences;
}

// ---- number grounding: parameters must be derivable from the sentence itself ----

export type Unit = "days" | "weeks" | "months" | "years";
export const UNIT_DAYS: Record<Unit, number> = { days: 1, weeks: 7, months: 30, years: 365 };
export const toDays = (n: number, unit: Unit) => n * UNIT_DAYS[unit];

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const unitOf = (w: string | undefined): Unit | null => {
  if (!w) return null;
  const u = w.toLowerCase().replace(/s$/, "");
  return u === "day" ? "days" : u === "week" ? "weeks" : u === "month" ? "months" : u === "year" ? "years" : null;
};

export interface Quantity {
  value: number;
  unit: Unit | null; // the unit written right after the number, if any
}

// Every number written in the sentence, as digits or words ("twelve", "ninety",
// "twenty-one", "one hundred"), and "a"/"an" directly before a unit ("a year").
export function quantitiesIn(sentence: string): Quantity[] {
  const out: Quantity[] = [];
  const tokens = sentence.toLowerCase().replace(/(\d),(\d{3})/g, "$1$2").match(/[a-z]+|\d+/g) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let value: number | null = null;
    let used = 1;
    if (/^\d+$/.test(t)) value = Number(t);
    else if (t in TENS) {
      value = TENS[t];
      if (tokens[i + 1] && tokens[i + 1] in ONES && ONES[tokens[i + 1]] < 10 && ONES[tokens[i + 1]] > 0) {
        value += ONES[tokens[i + 1]];
        used = 2;
      }
    } else if (t in ONES) value = ONES[t];
    else if ((t === "a" || t === "an") && unitOf(tokens[i + 1])) value = 1;
    if (value === null) continue;
    if (tokens[i + used] === "hundred") {
      value = (value || 1) * 100;
      used++;
    } else if (t === "hundred") value = 100;
    out.push({ value, unit: unitOf(tokens[i + used]) });
    i += used - 1;
  }
  return out;
}

// True when `value` (with `unit`, if given) is written in the sentence.
export function isGrounded(sentence: string, value: number, unit: Unit | null): boolean {
  return quantitiesIn(sentence).some((q) => q.value === value && (unit === null || q.unit === unit));
}

// ---- document mentions ----

const ID_TYPES: Array<[RegExp, RealDocType]> = [
  [/\bpassports?\b/i, "passport"],
  [/\bdriver'?s'? licen[cs]es?\b/i, "drivers_license"],
  [/\bnational id(entity)?( card)?\b/i, "national_id"],
];
const ADDRESS_TYPES: Array<[RegExp, RealDocType]> = [
  [/\butility bills?\b/i, "utility_bill"],
  [/\bbank statements?\b/i, "bank_statement"],
];
export const IDENTITY_TYPES: RealDocType[] = ["passport", "drivers_license", "national_id"];
export const ADDRESS_TYPES_ALL: RealDocType[] = ["utility_bill", "bank_statement"];

// The document types a sentence names; [] when it only names the category ("photo ID").
export function docTypesIn(sentence: string, category: "identity" | "address"): RealDocType[] {
  return (category === "identity" ? ID_TYPES : ADDRESS_TYPES).filter(([re]) => re.test(sentence)).map(([, t]) => t);
}

// A sentence may switch a requirement OFF only with an explicit "not required"
// phrase. Limits such as "no older than", "has not expired", "not later than",
// "no more than", "at most" or "must not exceed" are not negations.
export const NOT_REQUIRED =
  /\b(need not|needn'?t|(?:is|are|be) not required|not required|no longer required|not necessary|no need|(?:do|does) not (?:require|need|check)|(?:don'?t|doesn'?t) (?:require|need|check)|optional(?:ly)?|exempt(?:ed)?|waived?|waives|forbidden|not allowed|must not (?:be required|be checked|provide|submit|upload|check))\b/i;
export const NEGATION_PHRASES_DOC =
  'negated=true ONLY when the sentence says a document or check is not required, optional, waived, exempt or forbidden ' +
  '(for example "need not", "is not required", "optional", "exempt", "waived"). Validity or limit phrasings are NOT negations and ' +
  'must use negated=false: "has not expired", "not older than", "no older than", "no more than", "not later than", "at most", "must not exceed".';

// ---- assembly ----

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
const DEFAULT_NOTES: Array<[keyof Rules, string]> = [
  ["minAge", "No minimum age stated; default applied: 18."],
  ["selfieRequired", "Selfie not mentioned; default applied: a selfie is required."],
  ["authorityLookup", "Registry check not mentioned; default applied: the ID is checked against the registry."],
  ["retentionDays", "No retention period stated; default applied: 365 days."],
];

export const NOT_LABELLED = notAppliedText("not_labelled");

export interface Assembled {
  rules: CompiledRules;
  warnings: CompileWarning[];
  applied: AppliedLabel[]; // every rule label, in sentence order, with its conflict flag
  platform: PlatformLabel[];
}

// Labelled sentences -> rules + warnings, deterministically. Sentences are
// processed in order and the first value of a setting wins; every sentence with
// no rule, no platform check and no unsupported note is reported as not labelled.
export function assemble(sentences: string[], labels: Label[], unsupported: Unsupported[], platform: PlatformLabel[] = []): Assembled {
  const rules: Rules = { ...DEFAULTS, requiredDocuments: [] };
  const provenance: CompiledRules["provenance"] = [];
  const warnings: CompileWarning[] = [];
  const applied: AppliedLabel[] = [];
  const setBy = new Map<string, string>(); // setting -> sentence that set it

  sentences.forEach((sentence, index) => {
    const mine = labels.filter((l) => l.index === index);
    const notes = unsupported.filter((u) => u.index === index);
    for (const label of mine) {
      let conflict = false;
      provenance.push({ rule: label.kind, sentence: sentence.slice(0, 500) });
      for (const [key, value] of Object.entries(label.set) as Array<[keyof Rules, unknown]>) {
        if (key === "requiredDocuments") {
          for (const doc of value as Rules["requiredDocuments"]) {
            if (rules.requiredDocuments.some((d) => d.label === doc.label)) {
              conflict = true;
              warnings.push({ kind: "conflict", sentence, message: `${doc.label} is already required by an earlier sentence; the first is used.` });
            } else rules.requiredDocuments.push(doc);
          }
          continue;
        }
        const prev = setBy.get(key);
        if (prev !== undefined && JSON.stringify(rules[key]) !== JSON.stringify(value)) {
          conflict = true;
          warnings.push({ kind: "conflict", sentence, message: `Conflicts with an earlier sentence ("${prev}"); the earlier value is used.` });
          continue;
        }
        (rules as Record<string, unknown>)[key] = value;
        setBy.set(key, sentence);
      }
      applied.push({ ...label, conflict });
    }
    for (const n of notes) warnings.push({ kind: "unsupported", sentence, message: notAppliedText(n.reason, n.detail), reason: n.reason });
    if (!mine.length && !notes.length && !platform.some((p) => p.index === index))
      warnings.push({ kind: "unsupported", sentence, message: NOT_LABELLED, reason: "not_labelled" });
  });

  if (!rules.requiredDocuments.length) {
    rules.requiredDocuments.push({ label: "Government photo ID", anyOf: [...IDENTITY_TYPES] });
    warnings.push({ kind: "default", message: "No document requirement found; default applied: a government photo ID is required." });
  }
  const hasAddressDoc = rules.requiredDocuments.some((d) => d.label === "Proof of address");
  if (hasAddressDoc && !setBy.has("proofOfAddressMaxAgeDays"))
    warnings.push({ kind: "default", message: "No age limit for proof of address; default applied: 90 days." });
  if (!hasAddressDoc && setBy.has("proofOfAddressMaxAgeDays"))
    warnings.push({ kind: "conflict", message: "A proof-of-address age limit is set but no proof of address is required." });
  if (!setBy.has("autoApproveEnabled"))
    warnings.push({ kind: "default", message: "Auto-approval not mentioned; default applied: risk scores of 25 or lower are auto-approved." });
  for (const [key, note] of DEFAULT_NOTES) if (!setBy.has(key)) warnings.push({ kind: "default", message: note });

  return { rules: { ...rules, provenance }, warnings, applied, platform };
}
