"use client";

import { useEffect, useState } from "react";
import { api, DEMO_ACCESS_EVENT, postJson } from "@/src/lib/client/api";

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
    <div role="note" className="border-b border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-2 text-sm">
        <p>
          <strong>Synthetic demo.</strong> Fictional data only: do not upload real identity documents.
        </p>
        {status && !status.configured && <span>Demo access is not configured on the server.</span>}
        {status?.unlocked && (
          <span className="flex items-center gap-2">
            Demo access unlocked
            <button onClick={lock} className="underline underline-offset-2">Lock</button>
          </span>
        )}
        {status?.configured && !status.unlocked && (
          <form onSubmit={unlock} className="flex items-center gap-2">
            <label htmlFor="demo-code">Demo access code</label>
            <input id="demo-code" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off"
              className="w-36 rounded border border-amber-400 bg-white px-2 py-0.5 text-zinc-900 dark:border-amber-700 dark:bg-zinc-900 dark:text-zinc-100" />
            <button className="rounded bg-amber-900 px-2.5 py-0.5 font-medium text-amber-50 dark:bg-amber-200 dark:text-amber-950">Unlock</button>
            {error && <span className="text-red-700 dark:text-red-300">{error}</span>}
          </form>
        )}
      </div>
    </div>
  );
}
