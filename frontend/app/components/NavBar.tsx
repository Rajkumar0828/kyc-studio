"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";
import { Icon } from "./Icon";

const LINKS = [
  { href: "/guide", label: "Judge guide" },
  { href: "/admin/policies/new", label: "Policy Studio" },
  { href: "/admin/policies", label: "Policies" },
  { href: "/apply/housing-loan", label: "Customer journey", match: "/apply" },
  { href: "/verify", label: "Developer tool" },
];

export function NavBar() {
  const path = usePathname();
  const active = (l: (typeof LINKS)[number]) => (l.match ? path.startsWith(l.match) : path === l.href);
  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 py-3 font-semibold text-zinc-950 dark:text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-600 text-white dark:bg-accent-500 dark:text-zinc-950">
            <Icon name="shield" />
          </span>
          KYC Studio
        </Link>
        <nav aria-label="Main" className="-mx-2 flex min-w-0 flex-1 overflow-x-auto">
          <ul className="flex items-center gap-1 px-2 text-sm">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} aria-current={active(l) ? "page" : undefined}
                  className={cx(
                    "block rounded-md px-3 py-2 whitespace-nowrap motion-safe:transition-colors",
                    active(l) ? "bg-accent-50 font-medium text-accent-700 dark:bg-accent-950 dark:text-accent-300" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
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
