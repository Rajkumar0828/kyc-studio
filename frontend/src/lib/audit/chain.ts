import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../canonicalJson";
import { DocType, POLICY_ID } from "../policy/schema";

// Tamper-evident audit log. Each event's hash = sha256(previous hash + canonical
// JSON of the event), so changing, removing or reordering any stored event breaks
// every later link. Events hold ids, types and coded facts only; the schema below
// rejects anything else, so personal data cannot enter the chain.
//
// Concurrent writers: an event's position is its seq, and the store guarantees seq
// is unique (a unique index in Mongo). A writer reads the newest event, builds
// seq+1 on top of it and inserts; if another writer won that seq, the insert fails
// and the writer re-reads and retries, with jitter, for up to about 2 seconds. No
// transactions are needed. An optional in-process lock cuts down on retries.

export const AUDIT_TYPES = [
  "chain_reset",
  "policy_draft_saved", "policy_published", "policy_archived",
  "case_received", "consent_recorded", "quality_gate_failed", "document_processed", "checks_completed", "decision_proposed",
  "case_stored", "pii_revealed", "review_decided",
  "customer_erased", "case_purged", "seed_run",
] as const;
export type AuditType = (typeof AUDIT_TYPES)[number];

export const ACTOR = /^(system|customer|seed|officer:(demo|admin)|ai:[a-z][a-z0-9_-]{0,30})$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const AuditData = z.object({
  decision: z.enum(["auto_approve", "manual_review", "request_info", "approved", "rejected", "more_info_requested"]).optional(),
  flagCodes: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,40}$/)).max(30).optional(),
  riskScore: z.number().int().min(0).max(100).optional(),
  count: z.number().int().min(0).max(1_000_000).optional(),
  version: z.number().int().positive().optional(),
  docType: DocType.optional(),
}).strict();

export const AuditInput = z.object({
  type: z.enum(AUDIT_TYPES),
  actor: z.string().regex(ACTOR),
  caseId: z.string().regex(UUID).optional(),
  policyId: z.string().regex(POLICY_ID).optional(),
  policyVersion: z.number().int().positive().optional(),
  data: AuditData.optional(),
}).strict();
export type AuditInput = z.infer<typeof AuditInput>;

export interface AuditEvent extends AuditInput {
  seq: number;
  at: string;
  prevHash: string;
  hash: string;
}

export const GENESIS = "0".repeat(64);

export function hashEvent(e: Omit<AuditEvent, "hash">): string {
  const { seq, at, type, actor, caseId, policyId, policyVersion, data, prevHash } = e;
  return createHash("sha256").update(prevHash + canonicalJson({ seq, at, type, actor, caseId, policyId, policyVersion, data, prevHash })).digest("hex");
}

// Raised by a backend when the seq it was asked to insert is already taken.
export class DuplicateSeq extends Error {}
export class AuditAppendFailed extends Error {
  constructor() {
    super("The audit event could not be appended (the chain was busy for too long).");
  }
}

export interface AuditBackend {
  last(): Promise<AuditEvent | null>;
  insert(e: AuditEvent): Promise<void>; // throws DuplicateSeq if e.seq exists
  ascending(afterSeq: number, limit: number): Promise<AuditEvent[]>;
  recent(limit: number): Promise<AuditEvent[]>;
}

export interface VerifyResult {
  ok: boolean;
  count: number;
  lastSeq: number;
  lastHash: string;
  firstBroken: { seq: number; reason: "seq_gap" | "prev_hash_mismatch" | "hash_mismatch" | "invalid_event"; expected: string; actual: string } | null;
}

export interface AuditLog {
  kind: "console" | "memory" | "mongo";
  append(input: AuditInput): Promise<AuditEvent | null>; // null for the console log (no chain)
  verify(): Promise<VerifyResult | null>;
  recent(limit?: number): Promise<AuditEvent[]>;
  stats(): { appends: number; retries: number };
}

export interface ChainOptions {
  lock?: boolean; // serialise appends within this process (default true)
  retryForMs?: number; // keep retrying conflicts for this long (default 2000)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createChainLog(kind: "memory" | "mongo", backend: AuditBackend, opts: ChainOptions = {}): AuditLog {
  const useLock = opts.lock !== false;
  const retryForMs = opts.retryForMs ?? 2000;
  let queue: Promise<unknown> = Promise.resolve();
  const counters = { appends: 0, retries: 0 };

  async function appendOnce(input: AuditInput): Promise<AuditEvent> {
    const deadline = Date.now() + retryForMs;
    for (;;) {
      const last = await backend.last();
      const base = { ...input, seq: (last?.seq ?? 0) + 1, at: new Date().toISOString(), prevHash: last?.hash ?? GENESIS };
      const event: AuditEvent = { ...base, hash: hashEvent(base) };
      try {
        await backend.insert(event);
        counters.appends++;
        return event;
      } catch (e) {
        if (!(e instanceof DuplicateSeq)) throw e;
        counters.retries++;
        if (Date.now() >= deadline) throw new AuditAppendFailed();
        await sleep(5 + Math.random() * 35); // jitter so competing writers spread out
      }
    }
  }

  return {
    kind,
    append(raw) {
      const parsed = AuditInput.safeParse(raw);
      if (!parsed.success) return Promise.reject(parsed.error);
      const input = parsed.data;
      if (!useLock) return appendOnce(input);
      const run = queue.then(() => appendOnce(input), () => appendOnce(input));
      queue = run.catch(() => {});
      return run;
    },
    async verify() {
      let prevHash = GENESIS, expectedSeq = 1, count = 0;
      for (let after = 0; ; ) {
        const page = await backend.ascending(after, 500);
        if (!page.length) break;
        for (const e of page) {
          const broken = (reason: NonNullable<VerifyResult["firstBroken"]>["reason"], expected: string, actual: string): VerifyResult =>
            ({ ok: false, count, lastSeq: expectedSeq - 1, lastHash: prevHash, firstBroken: { seq: e.seq, reason, expected, actual } });
          if (e.seq !== expectedSeq) return broken("seq_gap", String(expectedSeq), String(e.seq));
          const { seq, at, prevHash: p, hash, ...input } = e;
          if (!AuditInput.safeParse(input).success) return broken("invalid_event", "valid event", "invalid fields");
          if (p !== prevHash) return broken("prev_hash_mismatch", prevHash, p);
          const recomputed = hashEvent({ ...input, seq, at, prevHash: p });
          if (recomputed !== hash) return broken("hash_mismatch", recomputed, hash);
          prevHash = hash;
          expectedSeq++;
          count++;
        }
        after = page.at(-1)!.seq;
      }
      return { ok: true, count, lastSeq: expectedSeq - 1, lastHash: prevHash, firstBroken: null };
    },
    recent: (limit = 50) => backend.recent(limit),
    stats: () => ({ ...counters }),
  };
}

// In-memory backend. last() yields to the event loop, like a database round trip,
// so concurrent appends really race (tests rely on this).
export function createMemoryBackend() {
  const events: AuditEvent[] = [];
  const tick = () => new Promise((r) => setImmediate(r));
  const backend: AuditBackend = {
    async last() {
      await tick();
      return events.reduce<AuditEvent | null>((a, e) => (!a || e.seq > a.seq ? e : a), null);
    },
    async insert(e) {
      await tick();
      if (events.some((x) => x.seq === e.seq)) throw new DuplicateSeq();
      events.push(structuredClone(e));
    },
    ascending: async (after, limit) => events.filter((e) => e.seq > after).sort((a, b) => a.seq - b.seq).slice(0, limit).map((e) => structuredClone(e)),
    recent: async (limit) => [...events].sort((a, b) => b.seq - a.seq).slice(0, limit).map((e) => structuredClone(e)),
  };
  return { backend, events };
}

// AUDIT_LOG=console: no chain, one content-free line per event (local development).
export const consoleAuditLog: AuditLog = {
  kind: "console",
  async append(raw) {
    const e = AuditInput.parse(raw);
    console.log(`[audit] ${e.type}${e.caseId ? ` case=${e.caseId}` : ""}${e.policyId ? ` policy=${e.policyId}` : ""} actor=${e.actor}`);
    return null;
  },
  verify: async () => null,
  recent: async () => [],
  stats: () => ({ appends: 0, retries: 0 }),
};
