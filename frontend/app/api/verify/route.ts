import { getAi } from "@/src/lib/ai";
import type { InputFile } from "@/src/lib/ai/types";
import { specimenAsOf } from "@/src/lib/ai/specimens";
import { consoleSink } from "@/src/lib/audit/logger";
import { latestPublished } from "@/src/lib/policy/store";
import { runPipeline } from "@/src/lib/pipeline/run";
import { errorResponse, metered, protect } from "@/src/lib/security/guard";

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
  const policy = await latestPublished(String(form.get("policyId") ?? ""));
  if (!policy) return Response.json({ error: "Unknown policy" }, { status: 400 });

  const docs = form.getAll("documents").filter((v): v is File => v instanceof File && v.size > 0);
  if (!docs.length) return Response.json({ error: "Upload at least one document" }, { status: 400 });
  const selfie = form.get("selfie");

  try {
    const documents = await Promise.all(docs.map(toInput));
    const specimen = await specimenAsOf(documents); // mock mode only
    const result = await runPipeline(
      {
        caseId: `case-${Date.now().toString(36)}`,
        documents,
        selfie: selfie instanceof File && selfie.size > 0 ? await toInput(selfie) : undefined,
        asOf: specimen?.asOf,
      },
      policy,
      metered(getAi()),
      consoleSink, // switch to mongoSink() once cases are persisted
    );
    return Response.json(result);
  } catch (e) {
    return errorResponse(e, "Pipeline failed");
  }
}
