import { z } from "zod";

export const DocType = z.enum(["passport", "drivers_license", "national_id", "utility_bill", "bank_statement", "unknown"]);
export type DocType = z.infer<typeof DocType>;

export const IDENTITY_DOCS: DocType[] = ["passport", "drivers_license", "national_id"];
export const ADDRESS_DOCS: DocType[] = ["utility_bill", "bank_statement"];

// The validated JSON spec the Policy Compiler produces from English policy text.
export const PolicySpec = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  customerCategory: z.string(),
  // Each requirement is satisfied by any one of its doc types.
  requiredDocuments: z.array(z.object({ label: z.string(), anyOf: z.array(DocType).min(1) })).min(1),
  minAge: z.number().int().min(0).max(120),
  proofOfAddressMaxAgeDays: z.number().int().positive(),
  selfieRequired: z.boolean(),
  authorityLookup: z.boolean(),
  risk: z.object({
    autoApproveMax: z.number().min(0).max(100), // score <= this and no blocking issues -> auto-approve
  }),
});
export type PolicySpec = z.infer<typeof PolicySpec>;
