import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import type { ChatRequest, ChatResult, ChatWrapper, MetaStep } from "../../src/lib/ai/meta";

// The eval's wrapper around the provider's single API call: an on-disk cache,
// a hard cap on live calls, and a per-call log. It only ever sees the request
// body and the response, never request headers or the API key.

export const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

const DATA_URL = /^data:([^;]+);base64,([\s\S]*)$/;

// Replaces each image data URL with the sha256 of its bytes. Returns the
// rewritten body and the file hashes, in order.
export function hashImages(body: ChatRequest): { body: unknown; fileHashes: string[] } {
  const fileHashes: string[] = [];
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const m = v.match(DATA_URL);
      if (!m) return v;
      const h = sha256(Buffer.from(m[2], "base64"));
      fileHashes.push(h);
      return `sha256:${h}`;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { body: walk(body), fileHashes };
}

// sha256 of model + full request body (prompt, schema, reasoning settings, caps) + each attached file's hash.
export function cacheKey(body: ChatRequest): string {
  const { body: hashed, fileHashes } = hashImages(body);
  return sha256(JSON.stringify({ model: body.model, body: hashed, files: fileHashes }));
}

export interface CallRecord {
  caseId: string;
  doc: string | null; // specimen file the call was about, if any
  step: MetaStep | "preflight";
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  latencyMs: number | null; // null for cache hits
  cached: boolean;
  finishReason: string | null;
  error?: string;
}

export class CallCapReached extends Error {
  constructor(readonly cap: number) {
    super(`Reached the cap of ${cap} live API calls; stopping. Raise it with --max-calls if this is expected.`);
  }
}

interface CacheEntry {
  key: string;
  model: string;
  step: string;
  storedAt: string;
  response: ChatResult; // content, finish_reason and the usage block
}

export interface EvalCallOptions {
  cacheDir: string;
  useCache: boolean; // read hits
  refresh: boolean; // ignore hits but still write
  maxCalls: number;
  caseId: () => string;
  docFor: (fileHash: string) => string | null;
  onRecord: (r: CallRecord) => void;
}

export function createEvalCall(o: EvalCallOptions) {
  let live = 0;
  fs.mkdirSync(o.cacheDir, { recursive: true });
  const file = (key: string) => path.join(o.cacheDir, `${key}.json`);

  const call = async (step: MetaStep | "preflight", body: ChatRequest, send: (b: ChatRequest) => Promise<ChatResult>): Promise<ChatResult> => {
    const key = cacheKey(body);
    const { fileHashes } = hashImages(body);
    const base = { caseId: o.caseId(), doc: fileHashes.length ? o.docFor(fileHashes[0]) : null, step, model: body.model };
    const usageOf = (r: ChatResult) => ({
      inputTokens: r.usage?.prompt_tokens ?? null,
      outputTokens: r.usage?.completion_tokens ?? null,
      reasoningTokens: r.usage?.completion_tokens_details?.reasoning_tokens ?? null,
      cachedInputTokens: r.usage?.prompt_tokens_details?.cached_tokens ?? null,
    });

    if (o.useCache && !o.refresh && fs.existsSync(file(key))) {
      const hit = JSON.parse(fs.readFileSync(file(key), "utf8")) as CacheEntry;
      o.onRecord({ ...base, ...usageOf(hit.response), latencyMs: null, cached: true, finishReason: hit.response.finishReason });
      return hit.response;
    }

    if (live >= o.maxCalls) throw new CallCapReached(o.maxCalls);
    live++;
    const t0 = performance.now();
    try {
      const res = await send(body);
      const latencyMs = Math.round(performance.now() - t0);
      o.onRecord({ ...base, ...usageOf(res), latencyMs, cached: false, finishReason: res.finishReason });
      if (o.useCache) {
        const entry: CacheEntry = { key, model: body.model, step, storedAt: new Date().toISOString(), response: res };
        fs.writeFileSync(file(key), JSON.stringify(entry, null, 2));
      }
      return res;
    } catch (e) {
      // Only the error message is kept; SDK errors can carry request details.
      const msg = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
      o.onRecord({ ...base, inputTokens: null, outputTokens: null, reasoningTokens: null, cachedInputTokens: null, latencyMs: Math.round(performance.now() - t0), cached: false, finishReason: null, error: msg });
      throw e;
    }
  };

  return {
    call: call as ChatWrapper,
    callStep: call,
    liveCalls: () => live,
    isCached: (body: ChatRequest) => o.useCache && !o.refresh && fs.existsSync(file(cacheKey(body))),
  };
}
