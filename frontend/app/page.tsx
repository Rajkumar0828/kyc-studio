import Link from "next/link";
import { DEFAULT_POLICIES } from "@/src/lib/policy/defaults";

const button = "w-fit rounded-lg px-5 py-3 font-medium";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">KYC Studio</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Configurable KYC onboarding and compliance review. AI proposes, a human decides.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/policies" className={`${button} bg-blue-600 text-white hover:bg-blue-700`}>Manage policies →</Link>
        <Link href="/verify" className={`${button} border border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900`}>Verification playground</Link>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium text-zinc-500">Try the customer journey</h2>
        <ul className="flex flex-col gap-1">
          {DEFAULT_POLICIES.map((p) => (
            <li key={p.id}><Link href={`/apply/${p.id}`} className="text-blue-600 hover:underline dark:text-blue-400">{p.name}</Link></li>
          ))}
        </ul>
      </div>
    </main>
  );
}
