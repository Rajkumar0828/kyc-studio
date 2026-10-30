"use client";

import { useEffect, useState } from "react";
import { api, DEMO_ACCESS_EVENT, postJson } from "@/src/lib/client/api";
import { Icon } from "./Icon";

// Shown on every page. Also where the shared demo access code is entered.
export function DemoBanner() {
  const [status, setStatus] = useState<{ configured: boolean; unlocked: boolean } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ configured: boolean; unlocked: boolean }>("/api/demo-access").then(setStatus).catch(() => setStatus(null));
  }, []);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await postJson("/api/demo-access", { code });
      setStatus({ configured: true, unlocked: true });
      setCode("");
      window.dispatchEvent(new Event(DEMO_ACCESS_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function lock() {
    await api("/api/demo-access", { method: "DELETE" });
    setStatus({ configured: true, unlocked: false });
  }

  return (
    <div role="region" aria-label="Demo notice" className="border-b border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 text-sm sm:px-6">
        <p className="flex items-center gap-2">
          <Icon name="info" className="shrink-0" />
          <span><strong className="font-semibold">Synthetic demo.</strong> Fictional data only. Do not upload real identity documents.</span>
        </p>
        {status && !status.configured && <span>Demo access is not configured on the server.</span>}
        {status?.unlocked && (
          <span className="flex items-center gap-2">
            <Icon name="check" className="text-emerald-700 dark:text-emerald-400" /> Demo access unlocked
            <button onClick={lock} className="rounded underline underline-offset-2 hover:no-underline">Lock</button>
          </span>
        )}
        {status?.configured && !status.unlocked && (
          <form onSubmit={unlock} className="flex flex-wrap items-center gap-2">
            <label htmlFor="demo-code" className="flex items-center gap-1.5"><Icon name="lock" /> Demo access code</label>
            <input id="demo-code" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off"
              aria-describedby={error ? "demo-code-error" : undefined}
              className="w-36 rounded-md border border-amber-300 bg-white px-2 py-1 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-amber-800 dark:bg-zinc-900 dark:text-zinc-100" />
            <button type="submit" className="rounded-md bg-amber-900 px-3 py-1 font-medium text-amber-50 hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100">Unlock</button>
            {error && <span id="demo-code-error" role="alert" className="text-red-700 dark:text-red-300">{error}</span>}
          </form>
        )}
      </div>
    </div>
  );
}
