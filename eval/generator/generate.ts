// Regenerates every specimen case into eval/specimens/<case-id>/.
// Usage (from the repo root): npm run generate --prefix eval/generator
import fs from "node:fs";
import path from "node:path";
import { addressExists, lookupDocument } from "../../frontend/src/lib/authority/registry";
import { MIN_SHARPNESS, sharpness } from "../../frontend/src/lib/pipeline/quality";
import { allSpecs, buildCase, POLICY_ID, SEED, type CaseData, type DocKey } from "./cases";
import { formatAddress } from "./people";
import { launch, render, type Rendered } from "./render";
import { ID_SIZE, idCardHtml } from "./templates/idCard";
import { selfieHtml, SELFIE_SIZE } from "./templates/selfie";
import { BILL_SIZE, utilityBillHtml } from "./templates/utilityBill";

const REPO = path.resolve(__dirname, "..", "..");
const OUT = path.join(REPO, "eval", "specimens");
const FIELDS = ["full_name", "date_of_birth", "document_number", "issue_date", "expiry_date", "address"] as const;
const DOC_TYPE: Record<DocKey, string> = { id: "national_id", bill: "utility_bill" };
const ISSUER: Record<DocKey, string> = { id: "Republic of Veridia (fictional)", bill: "Quillmere Water & Power (fictional)" };

// Deletes only paths strictly inside eval/specimens of this repo.
function safeRemove(target: string) {
  const abs = path.resolve(target);
  const rel = path.relative(OUT, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`refusing to delete outside ${OUT}: ${abs}`);
  fs.rmSync(abs, { recursive: true, force: true });
}

function cleanOutput() {
  if (!fs.existsSync(path.join(REPO, ".git")) || path.basename(path.dirname(OUT)) !== "eval")
    throw new Error(`unexpected repo layout, not cleaning: ${OUT}`);
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of fs.readdirSync(OUT)) safeRemove(path.join(OUT, name));
}

// Clean cases must be able to reach auto_approve, so the synthetic registry has to
// know every person and address the generator prints.
function checkRegistry(c: CaseData) {
  const rec = lookupDocument(c.id.idNumber);
  if (!rec || rec.fullName !== c.id.fullName || rec.dateOfBirth !== c.id.dateOfBirth || rec.status !== "valid")
    throw new Error(`${c.caseId}: ${c.id.idNumber} missing or different in frontend/src/lib/authority/registry.ts`);
  for (const a of [c.id.address, c.bill.address])
    if (!addressExists(formatAddress(a))) throw new Error(`${c.caseId}: address "${formatAddress(a)}" not in registry.ts`);
}

function truth(c: CaseData, doc: DocKey, file: string, r: Rendered) {
  return {
    case_id: c.caseId,
    file,
    document_type: DOC_TYPE[doc],
    issuer: ISSUER[doc],
    synthetic: true,
    image: { width: r.width, height: r.height },
    box_format: "[x_min, y_min, x_max, y_max] on a 0-1000 grid, origin top-left",
    defects: c.docDefects[doc],
    fields: Object.fromEntries(
      FIELDS.map((k) => [k, r.fields[k] ? { found: true, ...r.fields[k] } : { found: false, value: "", normalized: "", box: [0, 0, 0, 0] }]),
    ),
  };
}

const writeJson = (file: string, data: unknown) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");

async function main() {
  const cases = allSpecs().map(buildCase);
  cases.forEach(checkRegistry);
  cleanOutput();

  const browser = await launch();
  const sharpRows: Array<{ file: string; score: number; blurred: boolean }> = [];
  try {
    for (const c of cases) {
      const dir = path.join(OUT, c.caseId);
      fs.mkdirSync(dir);
      const docs: Array<[DocKey, string, Rendered, boolean]> = [
        ["id", "id.png", await render(browser, idCardHtml(c.id), ID_SIZE.width, ID_SIZE.height, c.id.blur), c.id.blur > 0],
        ["bill", "bill.png", await render(browser, utilityBillHtml(c.bill), BILL_SIZE.width, BILL_SIZE.height, c.bill.blur), c.bill.blur > 0],
      ];
      for (const [doc, file, r, blurred] of docs) {
        fs.writeFileSync(path.join(dir, file), r.png);
        writeJson(path.join(dir, `${doc}.truth.json`), truth(c, doc, file, r));
        sharpRows.push({ file: `${c.caseId}/${file}`, score: await sharpness(r.png), blurred });
      }
      const selfie = await render(browser, selfieHtml(c.person.avatar), SELFIE_SIZE.width, SELFIE_SIZE.height);
      fs.writeFileSync(path.join(dir, "selfie.png"), selfie.png);
      sharpRows.push({ file: `${c.caseId}/selfie.png`, score: await sharpness(selfie.png), blurred: false });

      writeJson(path.join(dir, "case.json"), {
        case_id: c.caseId,
        synthetic: true,
        seed: SEED,
        as_of: c.asOf,
        policy_id: POLICY_ID,
        person: c.person.key,
        defects: c.defects,
        documents: (["id", "bill"] as const).map((d) => ({ file: `${d}.png`, truth: `${d}.truth.json`, document_type: DOC_TYPE[d] })),
        selfie: "selfie.png",
        // flag_codes is the minimum set of non-pass check codes the pipeline should raise.
        expected: c.expected,
      });
      console.log(`${c.caseId.padEnd(28)} -> ${c.expected.decision}`);
    }
  } finally {
    await browser.close();
  }

  writeJson(path.join(OUT, "index.json"), {
    seed: SEED,
    // files lets the app's mock mode recognise uploaded specimens (frontend/src/lib/ai/specimens.ts).
    cases: cases.map((c) => ({
      case_id: c.caseId,
      as_of: c.asOf,
      defects: c.defects,
      expected_decision: c.expected.decision,
      files: [
        ...(["id", "bill"] as const).map((d) => ({ file: `${c.caseId}/${d}.png`, role: "document", document_type: DOC_TYPE[d], truth: `${c.caseId}/${d}.truth.json` })),
        { file: `${c.caseId}/selfie.png`, role: "selfie" },
      ],
    })),
  });

  // The blurry defect is only meaningful if the pipeline's quality gate catches it.
  console.log(`\nsharpness (Laplacian variance, gate fails below ${MIN_SHARPNESS}):`);
  for (const s of sharpRows) console.log(`  ${s.file.padEnd(36)} ${s.score.toFixed(1).padStart(8)}${s.blurred ? "  (blurred)" : ""}`);
  const wrong = sharpRows.filter((s) => s.blurred !== s.score < MIN_SHARPNESS);
  if (wrong.length) throw new Error(`sharpness gate disagrees with the case design: ${wrong.map((s) => s.file).join(", ")}`);
  console.log(`\n${cases.length} cases written to ${path.relative(REPO, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
