import OpenAI from "openai";

export const MODEL = process.env.META_MODEL ?? "muse-spark-1.3";

// Lazy: importing this file must not crash when no key is set, so the app
// runs on the mock provider until the hackathon credits arrive.
let client: OpenAI | undefined;
export function getMeta(): OpenAI {
  if (!process.env.MODEL_API_KEY) throw new Error("MODEL_API_KEY is not set (use AI_PROVIDER=mock until credits arrive)");
  return (client ??= new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.MODEL_API_KEY }));
}
