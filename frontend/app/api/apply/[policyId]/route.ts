import { getAi, getCustomerGuide } from "@/src/lib/ai";
import { specimenAsOf } from "@/src/lib/ai/specimens";
import type { InputFile } from "@/src/lib/ai/types";
import { getApplicationLog } from "@/src/lib/applications/log";
import { randomUUID } from "node:crypto";
import { getAuditLog, pipelineAuditSink } from "@/src/lib/audit";
import { runPipeline } from "@/src/lib/pipeline/run";
import { DocType } from "@/src/lib/policy/schema";
import { getPolicyStore } from "@/src/lib/policy/store";
import { protect } from "@/src/lib/security/guard";
import { errorResponse } from "@/src/lib/security/errors";
import { MAX_DOCUMENTS, MAX_FILE_BYTES, MAX_FILE_LABEL } from "@/src/lib/uploadLimits";

const toInput = async (f: File, declared?: string): Promise<InputFile> => {
  const t = DocType.safeParse(declared);
  return { filename: f.name, mime: f.type || "application/octet-stream", bytes: Buffer.from(await f.arrayBuffer()), declaredType: t.success ? t.data : undefined };
};

// POST multipart: consent=true, consentAt, documents[] with matching documentTypes[], selfie.
// Runs the pipeline on the latest published version, which must be the version
// the customer was shown (policyVersion). The customer gets the decision and
// what to fix, never risk scores or integrity findings.
export async function POST(req: Request, ctx: RouteContext<"/api/apply/[policyId]">) {
  const denied = protect(req, { ai: true });
  if (denied) return denied;
  const { policyId } = await ctx.params;
  const store = getPolicyStore();
  const current = await store.get(policyId);
  if (!current) return Response.json({ error: (await store.isArchived(policyId)) ? "This policy has been archived." : "Unknown or unpublished policy" }, { status: 404 });
  const policy = current.spec;

  const form = await req.formData();
  if (Number(form.get("policyVersion")) !== policy.version)
    return Response.json({ error: "This policy was updated; please reload the page.", code: "policy_version_changed" }, { status: 409 });
  if (form.get("consent") !== "true") return Response.json({ error: "Consent is required before submitting." }, { status: 400 });
  const files = form.getAll("documents").filter((v): v is File => v instanceof File && v.size > 0);
  const types = form.getAll("documentTypes").map(String);
  const selfie = form.get("selfie");
  if (!files.length) return Response.json({ error: "Upload at least one document." }, { status: 400 });
  if (files.length > MAX_DOCUMENTS) return Response.json({ error: `Upload at most ${MAX_DOCUMENTS} documents.` }, { status: 400 });
  if ([...files, selfie].some((f) => f instanceof File && f.size > MAX_FILE_BYTES)) return Response.json({ error: `Each file must be ${MAX_FILE_LABEL} or smaller.` }, { status: 413 });

  // A random UUID: never derived from a name, document number or time.
  const caseId = randomUUID();
  const submittedAt = new Date().toISOString();
  const consentRaw = String(form.get("consentAt") ?? "");
  const consentAt = !isNaN(Date.parse(consentRaw)) ? new Date(consentRaw).toISOString() : null;
  try {
    const guide = getCustomerGuide({ caseId, policyId: policy.id }); // resolve before any AI spend
    const documents = await Promise.all(files.map((f, i) => toInput(f, types[i])));
    const specimen = await specimenAsOf(documents); // mock mode only
    const audit = getAuditLog();
    const ids = { caseId, policyId: policy.id, policyVersion: policy.version };
    await audit.append({ type: "consent_recorded", actor: "customer", ...ids });
    const result = await runPipeline(
      { caseId, documents, selfie: selfie instanceof File && selfie.size > 0 ? await toInput(selfie) : undefined, asOf: specimen?.asOf },
      policy,
      getAi({ caseId, policyId: policy.id }),
      pipelineAuditSink(audit, ids),
    );
    // Recorded against the exact version evaluated.
    await getApplicationLog().record({
      caseId, channel: "apply", policyId: result.policy.id, policyVersion: result.policy.version, decision: result.decision,
      provider: result.provider, consentAt, submittedAt, decidedAt: new Date(result.finishedAt).toISOString(),
    });
    const fixes = result.decision === "request_info"
      ? [...new Set(result.checks.filter((c) => c.status !== "pass" && c.category === "customer_fixable").map((c) => c.message))]
      : [];
    return Response.json({
      caseId,
      policy: result.policy,
      decision: result.decision,
      message: await guide.resultMessage(result.decision, fixes),
      fixes,
      provider: result.provider,
      guideProvider: guide.name,
      specimen: specimen ? { caseId: specimen.caseId, asOf: specimen.asOf.toISOString().slice(0, 10) } : null,
    });
  } catch (e) {
    return errorResponse(e, "Verification failed");
  }
}
