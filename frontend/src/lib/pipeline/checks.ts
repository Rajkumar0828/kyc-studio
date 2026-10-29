import type { AiProvider } from "../ai/types";
import { addressExists, lookupDocument } from "../authority/registry";
import { ADDRESS_DOCS, IDENTITY_DOCS, type PolicySpec } from "../policy/schema";
import { qualityProblems } from "./quality";
import type { Check, ProcessedDoc } from "./types";
import type { InputFile } from "../ai/types";

const LOW_CONFIDENCE = 0.7;
// Midnight UTC of the given instant, so date-only comparisons are stable.
const dayOf = (d: Date) => new Date(d.toISOString().slice(0, 10));
const parseDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? new Date(s) : null);
const ageOn = (dob: Date, d: Date) => d.getUTCFullYear() - dob.getUTCFullYear() - (d < new Date(Date.UTC(d.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate())) ? 1 : 0);
const DOC_NUMBER = /^[A-Z0-9]{6,12}$/;

// Step 5: deterministic rules from the policy. asOf is "today" for expiry, age and
// bill-age rules; evals pass a fixed reference date, production uses the real date.
export function ruleChecks(docs: ProcessedDoc[], policy: PolicySpec, asOf: Date = new Date()): Check[] {
  const out: Check[] = [];
  const today = dayOf(asOf);
  const add = (c: Omit<Check, "step">) => out.push({ step: "rules", ...c });

  for (const req of policy.requiredDocuments) {
    if (!docs.some((d) => req.anyOf.some((t) => t === d.docType)))
      add({ code: "missing_document", status: "fail", category: "customer_fixable", message: `Missing required document: ${req.label}.` });
  }

  for (const d of docs) {
    const x = d.extraction;
    if (!x) continue;
    const ev = (field: keyof typeof x) => ({ docIndex: d.index, field: String(field), box: (x[field] as { box: number[] }).box });

    for (const [k, v] of Object.entries(x)) {
      if (typeof v === "object" && v.found && v.confidence < LOW_CONFIDENCE)
        add({ code: "low_confidence", status: "warn", category: "customer_fixable", message: `${d.filename}: ${k} was hard to read.`, evidence: ev(k as keyof typeof x) });
    }

    if (IDENTITY_DOCS.includes(d.docType)) {
      const exp = parseDate(x.expiry_date.value);
      if (!exp) add({ code: "expiry_unreadable", status: "warn", category: "customer_fixable", message: `${d.filename}: expiry date missing or not a valid date.`, evidence: ev("expiry_date") });
      else if (exp < today) add({ code: "document_expired", status: "fail", category: "customer_fixable", message: `${d.filename}: document expired on ${x.expiry_date.value}.`, evidence: ev("expiry_date") });

      const dob = parseDate(x.date_of_birth.value);
      if (!dob) add({ code: "dob_unreadable", status: "warn", category: "customer_fixable", message: `${d.filename}: date of birth missing or invalid.`, evidence: ev("date_of_birth") });
      else if (ageOn(dob, today) < policy.minAge) add({ code: "under_min_age", status: "fail", category: "integrity", message: `Applicant is under the minimum age of ${policy.minAge}.`, evidence: ev("date_of_birth") });

      if (!DOC_NUMBER.test(x.document_number.value)) add({ code: "doc_number_format", status: "warn", category: "integrity", message: `${d.filename}: document number has an unexpected format.`, evidence: ev("document_number") });
    }

    if (ADDRESS_DOCS.includes(d.docType)) {
      const issued = parseDate(x.issue_date.value);
      const maxAge = policy.proofOfAddressMaxAgeDays * 864e5;
      if (!issued) add({ code: "poa_date_unreadable", status: "warn", category: "customer_fixable", message: `${d.filename}: issue date could not be read.`, evidence: ev("issue_date") });
      else if (today.getTime() - issued.getTime() > maxAge) add({ code: "poa_too_old", status: "fail", category: "customer_fixable", message: `${d.filename}: proof of address is older than ${policy.proofOfAddressMaxAgeDays} days.`, evidence: ev("issue_date") });
      if (!x.address.found) add({ code: "poa_no_address", status: "fail", category: "customer_fixable", message: `${d.filename}: no address found on proof of address.`, evidence: ev("address") });
    }
  }
  if (!out.length) out.push({ step: "rules", code: "rules_ok", status: "pass", category: "info", message: "All policy rules passed." });
  return out;
}

// Step 6: names, dates and addresses must agree across documents. Code first; AI only for non-identical pairs.
export async function crossDocChecks(docs: ProcessedDoc[], ai: AiProvider): Promise<Check[]> {
  const out: Check[] = [];
  const withX = docs.filter((d) => d.extraction);
  const norm = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  for (const field of ["full_name", "date_of_birth", "address"] as const) {
    const vals = withX.filter((d) => d.extraction![field].found).map((d) => ({ d, v: d.extraction![field].value }));
    for (let i = 1; i < vals.length; i++) {
      const [a, b] = [vals[0], vals[i]];
      if (norm(a.v) === norm(b.v)) continue;
      if (field === "date_of_birth") {
        out.push({ step: "cross_doc", code: "dob_mismatch", status: "fail", category: "integrity", message: `Date of birth differs between ${a.d.filename} and ${b.d.filename}.`, evidence: { field, values: [a.v, b.v] } });
        continue;
      }
      const cmp = await ai.compareValues(field, a.v, b.v);
      if (!cmp.same)
        out.push({ step: "cross_doc", code: `${field}_mismatch`, status: "fail", category: "integrity", message: `${field.replace("_", " ")} differs between ${a.d.filename} and ${b.d.filename}: ${cmp.reason}.`, evidence: { field, values: [a.v, b.v] } });
      else
        out.push({ step: "cross_doc", code: `${field}_variant`, status: "pass", category: "info", message: `${field.replace("_", " ")} matches with formatting differences: ${cmp.reason}.`, evidence: { field, values: [a.v, b.v] } });
    }
  }
  if (!out.some((c) => c.status === "fail")) out.push({ step: "cross_doc", code: "consistent", status: "pass", category: "info", message: "Details are consistent across documents." });
  return out;
}

// Step 7: synthetic authority registries.
export function authorityChecks(docs: ProcessedDoc[]): Check[] {
  const out: Check[] = [];
  for (const d of docs) {
    const x = d.extraction;
    if (!x) continue;
    if (IDENTITY_DOCS.includes(d.docType)) {
      const rec = lookupDocument(x.document_number.value);
      if (!rec) out.push({ step: "authority", code: "id_not_found", status: "fail", category: "integrity", message: `${d.filename}: document number not found in the ID registry.` });
      else if (rec.status !== "valid") out.push({ step: "authority", code: `id_${rec.status}`, status: "fail", category: "integrity", message: `${d.filename}: registry marks this document as ${rec.status.replace("_", " ")}.` });
      else if (rec.fullName.toLowerCase() !== x.full_name.value.toLowerCase() || rec.dateOfBirth !== x.date_of_birth.value)
        out.push({ step: "authority", code: "id_registry_mismatch", status: "fail", category: "integrity", message: `${d.filename}: name or date of birth does not match the registry record.`, evidence: { values: [x.full_name.value, rec.fullName] } });
      else out.push({ step: "authority", code: "id_verified", status: "pass", category: "info", message: `${d.filename}: verified against the ID registry.` });
    }
    if (ADDRESS_DOCS.includes(d.docType) && x.address.found && !addressExists(x.address.value))
      out.push({ step: "authority", code: "address_unknown", status: "warn", category: "integrity", message: `${d.filename}: address not found in the address database.` });
  }
  return out;
}

// Step 8: selfie presence and quality. Liveness/face match is a stretch goal.
export async function selfieChecks(selfie: InputFile | undefined, policy: PolicySpec): Promise<Check[]> {
  if (!policy.selfieRequired) return [];
  if (!selfie) return [{ step: "selfie", code: "selfie_missing", status: "fail", category: "customer_fixable", message: "A selfie is required." }];
  const p = await qualityProblems(selfie);
  return p.length
    ? p.map((m) => ({ step: "selfie", code: "selfie_quality", status: "fail" as const, category: "customer_fixable" as const, message: m }))
    : [{ step: "selfie", code: "selfie_ok", status: "pass", category: "info", message: "Selfie received and passes quality checks." }];
}
