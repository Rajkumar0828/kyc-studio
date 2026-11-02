import { metered } from "../security/aiBudget";
import { createMetaProvider } from "./meta";
import { createMetaCustomerGuide } from "./metaCustomerGuide";
import { createMetaPolicyCompiler } from "./metaPolicyCompiler";
import { mockProvider } from "./mock";
import { mockCustomerGuide } from "./mockCustomerGuide";
import { mockPolicyCompiler } from "./mockPolicyCompiler";
import { providerName } from "./provider";
import { recordingWrapper, type RecordingContext } from "./recordAiCall";
import type { AiProvider, CustomerGuide, PolicyCompiler } from "./types";

// Thrown when a provider is configured but cannot serve a request.
export class ProviderUnavailable extends Error {}

// Correlation ids for the AI call log. Never content.
export type AiContext = Pick<RecordingContext, "caseId" | "policyId" | "onRecord">;

// Every provider handed out here counts toward the daily AI cap: Meta per API
// request (and recorded via recordAiCall), mock per method call.
export function getAi(ctx: AiContext = {}): AiProvider {
  return providerName() === "meta" ? createMetaProvider({ call: recordingWrapper(ctx) }) : metered(mockProvider);
}

export function getPolicyCompiler(ctx: AiContext = {}): PolicyCompiler {
  return providerName() === "meta" ? createMetaPolicyCompiler({ call: recordingWrapper(ctx) }) : metered(mockPolicyCompiler);
}

export function getCustomerGuide(ctx: AiContext = {}): CustomerGuide {
  return providerName() === "meta" ? createMetaCustomerGuide({ call: recordingWrapper(ctx) }) : metered(mockCustomerGuide);
}

export { providerName, type ProviderName } from "./provider";
export type * from "./types";
