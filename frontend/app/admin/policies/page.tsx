import type { Metadata } from "next";
import Link from "next/link";
import { PolicyList } from "./PolicyList";

export const metadata: Metadata = { title: "Policies · KYC Studio" };

export default function PoliciesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Policies</h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">Each policy decides which evidence a customer category must provide.</p>
        </div>
        <Link href="/admin/policies/new" className="rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700">New policy</Link>
      </header>
      <PolicyList />
    </main>
  );
}
