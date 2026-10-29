import { metaProvider } from "./meta";
import { mockProvider } from "./mock";
import { mockCustomerGuide } from "./mockCustomerGuide";
import { mockPolicyCompiler } from "./mockPolicyCompiler";
import { providerName } from "./provider";
import type { AiProvider, CustomerGuide, PolicyCompiler } from "./types";

export class ProviderUnavailable extends Error {}

export function getAi(): AiProvider {
  return providerName() === "meta" ? metaProvider : mockProvider;
}

// Meta implementations come in a later task; until then these fail loudly instead
// of silently falling back to the mock.
export function getPolicyCompiler(): PolicyCompiler {
  if (providerName() === "meta") throw new ProviderUnavailable("The Meta policy compiler is not implemented yet; set AI_PROVIDER=mock.");
  return mockPolicyCompiler;
}

export function getCustomerGuide(): CustomerGuide {
  if (providerName() === "meta") throw new ProviderUnavailable("The Meta customer guide is not implemented yet; set AI_PROVIDER=mock.");
  return mockCustomerGuide;
}

export { providerName, type ProviderName } from "./provider";
export type * from "./types";
