import type { DocType, RuleKind } from "./schema";

// Human-readable names for the UI.
export const DOC_LABEL: Record<DocType, string> = {
  passport: "Passport",
  drivers_license: "Driver's license",
  national_id: "National ID card",
  utility_bill: "Utility bill",
  bank_statement: "Bank statement",
  unknown: "Unknown document",
};

export const RULE_LABEL: Record<RuleKind, string> = {
  require_identity_doc: "Identity document",
  require_address_doc: "Proof of address",
  min_age: "Minimum age",
  poa_max_age: "Proof of address age",
  selfie_required: "Selfie",
  authority_lookup: "Registry check",
  auto_approve_threshold: "Auto-approval",
  no_auto_approve: "Auto-approval",
  retention: "Data retention",
};

export const docList = (types: readonly DocType[]) => types.map((t) => DOC_LABEL[t]).join(" or ");
