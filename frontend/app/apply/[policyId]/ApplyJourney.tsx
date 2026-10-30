"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/app/components/Badge";
import { Button } from "@/app/components/Button";
import { Card } from "@/app/components/Card";
import { cx } from "@/app/components/cx";
import { ErrorNotice } from "@/app/components/ErrorNotice";
import { Select } from "@/app/components/Field";
import { Icon, Spinner, type IconName } from "@/app/components/Icon";
import { ProviderBadge } from "@/app/components/ProviderBadge";
import { Loading } from "@/app/components/Skeleton";
import { Stepper } from "@/app/components/Stepper";
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

// What the customer sees. Never a score or an integrity finding.
const OUTCOME: Record<Decision, { title: string; icon: IconName; cls: string; iconCls: string }> = {
  auto_approve: {
    title: "You're verified",
    icon: "check",
    cls: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/50",
    iconCls: "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950",
  },
  request_info: {
    title: "We need a little more from you",
    icon: "upload",
    cls: "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/50",
    iconCls: "bg-sky-600 text-white dark:bg-sky-500 dark:text-zinc-950",
  },
  manual_review: {
    title: "Your application is with our team",
    icon: "user",
    cls: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950",
    iconCls: "bg-accent-600 text-white dark:bg-accent-500 dark:text-zinc-950",
  },
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

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// One upload: a large tap target with a visually hidden (but focusable) file input.
function UploadCard({ id, title, hint, accept, capture, file, check, onPick, children }: {
  id: string; title: string; hint: string; accept: string[]; capture?: "user"; file: File | null; check: FileCheck | null;
  onPick: (f: File | null) => void; children?: ReactNode;
}) {
  const state = !file ? "empty" : check?.state ?? "checking";
  const tone = {
    empty: "border-dashed border-zinc-300 dark:border-zinc-700",
    checking: "border-zinc-300 dark:border-zinc-700",
    ok: "border-emerald-300 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30",
    problem: "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
    error: "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30",
  }[state];
  return (
    <div className={cx("rounded-2xl border-2 p-4 motion-safe:transition-colors sm:p-5", tone)}>
      <div className="flex items-start gap-3">
        <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg",
          state === "ok" ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950" : state === "problem" ? "bg-amber-500 text-white dark:text-zinc-950" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800")}>
          {state === "checking" ? <Spinner /> : <Icon name={state === "ok" ? "check" : state === "problem" || state === "error" ? "alert" : "upload"} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{hint}</p>
          {children}
          {file && (
            <p className="mt-2 truncate text-sm text-zinc-700 dark:text-zinc-300">
              <Icon name="file" className="mr-1 inline align-[-2px]" /> {file.name} <span className="text-zinc-500">· {kb(file.size)}</span>
            </p>
          )}
          <div aria-live="polite">
            {state === "checking" && <p className="mt-1 text-sm text-zinc-500">Checking the image…</p>}
            {state === "ok" && <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">Looks good.</p>}
            {(state === "problem" || state === "error") && (
              <div className={cx("mt-1 text-sm", state === "problem" ? "text-amber-900 dark:text-amber-200" : "text-red-700 dark:text-red-300")}>
                {check!.messages.map((m, i) => <p key={i}>{m}</p>)}
                {state === "problem" && <p className="mt-1 text-zinc-600 dark:text-zinc-400">Choose another file, or continue and we may ask again.</p>}
              </div>
            )}
          </div>
          <label htmlFor={id}
            className="mt-3 inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 shadow-sm motion-safe:transition-colors hover:bg-zinc-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800">
            <Icon name="upload" /> {file ? "Replace file" : "Choose file"}
            <input id={id} type="file" accept={accept.join(",")} capture={capture} className="sr-only"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      </div>
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">{children}</div>;
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
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

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

  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [stepIndex]);

  if (loadError) return <ErrorNotice title="This journey isn't available">{loadError}</ErrorNotice>;
  if (!policy) return <Card><Loading label="Loading the journey" /></Card>;

  const steps: JourneyStep[] = ["consent", "tour", "documents", ...(policy.selfieRequired ? (["selfie"] as const) : []), "review", "result"];
  const step = steps[stepIndex];
  const next = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));
  const help = guide?.steps[step];
  const wide = "w-full sm:w-auto";

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
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl dark:text-white">Verify your identity</h1>
      </header>

      <Stepper steps={steps.map((s) => STEP_TITLE[s])} current={stepIndex} label="Verification steps" />

      <Card>
        <div key={step} className="motion-safe:animate-step-in">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold text-zinc-900 focus:outline-none dark:text-zinc-100">{STEP_TITLE[step]}</h2>
            {guide && step !== "consent" && step !== "result" && <ProviderBadge provider={guide.provider} label="Guidance" />}
          </div>
          {help && step !== "result" && <p className="mb-6 leading-relaxed text-zinc-600 dark:text-zinc-400">{help}</p>}
          {guideError && step !== "result" && <div className="mb-6"><ErrorNotice tone="warning" title="Guidance unavailable">{guideError}</ErrorNotice></div>}

          {step === "consent" && (
            <>
              {/* From the policy, written by its author; never model output. */}
              <div className="whitespace-pre-line rounded-xl bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">{policy.consentText}</div>
              <p className="mt-4 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <Icon name="lock" className="shrink-0 text-zinc-500" /> Your verification data is kept for <strong>{policy.retentionDays} days</strong>, then deleted.
              </p>
              <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-accent-600" />
                <span>I have read this and agree to my information being used to verify my identity.</span>
              </label>
              <Actions>
                <span />
                <Button size="lg" className={wide} disabled={!agreed} onClick={() => { setConsentAt(new Date().toISOString()); next(); }}>
                  Agree and continue <Icon name="arrowRight" />
                </Button>
              </Actions>
            </>
          )}

          {step === "tour" && (
            <>
              <ul className="flex flex-col gap-3">
                {policy.requiredDocuments.map((d) => (
                  <li key={d.label} className="flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                    <Icon name="file" className="mt-0.5 shrink-0 text-lg text-accent-600 dark:text-accent-400" />
                    <div>
                      <p className="font-medium">{d.label}</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {docList(d.anyOf)}
                        {d.label === "Proof of address" && `, issued within the last ${policy.proofOfAddressMaxAgeDays} days`}
                      </p>
                    </div>
                  </li>
                ))}
                {policy.selfieRequired && (
                  <li className="flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                    <Icon name="user" className="mt-0.5 shrink-0 text-lg text-accent-600 dark:text-accent-400" />
                    <div><p className="font-medium">A selfie</p><p className="text-sm text-zinc-600 dark:text-zinc-400">Taken with your camera or uploaded</p></div>
                  </li>
                )}
              </ul>
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">You must be at least {policy.minAge} years old.</p>
              {guide?.provider === "mock" && (
                <div className="mt-4 flex gap-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-sm text-fuchsia-900 dark:border-fuchsia-900 dark:bg-fuchsia-950/50 dark:text-fuchsia-200">
                  <Badge tone="mock" className="h-fit">mock</Badge>
                  <p>No model reads your files. Uploading the synthetic specimens from <code className="font-mono">eval/specimens/&lt;case&gt;/</code> returns that case&apos;s scripted outcome; other files get placeholder data.</p>
                </div>
              )}
              <Actions>
                <Button variant="secondary" size="lg" className={wide} onClick={back}>Back</Button>
                <Button size="lg" className={wide} onClick={next}>Start <Icon name="arrowRight" /></Button>
              </Actions>
            </>
          )}

          {step === "documents" && (
            <>
              <div className="flex flex-col gap-4">
                {policy.requiredDocuments.map((d, i) => (
                  <UploadCard key={d.label} id={`doc-${i}`} title={d.label} hint={`Accepted: ${docList(d.anyOf)} · JPG, PNG or PDF, up to 10 MB`}
                    accept={DOC_TYPES} file={slots[i]?.file ?? null} check={slots[i]?.check ?? null} onPick={(f) => pickDocument(i, f)}>
                    {d.anyOf.length > 1 && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                        <label htmlFor={`doc-type-${i}`} className="text-zinc-700 dark:text-zinc-300">Which document is this?</label>
                        <Select id={`doc-type-${i}`} value={slots[i]?.type} onChange={(e) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, type: e.target.value as DocType } : x)))}>
                          {d.anyOf.map((t) => <option key={t} value={t}>{DOC_LABEL[t]}</option>)}
                        </Select>
                      </div>
                    )}
                  </UploadCard>
                ))}
              </div>
              <Actions>
                <Button variant="secondary" size="lg" className={wide} onClick={back}>Back</Button>
                <Button size="lg" className={wide} onClick={next} disabled={slots.some((s) => !s.file || s.check?.state === "checking")}>Continue <Icon name="arrowRight" /></Button>
              </Actions>
            </>
          )}

          {step === "selfie" && (
            <>
              <div className="mb-4 flex gap-3 rounded-xl border-2 border-dashed border-fuchsia-300 bg-fuchsia-50 p-4 text-sm text-fuchsia-900 dark:border-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-200">
                <Badge tone="mock" className="h-fit">mock</Badge>
                <p><strong>Mock selfie step.</strong> The photo is only checked for image quality. No liveness detection or face matching is performed.</p>
              </div>
              <UploadCard id="selfie" title="Your selfie" hint="Face the camera in good light · JPG or PNG" accept={IMAGE_TYPES} capture="user"
                file={selfie.file} check={selfie.check} onPick={pickSelfie} />
              <Actions>
                <Button variant="secondary" size="lg" className={wide} onClick={back}>Back</Button>
                <Button size="lg" className={wide} onClick={next} disabled={!selfie.file || selfie.check?.state === "checking"}>Continue <Icon name="arrowRight" /></Button>
              </Actions>
            </>
          )}

          {step === "review" && (
            <>
              <dl className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
                {policy.requiredDocuments.map((d, i) => (
                  <div key={d.label} className="flex flex-col gap-1 p-4 sm:flex-row sm:gap-4">
                    <dt className="text-zinc-500 sm:w-40 sm:shrink-0">{d.label}</dt>
                    <dd className="min-w-0 break-words">
                      {slots[i]?.file?.name} <span className="text-zinc-500">({DOC_LABEL[slots[i]?.type ?? "unknown"]})</span>
                      {slots[i]?.check?.state === "problem" && <Badge tone="warning" className="ml-2">quality warning</Badge>}
                    </dd>
                  </div>
                ))}
                {policy.selfieRequired && (
                  <div className="flex flex-col gap-1 p-4 sm:flex-row sm:gap-4">
                    <dt className="text-zinc-500 sm:w-40 sm:shrink-0">Selfie</dt>
                    <dd className="min-w-0 break-words">{selfie.file?.name}</dd>
                  </div>
                )}
                <div className="flex flex-col gap-1 p-4 sm:flex-row sm:gap-4">
                  <dt className="text-zinc-500 sm:w-40 sm:shrink-0">Consent given</dt>
                  <dd>{consentAt && new Date(consentAt).toLocaleString()}</dd>
                </div>
              </dl>
              {submitError && <div className="mt-4"><ErrorNotice title="We couldn't submit your application">{submitError}</ErrorNotice></div>}
              <Actions>
                <Button variant="secondary" size="lg" className={wide} onClick={back} disabled={submitting}>Back</Button>
                <Button size="lg" className={wide} onClick={submit} disabled={submitting}>
                  {submitting ? <><Spinner /> Checking your documents…</> : "Submit"}
                </Button>
              </Actions>
            </>
          )}

          {step === "result" && result && (
            <>
              <div className={cx("rounded-2xl border p-5 sm:p-6", OUTCOME[result.decision].cls)}>
                <div className="flex items-start gap-4">
                  <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl", OUTCOME[result.decision].iconCls)}>
                    <Icon name={OUTCOME[result.decision].icon} />
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{OUTCOME[result.decision].title}</p>
                    <p className="mt-1 leading-relaxed text-zinc-700 dark:text-zinc-300">{result.message}</p>
                  </div>
                </div>
              </div>
              {result.fixes.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold">What to fix</h3>
                  <ul className="mt-2 flex flex-col gap-2">
                    {result.fixes.map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"><Icon name="arrowRight" className="mt-0.5 shrink-0 text-accent-600 dark:text-accent-400" />{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.specimen && (
                <div className="mt-6 flex gap-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-sm text-fuchsia-900 dark:border-fuchsia-900 dark:bg-fuchsia-950/50 dark:text-fuchsia-200">
                  <Badge tone="mock" className="h-fit">mock</Badge>
                  <p>Recognised synthetic specimen <strong>{result.specimen.caseId}</strong>. Its ground truth was used as the extraction, and date checks ran as of {result.specimen.asOf}.</p>
                </div>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
                <ProviderBadge provider={result.guideProvider} label="Message" />
                <ProviderBadge provider={result.provider} label="Checks" />
                <span>Reference {result.caseId} · policy {result.policy.id} v{result.policy.version}</span>
              </div>
              {result.decision === "request_info" && (
                <Actions>
                  <span />
                  <Button size="lg" className={wide} onClick={startAgain}><Icon name="upload" /> Upload again</Button>
                </Actions>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
