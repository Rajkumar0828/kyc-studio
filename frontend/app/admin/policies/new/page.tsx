import type { Metadata } from "next";
import { PageHeader } from "@/app/components/PageHeader";
import { PolicyStudio } from "./PolicyStudio";

export const metadata: Metadata = { title: "Policy Studio · KYC Studio" };

// ?id=<policy> opens an existing policy's draft (or starts its next version).
export default async function PolicyStudioPage(props: PageProps<"/admin/policies/new">) {
  const { id } = await props.searchParams;
  const editId = typeof id === "string" ? id : undefined;
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader eyebrow={editId ? `Editing ${editId}` : "Policy Studio"} title={editId ? "Edit policy" : "Write a policy"}
        description="Describe the policy in plain English. It is compiled into the fixed set of rules the pipeline enforces, and every setting shows the sentence it came from." />
      <PolicyStudio key={editId ?? "new"} editId={editId} />
    </main>
  );
}
