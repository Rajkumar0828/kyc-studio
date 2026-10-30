"use client";

import { useEffect, useState } from "react";
import { Badge, type Tone } from "@/app/components/Badge";
import { Button, ButtonLink } from "@/app/components/Button";
import { Card, CardHeader } from "@/app/components/Card";
import { cx } from "@/app/components/cx";
import { EmptyState } from "@/app/components/EmptyState";
import { ErrorNotice } from "@/app/components/ErrorNotice";
import { Field, TextArea, TextInput } from "@/app/components/Field";
import { Icon, Spinner } from "@/app/components/Icon";
import { ProviderBadge } from "@/app/components/ProviderBadge";
import type { CompileWarning } from "@/src/lib/ai/types";
import { api, postJson } from "@/src/lib/client/api";
import { EXAMPLE_PROMPTS } from "@/src/lib/policy/defaults";
import { docList, RULE_LABEL } from "@/src/lib/policy/labels";
import { defaultConsentText, type CompiledRules, type PolicySpec, type RuleKind } from "@/src/lib/policy/schema";

interface Compiled {
  rules: CompiledRules;
  warnings: CompileWarning[];
  provider: string; // "saved" when loaded from a stored policy
}

const pickRules = (r: CompiledRules): CompiledRules => {
  const { provenance, requiredDocuments, minAge, proofOfAddressMaxAgeDays, selfieRequired, authorityLookup, autoApproveEnabled, autoApproveMaxScore, retentionDays } = r;
  return { provenance, requiredDocuments, minAge, proofOfAddressMaxAgeDays, selfieRequired, authorityLookup, autoApproveEnabled, autoApproveMaxScore, retentionDays };
};
const slug = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

const WARNING: Record<CompileWarning["kind"], { tone: Tone; label: string; hint: string }> = {
  unsupported: { tone: "danger", label: "Not supported", hint: "Ignored. Rephrase it as a supported rule, or handle it outside this policy." },
  conflict: { tone: "warning", label: "Conflict", hint: "Two sentences disagree; the first one was kept." },
  default: { tone: "neutral", label: "Default used", hint: "Not stated in the text, so a default applies." },
};

export function PolicyStudio({ editId }: { editId?: string }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [text, setText] = useState("");
  const [consent, setConsent] = useState("");
  const [consentEdited, setConsentEdited] = useState(false);
  const [compiled, setCompiled] = useState<Compiled | null>(null);
  const [compiledText, setCompiledText] = useState<string | null>(null);
  const [saved, setSaved] = useState<PolicySpec | null>(null);
  const [dirty, setDirty] = useState(false); // edits since the last save
  const [published, setPublished] = useState<PolicySpec | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editing an existing policy: start from its draft, else its latest published version.
  useEffect(() => {
    if (!editId) return;
    api<{ published: PolicySpec | null; draft: PolicySpec | null }>(`/api/policies/${editId}`)
      .then(({ published: pub, draft }) => {
        const p = draft ?? pub;
        if (!p) return;
        setName(p.name);
        setCategory(p.customerCategory);
        setText(p.sourceText);
        setConsent(p.consentText);
        setConsentEdited(true);
        setCompiled({ rules: pickRules(p), warnings: [], provider: "saved" });
        setCompiledText(p.sourceText);
        if (draft) setSaved(draft);
      })
      .catch((e) => setError(e.message));
  }, [editId]);

  const stale = compiled !== null && compiledText !== text;
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
    setPublished(null);
  };

  async function compile() {
    setBusy("compile");
    setError(null);
    try {
      const r = await postJson<Compiled>("/api/policies/compile", { text });
      setCompiled(r);
      setCompiledText(text);
      setDirty(true);
      if (!consentEdited) setConsent(defaultConsentText(r.rules.retentionDays));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    if (!compiled) return;
    setBusy("save");
    setError(null);
    try {
      const { policy } = await postJson<{ policy: PolicySpec }>("/api/policies", {
        id: editId ?? saved?.id,
        name, customerCategory: category, sourceText: text, consentText: consent,
        rules: pickRules(compiled.rules),
      });
      setSaved(policy);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!saved) return;
    setBusy("publish");
    setError(null);
    try {
      const { policy } = await postJson<{ policy: PolicySpec }>(`/api/policies/${saved.id}/publish`, {});
      setPublished(policy);
      setSaved(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const preview = compiled && {
    id: editId ?? saved?.id ?? slug(name),
    version: saved?.version ?? "(set on save)",
    status: "draft",
    name, customerCategory: category, sourceText: text, consentText: consent,
    ...compiled.rules,
  };
  const canSave = !!compiled && !stale && !!name.trim() && !!category.trim() && !!consent.trim() && busy === null;
  const status = published
    ? null
    : saved && !dirty ? `Draft v${saved.version} saved. Ready to publish.` : saved ? "Unsaved changes." : compiled ? "Save a draft before publishing." : "Compile the policy first.";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-label="Policy input" className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Details" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="policy-name" label="Policy name" hint={!editId && name ? <>id: <span className="font-mono">{slug(name) || "(needs letters or digits)"}</span></> : undefined}>
              <TextInput id="policy-name" value={name} onChange={(e) => edit(setName)(e.target.value)} disabled={!!editId}
                placeholder="e.g. Student account" aria-describedby={!editId && name ? "policy-name-hint" : undefined} />
            </Field>
            <Field id="policy-category" label="Customer category">
              <TextInput id="policy-category" value={category} onChange={(e) => edit(setCategory)(e.target.value)} placeholder="e.g. retail" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Policy in plain English" description="One rule per sentence works best. Only the nine supported rule kinds are applied; everything else is flagged." />
          <div className="mb-3">
            <p id="examples-label" className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Start from an example</p>
            <div role="group" aria-labelledby="examples-label" className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button key={ex.title} type="button" onClick={() => { edit(setText)(ex.text); if (!name && !editId) setName(ex.title); }}
                  className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 motion-safe:transition-colors hover:border-accent-400 hover:text-accent-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-accent-300">
                  {ex.title}
                </button>
              ))}
            </div>
          </div>
          <label htmlFor="policy-text" className="sr-only">Policy text</label>
          <TextArea id="policy-text" value={text} onChange={(e) => edit(setText)(e.target.value)} rows={9} maxLength={4000}
            placeholder="Require a passport. Applicants must be at least 18 years old. …" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={compile} disabled={!text.trim() || busy !== null}>
              {busy === "compile" ? <><Spinner /> Compiling…</> : <><Icon name="sparkle" /> Compile</>}
            </Button>
            <span className="text-xs text-zinc-500">{text.length}/4000</span>
          </div>
          {stale && <div className="mt-4"><ErrorNotice tone="warning">The text changed since the last compile. Compile again before saving.</ErrorNotice></div>}
        </Card>

        <Card>
          <Field id="consent" label="Consent text" hint="Shown to customers word for word. Written by you, never by the AI; filled from a template until you edit it.">
            <TextArea id="consent" aria-describedby="consent-hint" value={consent} onChange={(e) => { edit(setConsent)(e.target.value); setConsentEdited(true); }} rows={5} maxLength={2000} />
          </Field>
        </Card>
      </section>

      <section aria-label="Compiled policy" className="flex flex-col gap-6 lg:sticky lg:top-6">
        {error && <ErrorNotice title="Something went wrong">{error}</ErrorNotice>}

        {!compiled ? (
          <EmptyState icon="sparkle" title="Nothing compiled yet" description="Pick an example or write your own rules, then press Compile to see each setting and where it came from." />
        ) : (
          <>
            <Card>
              <CardHeader title="Preview"
                actions={
                  <>
                    {compiled.provider === "saved" ? <Badge>saved version</Badge> : <ProviderBadge provider={compiled.provider} label="Compiled by" />}
                    <div role="group" aria-label="Preview format" className="inline-flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
                      {(["Summary", "JSON"] as const).map((v) => {
                        const on = (v === "JSON") === showJson;
                        return (
                          <button key={v} type="button" aria-pressed={on} onClick={() => setShowJson(v === "JSON")}
                            className={cx("rounded-md px-2.5 py-1 text-xs font-medium motion-safe:transition-colors", on ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100")}>
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </>
                } />
              {showJson ? (
                <pre className="max-h-[32rem] overflow-auto rounded-xl bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-100">{JSON.stringify(preview, null, 2)}</pre>
              ) : (
                <Summary rules={compiled.rules} />
              )}
            </Card>

            <Card>
              <CardHeader title={<>Warnings {compiled.warnings.length > 0 && <span className="font-normal text-zinc-500">({compiled.warnings.length})</span>}</>} />
              {compiled.warnings.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><Icon name="check" /> None. Every sentence mapped to a supported rule.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {compiled.warnings.map((w, i) => (
                    <li key={i} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={WARNING[w.kind].tone}>{WARNING[w.kind].label}</Badge>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{w.message}</span>
                      </div>
                      {w.sentence && <blockquote className="mt-2 border-l-2 border-zinc-300 pl-3 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">{w.sentence}</blockquote>}
                      <p className="mt-1.5 text-xs text-zinc-500">{WARNING[w.kind].hint}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}

        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={saveDraft} disabled={!canSave}>{busy === "save" ? <><Spinner /> Saving…</> : "Save draft"}</Button>
            <Button variant="success" onClick={publish} disabled={!saved || dirty || busy !== null}>{busy === "publish" ? <><Spinner /> Publishing…</> : "Publish"}</Button>
          </div>
          {status && <p className="mt-3 text-sm text-zinc-500" aria-live="polite">{status}</p>}
          {published && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm" aria-live="polite">
              <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400"><Icon name="check" /> Published v{published.version}.</span>
              <ButtonLink href={`/apply/${published.id}`} size="sm">Open the journey <Icon name="arrowRight" /></ButtonLink>
              <ButtonLink href="/admin/policies" size="sm" variant="ghost">Back to policies</ButtonLink>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

// One card row per setting, with the sentence(s) it came from.
function Summary({ rules }: { rules: CompiledRules }) {
  const from = (...kinds: RuleKind[]) => rules.provenance.filter((p) => kinds.includes(p.rule)).map((p) => p.sentence);
  const hasPoa = rules.requiredDocuments.some((d) => d.label === "Proof of address");
  const rows: Array<{ label: string; value: string; sources: string[] }> = [
    ...rules.requiredDocuments.map((d) => ({
      label: d.label,
      value: `Required: ${docList(d.anyOf)}`,
      sources: from(d.label === "Proof of address" ? "require_address_doc" : "require_identity_doc"),
    })),
    { label: RULE_LABEL.min_age, value: `${rules.minAge} years`, sources: from("min_age") },
    ...(hasPoa ? [{ label: RULE_LABEL.poa_max_age, value: `Issued within ${rules.proofOfAddressMaxAgeDays} days`, sources: from("poa_max_age") }] : []),
    { label: RULE_LABEL.selfie_required, value: rules.selfieRequired ? "Required" : "Not required", sources: from("selfie_required") },
    { label: RULE_LABEL.authority_lookup, value: rules.authorityLookup ? "Check the ID against the registry" : "Off", sources: from("authority_lookup") },
    {
      label: "Auto-approval",
      value: rules.autoApproveEnabled ? `When the risk score is ${rules.autoApproveMaxScore} or lower` : "Never: every case goes to manual review",
      sources: from("auto_approve_threshold", "no_auto_approve"),
    },
    { label: RULE_LABEL.retention, value: `${rules.retentionDays} days`, sources: from("retention") },
  ];
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <li key={i} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{r.label}</span>
            {!r.sources.length && <Badge>default</Badge>}
          </div>
          <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">{r.value}</p>
          {r.sources.map((s, j) => (
            <blockquote key={j} className="mt-1.5 border-l-2 border-accent-300 pl-3 text-sm text-zinc-600 dark:border-accent-700 dark:text-zinc-400">
              <span className="sr-only">Source sentence: </span>{s}
            </blockquote>
          ))}
        </li>
      ))}
    </ul>
  );
}
