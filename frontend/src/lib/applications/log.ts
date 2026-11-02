import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// Every evaluated application records the policy id AND version it was
// evaluated against. Ids, version, decision, provider and timestamps only: no
// names, extracted fields or images (encrypted PII arrives with MongoDB).

export const ApplicationRecord = z.object({
  caseId: z.string().max(80),
  channel: z.enum(["apply", "verify"]),
  policyId: z.string().max(48),
  policyVersion: z.number().int().positive(),
  decision: z.enum(["auto_approve", "manual_review", "request_info"]),
  provider: z.string().max(40),
  consentAt: z.iso.datetime().nullable(),
  submittedAt: z.iso.datetime(),
  decidedAt: z.iso.datetime(),
}).strict();
export type ApplicationRecord = z.infer<typeof ApplicationRecord>;

export interface ApplicationLog {
  record(r: ApplicationRecord): Promise<void>;
  recent(limit?: number): Promise<ApplicationRecord[]>;
}

// JSON Lines file (gitignored data/), appended one record per line.
export function createFileApplicationLog(file: string): ApplicationLog {
  return {
    async record(r) {
      const line = JSON.stringify(ApplicationRecord.parse(r));
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.appendFile(file, line + "\n");
    },
    async recent(limit = 50) {
      const text = await fs.readFile(file, "utf8").catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? "" : Promise.reject(e)));
      return text.split(/\r?\n/).filter(Boolean).slice(-limit).map((l) => ApplicationRecord.parse(JSON.parse(l)));
    },
  };
}

const g = globalThis as unknown as { _applicationLog?: ApplicationLog };

// APPLICATION_LOG=file (default); MongoDB arrives in a later task.
export function getApplicationLog(): ApplicationLog {
  const kind = process.env.APPLICATION_LOG || "file";
  if (kind !== "file") throw new Error(`APPLICATION_LOG=${kind} is not available yet; use file.`);
  return (g._applicationLog ??= createFileApplicationLog(path.join(process.cwd(), "data", "applications.jsonl")));
}
