import { consoleAuditLog, createChainLog, createMemoryBackend, type AuditInput, type AuditLog } from "./chain";
import type { AuditSink } from "./logger";
import { mongoAuditBackend } from "./mongoBackend";

export type AuditKind = "console" | "memory" | "mongo";

export function auditKind(): AuditKind {
  const v = process.env.AUDIT_LOG || "console";
  if (v !== "console" && v !== "memory" && v !== "mongo") throw new Error(`AUDIT_LOG must be console, memory or mongo; got "${v}"`);
  return v;
}

const g = globalThis as unknown as { _auditLog?: { kind: AuditKind; log: AuditLog } };

// AUDIT_LOG=console (default, no chain) | memory (chain, lost on restart) | mongo (audit_events).
export function getAuditLog(): AuditLog {
  const kind = auditKind();
  if (g._auditLog?.kind !== kind)
    g._auditLog = {
      kind,
      log: kind === "mongo" ? createChainLog("mongo", mongoAuditBackend) : kind === "memory" ? createChainLog("memory", createMemoryBackend().backend) : consoleAuditLog,
    };
  return g._auditLog.log;
}

// Pipeline actions -> audit types. Only coded facts are copied; free text (such
// as check messages that can contain names or dates) never reaches the chain.
const PIPELINE: Record<string, AuditInput["type"]> = {
  pipeline_started: "case_received",
  quality_gate_failed: "quality_gate_failed",
  document_processed: "document_processed",
  checks_completed: "checks_completed",
  decision_proposed: "decision_proposed",
};

export function pipelineAuditSink(log: AuditLog, ctx: { caseId: string; policyId: string; policyVersion: number }): AuditSink {
  return async (e) => {
    const type = PIPELINE[e.action];
    if (!type) return;
    const d = e.detail ?? {};
    const data: AuditInput["data"] = {};
    if (typeof d.decision === "string") data.decision = d.decision as NonNullable<AuditInput["data"]>["decision"];
    if (Array.isArray(d.flagCodes)) data.flagCodes = d.flagCodes.map(String);
    if (typeof d.score === "number") data.riskScore = d.score;
    if (typeof d.problems === "number") data.count = d.problems;
    if (typeof d.fails === "number") data.count = d.fails;
    if (typeof d.docType === "string") data.docType = d.docType as NonNullable<AuditInput["data"]>["docType"];
    const actor = e.actor.startsWith("ai:") ? `ai:${e.actor.slice(3).replace(/[^a-z0-9_-]/g, "")}` : "system";
    await log.append({ type, actor, caseId: ctx.caseId, policyId: ctx.policyId, policyVersion: ctx.policyVersion, data: Object.keys(data).length ? data : undefined });
  };
}
