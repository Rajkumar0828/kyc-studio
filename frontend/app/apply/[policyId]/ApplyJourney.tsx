"use client";

import { useCallback, useEffect, useState } from "react";
import { ProviderBadge } from "@/app/components/ProviderBadge";
import type { JourneyStep } from "@/src/lib/ai/types";
import { api, ApiError, DEMO_ACCESS_EVENT, postJson } from "@/src/lib/client/api";
import type { Decision } from "@/src/lib/pipeline/types";
import { DOC_LABEL, docList } from "@/src/lib/policy/labels";
import type { DocType, PolicySpec } from "@/src/lib/policy/schema";

interface Guide {
  steps: Record<JourneyStep, string>;
  provider: string;
}
interface FileCheck {
  state: "checking" | "ok" | "problem" | "error";
  messages: string[];
}
interface Slot {
  file: File | null;
  type: DocType;
  check: FileCheck | null;
}
interface ApplyResult {
  caseId: string;
  policy: { id: string; version: number };
  decision: Decision;
  message: string;
  fixes: string[];
  provider: string;
  guideProvider: string;
  specimen: { caseId: string; asOf: string } | null;
}

const STEP_TITLE: Record<JourneyStep, string> = {
  consent: "Consent",
  tour: "What you'll need",
  documents: "Documents",
  selfie: "Selfie",
  review: "Review",
  result: "Result",
};
const DOC_TYPES = ["image/png", "image/jpeg", "application/pdf"];
const IMAGE_TYPES = ["image/png", "image/jpeg"];
const MAX_BYTES = 10 * 1024 * 1024;

const card = "rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900";
const primary = "rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50";
const secondary = "rounded-lg border border-zinc-300 px-5 py-2.5 font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";
const fileInput = "block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 dark:file:bg-zinc-800";

const OUTCOME: Record<Decision, { title: string; cls: string }> = {
  auto_approve: { title: "You're verified", cls: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  request_info: { title: "We need a little more from you", cls: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  manual_review: { title: "Your application is being reviewed", cls: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" },
};

// Quick checks in the browser, then the server's quality gate (resolution, sharpness).
async function checkFile(file: File, allowed: string[]): Promise<FileCheck> {
  if (!allowed.includes(file.type)) return { state: "problem", messages: [`${file.name}: please use ${allowed.includes("application/pdf") ? "a JPG, PNG or PDF" : "a JPG or PNG"} file.`] };
  if (file.size > MAX_BYTES) return { state: "problem", messages: [`${file.name}: the file is larger than 10 MB.`] };
  const form = new FormData();
  form.set("file", file);
  try {
    const r = await api<{ ok: boolean; problems: string[] }>("/api/quality", { method: "POST", body: form });
    return r.ok ? { state: "ok", messages: [] } : { state: "problem", messages: r.problems };
  } catch (e) {
    return { state: "error", messages: [e instanceof Error ? e.message : String(e)] };
  }
}

function CheckNote({ check }: { check: FileCheck | null }) {
  if (!check) return null;
  if (check.state === "checking") return <p className="mt-2 text-sm text-zinc-500">Checking the image…</p>;
  if (check.state === "ok") return <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">Looks good.</p>;
  return (
    <div className={`mt-2 text-sm ${check.state === "problem" ? "text-amber-800 dark:text-amber-300" : "text-red-700 dark:text-red-300"}`}>
      {check.messages.map((m, i) => <p key={i}>{m}</p>)}
      {check.state === "problem" && <p className="text-zinc-500">You can choose another file, or continue and we may ask again.</p>}
    </div>
  );
}

export function ApplyJourney({ policyId }: { policyId: string }) {
  const [policy, setPolicy] = useState<PolicySpec | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selfie, setSelfie] = useState<{ file: File | null; check: FileCheck | null }>({ file: null, check: null });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  useEffect(() => {
    api<{ published: PolicySpec | null }>(`/api/policies/${policyId}`)
      .then(({ published }) => {
        if (!published) return setLoadError("This policy has not been published yet.");
        setPolicy(published);
        setSlots(published.requiredDocuments.map((d) => ({ file: null, type: d.anyOf[0], check: null })));
      })
      .catch((e) => setLoadError(e instanceof ApiError && e.status === 404 ? "There is no policy with this id." : e.message));
  }, [policyId]);

  const loadGuide = useCallback(() => {
    postJson<Guide>("/api/guide", { policyId })
      .then((g) => {
        setGuide(g);
        setGuideError(null);
      })
      .catch((e) => setGuideError(e.message));
  }, [policyId]);

  useEffect(() => {
    loadGuide();
    window.addEventListener(DEMO_ACCESS_EVENT, loadGuide);
    return () => window.removeEventListener(DEMO_ACCESS_EVENT, loadGuide);
  }, [loadGuide]);

  if (loadError) return <div className={card}><p className="text-red-700 dark:text-red-300">{loadError}</p></div>;
  if (!policy) return <p className="text-zinc-500">Loading…</p>;

  const steps: JourneyStep[] = ["consent", "tour", "documents", ...(policy.selfieRequired ? (["selfie"] as const) : []), "review", "result"];
  const step = steps[stepIndex];
  const next = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));
  const help = guide?.steps[step];

  async function pickDocument(i: number, file: File | null) {
    setSlots((s) => s.map((x, j) => (j === i ? { ...x, file, check: file ? { state: "checking", messages: [] } : null } : x)));
    if (!file) return;
    const check = await checkFile(file, DOC_TYPES);
    setSlots((s) => s.map((x, j) => (j === i && x.file === file ? { ...x, check } : x)));
  }

  async function pickSelfie(file: File | null) {
    setSelfie({ file, check: file ? { state: "checking", messages: [] } : null });
    if (!file) return;
    const check = await checkFile(file, IMAGE_TYPES);
    setSelfie((s) => (s.file === file ? { file, check } : s));
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    const form = new FormData();
    form.set("consent", "true");
    form.set("consentAt", consentAt ?? "");
    for (const s of slots) {
      if (!s.file) continue;
      form.append("documents", s.file);
      form.append("documentTypes", s.type);
    }
    if (selfie.file) form.set("selfie", selfie.file);
    try {
      setResult(await api<ApplyResult>(`/api/apply/${policyId}`, { method: "POST", body: form }));
      next();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function startAgain() {
    setSlots(policy!.requiredDocuments.map((d) => ({ file: null, type: d.anyOf[0], check: null })));
    setSelfie({ file: null, check: null });
    setResult(null);
    setStepIndex(steps.indexOf("documents"));
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-zinc-500">{policy.name} · policy v{policy.version}</p>
        <h1 className="text-3xl font-semibold tracking-tight">Verify your identity</h1>
      </header>

      <ol className="flex flex-wrap gap-2 text-sm">
        {steps.map((s, i) => (
          <li key={s} className={`rounded-full px-3 py-1 ${i === stepIndex ? "bg-blue-600 text-white" : i < stepIndex ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>
            {i + 1}. {STEP_TITLE[s]}
          </li>
        ))}
      </ol>

      <section className={card}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-xl font-semibold">{STEP_TITLE[step]}</h2>
          {guide && step !== "consent" && <ProviderBadge provider={guide.provider} label="Guidance" />}
        </div>
        {help && step !== "result" && <p className="mb-4 text-zinc-600 dark:text-zinc-400">{help}</p>}
        {guideError && step !== "result" && <p className="mb-4 text-sm text-amber-800 dark:text-amber-300">Guidance unavailable: {guideError}</p>}

        {step === "consent" && (
          <div className="flex flex-col gap-4">
            {/* From the policy, written by its author; never model output. */}
            <div className="whitespace-pre-line rounded-lg bg-zinc-50 p-4 text-sm leading-relaxed dark:bg-zinc-950">{policy.consentText}</div>
            <p className="text-sm"><strong>Retention:</strong> your verification data is kept for {policy.retentionDays} days, then deleted.</p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
              I have read this and agree to my information being used to verify my identity.
            </label>
            <div><button disabled={!agreed} onClick={() => { setConsentAt(new Date().toISOString()); next(); }} className={primary}>Agree and continue</button></div>
          </div>
        )}

        {step === "tour" && (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2 text-sm">
              {policy.requiredDocuments.map((d) => <li key={d.label}>• <strong>{d.label}</strong>: {docList(d.anyOf)}</li>)}
              {policy.requiredDocuments.some((d) => d.label === "Proof of address") && <li>• Proof of address must be issued within the last {policy.proofOfAddressMaxAgeDays} days.</li>}
              {policy.selfieRequired && <li>• <strong>A selfie</strong></li>}
              <li>• You must be at least {policy.minAge} years old.</li>
            </ul>
            {guide?.provider === "mock" && (
              <p className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-3 text-sm text-fuchsia-900 dark:border-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200">
                Mock mode: no model reads your files. Uploading the synthetic specimens from <code>eval/specimens/&lt;case&gt;/</code> returns that case&apos;s scripted outcome; other files get placeholder data.
              </p>
            )}
            <div className="flex gap-3"><button onClick={back} className={secondary}>Back</button><button onClick={next} className={primary}>Start</button></div>
          </div>
        )}

        {step === "documents" && (
          <div className="flex flex-col gap-6">
            {policy.requiredDocuments.map((d, i) => (
              <div key={d.label}>
                <p className="mb-2 font-medium">{d.label}</p>
                {d.anyOf.length > 1 && (
                  <label className="mb-2 block text-sm">
                    Which document is this?{" "}
                    <select value={slots[i]?.type} onChange={(e) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, type: e.target.value as DocType } : x)))}
                      className="ml-1 rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700">
                      {d.anyOf.map((t) => <option key={t} value={t}>{DOC_LABEL[t]}</option>)}
                    </select>
                  </label>
                )}
                <input type="file" accept={DOC_TYPES.join(",")} onChange={(e) => pickDocument(i, e.target.files?.[0] ?? null)} className={fileInput} />
                <CheckNote check={slots[i]?.check ?? null} />
              </div>
            ))}
            <div className="flex gap-3">
              <button onClick={back} className={secondary}>Back</button>
              <button onClick={next} disabled={slots.some((s) => !s.file || s.check?.state === "checking")} className={primary}>Continue</button>
            </div>
          </div>
        )}

        {step === "selfie" && (
          <div className="flex flex-col gap-4">
            <p className="rounded-lg border-2 border-dashed border-fuchsia-400 bg-fuchsia-50 p-3 text-sm font-medium text-fuchsia-900 dark:border-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-200">
              MOCK SELFIE STEP: the photo is only checked for image quality. No liveness detection or face matching is performed.
            </p>
            <input type="file" accept={IMAGE_TYPES.join(",")} capture="user" onChange={(e) => pickSelfie(e.target.files?.[0] ?? null)} className={fileInput} />
            <CheckNote check={selfie.check} />
            <div className="flex gap-3">
              <button onClick={back} className={secondary}>Back</button>
              <button onClick={next} disabled={!selfie.file || selfie.check?.state === "checking"} className={primary}>Continue</button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col gap-4">
            <dl className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {policy.requiredDocuments.map((d, i) => (
                <div key={d.label} className="grid grid-cols-[10rem_1fr] gap-3 py-2">
                  <dt className="text-zinc-500">{d.label}</dt>
                  <dd>{slots[i]?.file?.name} <span className="text-zinc-500">({DOC_LABEL[slots[i]?.type ?? "unknown"]})</span>{slots[i]?.check?.state === "problem" && <span className="ml-2 text-amber-700 dark:text-amber-400">quality warning</span>}</dd>
                </div>
              ))}
              {policy.selfieRequired && (
                <div className="grid grid-cols-[10rem_1fr] gap-3 py-2"><dt className="text-zinc-500">Selfie</dt><dd>{selfie.file?.name}</dd></div>
              )}
              <div className="grid grid-cols-[10rem_1fr] gap-3 py-2"><dt className="text-zinc-500">Consent given</dt><dd>{consentAt && new Date(consentAt).toLocaleString()}</dd></div>
            </dl>
            {submitError && <p className="text-sm text-red-700 dark:text-red-300">{submitError}</p>}
            <div className="flex gap-3">
              <button onClick={back} disabled={submitting} className={secondary}>Back</button>
              <button onClick={submit} disabled={submitting} className={primary}>{submitting ? "Checking your documents…" : "Submit"}</button>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="flex flex-col gap-4">
            <div className={`rounded-lg border p-4 ${OUTCOME[result.decision].cls}`}>
              <p className="text-lg font-semibold">{OUTCOME[result.decision].title}</p>
              <p className="mt-2">{result.message}</p>
            </div>
            {result.fixes.length > 0 && (
              <div>
                <p className="mb-1 font-medium">What to fix</p>
                <ul className="list-disc pl-5 text-sm">{result.fixes.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
              <ProviderBadge provider={result.guideProvider} label="Message" />
              <ProviderBadge provider={result.provider} label="Checks" />
              <span>Reference {result.caseId} · policy {result.policy.id} v{result.policy.version}</span>
            </div>
            {result.specimen && (
              <p className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-3 text-sm text-fuchsia-900 dark:border-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200">
                Mock: recognised synthetic specimen <strong>{result.specimen.caseId}</strong>. Its ground truth was used as the extraction, and date checks ran as of {result.specimen.asOf}.
              </p>
            )}
            {result.decision === "request_info" && <div><button onClick={startAgain} className={primary}>Upload again</button></div>}
          </div>
        )}
      </section>
    </div>
  );
}
