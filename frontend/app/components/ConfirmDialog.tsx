"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";

// Modal confirmation on the native <dialog> element: focus moves into it, Esc
// cancels, and the page behind is inert while it is open.
export function ConfirmDialog({ open, title, children, confirmLabel, busy = false, tone = "primary", onConfirm, onCancel }: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  tone?: "primary" | "success";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }} aria-labelledby="confirm-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-zinc-950/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="p-6">
        <h2 id="confirm-title" className="text-lg font-semibold">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={tone} onClick={onConfirm} disabled={busy} autoFocus>{busy ? "Working…" : confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}
