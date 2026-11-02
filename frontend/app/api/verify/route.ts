import { getAi } from "@/src/lib/ai";
import type { InputFile } from "@/src/lib/ai/types";
import { specimenAsOf } from "@/src/lib/ai/specimens";
import { getApplicationLog } from "@/src/lib/applications/log";
import { consoleSink } from "@/src/lib/audit/logger";
import { getPolicyStore } from "@/src/lib/policy/store";
import { runPipeline } from "@/src/lib/pipeline/run";
import { errorResponse, protect } from "@/src/lib/security/guard";

const toInput = async (f: File): Promise<InputFile> => ({
  filename: f.name,
  mime: f.type || "application/octet-stream",
  bytes: Buffer.from(await f.arrayBuffer()),
});

// POST multipart/form-data: policyId, documents (1+ files), selfie (optional file)
export async function POST(req: Request) {
  const denied = protect(req, { ai: true });
  if (denied) return denied;

  const form = await req.formData();
  const policy = (await getPolicyStore().get(String(form.get("policyId") ?? "")))?.spec;
  if (!policy) return Response.json({ error: "Unknown policy" }, { status: 400 });

  const docs = form.getAll("documents").filter((v): v is File => v instanceof File && v.size > 0);
  if (!docs.length) return Response.json({ error: "Upload at least one document" }, { status: 400 });
  const selfie = form.get("selfie");

  const submittedAt = new Date().toISOString();
  const caseId = `case-${Date.now().toString(36)}`;
  try {
    const documents = await Promise.all(docs.map(toInput));
    const specimen = await specimenAsOf(documents); // mock mode only
    const result = await runPipeline(
      {
        caseId,
        documents,
        selfie: selfie instanceof File && selfie.size > 0 ? await toInput(selfie) : undefined,
        asOf: specimen?.asOf,
      },
      policy,
      getAi({ caseId, policyId: policy.id }),
      consoleSink, // switch to mongoSink() once cases are persisted
    );
    await getApplicationLog().record({
      caseId: result.caseId, channel: "verify", policyId: result.policy.id, policyVersion: result.policy.version, decision: result.decision,
      provider: result.provider, consentAt: null, submittedAt, decidedAt: new Date(result.finishedAt).toISOString(),
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e, "Pipeline failed");
  }
}
