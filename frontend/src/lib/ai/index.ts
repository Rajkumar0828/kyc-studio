import { metered } from "../security/aiBudget";
import { createMetaProvider } from "./meta";
import { mockProvider } from "./mock";
import { mockCustomerGuide } from "./mockCustomerGuide";
import { mockPolicyCompiler } from "./mockPolicyCompiler";
import { providerName } from "./provider";
import { recordingWrapper, type RecordingContext } from "./recordAiCall";
import type { AiProvider, CustomerGuide, PolicyCompiler } from "./types";

export class ProviderUnavailable extends Error {}

// Correlation ids for the AI call log. Never content.
export type AiContext = Pick<RecordingContext, "caseId" | "policyId" | "onRecord">;

// Every provider handed out here counts toward the daily AI cap: Meta per API
// request (and recorded via recordAiCall), mock per method call.
export function getAi(ctx: AiContext = {}): AiProvider {
  return providerName() === "meta" ? createMetaProvider({ call: recordingWrapper(ctx) }) : metered(mockProvider);
}

// Meta implementations come in a later task; until then these fail loudly instead
// of silently falling back to the mock.
export function getPolicyCompiler(ctx: AiContext = {}): PolicyCompiler {
  void ctx;
  if (providerName() === "meta") throw new ProviderUnavailable("The Meta policy compiler is not implemented yet; set AI_PROVIDER=mock.");
  return metered(mockPolicyCompiler);
}

export function getCustomerGuide(ctx: AiContext = {}): CustomerGuide {
  void ctx;
  if (providerName() === "meta") throw new ProviderUnavailable("The Meta customer guide is not implemented yet; set AI_PROVIDER=mock.");
  return metered(mockCustomerGuide);
}

export { providerName, type ProviderName } from "./provider";
export type * from "./types";
