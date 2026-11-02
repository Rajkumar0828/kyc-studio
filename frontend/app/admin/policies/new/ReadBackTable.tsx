import { Badge, type Tone } from "@/app/components/Badge";
import { cx } from "@/app/components/cx";
import { Icon } from "@/app/components/Icon";
import type { ReadBackRow } from "@/src/lib/policy/readBack";

const WARNING: Record<ReadBackRow["warnings"][number]["kind"], { tone: Tone; label: string }> = {
  unsupported: { tone: "danger", label: "Not supported" },
  conflict: { tone: "warning", label: "Conflict" },
  default: { tone: "neutral", label: "Default applied" },
};

const ROW: Record<ReadBackRow["status"], string> = {
  mapped: "",
  partial: "bg-amber-50/70 dark:bg-amber-950/30",
  unsupported: "bg-red-50 dark:bg-red-950/40",
  note: "bg-zinc-50 dark:bg-zinc-950",
};

// Source sentence | compiled rule | warnings, one row per sentence, then policy-wide notes.
export function ReadBackTable({ rows }: { rows: ReadBackRow[] }) {
  const unsupported = rows.filter((r) => r.status === "unsupported" || r.status === "partial").length;
  return (
    <div>
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
        {unsupported
          ? <><strong className="text-red-700 dark:text-red-400">{unsupported} sentence{unsupported > 1 ? "s" : ""} not fully applied.</strong> Rephrase and compile again; rules can&apos;t be edited by hand.</>
          : "Every sentence was applied."}
      </p>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">How each sentence of the policy text was compiled</caption>
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-950">
            <tr>
              <th scope="col" className="w-[42%] px-3 py-2.5 font-medium">Source sentence</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Compiled rule</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Warnings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((r, i) => (
              <tr key={i} className={cx("align-top", ROW[r.status])}>
                <th scope="row" className="px-3 py-3 font-normal">
                  {r.status === "note"
                    ? <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Policy-wide</span>
                    : <span className="flex gap-2"><span className="text-zinc-400 tabular-nums">{(r.index ?? 0) + 1}</span><span className="text-zinc-900 dark:text-zinc-100">{r.sentence}</span></span>}
                </th>
                <td className="px-3 py-3">
                  {r.rules.length ? (
                    <ul className="flex flex-col gap-1">
                      {r.rules.map((x, j) => <li key={j} className="flex gap-1.5"><Icon name="check" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />{x.summary}</li>)}
                    </ul>
                  ) : r.status === "note" ? null : (
                    <span className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400"><Icon name="x" /> No rule</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <ul className="flex flex-col gap-1.5">
                    {r.warnings.map((w, j) => (
                      <li key={j} className="flex flex-col items-start gap-1">
                        <Badge tone={WARNING[w.kind].tone}>{WARNING[w.kind].label}</Badge>
                        <span className="text-zinc-700 dark:text-zinc-300">{w.message}</span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
