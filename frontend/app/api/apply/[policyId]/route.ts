import { getAi, getCustomerGuide } from "@/src/lib/ai";
import { specimenAsOf } from "@/src/lib/ai/specimens";
import type { InputFile } from "@/src/lib/ai/types";
import { consoleSink } from "@/src/lib/audit/logger";
import { runPipeline } from "@/src/lib/pipeline/run";
import { DocType } from "@/src/lib/policy/schema";
import { latestPublished } from "@/src/lib/policy/store";
import { errorResponse, metered, protect } from "@/src/lib/security/guard";

const MAX_FILES = 5, MAX_BYTES = 10 * 1024 * 1024;

const toInput = async (f: File, declared?: string): Promise<InputFile> => {
  const t = DocType.safeParse(declared);
  return { filename: f.name, mime: f.type || "application/octet-stream", bytes: Buffer.from(await f.arrayBuffer()), declaredType: t.success ? t.data : undefined };
};

// POST multipart: consent=true, consentAt, documents[] with matching documentTypes[], selfie.
// Runs the pipeline on the latest published version. The customer gets the
// decision and what to fix, never risk scores or integrity findings.
export async function POST(req: Request, ctx: RouteContext<"/api/apply/[policyId]">) {
  const denied = protect(req, { ai: true });
  if (denied) return denied;
  const policy = await latestPublished((await ctx.params).policyId);
  if (!policy) return Response.json({ error: "Unknown or unpublished policy" }, { status: 404 });

  const form = await req.formData();
  if (form.get("consent") !== "true") return Response.json({ error: "Consent is required before submitting." }, { status: 400 });
  const files = form.getAll("documents").filter((v): v is File => v instanceof File && v.size > 0);
  const types = form.getAll("documentTypes").map(String);
  const selfie = form.get("selfie");
  if (!files.length) return Response.json({ error: "Upload at least one document." }, { status: 400 });
  if (files.length > MAX_FILES) return Response.json({ error: `Upload at most ${MAX_FILES} documents.` }, { status: 400 });
  if ([...files, selfie].some((f) => f instanceof File && f.size > MAX_BYTES)) return Response.json({ error: "Each file must be 10 MB or smaller." }, { status: 413 });

  const caseId = `apply-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    const guide = getCustomerGuide(); // resolve before any AI spend
    const documents = await Promise.all(files.map((f, i) => toInput(f, types[i])));
    const specimen = await specimenAsOf(documents); // mock mode only
    await consoleSink({
      caseId, actor: "customer", action: "consent_given", at: new Date(),
      detail: { policy: `${policy.id}@v${policy.version}`, consentAt: String(form.get("consentAt") ?? ""), retentionDays: policy.retentionDays },
    });
    const result = await runPipeline(
      { caseId, documents, selfie: selfie instanceof File && selfie.size > 0 ? await toInput(selfie) : undefined, asOf: specimen?.asOf },
      policy,
      metered(getAi()),
      consoleSink,
    );
    const fixes = result.decision === "request_info"
      ? [...new Set(result.checks.filter((c) => c.status !== "pass" && c.category === "customer_fixable").map((c) => c.message))]
      : [];
    return Response.json({
      caseId,
      policy: result.policy,
      decision: result.decision,
      message: await metered(guide).resultMessage(result.decision, fixes),
      fixes,
      provider: result.provider,
      guideProvider: guide.name,
      specimen: specimen ? { caseId: specimen.caseId, asOf: specimen.asOf.toISOString().slice(0, 10) } : null,
    });
  } catch (e) {
    return errorResponse(e, "Verification failed");
  }
}
