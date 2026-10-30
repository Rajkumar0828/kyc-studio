import type { PipelineResult } from "@/src/lib/pipeline/types";
import { Badge, type Tone } from "./Badge";
import { Card, CardHeader } from "./Card";
import { ProviderBadge } from "./ProviderBadge";

type StepKey = "quality" | "classify" | "extract" | "rules" | "cross_doc" | "authority" | "risk" | "decision";
type Status = "pass" | "warn" | "fail" | "skipped";

const STEPS: Array<{ key: StepKey; label: string; handler: (p: string) => { code?: string; ai?: string } }> = [
  { key: "quality", label: "Quality gate", handler: () => ({ code: "Code" }) },
  { key: "classify", label: "Classify", handler: (p) => ({ ai: p }) },
  { key: "extract", label: "Extract", handler: (p) => ({ ai: p }) },
  { key: "rules", label: "Policy rules", handler: () => ({ code: "Code" }) },
  { key: "cross_doc", label: "Cross-check", handler: (p) => ({ code: "Code", ai: p }) },
  { key: "authority", label: "Authority lookup", handler: () => ({ code: "Code · synthetic registry" }) },
  { key: "risk", label: "Risk score", handler: (p) => ({ code: "Code score", ai: p }) },
  { key: "decision", label: "Decision", handler: () => ({ code: "Code · policy rule" }) },
];

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  pass: { label: "Passed", tone: "success" },
  warn: { label: "Warning", tone: "warning" },
  fail: { label: "Flagged", tone: "danger" },
  skipped: { label: "Skipped", tone: "neutral" },
};

function stepStatus(key: StepKey, r: PipelineResult): Status {
  const qualityFailed = r.checks.some((c) => c.step === "quality");
  if (key === "quality") return qualityFailed ? "fail" : "pass";
  if (qualityFailed && key !== "risk" && key !== "decision") return "skipped";
  if (key === "classify") return r.checks.some((c) => c.step === "classify") ? "warn" : "pass";
  if (key === "extract") return r.docs.some((d) => d.extraction) ? "pass" : "skipped";
  if (key === "risk") return r.score === 0 ? "pass" : r.score <= 25 ? "warn" : "fail";
  if (key === "decision") return r.decision === "auto_approve" ? "pass" : "warn";
  const cs = r.checks.filter((c) => c.step === key);
  if (!cs.length) return "skipped";
  return cs.some((c) => c.status === "fail") ? "fail" : cs.some((c) => c.status === "warn") ? "warn" : "pass";
}

// Per-step activity for one pipeline run. Token usage and timing are not
// recorded per step yet, so those cells say so instead of showing numbers.
export function PipelineActivity({ result }: { result: PipelineResult }) {
  const mock = result.provider === "mock";
  const unknown = mock ? "n/a (mock)" : "not recorded";
  const totalMs = new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime();
  return (
    <Card padded={false}>
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <CardHeader level={3} title="Pipeline activity" description="Which part of the system handled each step, and what it found." actions={<ProviderBadge provider={result.provider} />} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Pipeline steps with status, handler, token usage and time</caption>
          <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Step</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Handled by</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Tokens</th>
              <th scope="col" className="px-3 py-2.5 pr-5 font-medium sm:pr-6">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {STEPS.map((s, i) => {
              const st = STATUS[stepStatus(s.key, result)];
              const h = s.handler(result.provider);
              return (
                <tr key={s.key}>
                  <th scope="row" className="px-5 py-3 font-medium sm:px-6">
                    <span className="mr-2 text-zinc-400 tabular-nums">{i + 1}</span>{s.label}
                  </th>
                  <td className="px-3 py-3"><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td className="px-3 py-3">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {h.code && <Badge>{h.code}</Badge>}
                      {h.ai && <ProviderBadge provider={h.ai} />}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-zinc-500">{h.ai ? unknown : "none"}</td>
                  <td className="px-3 py-3 pr-5 text-zinc-500 sm:pr-6">{unknown}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-zinc-200 px-5 py-3 text-xs text-zinc-500 sm:px-6 dark:border-zinc-800">
        Whole run measured on the server: {totalMs} ms. Per-step timing and token counts are not recorded yet.
      </p>
    </Card>
  );
}
