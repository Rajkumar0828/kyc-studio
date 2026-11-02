// Meta list prices, used for estimates only (the eval runner and the usage page).
export interface Prices {
  input: number; // USD per 1M tokens
  cachedInput: number;
  output: number; // also applies to reasoning tokens
}

// muse-spark-1.3 standard mode.
export const DEFAULT_PRICES: Prices = { input: 1.25, cachedInput: 0.15, output: 4.25 };
export const PRICES_SOURCE = "https://dev.meta.ai/docs/pricing-rate-limits, checked 2026-10-30";

export const usdOf = (p: Prices, input: number, cachedInput: number, output: number) =>
  ((input - cachedInput) * p.input + cachedInput * p.cachedInput + output * p.output) / 1e6;
