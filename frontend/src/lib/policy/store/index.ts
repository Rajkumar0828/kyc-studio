import path from "node:path";
import { createCollectionStore } from "./collectionStore";
import { createFileStore } from "./fileStore";
import { mongoCollections } from "./mongoCollections";
import type { PolicyStore } from "./types";

// The one place that picks a PolicyStore implementation:
// POLICY_STORE=file (default, data/policies.json) | mongo (policies, policy_drafts, policy_state).
export type PolicyStoreKind = "file" | "mongo";

export function policyStoreKind(): PolicyStoreKind {
  const kind = process.env.POLICY_STORE || "file";
  if (kind !== "file" && kind !== "mongo") throw new Error(`POLICY_STORE must be file or mongo; got "${kind}"`);
  return kind;
}

const g = globalThis as unknown as { _policyStore?: { kind: PolicyStoreKind; store: PolicyStore } };

export function getPolicyStore(): PolicyStore {
  const kind = policyStoreKind();
  if (g._policyStore?.kind !== kind)
    g._policyStore = { kind, store: kind === "mongo" ? createCollectionStore(mongoCollections()) : createFileStore(path.join(process.cwd(), "data", "policies.json")) };
  return g._policyStore.store;
}

export * from "./types";
