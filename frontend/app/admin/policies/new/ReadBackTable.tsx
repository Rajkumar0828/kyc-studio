import { Badge, type Tone } from "@/app/components/Badge";
import { cx } from "@/app/components/cx";
import { Icon } from "@/app/components/Icon";
import { notAppliedCount, type ReadBackRow, type RowStatus } from "@/src/lib/policy/readBack";

// One status per sentence; the badge, row tint and wording never contradict each other.
const STATUS: Record<RowStatus, { tone: Tone; label: string; row: string }> = {
  applied: { tone: "success", label: "Applied", row: "" },
  applied_with_note: { tone: "warning", label: "Applied with note", row: "bg-amber-50/60 dark:bg-amber-950/25" },
  platform_check: { tone: "neutral", label: "Platform check", row: "" },
  not_applied: { tone: "danger", label: "Not applied", row: "bg-red-50 dark:bg-red-950/40" },
  note: { tone: "neutral", label: "Policy-wide", row: "bg-zinc-50 dark:bg-zinc-950" },
};
const NOTE_LABEL = { conflict: "Conflict", default: "Default applied", partial: "Note" } as const;

// Source sentence | compiled rule | status, one row per sentence, then policy-wide notes.
export function ReadBackTable({ rows }: { rows: ReadBackRow[] }) {
  const notApplied = notAppliedCount(rows);
  return (
    <div>
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
        {notApplied
          ? <><strong className="text-red-700 dark:text-red-400">{notApplied} sentence{notApplied > 1 ? "s" : ""} not applied.</strong> Rephrase and compile again; rules can&apos;t be edited by hand.</>
          : "Every sentence was applied or is covered by a platform check."}
      </p>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">How each sentence of the policy text was compiled</caption>
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-950">
            <tr>
              <th scope="col" className="w-[40%] px-3 py-2.5 font-medium">Source sentence</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Compiled rule</th>
              <th scope="col" className="w-[28%] px-3 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((r, i) => (
              <tr key={i} className={cx("align-top", STATUS[r.status].row)}>
                <th scope="row" className="px-3 py-3 font-normal">
                  {r.status === "note"
                    ? <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Policy-wide</span>
                    : <span className="flex gap-2"><span className="text-zinc-400 tabular-nums">{(r.index ?? 0) + 1}</span><span className="text-zinc-900 dark:text-zinc-100">{r.sentence}</span></span>}
                </th>
                <td className="px-3 py-3">
                  <ul className="flex flex-col gap-1">
                    {r.rules.map((x, j) => <li key={j} className="flex gap-1.5"><Icon name="check" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />{x.summary}</li>)}
                    {r.platformChecks.map((p, j) => (
                      <li key={`p${j}`} className="flex gap-1.5 text-zinc-700 dark:text-zinc-300">
                        <Icon name="shield" className="mt-0.5 shrink-0 text-zinc-500" />
                        <span>{p.summary}. <span className="text-zinc-500">Always enforced by the platform (not configurable).</span></span>
                      </li>
                    ))}
                  </ul>
                  {r.status === "not_applied" && <span className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400"><Icon name="x" /> No rule</span>}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-1.5">
                    {r.status !== "note" && <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>}
                    {r.reasonText && <span className="text-zinc-700 dark:text-zinc-300">Not applied: {r.reasonText}.</span>}
                    {r.notes.map((n, j) => (
                      <span key={j} className="flex flex-col items-start gap-1">
                        {r.status === "note" && <Badge tone={n.kind === "conflict" ? "warning" : "neutral"}>{NOTE_LABEL[n.kind]}</Badge>}
                        <span className="text-zinc-700 dark:text-zinc-300">{n.message}</span>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
