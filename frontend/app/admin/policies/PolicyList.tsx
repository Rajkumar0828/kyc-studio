"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/app/components/Badge";
import { Button, ButtonLink } from "@/app/components/Button";
import { Card } from "@/app/components/Card";
import { EmptyState } from "@/app/components/EmptyState";
import { ErrorNotice } from "@/app/components/ErrorNotice";
import { Icon } from "@/app/components/Icon";
import { Loading } from "@/app/components/Skeleton";
import { api } from "@/src/lib/client/api";
import { DEFAULT_POLICIES } from "@/src/lib/policy/defaults";
import type { PolicySpec } from "@/src/lib/policy/schema";

interface Row {
  id: string;
  latest: PolicySpec; // draft if there is one, else the newest published version
  published?: PolicySpec;
  draft?: PolicySpec;
  seed: boolean;
}

function group(policies: PolicySpec[]): Row[] {
  const byId = new Map<string, PolicySpec[]>();
  for (const p of policies) byId.set(p.id, [...(byId.get(p.id) ?? []), p]);
  return [...byId.entries()].map(([id, versions]) => {
    const sorted = versions.sort((a, b) => a.version - b.version);
    const published = sorted.filter((p) => p.status === "published").at(-1);
    const draft = sorted.find((p) => p.status === "draft");
    return { id, latest: draft ?? published!, published, draft, seed: DEFAULT_POLICIES.some((s) => s.id === id) };
  });
}

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export function PolicyList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api<{ policies: PolicySpec[] }>("/api/policies").then((r) => setRows(group(r.policies))).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNotice title="Could not load policies">{error}</ErrorNotice>;
  if (!rows) return <Card><Loading label="Loading policies" lines={4} /></Card>;
  if (!rows.length)
    return <EmptyState title="No policies yet" description="Write one in plain English in the Policy Studio." action={<ButtonLink href="/admin/policies/new">New policy</ButtonLink>} />;

  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r) => (
        <li key={r.id}>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{r.latest.name}</h2>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">{r.id}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.published && <Badge tone="success">Published v{r.published.version}</Badge>}
                  {r.draft && <Badge>Draft v{r.draft.version}</Badge>}
                  {r.seed && <Badge tone="info">Seed</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.published && <ButtonLink href={`/apply/${r.id}`} size="sm">Open journey <Icon name="arrowRight" /></ButtonLink>}
                {!r.seed && <ButtonLink href={`/admin/policies/new?id=${r.id}`} size="sm" variant="secondary">{r.draft ? "Edit draft" : "New version"}</ButtonLink>}
                <Button size="sm" variant="ghost" aria-expanded={open === r.id} aria-controls={`json-${r.id}`} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {open === r.id ? "Hide JSON" : "View JSON"}
                </Button>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-zinc-100 pt-4 text-sm sm:grid-cols-4 dark:border-zinc-800">
              <div><dt className="text-zinc-500">Category</dt><dd className="mt-0.5 font-medium">{r.latest.customerCategory}</dd></div>
              <div><dt className="text-zinc-500">Documents</dt><dd className="mt-0.5 font-medium">{r.latest.requiredDocuments.map((d) => d.label).join(", ")}</dd></div>
              <div><dt className="text-zinc-500">Retention</dt><dd className="mt-0.5 font-medium">{r.latest.retentionDays} days</dd></div>
              <div><dt className="text-zinc-500">Updated</dt><dd className="mt-0.5 font-medium">{date(r.latest.updatedAt)}</dd></div>
            </dl>
            {open === r.id && (
              <pre id={`json-${r.id}`} className="mt-4 max-h-96 overflow-auto rounded-xl bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-100">
                {JSON.stringify(r.latest, null, 2)}
              </pre>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
