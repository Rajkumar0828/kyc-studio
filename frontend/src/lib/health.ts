import { auditKind, type AuditKind } from "./audit";
import { aiCallLogKind, type AiCallLogKind } from "./ai/recordAiCall";
import { providerName } from "./ai/provider";
import { getDb, pingMongo, type MongoStatus } from "./db/mongo";
import { policyStoreKind, type PolicyStoreKind } from "./policy/store";
import { vaultHealth, type VaultHealth } from "./vault/transit";

// What /api/health reports: service status, which store each switch uses, and
// warnings for inconsistent combinations. Never secrets or the Vault cluster id.
// Readiness information only: warnings make the status "degraded", never a
// failure. Container healthchecks use /api/health/live, which checks liveness only.

export interface Stores {
  policy: PolicyStoreKind;
  applications: "file" | "mongo";
  aiCalls: AiCallLogKind;
  audit: AuditKind;
}

export type HealthStatus = "ok" | "degraded";
export const healthStatus = (warnings: string[]): HealthStatus => (warnings.length ? "degraded" : "ok");

export interface HealthReport {
  status: HealthStatus;
  mongo: MongoStatus;
  vault: { status: VaultHealth["status"]; tokenValid: boolean | null; restarted: string | null };
  stores: Stores;
  provider: string;
  warnings: string[];
}

export function applicationsKind(): "file" | "mongo" {
  const v = process.env.APPLICATION_LOG || "file";
  if (v !== "file" && v !== "mongo") throw new Error(`APPLICATION_LOG must be file or mongo; got "${v}"`);
  return v;
}

export function currentStores(): Stores {
  return { policy: policyStoreKind(), applications: applicationsKind(), aiCalls: aiCallLogKind(), audit: auditKind() };
}

export const RESTART_WARNING = "Vault restarted: previous keys lost. Cases encrypted before the restart are unreadable; run `npm run seed` to repair the demo cases.";

// Pure, so it can be tested offline.
export function configWarnings(stores: Stores, mongo: MongoStatus, vault: VaultHealth, restarted: string | null): string[] {
  const w: string[] = [];
  const onMongo = (Object.entries(stores) as Array<[keyof Stores, string]>).filter(([, v]) => v === "mongo").map(([k]) => k);
  if (onMongo.length && mongo !== "up")
    w.push(`MongoDB is ${mongo.replace("_", " ")}, but ${onMongo.join(", ")} ${onMongo.length > 1 ? "are" : "is"} set to mongo.`);
  if (stores.applications === "mongo" && stores.audit !== "mongo")
    w.push(`Cases are stored in MongoDB but the audit log is not (AUDIT_LOG=${stores.audit}), so case events are not in the tamper-evident chain.`);
  if (stores.applications === "mongo" && vault.status !== "up")
    w.push(`Cases are stored in MongoDB but Vault is ${vault.status.replace("_", " ")}: new applications can't be stored and personal data can't be revealed.`);
  if (vault.status === "up" && vault.tokenValid === false)
    w.push("The Vault token (VAULT_TOKEN) is invalid or expired. Check that it equals VAULT_APP_TOKEN and that vault-init is running.");
  if (stores.audit === "memory") w.push("The audit chain is kept in memory (AUDIT_LOG=memory) and is lost when the server restarts.");
  if (restarted) w.push(restarted);
  return w;
}

// Remembers the Vault cluster id in Mongo. A dev-mode Vault gets a new id on
// every restart, which means every key created before it is gone. The warning
// stays until `npm run seed` repairs the demo cases (it clears `lostAt`).
async function vaultRestartNotice(clusterId: string | null): Promise<string | null> {
  if (!clusterId) return null;
  try {
    const col = (await getDb()).collection<{ _id: string; clusterId: string; since: string; lostAt?: string }>("system_state");
    const doc = await col.findOne({ _id: "vault" });
    const now = new Date().toISOString();
    if (!doc) {
      await col.insertOne({ _id: "vault", clusterId, since: now });
      return null;
    }
    if (doc.clusterId !== clusterId) {
      await col.updateOne({ _id: "vault" }, { $set: { clusterId, since: now, lostAt: now } });
      return RESTART_WARNING;
    }
    return doc.lostAt ? RESTART_WARNING : null;
  } catch {
    return null; // Mongo unavailable: reported separately
  }
}

export async function healthReport(): Promise<HealthReport> {
  const stores = currentStores();
  const [mongo, vault] = await Promise.all([pingMongo(), vaultHealth()]);
  const restarted = mongo === "up" && vault.status === "up" ? await vaultRestartNotice(vault.clusterId) : null;
  const warnings = configWarnings(stores, mongo, vault, restarted);
  return {
    status: healthStatus(warnings),
    mongo,
    vault: { status: vault.status, tokenValid: vault.tokenValid, restarted },
    stores,
    provider: providerName(),
    warnings,
  };
}

// For pages and routes that need MongoDB (and, for cases, Vault).
export function storageRequirement(feature: "cases" | "audit" | "usage"): string | null {
  const s = currentStores();
  if (feature === "cases" && s.applications !== "mongo") return "Case records require MongoDB and Vault: set APPLICATION_LOG=mongo (with MONGODB_URI, VAULT_ADDR and VAULT_TOKEN).";
  if (feature === "audit" && s.audit === "console") return "The audit chain requires MongoDB: set AUDIT_LOG=mongo (with MONGODB_URI), or AUDIT_LOG=memory for a throwaway chain.";
  if (feature === "usage" && s.aiCalls !== "mongo") return "The usage panel requires MongoDB: set AI_CALL_LOG=mongo (with MONGODB_URI).";
  return null;
}
