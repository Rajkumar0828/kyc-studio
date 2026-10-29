import { ALT_ADDRESSES, ALT_FIRST_NAMES, PEOPLE, formatAddress, type Address, type Avatar, type Person } from "./people";
import { rng, type Rng } from "./rng";

// Change SEED to get a different but still reproducible set of details
// (bill dates, account numbers, which alternate name/address a defect uses).
export const SEED = 20261101;
// The pipeline's "today" for every case (passed as asOf). Clean IDs expire years
// after it and bills are dated a few weeks before it.
export const REFERENCE_DATE = "2026-11-01";
export const POLICY_ID = "housing-loan"; // needs a photo ID + proof of address + selfie

export type DefectId = "expired" | "name-mismatch" | "address-mismatch" | "blurry";
export type Decision = "auto_approve" | "request_info" | "manual_review";
export type Category = "customer_fixable" | "integrity";
export type DocKey = "id" | "bill";

export interface CaseSpec {
  person: string; // Person.key
  defects: DefectId[];
}

// Explicit cases. Add rows here (or new people in people.ts) to grow the set.
export const CASE_SPECS: CaseSpec[] = [
  { person: "p1", defects: [] },
  { person: "p2", defects: [] },
  { person: "p1", defects: ["expired"] },
  { person: "p2", defects: ["name-mismatch"] },
  { person: "p1", defects: ["address-mismatch"] },
  { person: "p2", defects: ["blurry"] },
];

// Extra seeded random combinations on top of CASE_SPECS (duplicates are skipped).
// With 2 people there are 2 x 15 distinct defect sets, so ~40 cases needs a 3rd person.
export const SAMPLED = { count: 0, maxDefects: 2 };

export interface IdCardData {
  fullName: string;
  dateOfBirth: string;
  idNumber: string;
  issueDate: string;
  expiryDate: string;
  address: Address;
  avatar: Avatar;
  blur: number; // CSS px, 0 = sharp
}

export interface BillData {
  fullName: string;
  address: Address;
  accountNumber: string;
  billDate: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  water: { previous: number; current: number; rate: number };
  power: { previous: number; current: number; rate: number };
  serviceCharge: number;
  blur: number;
}

export interface Expected {
  decision: Decision;
  flag_categories: Category[];
  flag_codes: string[];
}

export interface CaseData {
  caseId: string;
  person: Person;
  defects: DefectId[];
  asOf: string;
  id: IdCardData;
  bill: BillData;
  docDefects: Record<DocKey, DefectId[]>;
  expected: Expected;
}

interface Defect {
  target: DocKey;
  apply(c: CaseData, r: Rng): void;
  expect: { codes: string[]; category: Category; stopsPipeline?: boolean };
}

// Codes and categories are the pipeline's own (frontend/src/lib/pipeline/checks.ts).
const DEFECTS: Record<DefectId, Defect> = {
  expired: {
    target: "id",
    apply: (c, r) => {
      c.id.expiryDate = addDays(c.asOf, -r.int(20, 400));
      c.id.issueDate = addDays(addYears(c.id.expiryDate, -10), 1);
    },
    expect: { codes: ["document_expired"], category: "customer_fixable" },
  },
  "name-mismatch": {
    target: "bill",
    apply: (c, r) => {
      const [first, ...rest] = c.person.fullName.split(" ");
      c.bill.fullName = [r.pick(ALT_FIRST_NAMES.filter((n) => n !== first)), ...rest].join(" ");
    },
    expect: { codes: ["full_name_mismatch"], category: "integrity" },
  },
  "address-mismatch": {
    target: "bill",
    apply: (c, r) => {
      c.bill.address = r.pick(ALT_ADDRESSES.filter((a) => formatAddress(a) !== formatAddress(c.id.address)));
    },
    expect: { codes: ["address_mismatch"], category: "integrity" },
  },
  blurry: {
    target: "id",
    apply: (c) => {
      c.id.blur = 5;
    },
    // The quality gate stops the pipeline before any other check runs.
    expect: { codes: ["quality_failed"], category: "customer_fixable", stopsPipeline: true },
  },
};
const DEFECT_ORDER = Object.keys(DEFECTS) as DefectId[];

export const caseIdOf = (s: CaseSpec) => `${s.person}-${s.defects.length ? s.defects.join("+") : "clean"}`;

// Mirrors the pipeline's decision precedence: any integrity fail -> manual_review,
// else any customer-fixable fail -> request_info, else auto_approve.
function expectedFor(defects: DefectId[]): Expected {
  const ds = defects.map((d) => DEFECTS[d]);
  const active = ds.some((d) => d.expect.stopsPipeline) ? ds.filter((d) => d.expect.stopsPipeline) : ds;
  const flag_categories = [...new Set(active.map((d) => d.expect.category))];
  const flag_codes = [...new Set(active.flatMap((d) => d.expect.codes))];
  const decision: Decision = flag_categories.includes("integrity") ? "manual_review" : flag_categories.length ? "request_info" : "auto_approve";
  return { decision, flag_categories, flag_codes };
}

export function buildCase(spec: CaseSpec): CaseData {
  const person = PEOPLE.find((p) => p.key === spec.person);
  if (!person) throw new Error(`unknown person ${spec.person}`);
  const defects = DEFECT_ORDER.filter((d) => spec.defects.includes(d));
  const caseId = caseIdOf({ person: person.key, defects });
  const r = rng(`${SEED}:${caseId}`);
  const asOf = REFERENCE_DATE;

  const billDate = addDays(asOf, -r.int(8, 40));
  const periodEnd = addDays(billDate, -r.int(3, 8));
  const water = r.int(200, 900), power = r.int(10000, 60000);
  const c: CaseData = {
    caseId,
    person,
    defects,
    asOf,
    id: {
      fullName: person.fullName,
      dateOfBirth: person.dateOfBirth,
      idNumber: person.idNumber,
      issueDate: person.idIssued,
      expiryDate: addDays(addYears(person.idIssued, 10), -1),
      address: person.address,
      avatar: person.avatar,
      blur: 0,
    },
    bill: {
      fullName: person.fullName,
      address: person.address,
      accountNumber: `QW-${r.int(10000, 99999)}-${r.int(10000, 99999)}`,
      billDate,
      periodStart: addDays(periodEnd, -29),
      periodEnd,
      dueDate: addDays(billDate, 21),
      water: { previous: water, current: water + r.int(8, 22), rate: 3.4 },
      power: { previous: power, current: power + r.int(180, 520), rate: 0.27 },
      serviceCharge: 12.5,
      blur: 0,
    },
    docDefects: { id: [], bill: [] },
    expected: expectedFor(defects),
  };
  for (const d of defects) {
    DEFECTS[d].apply(c, r);
    c.docDefects[DEFECTS[d].target].push(d);
  }
  return c;
}

export function allSpecs(): CaseSpec[] {
  const out = new Map(CASE_SPECS.map((s) => [caseIdOf({ ...s, defects: DEFECT_ORDER.filter((d) => s.defects.includes(d)) }), s]));
  const r = rng(SEED);
  for (let tries = 0; out.size < CASE_SPECS.length + SAMPLED.count && tries < 1000; tries++) {
    const n = r.int(1, SAMPLED.maxDefects);
    const defects = DEFECT_ORDER.filter(() => r.next() < n / DEFECT_ORDER.length).slice(0, n);
    const spec = { person: r.pick(PEOPLE).key, defects };
    if (!out.has(caseIdOf(spec))) out.set(caseIdOf(spec), spec);
  }
  return [...out.values()];
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function addYears(iso: string, years: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}
