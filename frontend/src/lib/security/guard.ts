import { createHash, timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { ProviderUnavailable } from "../ai";
import { PolicyStoreError } from "../policy/store";

// Guards for API routes that call an AI provider or change policies:
//   requireDemoAccess  shared demo code (DEMO_ACCESS_CODE) via cookie or header
//   rateLimit          fixed one-minute window per client IP (RATE_LIMIT_PER_MINUTE)
//   AI budget          daily cap on provider calls across all routes (AI_DAILY_CALL_CAP)
// State is in memory: it resets on restart and is per server process.

export const DEMO_COOKIE = "kyc_demo_access";

const env = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const json = (status: number, error: string, code: string, headers?: Record<string, string>) =>
  Response.json({ error, code }, { status, headers });

const digest = (s: string) => createHash("sha256").update(s).digest();
export const codeMatches = (supplied: string | undefined | null) => {
  const code = process.env.DEMO_ACCESS_CODE;
  return !!code && !!supplied && timingSafeEqual(digest(supplied), digest(code));
};

function cookie(req: Request, name: string) {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

// Fails closed: with no DEMO_ACCESS_CODE configured, nothing is allowed.
export function requireDemoAccess(req: Request): Response | null {
  if (!process.env.DEMO_ACCESS_CODE)
    return json(503, "Demo access is not configured on the server (DEMO_ACCESS_CODE is not set).", "demo_access_unconfigured");
  if (codeMatches(cookie(req, DEMO_COOKIE) ?? req.headers.get("x-demo-access"))) return null;
  return json(401, "Enter the demo access code in the banner at the top of the page.", "demo_access_required");
}

// The first X-Forwarded-For entry is only trustworthy behind a proxy that sets it.
export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";

type State = { windows: Map<string, { start: number; count: number }>; aiDay: string; aiUsed: number };
const g = globalThis as unknown as { _guard?: State };
const state = (g._guard ??= { windows: new Map(), aiDay: "", aiUsed: 0 });

export function rateLimit(req: Request): Response | null {
  const limit = env("RATE_LIMIT_PER_MINUTE", 30);
  const now = Date.now();
  const ip = clientIp(req);
  const w = state.windows.get(ip);
  if (!w || now - w.start >= 60_000) {
    state.windows.set(ip, { start: now, count: 1 });
    if (state.windows.size > 10_000) for (const [k, v] of state.windows) if (now - v.start >= 60_000) state.windows.delete(k);
    return null;
  }
  if (++w.count <= limit) return null;
  const retry = Math.ceil((w.start + 60_000 - now) / 1000);
  return json(429, `Too many requests; try again in ${retry} seconds.`, "rate_limited", { "Retry-After": String(retry) });
}

export class AiBudgetExceeded extends Error {
  constructor() {
    super("The daily limit on AI calls has been reached; try again tomorrow.");
  }
}

const today = () => new Date().toISOString().slice(0, 10);
function aiUsedToday() {
  if (state.aiDay !== today()) {
    state.aiDay = today();
    state.aiUsed = 0;
  }
  return state.aiUsed;
}

// Counts one provider call against the daily cap (mock calls count too).
export function consumeAiCall() {
  if (aiUsedToday() >= env("AI_DAILY_CALL_CAP", 500)) throw new AiBudgetExceeded();
  state.aiUsed++;
}

// Wraps a provider so every method call is metered.
export function metered<T extends object>(provider: T): T {
  return new Proxy(provider, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver);
      return typeof v === "function" ? (...args: unknown[]) => (consumeAiCall(), v.apply(target, args)) : v;
    },
  });
}

// Runs the guards for a route. Returns an error response, or null to proceed.
export function protect(req: Request, opts: { ai?: boolean } = {}): Response | null {
  const denied = rateLimit(req) ?? requireDemoAccess(req);
  if (denied) return denied;
  if (opts.ai && aiUsedToday() >= env("AI_DAILY_CALL_CAP", 500)) return json(429, new AiBudgetExceeded().message, "ai_daily_cap");
  return null;
}

// Maps errors thrown inside a guarded route to responses.
export function errorResponse(e: unknown, fallback = "Request failed"): Response {
  if (e instanceof AiBudgetExceeded) return json(429, e.message, "ai_daily_cap");
  if (e instanceof ZodError) return json(422, "The data did not match the expected schema.", "invalid_data");
  if (e instanceof PolicyStoreError) return json(e.status, e.message, "policy_store");
  if (e instanceof ProviderUnavailable) return json(503, e.message, "provider_unavailable");
  console.error(e);
  return json(500, fallback, "error");
}
