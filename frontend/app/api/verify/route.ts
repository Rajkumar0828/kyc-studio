import { getAi } from "@/src/lib/ai";
import type { InputFile } from "@/src/lib/ai/types";
import { consoleSink } from "@/src/lib/audit/logger";
import { getDefaultPolicy } from "@/src/lib/policy/defaults";
import { runPipeline } from "@/src/lib/pipeline/run";

const toInput = async (f: File): Promise<InputFile> => ({
  filename: f.name,
  mime: f.type || "application/octet-stream",
  bytes: Buffer.from(await f.arrayBuffer()),
});

// POST multipart/form-data: policyId, documents (1+ files), selfie (optional file)
export async function POST(req: Request) {
  const form = await req.formData();
  const policy = getDefaultPolicy(String(form.get("policyId") ?? ""));
  if (!policy) return Response.json({ error: "Unknown policy" }, { status: 400 });

  const docs = form.getAll("documents").filter((v): v is File => v instanceof File && v.size > 0);
  if (!docs.length) return Response.json({ error: "Upload at least one document" }, { status: 400 });
  const selfie = form.get("selfie");

  try {
    const result = await runPipeline(
      {
        caseId: `case-${Date.now().toString(36)}`,
        documents: await Promise.all(docs.map(toInput)),
        selfie: selfie instanceof File && selfie.size > 0 ? await toInput(selfie) : undefined,
      },
      policy,
      getAi(),
      consoleSink, // switch to mongoSink() once cases are persisted
    );
    return Response.json(result);
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "Pipeline failed" }, { status: 500 });
  }
}
