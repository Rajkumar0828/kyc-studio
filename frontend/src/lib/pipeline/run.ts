import type { AiProvider } from "../ai/types";
import type { AuditSink } from "../audit/logger";
import type { PolicySpec } from "../policy/schema";
import { authorityChecks, crossDocChecks, ruleChecks, selfieChecks } from "./checks";
import { qualityProblems } from "./quality";
import { decide, scoreRisk } from "./risk";
import type { CaseInput, Check, PipelineResult, ProcessedDoc } from "./types";

export async function runPipeline(input: CaseInput, policy: PolicySpec, ai: AiProvider, audit: AuditSink): Promise<PipelineResult> {
  const startedAt = new Date();
  const log = (action: string, detail?: Record<string, unknown>, actor = "system") =>
    audit({ caseId: input.caseId, actor, action, detail, at: new Date() });
  await log("pipeline_started", { policy: `${policy.id}@v${policy.version}`, provider: ai.name, documents: input.documents.length, asOf: input.asOf?.toISOString().slice(0, 10) });

  const finish = async (docs: ProcessedDoc[], checks: Check[]): Promise<PipelineResult> => {
    const { score, reasons } = scoreRisk(checks);
    const decision = decide(checks, score, policy);
    const reviewerSummary = await ai.summarizeForReviewer({ score, reasons, decision });
    const fixable = checks.filter((c) => c.status !== "pass" && c.category === "customer_fixable").map((c) => c.message);
    const customerMessage = decision === "request_info" ? await ai.customerGuidance(fixable) : undefined;
    await log("decision_proposed", { decision, score, reasons }, `ai:${ai.name}`);
    return { caseId: input.caseId, policy: { id: policy.id, version: policy.version }, provider: ai.name, docs, checks, score, decision, reviewerSummary, customerMessage, startedAt, finishedAt: new Date() };
  };

  // 2. Quality gate: stop early and ask for a retake, no AI spend on bad images.
  const quality = (await Promise.all(input.documents.map(qualityProblems))).flat().map<Check>((m) => ({ step: "quality", code: "quality_failed", status: "fail", category: "customer_fixable", message: m }));
  if (quality.length) {
    await log("quality_gate_failed", { problems: quality.length });
    return finish([], quality);
  }
  await log("quality_gate_passed");

  // 3-4. Classify then extract each document.
  const docs: ProcessedDoc[] = [];
  for (const [index, file] of input.documents.entries()) {
    const { docType, confidence } = await ai.classifyDocument(file);
    const doc: ProcessedDoc = { index, filename: file.filename, docType, classConfidence: confidence };
    if (docType !== "unknown") doc.extraction = await ai.extractFields(file, docType);
    docs.push(doc);
    await log("document_processed", { index, docType, confidence }, `ai:${ai.name}`);
  }

  const checks: Check[] = [];
  for (const d of docs.filter((d) => d.docType === "unknown"))
    checks.push({ step: "classify", code: "unknown_document", status: "warn", category: "customer_fixable", message: `${d.filename}: could not tell what kind of document this is.` });

  checks.push(...ruleChecks(docs, policy, input.asOf));                       // 5
  checks.push(...(await crossDocChecks(docs, ai)));                           // 6
  if (policy.authorityLookup) checks.push(...authorityChecks(docs));          // 7
  checks.push(...(await selfieChecks(input.selfie, policy)));                 // 8
  await log("checks_completed", { fails: checks.filter((c) => c.status === "fail").length, warns: checks.filter((c) => c.status === "warn").length });

  return finish(docs, checks);                                                // 9-10 (11 = audit throughout)
}
