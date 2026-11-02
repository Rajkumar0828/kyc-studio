import type { Collection, MongoServerError } from "mongodb";
import { getDb } from "../../db/mongo";
import { VersionExists, type PolicyCollections } from "./collectionStore";
import { PolicyDraft, PolicyVersion } from "./types";

// MongoDB adapter for the policy store.
//   policies        immutable versions; unique {policyId, version}
//   policy_drafts   one editable draft per policy; unique {policyId}
//   policy_state    one-way archive flags; unique {policyId}
// Records are validated with the same schemas as the file store on every read.

interface VersionDoc { _id: string; policyId: string; version: number; publishedAt: string; record: PolicyVersion }
interface DraftDoc { _id: string; policyId: string; updatedAt: string; record: PolicyDraft }
interface StateDoc { _id: string; policyId: string; archived: true; archivedAt: string }

let ready: Promise<{ versions: Collection<VersionDoc>; drafts: Collection<DraftDoc>; state: Collection<StateDoc> }> | null = null;

function cols() {
  ready ??= (async () => {
    const db = await getDb();
    const versions = db.collection<VersionDoc>("policies");
    const drafts = db.collection<DraftDoc>("policy_drafts");
    const state = db.collection<StateDoc>("policy_state");
    await versions.createIndex({ policyId: 1, version: 1 }, { unique: true, name: "policy_version_unique" });
    await versions.createIndex({ policyId: 1, publishedAt: -1 }, { name: "policy_published" });
    await drafts.createIndex({ policyId: 1 }, { unique: true, name: "draft_policy_unique" });
    await state.createIndex({ policyId: 1 }, { unique: true, name: "state_policy_unique" });
    return { versions, drafts, state };
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export function mongoCollections(): PolicyCollections {
  return {
    async versions(id) {
      const docs = await (await cols()).versions.find(id ? { policyId: id } : {}, { sort: { policyId: 1, version: 1 } }).toArray();
      return docs.map((d) => PolicyVersion.parse(d.record));
    },
    async insertVersion(v) {
      try {
        await (await cols()).versions.insertOne({ _id: `${v.spec.id}@v${v.spec.version}`, policyId: v.spec.id, version: v.spec.version, publishedAt: v.publishedAt, record: v });
      } catch (e) {
        if ((e as MongoServerError).code === 11000) throw new VersionExists();
        throw e;
      }
    },
    async drafts() {
      return (await (await cols()).drafts.find({}).toArray()).map((d) => PolicyDraft.parse(d.record));
    },
    async getDraft(id) {
      const d = await (await cols()).drafts.findOne({ _id: id });
      return d ? PolicyDraft.parse(d.record) : null;
    },
    async putDraft(d) {
      await (await cols()).drafts.replaceOne({ _id: d.id }, { policyId: d.id, updatedAt: d.updatedAt, record: d }, { upsert: true });
    },
    async deleteDraft(id) {
      await (await cols()).drafts.deleteOne({ _id: id });
    },
    async archivedIds() {
      return (await (await cols()).state.find({ archived: true }, { projection: { policyId: 1 } }).toArray()).map((d) => d.policyId);
    },
    async archive(id, at) {
      await (await cols()).state.updateOne({ _id: id }, { $setOnInsert: { _id: id, policyId: id, archived: true, archivedAt: at } }, { upsert: true });
    },
  };
}
