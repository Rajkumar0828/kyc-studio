import type { Metadata } from "next";
import { PageHeader } from "@/app/components/PageHeader";
import { UsagePanel } from "./UsagePanel";

export const metadata: Metadata = { title: "AI usage · KYC Studio" };

export default function UsagePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader eyebrow="Admin" title="AI usage"
        description="Every Meta API call the platform made, from the ai_calls log: step, model, effort, tokens and latency. No prompts, documents or personal data are recorded." />
      <UsagePanel />
    </main>
  );
}
