import type { Metadata } from "next";
import { PageHeader } from "@/app/components/PageHeader";
import { AuditPanel } from "./AuditPanel";

export const metadata: Metadata = { title: "Audit chain · KYC Studio" };

export default function AuditPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader eyebrow="Admin" title="Audit chain"
        description="Every state change appends an event whose hash covers the previous one, so any edit, deletion or reordering breaks the chain. Events hold ids, types and codes only, never personal data." />
      <AuditPanel />
    </main>
  );
}
