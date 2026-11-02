import { DraftInput, getPolicyStore } from "@/src/lib/policy/store";
import { errorResponse, protect, rateLimit } from "@/src/lib/security/guard";

// GET: one summary per policy (seeds first). Read-only, so only rate limited.
export async function GET(req: Request) {
  const limited = rateLimit(req);
  if (limited) return limited;
  return Response.json({ policies: await getPolicyStore().list() });
}

// POST DraftInput: create or replace the draft for a policy. Drafts have no version number.
export async function POST(req: Request) {
  const denied = protect(req);
  if (denied) return denied;
  try {
    const draft = await getPolicyStore().saveDraft(DraftInput.parse(await req.json()));
    return Response.json({ draft }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Could not save the draft");
  }
}
