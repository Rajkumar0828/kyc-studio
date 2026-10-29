import { defaultConsentText, PolicySpec } from "./schema";

// English policy texts. They double as the Policy Studio's example prompts, and
// scripts/policy-compiler-test.ts checks that compiling each one reproduces the seed.
export const EXAMPLE_PROMPTS = [
  {
    title: "General account",
    text:
      "Require a government photo ID: passport, driver's license or national ID. " +
      "Applicants must be at least 18 years old. Require a selfie. " +
      "Check the ID against the government registry. " +
      "Auto-approve when the risk score is 25 or lower. Keep customer data for 365 days.",
  },
  {
    title: "Housing loan",
    text:
      "Require a government photo ID: passport, driver's license or national ID. " +
      "Require proof of address such as a utility bill or bank statement. " +
      "Proof of address must be dated within the last 90 days. " +
      "Applicants must be at least 21 years old. Require a selfie. " +
      "Check the ID against the government registry. " +
      "Auto-approve when the risk score is 15 or lower. Keep customer data for 730 days.",
  },
  {
    title: "Private banking (no auto-approve)",
    text:
      "Require a passport. Require proof of address such as a bank statement. " +
      "Proof of address must be dated within the last 60 days. " +
      "Applicants must be at least 25 years old. Require a selfie. " +
      "Check the ID against the government registry. " +
      "Never auto-approve; every application goes to manual review. Keep customer data for 5 years.",
  },
  {
    title: "With an unsupported rule",
    text:
      "Require a government photo ID: passport, driver's license or national ID. " +
      "Applicants must be at least 18 years old. Do not require a selfie. " +
      "Screen applicants against sanctions lists. " +
      "Check the ID against the government registry. " +
      "Auto-approve when the risk score is 20 or lower. Keep customer data for 180 days.",
  },
] as const;

const SEEDED_AT = "2026-10-01T00:00:00.000Z";
const ID_DOC = { label: "Government photo ID", anyOf: ["passport", "drivers_license", "national_id"] } as const;
const POA_DOC = { label: "Proof of address", anyOf: ["utility_bill", "bank_statement"] } as const;
const sentences = (t: string) => t.split(/(?<=[.;!?])\s+/);

// Seed policies until the Policy Studio has saved its own. Different customer
// categories collect different evidence (e.g. housing loan vs general account).
export const DEFAULT_POLICIES: PolicySpec[] = [
  PolicySpec.parse({
    id: "general-account", version: 1, status: "published", name: "General account opening", customerCategory: "retail",
    sourceText: EXAMPLE_PROMPTS[0].text,
    requiredDocuments: [ID_DOC],
    minAge: 18, proofOfAddressMaxAgeDays: 90, selfieRequired: true, authorityLookup: true,
    autoApproveEnabled: true, autoApproveMaxScore: 25, retentionDays: 365,
    consentText: defaultConsentText(365),
    provenance: (() => {
      const s = sentences(EXAMPLE_PROMPTS[0].text);
      return [
        { rule: "require_identity_doc", sentence: s[0] }, { rule: "min_age", sentence: s[1] }, { rule: "selfie_required", sentence: s[2] },
        { rule: "authority_lookup", sentence: s[3] }, { rule: "auto_approve_threshold", sentence: s[4] }, { rule: "retention", sentence: s[5] },
      ];
    })(),
    createdAt: SEEDED_AT, updatedAt: SEEDED_AT,
  }),
  PolicySpec.parse({
    id: "housing-loan", version: 1, status: "published", name: "Housing loan applicant", customerCategory: "lending",
    sourceText: EXAMPLE_PROMPTS[1].text,
    requiredDocuments: [ID_DOC, POA_DOC],
    minAge: 21, proofOfAddressMaxAgeDays: 90, selfieRequired: true, authorityLookup: true,
    autoApproveEnabled: true, autoApproveMaxScore: 15, retentionDays: 730,
    consentText: defaultConsentText(730),
    provenance: (() => {
      const s = sentences(EXAMPLE_PROMPTS[1].text);
      return [
        { rule: "require_identity_doc", sentence: s[0] }, { rule: "require_address_doc", sentence: s[1] }, { rule: "poa_max_age", sentence: s[2] },
        { rule: "min_age", sentence: s[3] }, { rule: "selfie_required", sentence: s[4] }, { rule: "authority_lookup", sentence: s[5] },
        { rule: "auto_approve_threshold", sentence: s[6] }, { rule: "retention", sentence: s[7] },
      ];
    })(),
    createdAt: SEEDED_AT, updatedAt: SEEDED_AT,
  }),
];

export const getDefaultPolicy = (id: string) => DEFAULT_POLICIES.find((p) => p.id === id);
