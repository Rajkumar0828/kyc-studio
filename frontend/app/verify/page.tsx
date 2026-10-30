"use client";

import { useState } from "react";
import { Badge, type Tone } from "@/app/components/Badge";
import { Button } from "@/app/components/Button";
import { Card, CardHeader } from "@/app/components/Card";
import { cx } from "@/app/components/cx";
import { EmptyState } from "@/app/components/EmptyState";
import { ErrorNotice } from "@/app/components/ErrorNotice";
import { Field, inputClass } from "@/app/components/Field";
import { Spinner } from "@/app/components/Icon";
import { PageHeader } from "@/app/components/PageHeader";
import { PipelineActivity } from "@/app/components/PipelineActivity";
import { ProviderBadge } from "@/app/components/ProviderBadge";
import { Loading } from "@/app/components/Skeleton";
import { DEFAULT_POLICIES } from "@/src/lib/policy/defaults";
import type { Check, PipelineResult } from "@/src/lib/pipeline/types";

// A real PNG of the given size with lines of text on it: the quality gate decodes
// pixels (for the sharpness check) and the mock provider reads filename hints.
async function fakePng(name: string, w = 1600, h = 1000): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#111";
  ctx.font = `${Math.round(h / 28)}px monospace`;
  for (let y = h / 20, i = 0; y < h; y += h / 18, i++)
    ctx.fillText(`SPECIMEN ${name.toUpperCase()} LINE ${i} ${(i * 7919).toString(36).toUpperCase()} 0123456789`, w / 40, y);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
  return new File([blob], name, { type: "image/png" });
}

const SCENARIOS = [
  { name: "Happy path", policy: "housing-loan", docs: () => Promise.all([fakePng("passport.png"), fakePng("utility_bill.png")]) },
  { name: "Name mismatch", policy: "housing-loan", docs: () => Promise.all([fakePng("passport.png"), fakePng("utility_bill_mismatch.png")]) },
  { name: "Expired ID", policy: "general-account", docs: () => Promise.all([fakePng("drivers_license_expired.png")]) },
  { name: "Blurry photo", policy: "general-account", docs: () => Promise.all([fakePng("passport.png", 480, 320)]) },
  { name: "Not in registry", policy: "general-account", docs: () => Promise.all([fakePng("national_id_unknownperson.png")]) },
  { name: "Missing proof of address", policy: "housing-loan", docs: () => Promise.all([fakePng("passport.png")]) },
];

const DECISION: Record<string, { label: string; tone: Tone }> = {
  auto_approve: { label: "Auto-approve", tone: "success" },
  manual_review: { label: "Manual review", tone: "warning" },
  request_info: { label: "Request more info", tone: "info" },
};
const STATUS_DOT: Record<string, string> = { pass: "bg-emerald-500", warn: "bg-amber-500", fail: "bg-red-500" };
const fileInput = cx(inputClass, "py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-sm file:font-medium dark:file:bg-zinc-800 dark:file:text-zinc-100");

export default function VerifyPage() {
  const [policyId, setPolicyId] = useState(DEFAULT_POLICIES[1].id);
  const [docs, setDocs] = useState<File[]>([]);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const policy = DEFAULT_POLICIES.find((p) => p.id === policyId)!;

  async function run(pid: string, files: File[], selfieFile: File | null) {
    setBusy(true);
    setError(null);
    setResult(null);
    const form = new FormData();
    form.set("policyId", pid);
    files.forEach((f) => form.append("documents", f));
    if (selfieFile) form.set("selfie", selfieFile);
    try {
      const res = await fetch("/api/verify", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader eyebrow="Developer tool" title="Verification playground"
        description="Run the full pipeline against a seed policy and inspect every check, score and extracted field. Customers never see this view." />

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section aria-label="Inputs" className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Demo scenarios" description="Generated test images; the mock provider reads their file names." />
            <div className="grid grid-cols-2 gap-2">
              {SCENARIOS.map((s) => (
                <Button key={s.name} variant="secondary" size="sm" disabled={busy} className="h-auto justify-start py-2 text-left whitespace-normal!"
                  onClick={async () => { setPolicyId(s.policy); run(s.policy, await s.docs(), await fakePng("selfie.png")); }}>
                  {s.name}
                </Button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Upload your own" />
            <div className="flex flex-col gap-4">
              <Field id="verify-policy" label="Policy">
                <select id="verify-policy" value={policyId} onChange={(e) => setPolicyId(e.target.value)} className={inputClass}>
                  {DEFAULT_POLICIES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <ul className="text-sm text-zinc-600 dark:text-zinc-400">
                {policy.requiredDocuments.map((r) => <li key={r.label}>• {r.label}</li>)}
                {policy.selfieRequired && <li>• Selfie</li>}
                <li>• Minimum age {policy.minAge}</li>
              </ul>
              <Field id="verify-docs" label="Documents">
                <input id="verify-docs" type="file" multiple accept="image/png,image/jpeg,application/pdf" onChange={(e) => setDocs(Array.from(e.target.files ?? []))} className={fileInput} />
              </Field>
              <Field id="verify-selfie" label="Selfie">
                <input id="verify-selfie" type="file" accept="image/png,image/jpeg" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} className={fileInput} />
              </Field>
              <Button disabled={busy || !docs.length} onClick={() => run(policyId, docs, selfie)} className="w-full">
                {busy ? <><Spinner /> Running…</> : "Run verification"}
              </Button>
              <p className="text-xs text-zinc-500">
                Mock mode reads the file name: include passport, license, national, utility or statement (optionally expired, mismatch, blurry). Eval specimens are recognised by content.
              </p>
            </div>
          </Card>
        </section>

        <section aria-label="Result" aria-busy={busy} className="flex flex-col gap-6">
          {error && <ErrorNotice title="The run failed">{error}</ErrorNotice>}
          {busy && <Card><Loading label="Running the pipeline" lines={4} /></Card>}
          {!result && !error && !busy && <EmptyState icon="code" title="No run yet" description="Pick a demo scenario or upload documents to see the pipeline's proposal." />}
          {result && !busy && <Result r={result} />}
        </section>
      </div>
    </main>
  );
}

function Result({ r }: { r: PipelineResult }) {
  const d = DECISION[r.decision];
  const flagged = r.checks.filter((c) => c.status !== "pass");
  const passed = r.checks.filter((c) => c.status === "pass");
  return (
    <>
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-500">{r.caseId} · {r.policy.id} v{r.policy.version}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Proposed:</span>
            <Badge tone={d.tone} className="text-sm">{d.label}</Badge>
            <ProviderBadge provider={r.provider} />
          </p>
        </div>
        <div className="w-full sm:w-56">
          <div className="flex justify-between text-sm"><span id="risk-label">Risk score</span><span className="font-semibold tabular-nums">{r.score}/100</span></div>
          <div className="mt-1.5 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800" role="meter" aria-labelledby="risk-label" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.score}>
            <div className={cx("h-2 rounded-full", r.score <= 15 ? "bg-emerald-500" : r.score <= 40 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${Math.max(r.score, 2)}%` }} />
          </div>
        </div>
      </Card>

      <PipelineActivity result={r} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader level={3} title="Reviewer summary" actions={<ProviderBadge provider={r.provider} />} />
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{r.reviewerSummary}</p>
        </Card>
        <Card>
          <CardHeader level={3} title="Message to customer" actions={r.customerMessage ? <ProviderBadge provider={r.provider} /> : undefined} />
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{r.customerMessage ?? "No action needed from the customer."}</p>
        </Card>
      </div>

      <Card>
        <CardHeader level={3} title={`Flags (${flagged.length})`} />
        {flagged.length ? <CheckList checks={flagged} /> : <p className="text-sm text-zinc-500">No flags raised.</p>}
        {passed.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-zinc-500">Passed checks ({passed.length})</summary>
            <div className="mt-2"><CheckList checks={passed} /></div>
          </details>
        )}
      </Card>

      {r.docs.length > 0 && (
        <Card>
          <CardHeader level={3} title="Extracted data" actions={<ProviderBadge provider={r.provider} />} />
          <div className="grid gap-4 md:grid-cols-2">
            {r.docs.map((doc) => (
              <div key={doc.index} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="truncate text-sm font-medium">{doc.filename}</p>
                <p className="mb-2 text-xs text-zinc-500">{doc.docType} · {(doc.classConfidence * 100).toFixed(0)}% confidence</p>
                {doc.extraction && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Fields extracted from {doc.filename}</caption>
                      <tbody>
                        {Object.entries(doc.extraction).filter(([, v]) => typeof v === "object" && v.found).map(([k, v]) => {
                          const f = v as { value: string; confidence: number };
                          return (
                            <tr key={k} className="border-t border-zinc-100 dark:border-zinc-800">
                              <th scope="row" className="py-1 pr-3 text-left font-normal text-zinc-500">{k.replace(/_/g, " ")}</th>
                              <td className="py-1 pr-3">{f.value}</td>
                              <td className={cx("py-1 text-right text-xs tabular-nums", f.confidence < 0.7 ? "text-amber-600" : "text-zinc-500")}>{(f.confidence * 100).toFixed(0)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {checks.map((c, i) => (
        <li key={i} className="flex items-start gap-3 text-sm">
          <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", STATUS_DOT[c.status])} aria-hidden />
          <div>
            <Badge className="mr-2">{c.step}</Badge>
            <span className="sr-only">{c.status}: </span>{c.message}
            {c.category !== "info" && <span className="ml-2 text-xs text-zinc-500">({c.category === "integrity" ? "needs reviewer" : "customer can fix"})</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
