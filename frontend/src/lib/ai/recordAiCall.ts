import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { consumeAiCall } from "../security/aiBudget";
import type { ChatWrapper } from "./meta";

// One record per Meta API call, for the "Meta usage" panel. Metadata only:
// never prompt text, policy text, images, response content, headers or keys.
// Optional correlation ids link a call to a case or policy.

export const AiCallRecord = z.object({
  at: z.iso.datetime(),
  source: z.enum(["app", "eval"]),
  step: z.string().max(40),
  model: z.string().max(80),
  effort: z.string().max(20).nullable(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  reasoningTokens: z.number().int().nullable(),
  cachedInputTokens: z.number().int().nullable(),
  latencyMs: z.number().int().nullable(),
  finishReason: z.string().max(40).nullable(),
  error: z.string().max(80).nullable(), // error class and HTTP status only, never the message body
  caseId: z.string().max(80).optional(),
  policyId: z.string().max(48).optional(),
}).strict();
export type AiCallRecord = z.infer<typeof AiCallRecord>;

export interface AiCallSink {
  write(r: AiCallRecord): void;
  recent(limit?: number): AiCallRecord[];
}

// In-memory ring buffer plus an append-only JSON Lines file (gitignored data/).
// AI_CALL_LOG=memory skips the file. MongoDB arrives in a later task.
function createDefaultSink(): AiCallSink {
  const ring: AiCallRecord[] = [];
  const toFile = (process.env.AI_CALL_LOG || "file") === "file";
  const file = path.join(process.cwd(), "data", "ai-calls.jsonl");
  return {
    write(r) {
      ring.push(r);
      if (ring.length > 500) ring.shift();
      if (!toFile) return;
      fs.promises.mkdir(path.dirname(file), { recursive: true })
        .then(() => fs.promises.appendFile(file, JSON.stringify(r) + "\n"))
        .catch((e) => console.error("[recordAiCall] could not write the call log:", e instanceof Error ? e.name : e));
    },
    recent: (limit = 50) => ring.slice(-limit),
  };
}

const g = globalThis as unknown as { _aiCallSink?: AiCallSink };
export const aiCallSink = (): AiCallSink => (g._aiCallSink ??= createDefaultSink());
export const setAiCallSink = (s: AiCallSink) => {
  g._aiCallSink = s;
};

export function recordAiCall(r: AiCallRecord) {
  aiCallSink().write(AiCallRecord.parse(r));
}

// Only the error's class and HTTP status, so no request or response text leaks into the log.
export const errorLabel = (e: unknown) => {
  if (!(e instanceof Error)) return "Error";
  const status = (e as { status?: unknown }).status;
  return `${e.name}${typeof status === "number" ? ` ${status}` : ""}`.slice(0, 80);
};

export interface RecordingContext {
  caseId?: string;
  policyId?: string;
  source?: "app" | "eval";
  meter?: boolean; // count each API call against the daily AI cap (default true)
  onRecord?: (r: AiCallRecord) => void; // e.g. to show a compile's usage in the UI
}

// The production wrapper around the single Meta API call: meter, time, record.
export function recordingWrapper(ctx: RecordingContext = {}): ChatWrapper {
  return async (step, body, send) => {
    if (ctx.meter !== false) consumeAiCall();
    const base = {
      at: new Date().toISOString(), source: ctx.source ?? "app", step, model: body.model, effort: body.reasoning_effort ?? null,
      ...(ctx.caseId && { caseId: ctx.caseId }), ...(ctx.policyId && { policyId: ctx.policyId }),
    } as const;
    const t0 = performance.now();
    try {
      const res = await send(body);
      const rec: AiCallRecord = {
        ...base,
        inputTokens: res.usage?.prompt_tokens ?? null,
        outputTokens: res.usage?.completion_tokens ?? null,
        reasoningTokens: res.usage?.completion_tokens_details?.reasoning_tokens ?? null,
        cachedInputTokens: res.usage?.prompt_tokens_details?.cached_tokens ?? null,
        latencyMs: Math.round(performance.now() - t0),
        finishReason: res.finishReason,
        error: null,
      };
      recordAiCall(rec);
      ctx.onRecord?.(rec);
      return res;
    } catch (e) {
      const rec: AiCallRecord = {
        ...base, inputTokens: null, outputTokens: null, reasoningTokens: null, cachedInputTokens: null,
        latencyMs: Math.round(performance.now() - t0), finishReason: null, error: errorLabel(e),
      };
      recordAiCall(rec);
      ctx.onRecord?.(rec);
      throw e;
    }
  };
}
