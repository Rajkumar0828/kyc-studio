import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "success";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent-600 text-white shadow-sm hover:bg-accent-700 dark:bg-accent-500 dark:text-zinc-950 dark:hover:bg-accent-400",
  secondary: "border border-zinc-300 bg-white text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  ghost: "text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export const buttonClass = (variant: Variant = "primary", size: Size = "md", className?: string) =>
  cx(
    "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap",
    "motion-safe:transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT[variant], SIZE[size], className,
  );

type Common = { variant?: Variant; size?: Size };

export function Button({ variant, size, className, type = "button", ...props }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: Common & ComponentProps<typeof Link>) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
