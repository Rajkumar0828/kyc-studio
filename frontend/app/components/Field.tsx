import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

export const inputClass = cx(
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-xs placeholder:text-zinc-400",
  "focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30",
  "disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-900",
);

// Label + control + optional hint. Pass aria-describedby={`${id}-hint`} on the control when using a hint.
export function Field({ id, label, hint, children }: { id: string; label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export const TextInput = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx(inputClass, className)} {...p} />;
export const TextArea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cx(inputClass, "leading-relaxed", className)} {...p} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cx(inputClass, "w-auto", className)} {...p} />;
