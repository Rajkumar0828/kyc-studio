import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export const cardClass = "rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

export function Card({ className, padded = true, ...props }: { padded?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(cardClass, padded && "p-5 sm:p-6", className)} {...props} />;
}

// Title row for a card. Pick the heading level that fits the page outline.
export function CardHeader({ title, description, actions, level = 2 }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; level?: 2 | 3 }) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <H className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</H>
        {description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
