import { qualityProblems } from "@/src/lib/pipeline/quality";
import { errorResponse, protect } from "@/src/lib/security/guard";

// POST multipart { file }: runs the pipeline's quality gate on one upload so the
// journey can show the problem before the customer submits. No AI involved.
export async function POST(req: Request) {
  const denied = protect(req);
  if (denied) return denied;
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File) || !file.size) return Response.json({ error: "No file uploaded" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return Response.json({ ok: false, problems: [`${file.name}: the file is larger than 10 MB.`] });
    const problems = await qualityProblems({ filename: file.name, mime: file.type || "application/octet-stream", bytes: Buffer.from(await file.arrayBuffer()) });
    return Response.json({ ok: !problems.length, problems });
  } catch (e) {
    return errorResponse(e, "Could not check the file");
  }
}
