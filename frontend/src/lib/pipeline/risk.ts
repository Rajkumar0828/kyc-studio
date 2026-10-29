import type { PolicySpec } from "../policy/schema";
import type { Check, Decision } from "./types";

// Transparent points so every score can be explained line by line.
const WEIGHTS: Record<string, number> = {
  name_mismatch: 40, full_name_mismatch: 40, dob_mismatch: 50, address_mismatch: 15,
  id_not_found: 45, id_reported_lost: 70, id_revoked: 70, id_registry_mismatch: 50,
  under_min_age: 60, doc_number_format: 15, address_unknown: 10, low_confidence: 5,
};

export function scoreRisk(checks: Check[]): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  for (const c of checks) {
    if (c.status === "pass") continue;
    const w = WEIGHTS[c.code] ?? (c.status === "fail" ? 20 : 5);
    score += w;
    reasons.push(`${c.message} (+${w})`);
  }
  return { score: Math.min(100, score), reasons };
}

// AI proposes, a human decides: the system never auto-rejects.
export function decide(checks: Check[], score: number, policy: PolicySpec): Decision {
  const blocking = checks.filter((c) => c.status === "fail");
  if (blocking.some((c) => c.category === "integrity")) return "manual_review";
  if (blocking.some((c) => c.category === "customer_fixable")) return "request_info";
  if (!policy.autoApproveEnabled) return "manual_review";
  return score <= policy.autoApproveMaxScore ? "auto_approve" : "manual_review";
}
