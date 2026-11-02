"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/app/components/Badge";
import { Button, ButtonLink } from "@/app/components/Button";
import { Card } from "@/app/components/Card";
import { ConfirmDialog } from "@/app/components/ConfirmDialog";
import { EmptyState } from "@/app/components/EmptyState";
import { ErrorNotice } from "@/app/components/ErrorNotice";
import { Icon } from "@/app/components/Icon";
import { Loading } from "@/app/components/Skeleton";
import { api, postJson } from "@/src/lib/client/api";
import type { PolicySummary, PolicyVersion } from "@/src/lib/policy/store/types";

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "–");

export function PolicyList() {
  const [rows, setRows] = useState<PolicySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [json, setJson] = useState<{ id: string; body: PolicyVersion | null } | null>(null);
  const [archiving, setArchiving] = useState<PolicySummary | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ policies: PolicySummary[] }>("/api/policies").then((r) => setRows(r.policies)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function toggleJson(id: string) {
    if (json?.id === id) return setJson(null);
    const r = await api<{ published: PolicyVersion | null }>(`/api/policies/${id}`).catch(() => ({ published: null }));
    setJson({ id, body: r.published });
  }

  async function archive() {
    if (!archiving) return;
    setBusy(true);
    try {
      await postJson(`/api/policies/${archiving.id}/archive`, {});
      setArchiving(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setArchiving(null);
    } finally {
      setBusy(false);
    }
  }

  if (error && !rows) return <ErrorNotice title="Could not load policies">{error}</ErrorNotice>;
  if (!rows) return <Card><Loading label="Loading policies" lines={4} /></Card>;
  if (!rows.length)
    return <EmptyState title="No policies yet" description="Write one in plain English in the Policy Studio." action={<ButtonLink href="/admin/policies/new">New policy</ButtonLink>} />;

  return (
    <>
      {error && <div className="mb-4"><ErrorNotice>{error}</ErrorNotice></div>}
      <ul className="flex flex-col gap-4">
        {rows.map((r) => (
          <li key={r.id}>
            <Card className={r.archived ? "opacity-70" : undefined}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{r.name}</h2>
                  <p className="mt-0.5 font-mono text-xs text-zinc-500">{r.id}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {r.latestVersion !== null && <Badge tone="success">Published v{r.latestVersion}</Badge>}
                    {r.draftUpdatedAt && <Badge>Draft (unpublished changes)</Badge>}
                    {r.archived && <Badge tone="warning">Archived</Badge>}
                    {r.seed && <Badge tone="info">Seed</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.latestVersion !== null && !r.archived && <ButtonLink href={`/apply/${r.id}`} size="sm">Open journey <Icon name="arrowRight" /></ButtonLink>}
                  {!r.seed && !r.archived && <ButtonLink href={`/admin/policies/new?id=${r.id}`} size="sm" variant="secondary">{r.draftUpdatedAt ? "Edit draft" : "New version"}</ButtonLink>}
                  {r.latestVersion !== null && (
                    <Button size="sm" variant="ghost" aria-expanded={json?.id === r.id} aria-controls={`json-${r.id}`} onClick={() => toggleJson(r.id)}>
                      {json?.id === r.id ? "Hide JSON" : "View JSON"}
                    </Button>
                  )}
                  {!r.seed && !r.archived && <Button size="sm" variant="ghost" onClick={() => setArchiving(r)}>Archive</Button>}
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-zinc-100 pt-4 text-sm sm:grid-cols-4 dark:border-zinc-800">
                <div><dt className="text-zinc-500">Category</dt><dd className="mt-0.5 font-medium">{r.customerCategory}</dd></div>
                <div><dt className="text-zinc-500">Documents</dt><dd className="mt-0.5 font-medium">{r.documents.join(", ")}</dd></div>
                <div><dt className="text-zinc-500">Retention</dt><dd className="mt-0.5 font-medium">{r.retentionDays} days</dd></div>
                <div><dt className="text-zinc-500">Published</dt><dd className="mt-0.5 font-medium">{date(r.publishedAt)}</dd></div>
              </dl>
              {json?.id === r.id && (
                <pre id={`json-${r.id}`} className="mt-4 max-h-96 overflow-auto rounded-xl bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-100">
                  {json.body ? JSON.stringify(json.body, null, 2) : "No published version is available."}
                </pre>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <ConfirmDialog open={!!archiving} title={`Archive ${archiving?.name ?? ""}?`} confirmLabel="Archive" busy={busy} onConfirm={archive} onCancel={() => setArchiving(null)}>
        Archiving is permanent. New applications will be refused and the policy can no longer be edited; its published versions stay readable.
      </ConfirmDialog>
    </>
  );
}
