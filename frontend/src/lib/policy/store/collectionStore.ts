import { POLICY_ID } from "../schema";
import { isSeed, SEED_VERSIONS } from "./seeds";
import {
  PolicyDraft, PolicyStoreError, PolicyVersion, slugify, specFromDraft,
  type DraftInput, type PolicyStore, type PolicySummary, type PublishExtras,
} from "./types";

// PolicyStore over three collections: immutable versions, editable drafts and
// one-way archive flags. The storage adapter is tiny so the same logic runs on
// MongoDB in production and on an in-memory adapter in offline tests.

export class VersionExists extends Error {}

export interface PolicyCollections {
  versions(id?: string): Promise<PolicyVersion[]>; // stored (non-seed) versions
  insertVersion(v: PolicyVersion): Promise<void>; // must throw VersionExists for a duplicate (id, version)
  drafts(): Promise<PolicyDraft[]>;
  getDraft(id: string): Promise<PolicyDraft | null>;
  putDraft(d: PolicyDraft): Promise<void>;
  deleteDraft(id: string): Promise<void>;
  archivedIds(): Promise<string[]>;
  archive(id: string, at: string): Promise<void>;
}

export function createCollectionStore(c: PolicyCollections): PolicyStore {
  const versionsOf = async (id: string) =>
    [...SEED_VERSIONS.filter((v) => v.spec.id === id), ...(isSeed(id) ? [] : await c.versions(id))].sort((a, b) => a.spec.version - b.spec.version);
  const isArchived = async (id: string) => (await c.archivedIds()).includes(id);

  return {
    async list() {
      const [stored, drafts, archived] = await Promise.all([c.versions(), c.drafts(), c.archivedIds()]);
      const all = [...SEED_VERSIONS, ...stored];
      const ids = [...new Set([...all.map((v) => v.spec.id), ...drafts.map((d) => d.id)])];
      return ids.map((id): PolicySummary => {
        const latest = all.filter((v) => v.spec.id === id).sort((a, b) => a.spec.version - b.spec.version).at(-1);
        const draft = drafts.find((d) => d.id === id);
        const src = draft ?? latest!.spec;
        const rules = draft ? draft.rules : latest!.spec;
        return {
          id,
          name: src.name,
          customerCategory: src.customerCategory,
          latestVersion: latest?.spec.version ?? null,
          publishedAt: latest?.publishedAt ?? null,
          retentionDays: rules.retentionDays,
          documents: rules.requiredDocuments.map((d) => d.label),
          draftUpdatedAt: draft?.updatedAt ?? null,
          archived: archived.includes(id),
          seed: isSeed(id),
        };
      });
    },

    async get(id) {
      if (await isArchived(id)) return null;
      return (await versionsOf(id)).at(-1) ?? null;
    },

    async getVersion(id, version) {
      return (await versionsOf(id)).find((v) => v.spec.version === version) ?? null;
    },

    async versions(id) {
      return (await versionsOf(id)).map((v) => v.spec.version);
    },

    getDraft: (id) => c.getDraft(id),
    isArchived,

    async saveDraft(input: DraftInput) {
      const id = input.id ?? slugify(input.name);
      if (!POLICY_ID.test(id)) throw new PolicyStoreError("The name must contain at least two letters or digits.", 400);
      if (isSeed(id)) throw new PolicyStoreError("Seed policies are read-only; choose a different name.", 409);
      if (await isArchived(id)) throw new PolicyStoreError("This policy is archived and can no longer be changed.", 409);
      if (!input.id && (await c.versions(id)).length) throw new PolicyStoreError(`A policy named "${id}" already exists; open it to create a new version.`, 409);
      const existing = await c.getDraft(id);
      const now = new Date().toISOString();
      const draft = PolicyDraft.parse({
        id, name: input.name, customerCategory: input.customerCategory, sourceText: input.sourceText, consentText: input.consentText,
        rules: input.rules, compile: input.compile, createdAt: existing?.createdAt ?? now, updatedAt: now,
      });
      await c.putDraft(draft);
      return draft;
    },

    async publish(id: string, extras: PublishExtras) {
      if (isSeed(id)) throw new PolicyStoreError("Seed policies are already published.", 409);
      if (await isArchived(id)) throw new PolicyStoreError("This policy is archived.", 409);
      const draft = await c.getDraft(id);
      if (!draft) throw new PolicyStoreError("There is no draft to publish.", 404);
      const latest = Math.max(0, ...(await c.versions(id)).map((v) => v.spec.version));
      if (extras.version !== latest + 1 || extras.draftUpdatedAt !== draft.updatedAt)
        throw new PolicyStoreError("The policy changed while publishing; reload and try again.", 409);
      const now = new Date().toISOString();
      const version = PolicyVersion.parse({ spec: specFromDraft(draft, latest + 1, now), guide: extras.guide, compile: draft.compile, publishedAt: now });
      try {
        await c.insertVersion(version); // append only; a concurrent publish of the same number fails here
      } catch (e) {
        if (e instanceof VersionExists) throw new PolicyStoreError("Another publish created this version first; reload and try again.", 409);
        throw e;
      }
      await c.deleteDraft(id);
      return version;
    },

    async archive(id) {
      if (isSeed(id)) throw new PolicyStoreError("Seed policies can't be archived.", 409);
      if (!(await c.versions(id)).length && !(await c.getDraft(id))) throw new PolicyStoreError("Unknown policy.", 404);
      if (await isArchived(id)) return;
      await c.archive(id, new Date().toISOString());
      await c.deleteDraft(id);
    },
  };
}

// In-memory adapter (offline tests, and AI-free demos without a database).
export function memoryCollections(): PolicyCollections {
  const versions: PolicyVersion[] = [];
  const drafts = new Map<string, PolicyDraft>();
  const archived = new Set<string>();
  const clone = <T,>(v: T): T => structuredClone(v);
  return {
    versions: async (id) => versions.filter((v) => !id || v.spec.id === id).map(clone),
    async insertVersion(v) {
      if (versions.some((x) => x.spec.id === v.spec.id && x.spec.version === v.spec.version)) throw new VersionExists();
      versions.push(clone(v));
    },
    drafts: async () => [...drafts.values()].map(clone),
    getDraft: async (id) => (drafts.has(id) ? clone(drafts.get(id)!) : null),
    putDraft: async (d) => void drafts.set(d.id, clone(d)),
    deleteDraft: async (id) => void drafts.delete(id),
    archivedIds: async () => [...archived],
    archive: async (id) => void archived.add(id),
  };
}
