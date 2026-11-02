import { templateSteps } from "../../ai/mockCustomerGuide";
import { DEFAULT_POLICIES } from "../defaults";
import type { PolicyVersion } from "./types";

// The seed policies live in code as read-only published version 1, whichever store is used.
const SEEDED_AT = "2026-10-01T00:00:00.000Z";

export const SEED_VERSIONS: PolicyVersion[] = DEFAULT_POLICIES.map((spec) => ({
  spec,
  guide: { steps: templateSteps(spec), source: "template", provider: "template", model: null, effort: null, note: null, generatedAt: SEEDED_AT },
  compile: null,
  publishedAt: SEEDED_AT,
}));

export const isSeed = (id: string) => DEFAULT_POLICIES.some((p) => p.id === id);
