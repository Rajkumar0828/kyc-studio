// Runs the full KYC pipeline on synthetic inputs with the mock AI provider.
// Usage: npx tsx scripts/pipeline-demo.ts            (console audit)
//        npx tsx --env-file=.env.local scripts/pipeline-demo.ts --mongo   (writes audit_events)
import sharp from "sharp";
import { mongoSink } from "../src/lib/audit/logger";
import { getAi } from "../src/lib/ai";
import type { InputFile } from "../src/lib/ai/types";
import { getDefaultPolicy } from "../src/lib/policy/defaults";
import { runPipeline } from "../src/lib/pipeline/run";

// A real noise PNG of the given size: the mock provider never reads pixels, but
// the quality gate decodes them for the sharpness check, and noise is sharp.
const pngCache = new Map<string, Promise<Buffer>>();
const noisePng = (w: number, h: number) => {
  const key = `${w}x${h}`;
  if (!pngCache.has(key)) pngCache.set(key, sharp({ create: { width: w, height: h, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 40 } } }).png().toBuffer());
  return pngCache.get(key)!;
};
async function fakePng(filename: string, w = 1600, h = 1000): Promise<InputFile> {
  return { filename, mime: "image/png", bytes: await noisePng(w, h) };
}

const scenarios = async (): Promise<Array<{ name: string; policy: string; docs: InputFile[]; selfie?: InputFile; expect: string }>> => [
  { name: "Happy path", policy: "housing-loan", docs: [await fakePng("passport.png"), await fakePng("utility_bill.png")], selfie: await fakePng("selfie.png"), expect: "auto_approve" },
  { name: "Name mismatch", policy: "housing-loan", docs: [await fakePng("passport.png"), await fakePng("utility_bill_mismatch.png")], selfie: await fakePng("selfie.png"), expect: "manual_review" },
  { name: "Expired ID", policy: "general-account", docs: [await fakePng("drivers_license_expired.png")], selfie: await fakePng("selfie.png"), expect: "request_info" },
  { name: "Blurry photo", policy: "general-account", docs: [await fakePng("passport.png", 480, 320)], selfie: await fakePng("selfie.png"), expect: "request_info" },
  { name: "Not in registry", policy: "general-account", docs: [await fakePng("national_id_unknownperson.png")], selfie: await fakePng("selfie.png"), expect: "manual_review" },
  { name: "Missing proof of address", policy: "housing-loan", docs: [await fakePng("passport.png")], selfie: await fakePng("selfie.png"), expect: "request_info" },
];

async function main() {
  const ai = getAi();
  const audit = process.argv.includes("--mongo") ? mongoSink() : async () => {};
  const list = await scenarios();
  let ok = 0;
  for (const [i, s] of list.entries()) {
    const policy = getDefaultPolicy(s.policy)!;
    const r = await runPipeline({ caseId: `demo-${i + 1}`, documents: s.docs, selfie: s.selfie }, policy, ai, audit);
    const pass = r.decision === s.expect;
    ok += +pass;
    console.log(`\n${pass ? "PASS" : "FAIL"}  ${s.name}  -> ${r.decision} (score ${r.score}, expected ${s.expect})`);
    for (const c of r.checks.filter((c) => c.status !== "pass")) console.log(`   ${c.status.toUpperCase().padEnd(4)} [${c.step}] ${c.message}`);
    console.log(`   reviewer: ${r.reviewerSummary}`);
    if (r.customerMessage) console.log(`   customer: ${r.customerMessage}`);
  }
  console.log(`\n${ok}/${list.length} scenarios as expected (provider: ${ai.name})`);
  if (process.argv.includes("--mongo")) process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
