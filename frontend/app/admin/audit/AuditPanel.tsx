"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/app/components/Badge";
import { Button } from "@/app/components/Button";
import { Card, CardHeader } from "@/app/components/Card";
import { EmptyState } from "@/app/components/EmptyState";
import { ErrorNotice } from "@/app/components/ErrorNotice";
import { Icon, Spinner } from "@/app/components/Icon";
import { RequiresStorage } from "@/app/components/RequiresStorage";
import { Loading } from "@/app/components/Skeleton";
import type { AuditEvent, VerifyResult } from "@/src/lib/audit/chain";
import { api, ApiError, DEMO_ACCESS_EVENT } from "@/src/lib/client/api";

const REASON: Record<NonNullable<VerifyResult["firstBroken"]>["reason"], string> = {
  seq_gap: "an event is missing or out of order",
  prev_hash_mismatch: "the link to the previous event does not match",
  hash_mismatch: "the event's content does not match its hash",
  invalid_event: "the event has fields the schema does not allow",
};
const short = (s?: string) => (s ? `${s.slice(0, 8)}…` : "–");

export function AuditPanel() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [kind, setKind] = useState<string>("");
  const [requires, setRequires] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<(VerifyResult & { checkedAt: string; tookMs: number }) | null>(null);

  const load = useCallback(() => {
    api<{ kind: string; events: AuditEvent[] }>("/api/admin/audit")
      .then((d) => {
        setEvents(d.events);
        setKind(d.kind);
        setError(null);
      })
      .catch((e) => (e instanceof ApiError && e.code === "requires_storage" ? setRequires(e.message) : setError(e.message)));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(DEMO_ACCESS_EVENT, load);
    return () => window.removeEventListener(DEMO_ACCESS_EVENT, load);
  }, [load]);

  async function verify() {
    setVerifying(true);
    setError(null);
    try {
      setResult(await api("/api/admin/audit/verify", { method: "POST" }));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVerifying(false);
    }
  }

  if (requires) return <RequiresStorage message={requires} />;
  if (error && !events) return <ErrorNotice title="Could not load the audit log">{error}</ErrorNotice>;
  if (!events) return <Card><Loading label="Loading the audit log" lines={4} /></Card>;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Chain status" description={kind === "memory" ? "In-memory chain (AUDIT_LOG=memory): lost when the server restarts." : "Stored in MongoDB (audit_events)."}
          actions={<Button onClick={verify} disabled={verifying}>{verifying ? <><Spinner /> Verifying…</> : <><Icon name="shield" /> Verify chain</>}</Button>} />
        <div aria-live="polite">
          {!result && <p className="text-sm text-zinc-600 dark:text-zinc-400">Press Verify to recompute every hash from the first event.</p>}
          {result?.ok && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="success"><Icon name="check" /> Intact</Badge>
              {result.count} events verified, last hash <span className="font-mono">{short(result.lastHash)}</span> · checked {new Date(result.checkedAt).toLocaleTimeString()} in {result.tookMs} ms
            </p>
          )}
          {result && !result.ok && result.firstBroken && (
            <ErrorNotice title={`Broken at event #${result.firstBroken.seq}`}>
              The first {result.count} events are intact; at #{result.firstBroken.seq} {REASON[result.firstBroken.reason]}.
              <span className="mt-1 block font-mono text-xs">expected {short(result.firstBroken.expected)} · found {short(result.firstBroken.actual)}</span>
            </ErrorNotice>
          )}
          {error && <div className="mt-3"><ErrorNotice>{error}</ErrorNotice></div>}
        </div>
      </Card>

      {!events.length ? (
        <EmptyState icon="clipboard" title="No audit events yet" description="Saving or publishing a policy, or submitting an application, appends the first events." />
      ) : (
        <Card padded={false}>
          <div className="px-5 pt-5 sm:px-6 sm:pt-6"><CardHeader title="Recent events" description="Newest first. Ids, types and codes only." /></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <caption className="sr-only">Recent audit events</caption>
              <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                <tr>{["#", "Time", "Event", "Actor", "Case", "Policy", "Details", "Hash"].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium first:pl-5 sm:first:pl-6">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {events.map((e) => (
                  <tr key={e.seq}>
                    <td className="px-4 py-2.5 pl-5 tabular-nums sm:pl-6">{e.seq}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-400">{new Date(e.at).toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-medium">{e.type.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2.5"><Badge tone={e.actor === "officer:admin" ? "warning" : "neutral"}>{e.actor}</Badge></td>
                    <td className="px-4 py-2.5 font-mono text-xs">{short(e.caseId)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{e.policyId ? `${e.policyId}${e.policyVersion ? ` v${e.policyVersion}` : ""}` : "–"}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-400">
                      {[e.data?.decision, e.data?.flagCodes?.join(", "), e.data?.riskScore !== undefined ? `score ${e.data.riskScore}` : null, e.data?.count !== undefined ? `count ${e.data.count}` : null, e.data?.docType].filter(Boolean).join(" · ") || "–"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{short(e.hash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
