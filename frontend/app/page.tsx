import { Suspense } from "react";
import { Badge } from "./components/Badge";
import { ButtonLink } from "./components/Button";
import { Card } from "./components/Card";
import { Icon, type IconName } from "./components/Icon";
import { ProviderStatus } from "./components/ProviderStatus";
import { Skeleton } from "./components/Skeleton";

const HOW: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: "pen",
    title: "Write the policy",
    body: "An admin describes the rules in plain English. Each sentence is mapped to one of nine supported rule kinds; anything that can't be mapped is flagged, not guessed.",
  },
  {
    icon: "user",
    title: "Customer applies",
    body: "A guided journey built from that policy: consent, document upload with instant quality checks, and a selfie.",
  },
  {
    icon: "clipboard",
    title: "AI proposes, with evidence",
    body: "Each finding records the document and field it relies on, and code computes a transparent risk score. In mock mode the readings come from synthetic ground truth.",
  },
  {
    icon: "scale",
    title: "A human decides",
    body: "Clear cases can be auto-approved within the policy's threshold. Nothing is rejected automatically: integrity issues go to a person.",
  },
];

// Only what the code does today; planned items are marked "Coming".
const TRUST: Array<{ icon: IconName; title: string; body: string; live: boolean }> = [
  { icon: "file", title: "Synthetic data only", body: "Fictional specimen documents with ground truth, and a demo notice on every page.", live: true },
  { icon: "scale", title: "Human final decision", body: "The pipeline never rejects on its own; integrity flags always route to manual review. A reviewer console is coming.", live: true },
  { icon: "clipboard", title: "Audit events", body: "Every pipeline step and consent emits an audit event. In this demo they go to the server log; database storage is coming.", live: true },
  { icon: "lock", title: "Access controls", body: "A demo access code, a per-IP rate limit and a daily cap on AI calls guard every route that uses AI or changes policies.", live: true },
  { icon: "database", title: "Encrypted per-customer storage", body: "A Vault Transit helper with one key per customer is built and tested. The app does not store uploads yet.", live: false },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <section className="py-16 sm:py-24">
        <Badge tone="accent">KYC Studio · synthetic demo</Badge>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl dark:text-white">
          Changing KYC rules shouldn&apos;t mean rebuilding onboarding.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          Describe KYC rules in plain English; the platform builds and tests the verification flow.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/admin/policies/new" size="lg">
            Open the Policy Studio <Icon name="arrowRight" />
          </ButtonLink>
          <ButtonLink href="/apply/housing-loan" size="lg" variant="secondary">Try a customer journey</ButtonLink>
          <ButtonLink href="/guide" size="lg" variant="ghost"><Icon name="book" /> Judge guide</ButtonLink>
        </div>
        <div className="mt-10 max-w-2xl">
          <Suspense fallback={<Skeleton className="h-20" />}>
            <ProviderStatus />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="how" className="border-t border-zinc-200 py-16 dark:border-zinc-800">
        <h2 id="how" className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-lg text-accent-700 dark:bg-accent-950 dark:text-accent-300">
                    <Icon name={s.icon} />
                  </span>
                  <span className="text-sm font-medium text-zinc-500">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{s.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="trust" className="border-t border-zinc-200 py-16 dark:border-zinc-800">
        <h2 id="trust" className="text-2xl font-semibold tracking-tight">Built to be trusted</h2>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">What this demo does today, and what is still to come.</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST.map((t) => (
            <li key={t.title} className="flex gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <Icon name={t.icon} className="mt-0.5 shrink-0 text-lg text-zinc-500" />
              <div>
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {t.title}
                  <Badge tone={t.live ? "success" : "neutral"}>{t.live ? "Live" : "Coming"}</Badge>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{t.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
