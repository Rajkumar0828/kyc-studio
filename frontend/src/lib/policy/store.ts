import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_POLICIES } from "./defaults";
import { CompiledRules, POLICY_ID, PolicySpec } from "./schema";

// Policy storage until MongoDB: the code seeds (read-only, published v1) plus
// Studio-created records in frontend/data/policies.json (gitignored).
// One draft per policy id at most; publishing turns it into an immutable version.

const FILE = path.join(process.cwd(), "data", "policies.json");

export class PolicyStoreError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
  }
}

async function readFileRecords(): Promise<PolicySpec[]> {
  const raw = await fs.readFile(FILE, "utf8").catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? "[]" : Promise.reject(e)));
  return z.array(PolicySpec).parse(JSON.parse(raw));
}

async function writeFileRecords(records: PolicySpec[]) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(records, null, 2) + "\n");
  await fs.rename(tmp, FILE);
}

// Serialises read-modify-write cycles within this process.
const g = globalThis as unknown as { _policyLock?: Promise<unknown> };
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = (g._policyLock ?? Promise.resolve()).then(fn, fn);
  g._policyLock = run.catch(() => {});
  return run;
}

const isSeed = (id: string) => DEFAULT_POLICIES.some((p) => p.id === id);

export async function listPolicies(): Promise<PolicySpec[]> {
  return [...DEFAULT_POLICIES, ...(await readFileRecords())];
}

export async function getVersions(id: string): Promise<PolicySpec[]> {
  return (await listPolicies()).filter((p) => p.id === id).sort((a, b) => a.version - b.version);
}

export async function latestPublished(id: string): Promise<PolicySpec | undefined> {
  return (await getVersions(id)).filter((p) => p.status === "published").at(-1);
}

export async function getDraft(id: string): Promise<PolicySpec | undefined> {
  return (await getVersions(id)).find((p) => p.status === "draft");
}

export const slugify = (name: string) =>
  name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

export const DraftInput = z.object({
  id: z.string().regex(POLICY_ID).optional(), // set when editing an existing policy
  name: z.string().trim().min(1).max(80),
  customerCategory: z.string().trim().min(1).max(40),
  sourceText: z.string().max(4000),
  consentText: z.string().trim().min(1).max(2000),
  rules: CompiledRules,
}).strict();
export type DraftInput = z.infer<typeof DraftInput>;

export function saveDraft(input: DraftInput): Promise<PolicySpec> {
  return locked(async () => {
    const id = input.id ?? slugify(input.name);
    if (!POLICY_ID.test(id)) throw new PolicyStoreError("The name must contain at least two letters or digits.", 400);
    if (isSeed(id)) throw new PolicyStoreError("Seed policies are read-only; choose a different name.", 409);

    const records = await readFileRecords();
    const versions = records.filter((p) => p.id === id);
    const published = versions.filter((p) => p.status === "published");
    if (!input.id && published.length) throw new PolicyStoreError(`A policy named "${id}" already exists; open it to create a new version.`, 409);

    const draft = versions.find((p) => p.status === "draft");
    const now = new Date().toISOString();
    const record = PolicySpec.parse({
      ...input.rules,
      id,
      version: (published.at(-1)?.version ?? 0) + 1,
      status: "draft",
      name: input.name,
      customerCategory: input.customerCategory,
      sourceText: input.sourceText,
      consentText: input.consentText,
      createdAt: draft?.createdAt ?? now,
      updatedAt: now,
    });
    await writeFileRecords([...records.filter((p) => p !== draft), record]);
    return record;
  });
}

export function publish(id: string): Promise<PolicySpec> {
  return locked(async () => {
    if (isSeed(id)) throw new PolicyStoreError("Seed policies are already published.", 409);
    const records = await readFileRecords();
    const draft = records.find((p) => p.id === id && p.status === "draft");
    if (!draft) throw new PolicyStoreError("There is no draft to publish.", 404);
    const record = PolicySpec.parse({ ...draft, status: "published", updatedAt: new Date().toISOString() });
    await writeFileRecords(records.map((p) => (p === draft ? record : p)));
    return record;
  });
}
