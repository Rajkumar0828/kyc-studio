"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

const card = "rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900";
const input = "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700";
const btn = "rounded-lg px-4 py-2.5 font-medium disabled:opacity-50";
const pickRules = (r: CompiledRules): CompiledRules => {
  const { provenance, requiredDocuments, minAge, proofOfAddressMaxAgeDays, selfieRequired, authorityLookup, autoApproveEnabled, autoApproveMaxScore, retentionDays } = r;
  return { provenance, requiredDocuments, minAge, proofOfAddressMaxAgeDays, selfieRequired, authorityLookup, autoApproveEnabled, autoApproveMaxScore, retentionDays };
};
const slug = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

const WARNING_STYLE: Record<CompileWarning["kind"], string> = {
  unsupported: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  conflict: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  default: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="flex flex-col gap-6">
        <div className={card}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Policy name
              <input value={name} onChange={(e) => edit(setName)(e.target.value)} disabled={!!editId} placeholder="e.g. Student account" className={`${input} mt-1 font-normal`} />
            </label>
            <label className="block text-sm font-medium">
              Customer category
              <input value={category} onChange={(e) => edit(setCategory)(e.target.value)} placeholder="e.g. retail" className={`${input} mt-1 font-normal`} />
            </label>
          </div>
          {name && !editId && <p className="mt-2 font-mono text-xs text-zinc-500">id: {slug(name) || "(needs letters or digits)"}</p>}
        </div>

        <div className={card}>
          <label htmlFor="policy-text" className="mb-1 block text-sm font-medium">Policy in plain English</label>
          <textarea id="policy-text" value={text} onChange={(e) => edit(setText)(e.target.value)} rows={9} maxLength={4000}
            placeholder="Require a passport. Applicants must be at least 18 years old. …" className={`${input} font-normal`} />
          <div className="mt-3">
            <p className="mb-2 text-xs font-medium text-zinc-500">Examples</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button key={ex.title} onClick={() => { edit(setText)(ex.text); if (!name && !editId) setName(ex.title); }}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  {ex.title}
                </button>
              ))}
            </div>
          </div>
          <button onClick={compile} disabled={!text.trim() || busy !== null} className={`${btn} mt-4 bg-blue-600 text-white hover:bg-blue-700`}>
            {busy === "compile" ? "Compiling…" : "Compile"}
          </button>
          {stale && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">The text changed since the last compile. Compile again before saving.</p>}
        </div>

        <div className={card}>
          <label htmlFor="consent" className="mb-1 block text-sm font-medium">Consent text</label>
          <p className="mb-2 text-xs text-zinc-500">Shown to customers word for word. Written by you, never by the AI; filled from a template until you edit it.</p>
          <textarea id="consent" value={consent} onChange={(e) => { edit(setConsent)(e.target.value); setConsentEdited(true); }} rows={5} maxLength={2000} className={`${input} font-normal`} />
        </div>
      </section>

      <section className="flex flex-col gap-6">
        {error && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</div>}

        {!compiled && <div className={`${card} text-zinc-500`}>Compile the policy text to see a preview.</div>}

        {compiled && (
          <>
            <div className={card}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="font-semibold">Preview</h2>
                <div className="flex items-center gap-3">
                  {compiled.provider === "saved" ? <span className="text-xs text-zinc-500">saved version</span> : <ProviderBadge provider={compiled.provider} label="Compiled by" />}
                  <button onClick={() => setShowJson(!showJson)} className="text-sm text-blue-600 hover:underline dark:text-blue-400">{showJson ? "Show summary" : "Show JSON"}</button>
                </div>
              </div>
              {showJson ? <pre className="max-h-[32rem] overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-950">{JSON.stringify(preview, null, 2)}</pre> : <Summary rules={compiled.rules} />}
            </div>

            <div className={card}>
              <h2 className="mb-3 font-semibold">Warnings {compiled.warnings.length > 0 && <span className="text-zinc-500">({compiled.warnings.length})</span>}</h2>
              {compiled.warnings.length === 0 ? (
                <p className="text-sm text-zinc-500">None. Every sentence mapped to a supported rule.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {compiled.warnings.map((w, i) => (
                    <li key={i} className="flex flex-col gap-1">
                      <span><span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${WARNING_STYLE[w.kind]}`}>{w.kind}</span>{w.message}</span>
                      {w.sentence && <q className="text-zinc-500">{w.sentence}</q>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <div className={`${card} flex flex-wrap items-center gap-3`}>
          <button onClick={saveDraft} disabled={!canSave} className={`${btn} border border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800`}>
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <button onClick={publish} disabled={!saved || dirty || busy !== null} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
          <span className="text-sm text-zinc-500">
            {published ? "" : saved && !dirty ? `Draft v${saved.version} saved.` : saved ? "Unsaved changes." : "Save a draft before publishing."}
          </span>
          {published && (
            <span className="text-sm text-emerald-700 dark:text-emerald-400">
              Published v{published.version}. <Link href={`/apply/${published.id}`} className="underline">Open the journey</Link> or <Link href="/admin/policies" className="underline">back to policies</Link>.
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function Summary({ rules }: { rules: CompiledRules }) {
  const from = (...kinds: RuleKind[]) => rules.provenance.filter((p) => kinds.includes(p.rule)).map((p) => p.sentence);
  const rows: Array<{ label: string; value: string; sources: string[] }> = [
    ...rules.requiredDocuments.map((d) => ({
      label: d.label,
      value: `Required: ${docList(d.anyOf)}`,
      sources: from(d.label === "Proof of address" ? "require_address_doc" : "require_identity_doc"),
    })),
    { label: RULE_LABEL.min_age, value: `${rules.minAge} years`, sources: from("min_age") },
    ...(rules.requiredDocuments.some((d) => d.label === "Proof of address")
      ? [{ label: RULE_LABEL.poa_max_age, value: `Issued within ${rules.proofOfAddressMaxAgeDays} days`, sources: from("poa_max_age") }]
      : []),
    { label: RULE_LABEL.selfie_required, value: rules.selfieRequired ? "Required" : "Not required", sources: from("selfie_required") },
    { label: RULE_LABEL.authority_lookup, value: rules.authorityLookup ? "Check ID against the registry" : "Off", sources: from("authority_lookup") },
    {
      label: "Auto-approval",
      value: rules.autoApproveEnabled ? `When the risk score is ${rules.autoApproveMaxScore} or lower` : "Never: every case goes to manual review",
      sources: from("auto_approve_threshold", "no_auto_approve"),
    },
    { label: RULE_LABEL.retention, value: `${rules.retentionDays} days`, sources: from("retention") },
  ];
  return (
    <dl className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[10rem_1fr] gap-3 py-2.5">
          <dt className="text-zinc-500">{r.label}</dt>
          <dd>
            <div className="font-medium">{r.value}</div>
            {r.sources.length ? (
              r.sources.map((s, j) => <q key={j} className="block text-xs text-zinc-500">{s}</q>)
            ) : (
              <span className="text-xs text-zinc-400">default (not stated)</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
