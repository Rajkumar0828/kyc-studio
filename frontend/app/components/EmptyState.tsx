import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function EmptyState({ icon = "file", title, description, action }: { icon?: IconName; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-xl text-zinc-500 dark:bg-zinc-800">
        <Icon name={icon} />
      </span>
      <p className="font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
