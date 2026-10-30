import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

// Problems the user should notice. tone="warning" for recoverable issues.
export function ErrorNotice({ title, children, tone = "error", action }: { title?: string; children: ReactNode; tone?: "error" | "warning"; action?: ReactNode }) {
  return (
    <div role="alert" className={cx(
      "flex gap-3 rounded-xl border p-4 text-sm",
      tone === "error"
        ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
        : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
    )}>
      <Icon name="alert" className="mt-0.5 shrink-0 text-base" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-1" : undefined}>{children}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
