import { connection } from "next/server";
import { providerName } from "@/src/lib/ai/provider";
import { MODEL } from "@/src/lib/meta/client";
import { Badge } from "./Badge";
import { Icon } from "./Icon";

// Says which AI provider this server is running, read at request time.
// Only names a Meta model in meta mode, where it is actually called.
export async function ProviderStatus() {
  await connection();
  let mode: "mock" | "meta" | "invalid";
  try {
    mode = providerName();
  } catch {
    mode = "invalid";
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <Icon name="sparkle" className="mt-0.5 shrink-0 text-base text-zinc-500" />
      <div>
        <p className="flex flex-wrap items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100">
          AI provider on this server
          {mode === "mock" && <Badge tone="mock">mock</Badge>}
          {mode === "meta" && <Badge tone="accent">Meta · {MODEL}</Badge>}
          {mode === "invalid" && <Badge tone="danger">misconfigured</Badge>}
        </p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {mode === "mock" && "Mock mode: no model is called. Document reading, name comparison and customer wording come from deterministic stand-ins."}
          {mode === "meta" && `Document classification, extraction, comparison and summaries call ${MODEL}. The policy compiler and customer guide are not available in this mode yet.`}
          {mode === "invalid" && "AI_PROVIDER must be mock or meta."}
        </p>
      </div>
    </div>
  );
}
