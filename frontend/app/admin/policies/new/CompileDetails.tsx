import { ProviderBadge } from "@/app/components/ProviderBadge";
import type { CompileRecord } from "@/src/lib/policy/readBack";

const n = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v.toLocaleString());

// Model, effort, tokens and latency of the compile call(s), from the AI call record.
export function CompileDetails({ compile }: { compile: CompileRecord }) {
  if (compile.provider === "mock")
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <ProviderBadge provider="mock" label="Compiled by" /> mock: no model call, so no tokens or latency.
      </p>
    );
  const u = compile.usage;
  const items: Array<[string, string]> = [
    ["Model", compile.model ?? "–"],
    ["Reasoning effort", compile.effort ?? "–"],
    ["Input tokens", n(u?.inputTokens)],
    ["Output tokens", n(u?.outputTokens)],
    ["Reasoning tokens", n(u?.reasoningTokens)],
    ["Latency", u?.latencyMs === null || u?.latencyMs === undefined ? "–" : `${n(u.latencyMs)} ms`],
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2"><ProviderBadge provider={compile.provider} label="Compiled by" /></div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-zinc-500">{k}</dt>
            <dd className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-zinc-500">
        {compile.calls} API call{compile.calls === 1 ? "" : "s"} counted (totals above)
        {compile.attempts > 1 ? "; the first answer failed validation and was retried once with the errors" : ""}
        {compile.calls > compile.attempts ? "; includes the one-off structured-output preflight" : ""}.
      </p>
    </div>
  );
}
