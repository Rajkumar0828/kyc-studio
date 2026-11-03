import { restoreAiUsage } from "../security/aiBudget";
import { aiCallLogKind } from "./recordAiCall";

// Restores the daily AI cap after a restart. With AI_CALL_LOG=mongo every Meta
// call made by the app is in ai_calls (the recording wrapper counts a call and
// records it, errors included), so today's (UTC) count of source "app" records
// is the number of calls already spent. Eval runs (source "eval") don't count.
// Mock-mode calls are not recorded, so in mock mode the cap still resets on restart.

export type DayFilter = { source: "app"; at: { $gte: string; $lt: string } };
export type CountCalls = (filter: DayFilter) => Promise<number>;

export function utcDayFilter(now = new Date()): { day: string; filter: DayFilter } {
  const day = now.toISOString().slice(0, 10);
  const start = Date.parse(`${day}T00:00:00.000Z`);
  return { day, filter: { source: "app", at: { $gte: new Date(start).toISOString(), $lt: new Date(start + 86_400_000).toISOString() } } };
}

// Returns the restored count, or null when the call log is not in MongoDB.
export async function restoreAiBudget(count?: CountCalls, now = new Date()): Promise<number | null> {
  if (aiCallLogKind() !== "mongo") return null;
  count ??= async (f) => (await import("./aiCallsMongo")).countAiCalls(f);
  const { day, filter } = utcDayFilter(now);
  const used = await count(filter);
  restoreAiUsage(day, used);
  return used;
}

// Startup: the first attempt is awaited (bounded by the Mongo client's 3 s
// server-selection timeout) so requests don't start before the count is in;
// if it fails, retry every 30 s in the background. Logs the error class only.
export async function restoreAiBudgetWithRetry(count?: CountCalls, retryMs = 30_000): Promise<boolean> {
  const attempt = () =>
    restoreAiBudget(count).then(
      () => true,
      (e) => (console.error("[ai-budget] could not restore today's AI call count:", e instanceof Error ? e.name : "error"), false),
    );
  const ok = await attempt();
  if (!ok) {
    const t = setInterval(() => void attempt().then((done) => done && clearInterval(t)), retryMs);
    t.unref?.();
  }
  return ok;
}
