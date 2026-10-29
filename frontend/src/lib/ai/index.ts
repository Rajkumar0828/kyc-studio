import { metaProvider } from "./meta";
import { mockProvider } from "./mock";
import type { AiProvider } from "./types";

// AI_PROVIDER=meta once credits are applied; defaults to mock otherwise.
export function getAi(): AiProvider {
  const choice = process.env.AI_PROVIDER ?? (process.env.MODEL_API_KEY ? "meta" : "mock");
  return choice === "meta" ? metaProvider : mockProvider;
}
export type * from "./types";
