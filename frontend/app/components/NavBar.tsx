"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/guide", label: "Judge guide" },
  { href: "/admin/policies/new", label: "Policy Studio" },
  { href: "/admin/policies", label: "Policies" },
  { href: "/apply/housing-loan", label: "Customer journey", match: "/apply" },
  { href: "/verify", label: "Developer tool" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/usage", label: "AI usage" },
];

export function NavBar() {
  const path = usePathname();
  const active = (l: (typeof LINKS)[number]) => (l.match ? path.startsWith(l.match) : path === l.href);
  return (
    <header className="border-b border-white/10 bg-navy-950 text-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 py-3">
          <Logo />
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-semibold tracking-tight">KYCite</span>
            <span className="hidden text-[11px] text-slate-300 xl:block">AI proposes, a human decides, and every check cites its source.</span>
          </span>
        </Link>
        <nav aria-label="Main" className="-mx-2 flex min-w-0 flex-1 overflow-x-auto">
          <ul className="flex items-center gap-1 px-2 text-sm">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} aria-current={active(l) ? "page" : undefined}
                  className={cx(
                    "block rounded-md px-3 py-2 whitespace-nowrap motion-safe:transition-colors",
                    active(l) ? "bg-white/10 font-medium text-white shadow-[inset_0_-2px_0_var(--color-brand-400)]" : "text-slate-300 hover:bg-white/5 hover:text-white",
                  )}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
