import type { DocType } from "../policy/schema";
import { matchSpecimen } from "./specimens";
import type { AiProvider, Extraction, Field, FieldName, InputFile } from "./types";

// Deterministic stand-in for the model. Filename hints drive the scenario so
// every pipeline branch can be demoed without credits:
//   passport / license / national_id / utility / statement -> document type
//   "expired" -> past expiry, "mismatch" -> different name, "minor" -> under 18,
//   "unknownperson" -> not in the mock registry, "blurry" -> low confidence
// Exception: uploads identical to an eval specimen return that specimen's
// ground truth (see specimens.ts). Without a filename hint, the upload slot's
// declared type is used.
const f = (value: string, confidence = 0.96, box: Field["box"] = [100, 100, 600, 160]): Field =>
  ({ found: value !== "", value, confidence, box: value ? box : [0, 0, 0, 0] });

function typeFromName(name: string): DocType {
  const n = name.toLowerCase();
  if (n.includes("passport")) return "passport";
  if (n.includes("license") || n.includes("licence")) return "drivers_license";
  if (n.includes("national")) return "national_id";
  if (n.includes("utility")) return "utility_bill";
  if (n.includes("statement")) return "bank_statement";
  return "unknown";
}

const daysAgo = (d: number) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

export const mockProvider: AiProvider = {
  name: "mock",

  async classifyDocument(file) {
    const specimen = await matchSpecimen(file.bytes);
    if (specimen?.documentType) return { docType: specimen.documentType, confidence: 0.99 };
    const docType = typeFromName(file.filename);
    if (docType === "unknown" && file.declaredType) return { docType: file.declaredType, confidence: 0.8 };
    return { docType, confidence: docType === "unknown" ? 0.3 : 0.97 };
  },

  async extractFields(file: InputFile, docType: DocType): Promise<Extraction> {
    const specimen = await matchSpecimen(file.bytes);
    if (specimen?.extraction) return { ...specimen.extraction, document_type: docType };
    const n = file.filename.toLowerCase();
    const conf = n.includes("blurry") ? 0.55 : 0.96;
    const name = n.includes("mismatch") ? "Jonathan Mercer" : n.includes("unknownperson") ? "Priya Raman" : "Emily Carter";
    const dob = n.includes("minor") ? daysAgo(16 * 365) : "1991-04-12";
    const identity = docType === "passport" || docType === "drivers_license" || docType === "national_id";
    const docNumber = n.includes("unknownperson") ? "X0000000" : { passport: "P8234519", drivers_license: "D5520193", national_id: "N7781042" }[docType as "passport"] ?? "";
    const fields: Record<FieldName, Field> = {
      full_name: f(name, conf, [120, 210, 640, 250]),
      date_of_birth: f(identity ? dob : "", conf, [120, 300, 420, 335]),
      document_number: f(docNumber, conf, [620, 90, 900, 125]),
      expiry_date: f(identity ? (n.includes("expired") ? "2024-02-01" : "2031-08-30") : "", conf, [120, 380, 420, 415]),
      issue_date: f(identity ? "2021-08-30" : daysAgo(n.includes("old") ? 200 : 20), conf, [620, 380, 900, 415]),
      address: f(docType === "passport" ? "" : "42 Willow Lane, Springfield, IL 62704", conf, [120, 450, 800, 520]),
    };
    return { document_type: docType, ...fields };
  },

  async compareValues(field, a, b) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
    const [x, y] = [norm(a), norm(b)];
    const shared = x.filter((t) => y.includes(t)).length;
    const same = shared >= Math.min(x.length, y.length) - (field === "address" ? 1 : 0) && shared > 0;
    return { same, confidence: same ? 0.8 : 0.85, reason: same ? `${field} values are equivalent apart from formatting` : `${field} values refer to different entities` };
  },

  async summarizeForReviewer({ score, reasons, decision }) {
    return reasons.length
      ? `Risk score ${score} (${decision}). Key concerns: ${reasons.join("; ")}.`
      : `Risk score ${score} (${decision}). All checks passed with no concerns.`;
  },

  async customerGuidance(issues) {
    return issues.length ? `We need a little more from you: ${issues.join(" ")}` : "Thanks, everything we need has been received.";
  },
};
