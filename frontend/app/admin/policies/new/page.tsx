import type { Metadata } from "next";
import { PolicyStudio } from "./PolicyStudio";

export const metadata: Metadata = { title: "Policy Studio · KYC Studio" };

// ?id=<policy> opens an existing policy's draft (or starts its next version).
export default async function PolicyStudioPage(props: PageProps<"/admin/policies/new">) {
  const { id } = await props.searchParams;
  const editId = typeof id === "string" ? id : undefined;
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Policy Studio</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Describe the policy in plain English. It is compiled into the fixed set of rules the pipeline enforces; anything else is flagged.
        </p>
      </header>
      <PolicyStudio key={editId ?? "new"} editId={editId} />
    </main>
  );
}
