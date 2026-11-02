import type { Collection, MongoServerError } from "mongodb";
import { getDb } from "../db/mongo";
import { DuplicateSeq, type AuditBackend, type AuditEvent } from "./chain";

// audit_events collection. The unique index on seq is what keeps concurrent
// writers from forking the chain; indexes are created once per process.
let ready: Promise<Collection<AuditEvent>> | null = null;

async function collection(): Promise<Collection<AuditEvent>> {
  ready ??= (async () => {
    const col = (await getDb()).collection<AuditEvent>("audit_events");
    await col.createIndex({ seq: 1 }, { unique: true, name: "seq_unique" });
    await col.createIndex({ caseId: 1, seq: 1 }, { name: "case_seq", partialFilterExpression: { caseId: { $exists: true } } });
    await col.createIndex({ type: 1, at: -1 }, { name: "type_at" });
    return col;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

const strip = ({ _id, ...e }: AuditEvent & { _id?: unknown }) => (void _id, e as AuditEvent);

export const mongoAuditBackend: AuditBackend = {
  async last() {
    const e = await (await collection()).find({}, { sort: { seq: -1 }, limit: 1 }).next();
    return e ? strip(e) : null;
  },
  async insert(e) {
    try {
      await (await collection()).insertOne({ ...e });
    } catch (err) {
      if ((err as MongoServerError).code === 11000) throw new DuplicateSeq();
      throw err;
    }
  },
  async ascending(after, limit) {
    return (await (await collection()).find({ seq: { $gt: after } }, { sort: { seq: 1 }, limit }).toArray()).map(strip);
  },
  async recent(limit) {
    return (await (await collection()).find({}, { sort: { seq: -1 }, limit }).toArray()).map(strip);
  },
};
