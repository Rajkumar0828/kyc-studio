import { z } from "zod";

export const DocType = z.enum(["passport", "drivers_license", "national_id", "utility_bill", "bank_statement", "unknown"]);
export type DocType = z.infer<typeof DocType>;

export const IDENTITY_DOCS: DocType[] = ["passport", "drivers_license", "national_id"];
export const ADDRESS_DOCS: DocType[] = ["utility_bill", "bank_statement"];

// Closed vocabulary: the only settings a compiler may produce. Each one is
// enforced by the pipeline (or, for retention, by storage once it moves to Mongo).
export const RuleKind = z.enum([
  "require_identity_doc",
  "require_address_doc",
  "min_age",
  "poa_max_age",
  "selfie_required",
  "authority_lookup",
  "auto_approve_threshold",
  "no_auto_approve",
  "retention",
]);
export type RuleKind = z.infer<typeof RuleKind>;

export const RealDocType = DocType.exclude(["unknown"]);
export type RealDocType = z.infer<typeof RealDocType>;

export const RequiredDocument = z.object({
  label: z.string().min(1).max(80),
  anyOf: z.array(RealDocType).min(1).max(5), // satisfied by any one of these
}).strict();

export const Provenance = z.object({
  rule: RuleKind,
  sentence: z.string().max(500),
}).strict();

// Everything a compiler (mock or model) is allowed to decide. consentText, names
// and ids are deliberately absent: they come from the admin, never from a model.
export const CompiledRules = z.object({
  requiredDocuments: z.array(RequiredDocument).min(1).max(5),
  minAge: z.number().int().min(0).max(120),
  proofOfAddressMaxAgeDays: z.number().int().min(1).max(3650),
  selfieRequired: z.boolean(),
  authorityLookup: z.boolean(),
  autoApproveEnabled: z.boolean(),
  autoApproveMaxScore: z.number().int().min(0).max(100), // score <= this and no blocking issues -> auto-approve
  retentionDays: z.number().int().min(1).max(3650),
  provenance: z.array(Provenance).max(50), // which sentence set which rule
}).strict();
export type CompiledRules = z.infer<typeof CompiledRules>;

export const PolicyStatus = z.enum(["draft", "published"]);
export const POLICY_ID = /^[a-z0-9][a-z0-9-]{1,47}$/;

// The stored policy. Flat by design (max depth 4: requiredDocuments[].anyOf[]),
// no recursion and no free-form objects, so it maps onto a strict JSON schema.
export const PolicySpec = CompiledRules.extend({
  id: z.string().regex(POLICY_ID),
  version: z.number().int().positive(),
  status: PolicyStatus,
  name: z.string().min(1).max(80),
  customerCategory: z.string().min(1).max(40),
  sourceText: z.string().max(4000), // the English the rules were compiled from
  consentText: z.string().min(1).max(2000), // shown verbatim in the consent step
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();
export type PolicySpec = z.infer<typeof PolicySpec>;

export const defaultConsentText = (retentionDays: number) =>
  "We will use the documents and selfie you upload only to verify your identity for this application. " +
  "Automated checks propose an outcome and a person reviews anything unclear. " +
  `We keep your verification data for ${retentionDays} days and then delete it. ` +
  "This is a synthetic demo: do not upload real identity documents.";
