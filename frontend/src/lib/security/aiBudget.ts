// Daily cap on AI calls across all routes (AI_DAILY_CALL_CAP, default 500).
// Meta calls are counted once per API request (in the recording wrapper);
// mock providers are counted once per method call via metered().
// Counted in memory, per server process. With AI_CALL_LOG=mongo the count is
// restored at startup from today's ai_calls (see ai/budgetRestore.ts and
// instrumentation.ts), so a restart does not reset the cap. No imports, so the
// AI layer can use it without an import cycle.

export class AiBudgetExceeded extends Error {
  constructor() {
    super("The daily limit on AI calls has been reached; try again tomorrow.");
  }
}

const g = globalThis as unknown as { _aiBudget?: { day: string; used: number } };
const state = (g._aiBudget ??= { day: "", used: 0 });

const cap = () => {
  const n = Number(process.env.AI_DAILY_CALL_CAP);
  return Number.isFinite(n) && n > 0 ? n : 500;
};
const today = () => new Date().toISOString().slice(0, 10);

export function aiUsedToday() {
  if (state.day !== today()) {
    state.day = today();
    state.used = 0;
  }
  return state.used;
}

export const aiBudgetLeft = () => aiUsedToday() < cap();

// Raises today's count to `used` (calls already made today, e.g. before a
// restart). Never lowers it, and ignores a count for any other UTC day.
export function restoreAiUsage(day: string, used: number) {
  if (day !== today() || !Number.isInteger(used) || used < 0) return;
  aiUsedToday();
  state.used = Math.max(state.used, used);
}

export function consumeAiCall() {
  if (aiUsedToday() >= cap()) throw new AiBudgetExceeded();
  state.used++;
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
