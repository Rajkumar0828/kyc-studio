import path from "node:path";
import { createFileStore } from "./fileStore";
import type { PolicyStore } from "./types";

// The one place that picks a PolicyStore implementation. POLICY_STORE=file
// (default); MongoDB arrives in a later task.
const g = globalThis as unknown as { _policyStore?: PolicyStore };

export function getPolicyStore(): PolicyStore {
  const kind = process.env.POLICY_STORE || "file";
  if (kind !== "file") throw new Error(`POLICY_STORE=${kind} is not available yet; use file.`);
  return (g._policyStore ??= createFileStore(path.join(process.cwd(), "data", "policies.json")));
}

export * from "./types";
