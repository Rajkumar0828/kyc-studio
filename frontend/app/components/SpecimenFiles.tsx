import { Badge, type Tone } from "./Badge";
import { Icon } from "./Icon";

// Where judges get test files, and what each scenario should produce. The files
// are synthetic (fictional people, generated images) and live in the repository.
export const SPECIMENS_URL = "https://github.com/Rajkumar0828/kyc-studio/tree/main/eval/specimens";

const SCENARIOS: Array<{ id: string; shows: string; decision: string; label: string; tone: Tone }> = [
  { id: "p1-clean", shows: "Everything in order", decision: "auto_approve", label: "Auto-approve", tone: "success" },
  { id: "p1-expired", shows: "The ID card has expired", decision: "request_info", label: "Request more information", tone: "warning" },
  { id: "p2-name-mismatch", shows: "The bill is in another person's name", decision: "manual_review", label: "Manual review", tone: "info" },
  { id: "p2-blurry", shows: "Blurry photos, stopped by the quality check", decision: "request_info", label: "Request more information", tone: "warning" },
];

const Code = ({ children }: { children: string }) => (
  <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">{children}</code>
);

export function SpecimenFiles({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby="specimens" className="rounded-2xl border border-brand-200 bg-brand-50/60 p-5 sm:p-6 dark:border-brand-900 dark:bg-brand-950/40">
      <H id="specimens" className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        <Icon name="file" className="text-brand-700 dark:text-brand-300" /> Synthetic specimen files
      </H>
      <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        Fictional people and generated documents, made for this demo. Download a case folder and upload its{" "}
        <Code>id.png</Code> as the photo ID, <Code>bill.png</Code> as proof of address and <Code>selfie.png</Code> as the selfie.
      </p>
      <a href={SPECIMENS_URL} target="_blank" rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 underline underline-offset-2 hover:no-underline dark:text-brand-300">
        Get the synthetic specimen files <Icon name="arrowRight" />
        <span className="sr-only">(opens GitHub in a new tab)</span>
      </a>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <caption className="sr-only">Specimen cases, what each shows and the expected decision</caption>
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr><th scope="col" className="py-2 pr-4 font-medium">Case folder</th><th scope="col" className="py-2 pr-4 font-medium">What it shows</th><th scope="col" className="py-2 font-medium">Expected decision</th></tr>
          </thead>
          <tbody className="divide-y divide-brand-200/70 dark:divide-brand-900">
            {SCENARIOS.map((s) => (
              <tr key={s.id}>
                <th scope="row" className="py-2.5 pr-4 font-normal"><Code>{s.id}</Code></th>
                <td className="py-2.5 pr-4 text-zinc-700 dark:text-zinc-300">{s.shows}</td>
                <td className="py-2.5"><Badge tone={s.tone}>{s.label}</Badge> <span className="ml-1 font-mono text-xs text-zinc-500">{s.decision}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        Expected decisions assume the specimens&apos; evaluation date, 2026-11-01. With Meta, dates are checked against today, so an older bill can also be flagged as too old.
      </p>
    </section>
  );
}
