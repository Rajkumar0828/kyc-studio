import { DEFAULT_PRICES, PRICES_SOURCE, usdOf, type Prices } from "./prices";
import type { AiCallRecord } from "./recordAiCall";

// Totals and per-step averages for the usage page, from real call records.
// Cost is an estimate from list prices, not a bill.

export interface StepUsage {
  step: string;
  calls: number;
  errors: number;
  avgLatencyMs: number | null;
  avgInputTokens: number | null;
  avgOutputTokens: number | null;
  avgReasoningTokens: number | null;
  estimatedUsd: number;
}

export interface UsageSummary {
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  estimatedUsd: number;
  pricesSource: string;
  from: string | null;
  to: string | null;
  bySource: Record<string, number>;
  byModelEffort: Array<{ model: string; effort: string; calls: number }>;
  steps: StepUsage[];
  latest: AiCallRecord[];
}

// A call failed if it threw, or if the model was cut off at max_completion_tokens:
// a truncated answer is unusable even though the request itself succeeded.
export const isFailedCall = (r: AiCallRecord) => !!r.error || r.finishReason === "length";

const avg = (xs: Array<number | null>) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
const sum = (xs: Array<number | null>) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);
const cost = (rs: AiCallRecord[], p: Prices) => usdOf(p, sum(rs.map((r) => r.inputTokens)), sum(rs.map((r) => r.cachedInputTokens)), sum(rs.map((r) => r.outputTokens)));

export function summarizeUsage(records: AiCallRecord[], prices: Prices = DEFAULT_PRICES): UsageSummary {
  const sorted = [...records].sort((a, b) => a.at.localeCompare(b.at));
  const steps = [...new Set(sorted.map((r) => r.step))].sort().map((step): StepUsage => {
    const rs = sorted.filter((r) => r.step === step);
    return {
      step, calls: rs.length, errors: rs.filter(isFailedCall).length,
      avgLatencyMs: avg(rs.map((r) => r.latencyMs)), avgInputTokens: avg(rs.map((r) => r.inputTokens)),
      avgOutputTokens: avg(rs.map((r) => r.outputTokens)), avgReasoningTokens: avg(rs.map((r) => r.reasoningTokens)),
      estimatedUsd: cost(rs, prices),
    };
  });
  const me = new Map<string, number>();
  for (const r of sorted) me.set(`${r.model}\u0000${r.effort ?? "–"}`, (me.get(`${r.model}\u0000${r.effort ?? "–"}`) ?? 0) + 1);
  return {
    calls: sorted.length,
    errors: sorted.filter(isFailedCall).length,
    inputTokens: sum(sorted.map((r) => r.inputTokens)),
    outputTokens: sum(sorted.map((r) => r.outputTokens)),
    reasoningTokens: sum(sorted.map((r) => r.reasoningTokens)),
    cachedInputTokens: sum(sorted.map((r) => r.cachedInputTokens)),
    estimatedUsd: cost(sorted, prices),
    pricesSource: PRICES_SOURCE,
    from: sorted[0]?.at ?? null,
    to: sorted.at(-1)?.at ?? null,
    bySource: sorted.reduce<Record<string, number>>((a, r) => ((a[r.source] = (a[r.source] ?? 0) + 1), a), {}),
    byModelEffort: [...me.entries()].map(([k, calls]) => {
      const [model, effort] = k.split("\u0000");
      return { model, effort, calls };
    }),
    steps,
    latest: [...sorted].reverse().slice(0, 25),
  };
}
