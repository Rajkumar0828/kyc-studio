import { PolicySpec } from "./schema";

// Seed policies until the Policy Studio is built. Different customer
// categories collect different evidence (e.g. housing loan vs general account).
export const DEFAULT_POLICIES: PolicySpec[] = [
  PolicySpec.parse({
    id: "general-account", version: 1, name: "General account opening", customerCategory: "retail",
    requiredDocuments: [{ label: "Government photo ID", anyOf: ["passport", "drivers_license", "national_id"] }],
    minAge: 18, proofOfAddressMaxAgeDays: 90, selfieRequired: true, authorityLookup: true,
    risk: { autoApproveMax: 25 },
  }),
  PolicySpec.parse({
    id: "housing-loan", version: 1, name: "Housing loan applicant", customerCategory: "lending",
    requiredDocuments: [
      { label: "Government photo ID", anyOf: ["passport", "drivers_license", "national_id"] },
      { label: "Proof of address", anyOf: ["utility_bill", "bank_statement"] },
    ],
    minAge: 21, proofOfAddressMaxAgeDays: 90, selfieRequired: true, authorityLookup: true,
    risk: { autoApproveMax: 15 },
  }),
];

export const getDefaultPolicy = (id: string) => DEFAULT_POLICIES.find((p) => p.id === id);
