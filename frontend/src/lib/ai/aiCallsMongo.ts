import type { Collection } from "mongodb";
import { getDb } from "../db/mongo";
import { AiCallRecord } from "./recordAiCall";

// ai_calls: one document per Meta API call (metadata only, see AiCallRecord).
let ready: Promise<Collection<AiCallRecord>> | null = null;

function collection() {
  ready ??= (async () => {
    const col = (await getDb()).collection<AiCallRecord>("ai_calls");
    await col.createIndex({ at: -1 }, { name: "at" });
    await col.createIndex({ step: 1, at: -1 }, { name: "step_at" });
    await col.createIndex({ caseId: 1 }, { name: "case", sparse: true });
    await col.createIndex({ policyId: 1 }, { name: "policy", sparse: true });
    return col;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export async function insertAiCall(r: AiCallRecord) {
  await (await collection()).insertOne({ ...AiCallRecord.parse(r) });
}

// Calls recorded in [from, to) for one source; ISO strings in UTC compare correctly.
export async function countAiCalls(filter: { source: "app" | "eval"; at: { $gte: string; $lt: string } }): Promise<number> {
  return (await collection()).countDocuments(filter);
}

// The most recent calls (newest first), capped so the usage page stays fast.
export async function recentAiCalls(limit = 5000): Promise<AiCallRecord[]> {
  const docs = await (await collection()).find({}, { sort: { at: -1 }, limit, projection: { _id: 0 } }).toArray();
  return docs.map((d) => AiCallRecord.parse(d));
}
