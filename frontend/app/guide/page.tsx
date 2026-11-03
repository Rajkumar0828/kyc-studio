import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Badge } from "../components/Badge";
import { ButtonLink } from "../components/Button";
import { Card, CardHeader } from "../components/Card";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { ProviderStatus } from "../components/ProviderStatus";
import { Skeleton } from "../components/Skeleton";
import { SpecimenFiles } from "../components/SpecimenFiles";

export const metadata: Metadata = { title: "Judge guide · KYCite" };

const link = "font-medium text-accent-700 underline underline-offset-2 hover:no-underline dark:text-accent-300";
const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.85em] dark:bg-zinc-800">{children}</code>
);

const STEPS: Array<{ title: string; time: string; body: ReactNode; action?: { href: string; label: string } }> = [
  {
    title: "Unlock the demo",
    time: "15 s",
    body: <>Enter the demo access code in the amber bar at the top of any page and press <strong>Unlock</strong>. The team shares the code with judges; without it, anything that uses AI or saves a policy is refused.</>,
  },
  {
    title: "Compile an example policy",
    time: "45 s",
    body: <>In the Policy Studio, click the example <strong>With an unsupported rule</strong>, give it a name and category, then press <strong>Compile</strong>. Each setting in the preview shows the sentence it came from, and the sanctions sentence is flagged as unsupported instead of being guessed.</>,
    action: { href: "/admin/policies/new", label: "Open the Policy Studio" },
  },
  {
    title: "Publish it",
    time: "20 s",
    body: <>Press <strong>Save draft</strong>, then <strong>Publish</strong>. The policy appears in the list as a new published version, with a link to its customer journey.</>,
    action: { href: "/admin/policies", label: "See all policies" },
  },
  {
    title: "Run the customer journey with a specimen",
    time: "60 s",
    body: (
      <>
        Open the housing-loan journey, agree to the consent text, and upload the files from the <Code>p1-expired</Code> specimen folder (see{" "}
        <a href="#specimens" className={link}>Synthetic specimen files</a> above): <Code>id.png</Code> as the photo ID, <Code>bill.png</Code> as proof of
        address and <Code>selfie.png</Code> as the selfie. Each upload is quality-checked straight away; try <Code>p2-blurry/id.png</Code> to see a retake hint.
      </>
    ),
    action: { href: "/apply/housing-loan", label: "Start the journey" },
  },
  {
    title: "See the result",
    time: "20 s",
    body: (
      <>
        The customer sees a calm outcome and what to fix (here, the expired ID), never a risk score. Repeat with <Code>p1-clean</Code> for approval or{" "}
        <Code>p2-name-mismatch</Code> for manual review. The <Link href="/verify" className={link}>developer tool</Link> shows the full pipeline activity for the same files,
        and <Link href="/admin/audit" className={link}>Audit</Link> shows the events the run appended to the hash chain.
      </>
    ),
  },
];

const META = [
  "Policy compiler: labels each sentence with a rule kind or flags it; code checks every label against the sentence",
  "Customer step wording, written once when a version is published",
  "Document classification and field extraction, with a box showing where each value was read",
  "Comparing values across documents, the reviewer summary and the customer message",
];
const CODE = [
  "Every compiled rule is validated against a strict schema before it is saved",
  "Policy rules: expiry, minimum age, proof-of-address age, required documents",
  "Image quality gate: file type, size, resolution and a sharpness check",
  "Risk scoring and the decision rule: integrity issues go to a person, nothing is auto-rejected",
  "Audit hash chain, demo access code, rate limiting and the daily AI-call cap",
];
const MOCK = [
  "Without a Meta key (mock mode): specimens return their ground truth, other files get placeholder data, and the compiler and wording use fixed patterns and templates",
  "ID registry: a small synthetic list, not a government service",
  "Selfie: quality check only, then discarded; no liveness detection or face matching",
];
const CUT = [
  "Storing cases: documents and extracted details are not kept; only the case id, policy version and decision are recorded",
  "Encrypting case data with Vault (the per-customer key setup exists but holds no customer data)",
  "A reviewer console with evidence boxes",
  "Deleting a customer and the retention purge",
];

const List = ({ items, icon, tone }: { items: string[]; icon: "check" | "info" | "x"; tone: string }) => (
  <ul className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
    {items.map((t) => <li key={t} className="flex gap-2"><Icon name={icon} className={`mt-0.5 shrink-0 ${tone}`} />{t}</li>)}
  </ul>
);

export default function GuidePage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader eyebrow="Judge guide" title="See the whole flow in about three minutes"
        description="Write a policy in plain English, publish it, run a customer through it with a synthetic document, and see what the platform proposes." />

      <div className="mb-6">
        <Suspense fallback={<Skeleton className="h-20" />}>
          <ProviderStatus />
        </Suspense>
      </div>

      <div className="mb-10">
        <SpecimenFiles />
      </div>

      <ol className="flex flex-col gap-4">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <Card className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-600 text-sm font-semibold text-white dark:bg-accent-500 dark:text-zinc-950" aria-hidden>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="sr-only">Step {i + 1}: </span>{s.title} <Badge>{s.time}</Badge>
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{s.body}</p>
                {s.action && (
                  <ButtonLink href={s.action.href} variant="secondary" size="sm" className="mt-4">
                    {s.action.label} <Icon name="arrowRight" />
                  </ButtonLink>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <section aria-labelledby="real-vs-mock" className="mt-14">
        <h2 id="real-vs-mock" className="text-2xl font-semibold tracking-tight">What this version does</h2>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          The panel above says which AI provider this server runs. Every AI result carries a badge saying which provider produced it.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Badge tone="accent">Meta</Badge> Calls Meta&apos;s model when connected</span>} />
            <List items={META} icon="check" tone="text-accent-600 dark:text-accent-300" />
          </Card>
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Badge tone="success">Code</Badge> Always deterministic</span>} />
            <List items={CODE} icon="check" tone="text-emerald-600 dark:text-emerald-400" />
          </Card>
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Badge tone="mock">Stand-in</Badge> Synthetic or simplified</span>} />
            <List items={MOCK} icon="info" tone="text-fuchsia-600 dark:text-fuchsia-400" />
          </Card>
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Badge>Not in this version</Badge> Planned, not built yet</span>} />
            <List items={CUT} icon="x" tone="text-zinc-500" />
          </Card>
        </div>
      </section>
    </main>
  );
}
