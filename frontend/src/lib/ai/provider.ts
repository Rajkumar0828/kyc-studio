export type ProviderName = "mock" | "meta";

// AI_PROVIDER=mock|meta, defaulting to mock. Providers are for server code only
// (API routes and scripts); client components call the API routes instead.
export function providerName(): ProviderName {
  if (typeof window !== "undefined") throw new Error("AI providers are server-only");
  const v = process.env.AI_PROVIDER || "mock";
  if (v !== "mock" && v !== "meta") throw new Error(`AI_PROVIDER must be mock or meta, got "${v}"`);
  return v;
}
