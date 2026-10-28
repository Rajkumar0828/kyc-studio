import OpenAI from "openai";

if (!process.env.MODEL_API_KEY) throw new Error("MODEL_API_KEY is not set");

export const meta = new OpenAI({
  baseURL: "https://api.meta.ai/v1",
  apiKey: process.env.MODEL_API_KEY,
});

export const MODEL = "muse-spark-1.3";
