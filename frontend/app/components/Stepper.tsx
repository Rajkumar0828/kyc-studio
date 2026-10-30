import { cx } from "./cx";
import { Icon } from "./Icon";

// Progress through a fixed sequence. A compact bar on phones, the full list from sm up.
export function Stepper({ steps, current, label = "Progress" }: { steps: string[]; current: number; label?: string }) {
  return (
    <nav aria-label={label}>
      <p className="text-sm font-medium text-zinc-600 sm:hidden dark:text-zinc-400">
        Step {current + 1} of {steps.length}: <span className="text-zinc-900 dark:text-zinc-100">{steps[current]}</span>
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-zinc-200 sm:hidden dark:bg-zinc-800" aria-hidden>
        <div className="h-1.5 rounded-full bg-accent-600 motion-safe:transition-all dark:bg-accent-400" style={{ width: `${((current + 1) / steps.length) * 100}%` }} />
      </div>
      <ol className="hidden items-center gap-2 sm:flex">
        {steps.map((s, i) => {
          const done = i < current, active = i === current;
          return (
            <li key={s} className="flex flex-1 items-center gap-2 last:flex-none" aria-current={active ? "step" : undefined}>
              <span className={cx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold motion-safe:transition-colors",
                done && "bg-accent-600 text-white dark:bg-accent-500 dark:text-zinc-950",
                active && "bg-white text-accent-700 ring-2 ring-accent-600 dark:bg-zinc-900 dark:text-accent-300 dark:ring-accent-400",
                !done && !active && "bg-zinc-100 text-zinc-500 dark:bg-zinc-800",
              )}>
                {done ? <Icon name="check" /> : i + 1}
              </span>
              <span className={cx("text-sm whitespace-nowrap", active ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-500")}>
                {done && <span className="sr-only">Completed: </span>}
                {s}
              </span>
              {i < steps.length - 1 && <span className={cx("h-px min-w-3 flex-1", done ? "bg-accent-600 dark:bg-accent-400" : "bg-zinc-200 dark:bg-zinc-800")} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
