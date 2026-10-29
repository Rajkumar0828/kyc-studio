"use client";

import { useState } from "react";
import { DEFAULT_POLICIES } from "@/src/lib/policy/defaults";
import type { Check, PipelineResult } from "@/src/lib/pipeline/types";

// Header-only PNG of a given size: enough for the quality gate and the mock
// provider (which reads filename hints), so scenarios run without real images.
function fakePng(name: string, w = 1600, h = 1000, size = 200_000): File {
  const b = new Uint8Array(size);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return new File([b], name, { type: "image/png" });
}

const SCENARIOS = [
  { name: "Happy path", policy: "housing-loan", docs: () => [fakePng("passport.png"), fakePng("utility_bill.png")] },
  { name: "Name mismatch", policy: "housing-loan", docs: () => [fakePng("passport.png"), fakePng("utility_bill_mismatch.png")] },
  { name: "Expired ID", policy: "general-account", docs: () => [fakePng("drivers_license_expired.png")] },
  { name: "Blurry photo", policy: "general-account", docs: () => [fakePng("passport.png", 480, 320)] },
  { name: "Not in registry", policy: "general-account", docs: () => [fakePng("national_id_unknownperson.png")] },
  { name: "Missing proof of address", policy: "housing-loan", docs: () => [fakePng("passport.png")] },
];

const STEPS = [
  { key: "quality", label: "Quality gate", kind: "code" },
  { key: "classify", label: "Classification", kind: "ai" },
  { key: "extract", label: "Extraction", kind: "ai" },
  { key: "rules", label: "Rule validation", kind: "code" },
  { key: "cross_doc", label: "Cross-document", kind: "code + ai" },
  { key: "authority", label: "Authority lookup", kind: "code" },
  { key: "selfie", label: "Selfie check", kind: "code" },
  { key: "risk", label: "Risk score", kind: "code + ai" },
  { key: "decision", label: "Decision", kind: "rule" },
] as const;

const DECISION_STYLE: Record<string, { label: string; cls: string }> = {
  auto_approve: { label: "Auto-approve", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  manual_review: { label: "Manual review", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  request_info: { label: "Request more info", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
};

const STATUS_DOT: Record<string, string> = { pass: "bg-emerald-500", warn: "bg-amber-500", fail: "bg-red-500", skip: "bg-zinc-300 dark:bg-zinc-700" };

function stepStatus(key: string, r: PipelineResult): "pass" | "warn" | "fail" | "skip" {
  const qualityFailed = r.checks.some((c) => c.step === "quality");
  if (key === "quality") return qualityFailed ? "fail" : "pass";
  if (qualityFailed && key !== "risk" && key !== "decision") return "skip";
  if (key === "extract") return r.docs.some((d) => d.extraction) ? "pass" : "skip";
  if (key === "risk") return r.score === 0 ? "pass" : r.score <= 25 ? "warn" : "fail";
  if (key === "decision") return r.decision === "auto_approve" ? "pass" : "warn";
  const cs = r.checks.filter((c) => c.step === key);
  if (!cs.length) return key === "classify" ? "pass" : "skip";
  return cs.some((c) => c.status === "fail") ? "fail" : cs.some((c) => c.status === "warn") ? "warn" : "pass";
}

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

  const card = "rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900";

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Verification playground</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">Run the KYC pipeline end to end. AI proposes, a human decides.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="flex flex-col gap-6">
          <div className={card}>
            <h2 className="mb-3 font-semibold">Demo scenarios</h2>
            <div className="grid grid-cols-2 gap-2">
              {SCENARIOS.map((s) => (
                <button key={s.name} disabled={busy} onClick={() => { setPolicyId(s.policy); run(s.policy, s.docs(), fakePng("selfie.png")); }}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className={card}>
            <h2 className="mb-3 font-semibold">Upload your own</h2>
            <label className="mb-1 block text-sm font-medium">Policy</label>
            <select value={policyId} onChange={(e) => setPolicyId(e.target.value)}
              className="mb-2 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700">
              {DEFAULT_POLICIES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ul className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              {policy.requiredDocuments.map((r) => <li key={r.label}>• {r.label}</li>)}
              {policy.selfieRequired && <li>• Selfie</li>}
              <li>• Minimum age {policy.minAge}</li>
            </ul>
            <label className="mb-1 block text-sm font-medium">Documents</label>
            <input type="file" multiple accept="image/png,image/jpeg,application/pdf" onChange={(e) => setDocs(Array.from(e.target.files ?? []))}
              className="mb-3 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 dark:file:bg-zinc-800" />
            <label className="mb-1 block text-sm font-medium">Selfie</label>
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)}
              className="mb-4 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 dark:file:bg-zinc-800" />
            <button disabled={busy || !docs.length} onClick={() => run(policyId, docs, selfie)}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? "Running…" : "Run verification"}
            </button>
            <p className="mt-3 text-xs text-zinc-500">
              Mock AI mode reads the file name: include passport, license, national, utility or statement (and optionally expired, mismatch, blurry).
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          {error && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</div>}
          {!result && !error && (
            <div className={`${card} flex min-h-64 items-center justify-center text-zinc-500`}>
              {busy ? "Running pipeline…" : "Pick a demo scenario or upload documents to see the result."}
            </div>
          )}
          {result && <Result r={result} card={card} />}
        </section>
      </div>
    </main>
  );
}

function Result({ r, card }: { r: PipelineResult; card: string }) {
  const d = DECISION_STYLE[r.decision];
  const flagged = r.checks.filter((c) => c.status !== "pass");
  const passed = r.checks.filter((c) => c.status === "pass");
  return (
    <>
      <div className={`${card} flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <p className="text-sm text-zinc-500">{r.caseId} · {r.policy.id} v{r.policy.version} · provider: {r.provider}</p>
          <span className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-semibold ${d.cls}`}>Proposed: {d.label}</span>
        </div>
        <div className="w-48">
          <div className="flex justify-between text-sm"><span>Risk score</span><span className="font-semibold">{r.score}/100</span></div>
          <div className="mt-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className={`h-2 rounded-full ${r.score <= 15 ? "bg-emerald-500" : r.score <= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.max(r.score, 2)}%` }} />
          </div>
        </div>
      </div>

      <div className={card}>
        <h3 className="mb-4 font-semibold">Pipeline</h3>
        <ol className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {STEPS.map((s, i) => {
            const st = stepStatus(s.key, r);
            return (
              <li key={s.key} className="flex flex-col items-center text-center">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ${STATUS_DOT[st]}`}>{i + 2}</span>
                <span className="mt-1 text-xs font-medium">{s.label}</span>
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">{st === "skip" ? "skipped" : s.kind}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className={card}>
          <h3 className="mb-2 font-semibold">Reviewer summary</h3>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{r.reviewerSummary}</p>
        </div>
        <div className={card}>
          <h3 className="mb-2 font-semibold">Message to customer</h3>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{r.customerMessage ?? "No action needed from the customer."}</p>
        </div>
      </div>

      <div className={card}>
        <h3 className="mb-3 font-semibold">Flags ({flagged.length})</h3>
        {flagged.length ? <CheckList checks={flagged} /> : <p className="text-sm text-zinc-500">No flags raised.</p>}
        {passed.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-zinc-500">Passed checks ({passed.length})</summary>
            <div className="mt-2"><CheckList checks={passed} /></div>
          </details>
        )}
      </div>

      {r.docs.length > 0 && (
        <div className={card}>
          <h3 className="mb-3 font-semibold">Extracted data</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {r.docs.map((doc) => (
              <div key={doc.index} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-sm font-medium">{doc.filename}</p>
                <p className="mb-2 text-xs text-zinc-500">{doc.docType} · {(doc.classConfidence * 100).toFixed(0)}% confidence</p>
                {doc.extraction && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {Object.entries(doc.extraction).filter(([, v]) => typeof v === "object" && v.found).map(([k, v]) => {
                          const f = v as { value: string; confidence: number };
                          return (
                            <tr key={k} className="border-t border-zinc-100 dark:border-zinc-800">
                              <td className="py-1 pr-3 text-zinc-500">{k.replace(/_/g, " ")}</td>
                              <td className="py-1 pr-3">{f.value}</td>
                              <td className={`py-1 text-right text-xs ${f.confidence < 0.7 ? "text-amber-600" : "text-zinc-500"}`}>{(f.confidence * 100).toFixed(0)}%</td>
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
        </div>
      )}
    </>
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {checks.map((c, i) => (
        <li key={i} className="flex items-start gap-3 text-sm">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[c.status]}`} />
          <div>
            <span className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{c.step}</span>
            {c.message}
            {c.category !== "info" && <span className="ml-2 text-xs text-zinc-500">({c.category === "integrity" ? "needs reviewer" : "customer can fix"})</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
