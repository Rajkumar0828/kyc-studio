import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { templateSteps } from "../../ai/mockCustomerGuide";
import { isSeed, SEED_VERSIONS } from "./seeds";
import { POLICY_ID, PolicySpec } from "../schema";
import {
  PolicyDraft, PolicyStoreError, PolicyVersion, slugify, specFromDraft,
  type DraftInput, type PolicyStore, type PolicySummary, type PublishExtras,
} from "./types";

// JSON-file implementation of PolicyStore (until MongoDB). The only module
// that touches the policy file. Seeds live in code as read-only version 1.

const FileShape = z.object({
  versions: z.array(PolicyVersion),
  drafts: z.array(PolicyDraft),
  archived: z.array(z.string().regex(POLICY_ID)),
}).strict();
type FileShape = z.infer<typeof FileShape>;


// Files written before versions became immutable held a flat array of PolicySpec records.
function migrate(raw: unknown): FileShape {
  if (!Array.isArray(raw)) return FileShape.parse(raw);
  const old = z.array(PolicySpec).parse(raw);
  return {
    versions: old.filter((p) => p.status === "published").map((spec) => ({
      spec,
      guide: { steps: templateSteps(spec), source: "template_fallback", provider: "template", model: null, effort: null, note: "Published before guides were stored", generatedAt: spec.updatedAt },
      compile: null,
      publishedAt: spec.updatedAt,
    })),
    drafts: old.filter((p) => p.status === "draft").map((p) => ({
      id: p.id, name: p.name, customerCategory: p.customerCategory, sourceText: p.sourceText, consentText: p.consentText,
      rules: {
        requiredDocuments: p.requiredDocuments, minAge: p.minAge, proofOfAddressMaxAgeDays: p.proofOfAddressMaxAgeDays,
        selfieRequired: p.selfieRequired, authorityLookup: p.authorityLookup, autoApproveEnabled: p.autoApproveEnabled,
        autoApproveMaxScore: p.autoApproveMaxScore, retentionDays: p.retentionDays, provenance: p.provenance,
      },
      compile: null, createdAt: p.createdAt, updatedAt: p.updatedAt,
    })),
    archived: [],
  };
}

export function createFileStore(file: string): PolicyStore {
  async function read(): Promise<FileShape> {
    const text = await fs.readFile(file, "utf8").catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? null : Promise.reject(e)));
    return text === null ? { versions: [], drafts: [], archived: [] } : migrate(JSON.parse(text));
  }
  async function write(data: FileShape) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(FileShape.parse(data), null, 2) + "\n");
    await fs.rename(tmp, file);
  }
  // Serialises read-modify-write cycles within this process.
  let lock: Promise<unknown> = Promise.resolve();
  const locked = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = lock.then(fn, fn);
    lock = run.catch(() => {});
    return run;
  };
  const allVersions = async () => [...SEED_VERSIONS, ...(await read()).versions];
  const versionsOf = async (id: string) => (await allVersions()).filter((v) => v.spec.id === id).sort((a, b) => a.spec.version - b.spec.version);

  return {
    async list() {
      const data = await read();
      const ids = [...new Set([...SEED_VERSIONS, ...data.versions].map((v) => v.spec.id).concat(data.drafts.map((d) => d.id)))];
      return Promise.all(ids.map(async (id): Promise<PolicySummary> => {
        const latest = (await versionsOf(id)).at(-1);
        const draft = data.drafts.find((d) => d.id === id);
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
          archived: data.archived.includes(id),
          seed: isSeed(id),
        };
      }));
    },

    async get(id) {
      if ((await read()).archived.includes(id)) return null;
      return (await versionsOf(id)).at(-1) ?? null;
    },

    async getVersion(id, version) {
      return (await versionsOf(id)).find((v) => v.spec.version === version) ?? null;
    },

    async versions(id) {
      return (await versionsOf(id)).map((v) => v.spec.version);
    },

    async getDraft(id) {
      return (await read()).drafts.find((d) => d.id === id) ?? null;
    },

    async isArchived(id) {
      return (await read()).archived.includes(id);
    },

    saveDraft(input: DraftInput) {
      return locked(async () => {
        const id = input.id ?? slugify(input.name);
        if (!POLICY_ID.test(id)) throw new PolicyStoreError("The name must contain at least two letters or digits.", 400);
        if (isSeed(id)) throw new PolicyStoreError("Seed policies are read-only; choose a different name.", 409);
        const data = await read();
        if (data.archived.includes(id)) throw new PolicyStoreError("This policy is archived and can no longer be changed.", 409);
        const hasVersions = data.versions.some((v) => v.spec.id === id);
        if (!input.id && hasVersions) throw new PolicyStoreError(`A policy named "${id}" already exists; open it to create a new version.`, 409);
        const existing = data.drafts.find((d) => d.id === id);
        const now = new Date().toISOString();
        const draft = PolicyDraft.parse({
          id, name: input.name, customerCategory: input.customerCategory, sourceText: input.sourceText, consentText: input.consentText,
          rules: input.rules, compile: input.compile, createdAt: existing?.createdAt ?? now, updatedAt: now,
        });
        await write({ ...data, drafts: [...data.drafts.filter((d) => d.id !== id), draft] });
        return draft;
      });
    },

    publish(id: string, extras: PublishExtras) {
      return locked(async () => {
        if (isSeed(id)) throw new PolicyStoreError("Seed policies are already published.", 409);
        const data = await read();
        if (data.archived.includes(id)) throw new PolicyStoreError("This policy is archived.", 409);
        const draft = data.drafts.find((d) => d.id === id);
        if (!draft) throw new PolicyStoreError("There is no draft to publish.", 404);
        const latest = Math.max(0, ...data.versions.filter((v) => v.spec.id === id).map((v) => v.spec.version));
        if (extras.version !== latest + 1 || extras.draftUpdatedAt !== draft.updatedAt)
          throw new PolicyStoreError("The policy changed while publishing; reload and try again.", 409);
        const now = new Date().toISOString();
        const version = PolicyVersion.parse({ spec: specFromDraft(draft, latest + 1, now), guide: extras.guide, compile: draft.compile, publishedAt: now });
        // Append only: existing versions are never rewritten.
        await write({ ...data, versions: [...data.versions, version], drafts: data.drafts.filter((d) => d.id !== id) });
        return version;
      });
    },

    archive(id) {
      return locked(async () => {
        if (isSeed(id)) throw new PolicyStoreError("Seed policies can't be archived.", 409);
        const data = await read();
        if (!data.versions.some((v) => v.spec.id === id) && !data.drafts.some((d) => d.id === id)) throw new PolicyStoreError("Unknown policy.", 404);
        if (data.archived.includes(id)) return;
        await write({ ...data, archived: [...data.archived, id], drafts: data.drafts.filter((d) => d.id !== id) });
      });
    },
  };
}
