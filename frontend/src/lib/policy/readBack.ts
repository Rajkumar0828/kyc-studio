import { z } from "zod";
import { docList, RULE_LABEL } from "./labels";
import { RuleKind, type CompiledRules } from "./schema";

// The read-back table shown in the Policy Studio and stored with each draft and
// version: every source sentence, the rules compiled from it, and its warnings.
// Built deterministically by code from the compiler's output.

export const WarningKind = z.enum(["unsupported", "conflict", "default"]);

export const ReadBackRow = z.object({
  index: z.number().int().min(0).nullable(), // null for policy-wide notes (defaults)
  sentence: z.string().max(1000),
  rules: z.array(z.object({ kind: RuleKind, summary: z.string().max(300) }).strict()).max(10),
  warnings: z.array(z.object({ kind: WarningKind, message: z.string().max(300) }).strict()).max(10),
  status: z.enum(["mapped", "partial", "unsupported", "note"]),
}).strict();
export type ReadBackRow = z.infer<typeof ReadBackRow>;

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

export interface CompileWarningLike {
  kind: "unsupported" | "conflict" | "default";
  sentence?: string;
  message: string;
}

// One line per rule kind, from the compiled rules (first value wins on conflicts).
export function ruleSummary(kind: RuleKind, r: CompiledRules): string {
  switch (kind) {
    case "require_identity_doc": {
      const d = r.requiredDocuments.find((x) => x.label === "Government photo ID");
      return d ? `Require a government photo ID: ${docList(d.anyOf)}` : RULE_LABEL[kind];
    }
    case "require_address_doc": {
      const d = r.requiredDocuments.find((x) => x.label === "Proof of address");
      return d ? `Require proof of address: ${docList(d.anyOf)}` : RULE_LABEL[kind];
    }
    case "min_age": return `Minimum age ${r.minAge}`;
    case "poa_max_age": return `Proof of address issued within ${r.proofOfAddressMaxAgeDays} days`;
    case "selfie_required": return r.selfieRequired ? "Selfie required" : "Selfie not required";
    case "authority_lookup": return r.authorityLookup ? "Check the ID against the registry" : "No registry check";
    case "auto_approve_threshold": return r.autoApproveEnabled ? `Auto-approve at risk score ${r.autoApproveMaxScore} or lower` : "Auto-approval disabled";
    case "no_auto_approve": return "Never auto-approve; every case goes to manual review";
    case "retention": return `Keep data for ${r.retentionDays} days`;
  }
}

// Every sentence gets a row, in order; warnings without a sentence become note rows at the end.
export function buildReadBack(sentences: string[], rules: CompiledRules, warnings: CompileWarningLike[]): ReadBackRow[] {
  const rows: ReadBackRow[] = sentences.map((sentence, index) => {
    const kinds = [...new Set(rules.provenance.filter((p) => p.sentence === sentence).map((p) => p.rule))];
    const ws = warnings.filter((w) => w.sentence === sentence).map((w) => ({ kind: w.kind, message: w.message }));
    const unsupported = ws.some((w) => w.kind === "unsupported");
    return {
      index,
      sentence,
      rules: kinds.map((kind) => ({ kind, summary: ruleSummary(kind, rules) })),
      warnings: ws,
      status: unsupported ? (kinds.length ? "partial" : "unsupported") : kinds.length ? "mapped" : "unsupported",
    };
  });
  for (const w of warnings.filter((x) => !x.sentence))
    rows.push({ index: null, sentence: "", rules: [], warnings: [{ kind: w.kind, message: w.message }], status: "note" });
  return rows;
}
