import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
      <div className="max-w-3xl">
        {eyebrow && <p className="mb-2 text-sm font-medium text-accent-700 dark:text-accent-300">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl dark:text-white">{title}</h1>
        {description && <p className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </header>
  );
}
