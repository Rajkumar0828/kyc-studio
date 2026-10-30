import { cx } from "./cx";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("rounded-lg bg-zinc-200 motion-safe:animate-pulse dark:bg-zinc-800", className)} />;
}

// Labelled loading placeholder: screen readers hear the label, sighted users see skeleton lines.
export function Loading({ label = "Loading", lines = 3 }: { label?: string; lines?: number }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cx("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />)}
    </div>
  );
}
