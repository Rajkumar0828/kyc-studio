import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">KYC Studio</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Configurable KYC onboarding and compliance review. AI proposes, a human decides.
      </p>
      <Link href="/verify" className="w-fit rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700">
        Open verification playground →
      </Link>
    </main>
  );
}
