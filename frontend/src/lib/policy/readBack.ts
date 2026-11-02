import { z } from "zod";
import {
  PLATFORM_CHECK_TEXT, PLATFORM_CHECKS, REASON_TEXT, UNSUPPORTED_REASONS,
  type AppliedLabel, type CompileWarning, type PlatformLabel, type Setter, type UnsupportedReason,
} from "./compileCore";
import { docList, RULE_LABEL } from "./labels";
import { RuleKind } from "./schema";

// The read-back table shown in the Policy Studio and stored with each draft and
// version: every source sentence with exactly one status, the rules or platform
// checks it produced, and notes. Built deterministically by code.
//
// Statuses never contradict each other: a sentence that produced a rule is
// "applied" or "applied_with_note", never "not applied".

export const WarningKind = z.enum(["unsupported", "conflict", "default"]);
export const RowStatus = z.enum(["applied", "platform_check", "applied_with_note", "not_applied", "note"]);
export type RowStatus = z.infer<typeof RowStatus>;
export const UnsupportedReasonSchema = z.enum(UNSUPPORTED_REASONS);
export const PlatformCheckSchema = z.enum(PLATFORM_CHECKS);

const Row = z.object({
  index: z.number().int().min(0).nullable(), // null for policy-wide notes (defaults)
  sentence: z.string().max(1000),
  status: RowStatus,
  rules: z.array(z.object({ kind: RuleKind, summary: z.string().max(300) }).strict()).max(10),
  platformChecks: z.array(z.object({ check: PlatformCheckSchema, summary: z.string().max(200) }).strict()).max(3),
  notes: z.array(z.object({ kind: z.enum(["conflict", "default", "partial"]), message: z.string().max(400) }).strict()).max(10),
  reason: UnsupportedReasonSchema.nullable(), // set only when status is not_applied
  reasonText: z.string().max(300).nullable(),
}).strict();

// Rows stored before statuses existed ({ warnings, status: mapped|partial|unsupported|note }) are upgraded on read.
const legacyReason = (m: string): UnsupportedReason =>
  /not stated/i.test(m) ? "vague_no_number" : /not labelled/i.test(m) ? "not_labelled" : /negated|optional/i.test(m) ? "negated_requirement" : "unsupported_requirement";
function upgrade(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || !("warnings" in raw)) return raw;
  const r = raw as { index: number | null; sentence: string; rules: Array<{ kind: string; summary: string }>; warnings: Array<{ kind: string; message: string }>; status: string };
  const unsupported = r.warnings.filter((w) => w.kind === "unsupported");
  const others = r.warnings.filter((w) => w.kind !== "unsupported").map((w) => ({ kind: w.kind as "conflict" | "default", message: w.message }));
  if (r.status === "note") return { index: null, sentence: "", status: "note", rules: [], platformChecks: [], notes: others, reason: null, reasonText: null };
  if (r.rules.length) {
    const notes = [...others, ...unsupported.map((w) => ({ kind: "partial" as const, message: `Part of this sentence was not applied: ${REASON_TEXT[legacyReason(w.message)]}.` }))];
    return { index: r.index, sentence: r.sentence, status: notes.length ? "applied_with_note" : "applied", rules: r.rules, platformChecks: [], notes, reason: null, reasonText: null };
  }
  const reason = legacyReason(unsupported[0]?.message ?? "");
  return { index: r.index, sentence: r.sentence, status: "not_applied", rules: [], platformChecks: [], notes: others, reason, reasonText: REASON_TEXT[reason] };
}
export const ReadBackRow = z.preprocess(upgrade, Row);
export type ReadBackRow = z.infer<typeof Row>;

export const CallUsage = z.object({
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  reasoningTokens: z.number().int().nullable(),
  latencyMs: z.number().int().nullable(),
}).strict();

// How a policy text was compiled. Kept with the draft and copied into the version.
export const CompileRecord = z.object({
  provider: z.string().max(40),
  model: z.string().max(80).nullable(),
  effort: z.string().max(20).nullable(),
  attempts: z.number().int().min(1).max(2),
  calls: z.number().int().min(0).max(4), // API calls incl. preflight; 0 for mock
  usage: CallUsage.nullable(), // summed over the compile's API calls; null for mock
  rows: z.array(ReadBackRow).max(80),
  compiledAt: z.iso.datetime(),
}).strict();
export type CompileRecord = z.infer<typeof CompileRecord>;

// "3 months (stored as 90 days)" when code converted the period, else "90 days".
const period = (days: number | undefined, as?: string) => (as ? `${as} (stored as ${days} days)` : `${days} days`);

// One line for one rule label, from that label's own values (not the merged rules),
// so a sentence that conflicts with an earlier one still shows what it said.
export function labelSummary(kind: RuleKind, set: Setter, as?: string): string {
  switch (kind) {
    case "require_identity_doc":
    case "require_address_doc": {
      const d = set.requiredDocuments?.[0];
      return d ? `Require ${kind === "require_identity_doc" ? "a government photo ID" : "proof of address"}: ${docList(d.anyOf)}` : RULE_LABEL[kind];
    }
    case "min_age": return `Minimum age ${set.minAge}`;
    case "poa_max_age": return `Proof of address issued within ${period(set.proofOfAddressMaxAgeDays, as)}`;
    case "selfie_required": return set.selfieRequired ? "Selfie required" : "Selfie not required";
    case "authority_lookup": return set.authorityLookup ? "Check the ID against the registry" : "No registry check";
    case "auto_approve_threshold": return `Auto-approve at risk score ${set.autoApproveMaxScore} or lower`;
    case "no_auto_approve": return "Never auto-approve; every case goes to manual review";
    case "retention": return `Keep data for ${period(set.retentionDays, as)}`;
  }
}

export interface ReadBackInput {
  applied: AppliedLabel[];
  platform: PlatformLabel[];
  warnings: CompileWarning[];
}

// Exactly one status per sentence, in order; policy-wide notes come last.
export function buildReadBack(sentences: string[], out: ReadBackInput): ReadBackRow[] {
  const rows: ReadBackRow[] = sentences.map((sentence, index) => {
    const labels = out.applied.filter((l) => l.index === index);
    const checks = [...new Set(out.platform.filter((p) => p.index === index).map((p) => p.check))];
    const ws = out.warnings.filter((w) => w.sentence === sentence);
    const unsupported = ws.filter((w) => w.kind === "unsupported");
    const conflicts = ws.filter((w) => w.kind === "conflict").map((w) => ({ kind: "conflict" as const, message: w.message }));
    const base = {
      index, sentence,
      rules: labels.map((l) => ({ kind: l.kind, summary: labelSummary(l.kind, l.set, l.as) })),
      platformChecks: checks.map((check) => ({ check, summary: PLATFORM_CHECK_TEXT[check] })),
    };
    // Something from this sentence counts: rules first, then platform checks. Anything
    // else in it becomes a note, never a second, contradictory status.
    if (labels.length || checks.length) {
      const partial = unsupported.map((w) => ({ kind: "partial" as const, message: `Part of this sentence was not applied: ${REASON_TEXT[w.reason ?? "unsupported_requirement"]}.` }));
      const notes = [...conflicts, ...partial];
      const status: RowStatus = labels.length ? (notes.length ? "applied_with_note" : "applied") : "platform_check";
      return { ...base, status, notes, reason: null, reasonText: null };
    }
    const reason = unsupported[0]?.reason ?? "not_labelled";
    return { ...base, status: "not_applied", notes: conflicts, reason, reasonText: REASON_TEXT[reason] };
  });
  for (const w of out.warnings.filter((x) => !x.sentence))
    rows.push({ index: null, sentence: "", status: "note", rules: [], platformChecks: [], notes: [{ kind: w.kind === "conflict" ? "conflict" : "default", message: w.message }], reason: null, reasonText: null });
  return rows;
}

// Sentences that produced nothing at all; the only ones counted in the Studio's banner.
export const notAppliedCount = (rows: ReadBackRow[]) => rows.filter((r) => r.status === "not_applied").length;
