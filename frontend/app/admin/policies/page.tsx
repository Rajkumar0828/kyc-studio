import type { Metadata } from "next";
import { ButtonLink } from "@/app/components/Button";
import { PageHeader } from "@/app/components/PageHeader";
import { PolicyList } from "./PolicyList";

export const metadata: Metadata = { title: "Policies · KYC Studio" };

export default function PoliciesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader eyebrow="Policies" title="Verification policies"
        description="Each policy decides which evidence a customer category must provide. Published versions are immutable; edits become a new version."
        actions={<ButtonLink href="/admin/policies/new">New policy</ButtonLink>} />
      <PolicyList />
    </main>
  );
}
