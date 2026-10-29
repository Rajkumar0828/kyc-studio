import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DocType } from "../policy/schema";
import { providerName } from "./provider";
import type { Extraction, Field, FieldName } from "./types";

// MOCK MODE ONLY. Recognises uploads that are byte-identical to the synthetic
// eval specimens (files listed in eval/specimens/index.json) so the mock
// provider can return their ground truth instead of filename-based fakes.
// Never active when AI_PROVIDER=meta.

export interface SpecimenMatch {
  caseId: string;
  asOf: string; // the case's reference date, used as the pipeline's "today"
  file: string;
  role: "document" | "selfie";
  documentType?: DocType;
  extraction?: Extraction;
}

const DIR = path.resolve(process.cwd(), "..", "eval", "specimens");
const DATE_FIELDS = new Set<string>(["date_of_birth", "issue_date", "expiry_date"]);

interface IndexFile {
  cases: Array<{ case_id: string; as_of: string; files: Array<{ file: string; role: "document" | "selfie"; document_type?: string; truth?: string }> }>;
}
interface TruthFile {
  fields: Record<FieldName, { found: boolean; value: string; normalized: string; box: Field["box"] }>;
}

const g = globalThis as unknown as { _specimens?: { mtimeMs: number; byHash: Promise<Map<string, SpecimenMatch>> } };
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const inside = (p: string) => !path.relative(DIR, p).startsWith("..");

async function build(): Promise<Map<string, SpecimenMatch>> {
  const index = JSON.parse(await fs.readFile(path.join(DIR, "index.json"), "utf8")) as IndexFile;
  const byHash = new Map<string, SpecimenMatch>();
  for (const c of index.cases) {
    for (const f of c.files) {
      const file = path.resolve(DIR, f.file);
      if (!inside(file)) continue;
      const m: SpecimenMatch = { caseId: c.case_id, asOf: c.as_of, file: f.file, role: f.role };
      if (f.role === "document" && f.truth) {
        const truthPath = path.resolve(DIR, f.truth);
        if (!inside(truthPath)) continue;
        const truth = JSON.parse(await fs.readFile(truthPath, "utf8")) as TruthFile;
        m.documentType = DocType.parse(f.document_type);
        // Dates in ISO, as the real extractor is asked to return them.
        const fields = Object.fromEntries(Object.entries(truth.fields).map(([k, v]) =>
          [k, { found: v.found, value: DATE_FIELDS.has(k) ? v.normalized : v.value, confidence: 0.97, box: v.box }])) as Record<FieldName, Field>;
        m.extraction = { document_type: m.documentType, ...fields };
      }
      byHash.set(sha256(await fs.readFile(file)), m);
    }
  }
  return byHash;
}

async function specimens(): Promise<Map<string, SpecimenMatch>> {
  const stat = await fs.stat(path.join(DIR, "index.json")).catch(() => null);
  if (!stat) return new Map();
  if (!g._specimens || g._specimens.mtimeMs !== stat.mtimeMs) g._specimens = { mtimeMs: stat.mtimeMs, byHash: build() };
  return g._specimens.byHash.catch((e) => {
    console.error("[specimens] could not load eval/specimens/index.json:", e);
    return new Map<string, SpecimenMatch>();
  });
}

export async function matchSpecimen(bytes: Buffer): Promise<SpecimenMatch | null> {
  if (providerName() !== "mock") return null;
  return (await specimens()).get(sha256(bytes)) ?? null;
}

// The reference date of the first recognised specimen, if any (mock mode only).
export async function specimenAsOf(files: Array<{ bytes: Buffer }>): Promise<{ asOf: Date; caseId: string } | null> {
  for (const f of files) {
    const m = await matchSpecimen(f.bytes);
    if (m) return { asOf: new Date(`${m.asOf}T00:00:00Z`), caseId: m.caseId };
  }
  return null;
}
