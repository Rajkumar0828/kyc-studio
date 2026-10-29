// All services write here. The sink is swappable so scripts can log to the
// console while the app writes to the MongoDB audit_events collection.
export interface AuditEvent {
  caseId: string;
  actor: string; // "system", "ai:meta", "reviewer:<id>", ...
  action: string;
  detail?: Record<string, unknown>;
  at: Date;
}
export type AuditSink = (e: AuditEvent) => Promise<void>;

export const consoleSink: AuditSink = async (e) => console.log(`[audit] ${e.caseId} ${e.actor} ${e.action}`);

export function mongoSink(): AuditSink {
  return async (e) => {
    const { db } = await import("../db/mongo");
    await (await db()).collection("audit_events").insertOne(e);
  };
}
