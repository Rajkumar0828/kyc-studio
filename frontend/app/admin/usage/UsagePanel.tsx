"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/app/components/Badge";
import { Card, CardHeader } from "@/app/components/Card";
import { EmptyState } from "@/app/components/EmptyState";
import { ErrorNotice } from "@/app/components/ErrorNotice";
import { RequiresStorage } from "@/app/components/RequiresStorage";
import { Loading } from "@/app/components/Skeleton";
import type { UsageSummary } from "@/src/lib/ai/usage";
import { api, ApiError, DEMO_ACCESS_EVENT } from "@/src/lib/client/api";

const STEP_LABEL: Record<string, string> = {
  compile: "Policy compile", compile_preflight: "Compile preflight", guide: "Guide wording", doc_class: "Classify document",
  extraction: "Extract fields", compare: "Compare values", summary: "Reviewer summary", guidance: "Customer message", preflight: "Eval preflight",
};
const n = (v: number | null) => (v === null ? "–" : v.toLocaleString());
const usd = (v: number) => `$${v.toFixed(v < 0.01 ? 4 : 2)}`;

export function UsagePanel() {
  const [data, setData] = useState<UsageSummary | null>(null);
  const [requires, setRequires] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<UsageSummary>("/api/admin/usage")
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => (e instanceof ApiError && e.code === "requires_storage" ? setRequires(e.message) : setError(e.message)));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(DEMO_ACCESS_EVENT, load);
    return () => window.removeEventListener(DEMO_ACCESS_EVENT, load);
  }, [load]);

  if (requires) return <RequiresStorage message={requires} />;
  if (error) return <ErrorNotice title="Could not load AI usage">{error}</ErrorNotice>;
  if (!data) return <Card><Loading label="Loading AI usage" lines={4} /></Card>;
  if (!data.calls) return <EmptyState icon="sparkle" title="No AI calls recorded yet" description="Calls appear here once the server runs with AI_PROVIDER=meta. The mock provider makes no model calls." />;

  const tiles: Array<[string, string, string?]> = [
    ["Calls", n(data.calls), data.errors ? `${data.errors} failed` : undefined],
    ["Input tokens", n(data.inputTokens), data.cachedInputTokens ? `${n(data.cachedInputTokens)} cached` : undefined],
    ["Output tokens", n(data.outputTokens)],
    ["Reasoning tokens", n(data.reasoningTokens), "included in output"],
    ["Cost", usd(data.estimatedUsd), "estimated from list prices"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([label, value, note]) => (
          <Card key={label} className="p-4 sm:p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</dd>
            {note && <dd className="mt-0.5 text-xs text-zinc-500">{note}</dd>}
          </Card>
        ))}
      </dl>
      <p className="-mt-2 text-xs text-zinc-500">
        {data.from && data.to && <>Covers {new Date(data.from).toLocaleString()} to {new Date(data.to).toLocaleString()}. </>}
        Cost is estimated from list prices ({data.pricesSource}); it is not a bill.
      </p>

      <Card padded={false}>
        <div className="px-5 pt-5 sm:px-6 sm:pt-6"><CardHeader level={2} title="Per step" description="Averages per call." /></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">AI calls per pipeline step with averages</caption>
            <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
              <tr>{["Step", "Calls", "Failed", "Avg latency", "Avg input", "Avg output", "Avg reasoning", "Est. cost"].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium first:pl-5 sm:first:pl-6">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.steps.map((s) => (
                <tr key={s.step}>
                  <th scope="row" className="px-4 py-3 pl-5 font-medium sm:pl-6">{STEP_LABEL[s.step] ?? s.step}</th>
                  <td className="px-4 py-3 tabular-nums">{s.calls}</td>
                  <td className="px-4 py-3 tabular-nums">{s.errors || "–"}</td>
                  <td className="px-4 py-3 tabular-nums">{s.avgLatencyMs === null ? "–" : `${n(s.avgLatencyMs)} ms`}</td>
                  <td className="px-4 py-3 tabular-nums">{n(s.avgInputTokens)}</td>
                  <td className="px-4 py-3 tabular-nums">{n(s.avgOutputTokens)}</td>
                  <td className="px-4 py-3 tabular-nums">{n(s.avgReasoningTokens)}</td>
                  <td className="px-4 py-3 tabular-nums">{usd(s.estimatedUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader level={2} title="Models and effort" />
          <ul className="flex flex-col gap-2 text-sm">
            {data.byModelEffort.map((m) => (
              <li key={`${m.model}-${m.effort}`} className="flex items-center justify-between gap-3">
                <span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{m.model}</span><Badge>{m.effort}</Badge></span>
                <span className="tabular-nums text-zinc-600 dark:text-zinc-400">{m.calls}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-zinc-500">Sources: {Object.entries(data.bySource).map(([k, v]) => `${k} ${v}`).join(", ")}</p>
        </Card>
        <Card padded={false}>
          <div className="px-5 pt-5 sm:px-6 sm:pt-6"><CardHeader level={2} title="Latest calls" /></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">The most recent AI calls</caption>
              <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                <tr>{["Time", "Step", "Tokens in / out", "Latency", "Result"].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium first:pl-5 sm:first:pl-6">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.latest.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 pl-5 text-zinc-600 sm:pl-6 dark:text-zinc-400">{new Date(r.at).toLocaleString()}</td>
                    <td className="px-4 py-2.5">{STEP_LABEL[r.step] ?? r.step}{r.source === "eval" && <Badge className="ml-2">eval</Badge>}</td>
                    <td className="px-4 py-2.5 tabular-nums">{n(r.inputTokens)} / {n(r.outputTokens)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.latencyMs === null ? "–" : `${n(r.latencyMs)} ms`}</td>
                    <td className="px-4 py-2.5">{r.error ? <Badge tone="danger">{r.error}</Badge> : <span className="text-zinc-600 dark:text-zinc-400">{r.finishReason ?? "–"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
