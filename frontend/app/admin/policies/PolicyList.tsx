"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
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
const pill = "rounded-full px-2 py-0.5 text-xs font-medium";

export function PolicyList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api<{ policies: PolicySpec[] }>("/api/policies").then((r) => setRows(group(r.policies))).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!rows) return <p className="text-zinc-500">Loading policies…</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-3 font-medium">Policy</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Retention</th>
            <th className="px-4 py-3 font-medium">Updated</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {rows.map((r) => (
            <Fragment key={r.id}>
              <tr>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.latest.name}</div>
                  <div className="font-mono text-xs text-zinc-500">{r.id}</div>
                </td>
                <td className="px-4 py-3">{r.latest.customerCategory}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {r.published && <span className={`${pill} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300`}>published v{r.published.version}</span>}
                    {r.draft && <span className={`${pill} bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300`}>draft v{r.draft.version}</span>}
                    {r.seed && <span className={`${pill} bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300`}>seed</span>}
                  </div>
                </td>
                <td className="px-4 py-3">{r.latest.retentionDays} days</td>
                <td className="px-4 py-3">{date(r.latest.updatedAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-3">
                    {r.published && <Link href={`/apply/${r.id}`} className="text-blue-600 hover:underline dark:text-blue-400">Open journey</Link>}
                    {!r.seed && (
                      <Link href={`/admin/policies/new?id=${r.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                        {r.draft ? "Edit draft" : "New version"}
                      </Link>
                    )}
                    <button onClick={() => setOpen(open === r.id ? null : r.id)} className="text-blue-600 hover:underline dark:text-blue-400">
                      {open === r.id ? "Hide JSON" : "JSON"}
                    </button>
                  </div>
                </td>
              </tr>
              {open === r.id && (
                <tr>
                  <td colSpan={6} className="bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
                    <pre className="max-h-96 overflow-auto text-xs">{JSON.stringify(r.latest, null, 2)}</pre>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
