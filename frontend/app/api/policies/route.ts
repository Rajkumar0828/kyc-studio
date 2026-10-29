import { DraftInput, listPolicies, saveDraft } from "@/src/lib/policy/store";
import { errorResponse, protect, rateLimit } from "@/src/lib/security/guard";

// GET: every stored policy version (seeds first). Read-only, so only rate limited.
export async function GET(req: Request) {
  const limited = rateLimit(req);
  if (limited) return limited;
  return Response.json({ policies: await listPolicies() });
}

// POST DraftInput: create or replace the draft for a policy.
export async function POST(req: Request) {
  const denied = protect(req);
  if (denied) return denied;
  try {
    const draft = await saveDraft(DraftInput.parse(await req.json()));
    return Response.json({ policy: draft }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Could not save the draft");
  }
}
