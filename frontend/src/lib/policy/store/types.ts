import { z } from "zod";
import { JOURNEY_STEPS } from "../../ai/types";
import { CompileRecord } from "../readBack";
import { CompiledRules, POLICY_ID, PolicySpec } from "../schema";

// Storage contract for policies. Routes and pages use only this interface
// (via getPolicyStore()); implementations: JSON file now, MongoDB next.
//
// Drafts are editable working copies with no version number. Publishing turns
// the draft into version N+1, which is never changed afterwards. Archiving is a
// one-way flag on the policy; its versions stay readable.

export const GuideSource = z.enum(["ai", "template", "template_fallback"]);
export type GuideSource = z.infer<typeof GuideSource>;

// Step wording generated once at publish time from that exact version.
export const StoredGuide = z.object({
  steps: z.object(Object.fromEntries(JOURNEY_STEPS.map((s) => [s, z.string().min(1).max(1000)])) as Record<(typeof JOURNEY_STEPS)[number], z.ZodString>).strict(),
  source: GuideSource, // ai | template (mock provider) | template_fallback (AI wording unavailable)
  provider: z.string().max(40),
  model: z.string().max(80).nullable(),
  effort: z.string().max(20).nullable(),
  note: z.string().max(300).nullable(), // why the fallback was used
  generatedAt: z.iso.datetime(),
}).strict();
export type StoredGuide = z.infer<typeof StoredGuide>;

export const PolicyVersion = z.object({
  spec: PolicySpec, // status is always "published"
  guide: StoredGuide,
  compile: CompileRecord.nullable(), // null for seeds
  publishedAt: z.iso.datetime(),
}).strict();
export type PolicyVersion = z.infer<typeof PolicyVersion>;

export const PolicyDraft = z.object({
  id: z.string().regex(POLICY_ID),
  name: z.string().min(1).max(80),
  customerCategory: z.string().min(1).max(40),
  sourceText: z.string().max(8000),
  consentText: z.string().min(1).max(2000),
  rules: CompiledRules,
  compile: CompileRecord.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();
export type PolicyDraft = z.infer<typeof PolicyDraft>;

export const DraftInput = z.object({
  id: z.string().regex(POLICY_ID).optional(), // set when editing an existing policy
  name: z.string().trim().min(1).max(80),
  customerCategory: z.string().trim().min(1).max(40),
  sourceText: z.string().max(8000),
  consentText: z.string().trim().min(1).max(2000),
  rules: CompiledRules,
  compile: CompileRecord.nullable(),
}).strict();
export type DraftInput = z.infer<typeof DraftInput>;

export interface PolicySummary {
  id: string;
  name: string;
  customerCategory: string;
  latestVersion: number | null; // null until first published
  publishedAt: string | null;
  retentionDays: number;
  documents: string[];
  draftUpdatedAt: string | null;
  archived: boolean;
  seed: boolean;
}

export interface PublishExtras {
  guide: StoredGuide;
  version: number; // the version the caller prepared (guards against concurrent publishes)
  draftUpdatedAt: string; // the draft the caller prepared from (guards against concurrent edits)
}

export interface PolicyStore {
  list(): Promise<PolicySummary[]>;
  get(id: string): Promise<PolicyVersion | null>; // latest published version; null if none or archived
  getVersion(id: string, version: number): Promise<PolicyVersion | null>; // any version, archived or not
  versions(id: string): Promise<number[]>;
  getDraft(id: string): Promise<PolicyDraft | null>;
  isArchived(id: string): Promise<boolean>;
  saveDraft(input: DraftInput): Promise<PolicyDraft>;
  publish(id: string, extras: PublishExtras): Promise<PolicyVersion>;
  archive(id: string): Promise<void>;
}

export class PolicyStoreError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
  }
}

// The spec version N of a draft becomes. Pure, so the publish route can build
// the guide from exactly what will be stored.
export function specFromDraft(draft: PolicyDraft, version: number, now: string): PolicySpec {
  return PolicySpec.parse({
    ...draft.rules,
    id: draft.id,
    version,
    status: "published",
    name: draft.name,
    customerCategory: draft.customerCategory,
    sourceText: draft.sourceText,
    consentText: draft.consentText,
    createdAt: draft.createdAt,
    updatedAt: now,
  });
}

export const slugify = (name: string) =>
  name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
