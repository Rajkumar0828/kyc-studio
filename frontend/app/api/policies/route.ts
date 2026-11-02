import { verifyCompile } from "@/src/lib/policy/compileToken";
import { DraftInput, getPolicyStore } from "@/src/lib/policy/store";
import { errorResponse, protect, rateLimit } from "@/src/lib/security/guard";

// GET: one summary per policy (seeds first). Read-only, so only rate limited.
export async function GET(req: Request) {
  const limited = rateLimit(req);
  if (limited) return limited;
  return Response.json({ policies: await getPolicyStore().list() });
}

// POST DraftInput + compileToken: create or replace the draft for a policy.
// Rules must come from a compile of this exact text (signed token); there is no manual rule editing.
export async function POST(req: Request) {
  const denied = protect(req);
  if (denied) return denied;
  try {
    const { compileToken, ...body } = (await req.json()) as Record<string, unknown>;
    const input = DraftInput.parse(body);
    if (!verifyCompile({ sourceText: input.sourceText, rules: input.rules, compile: input.compile }, compileToken))
      return Response.json({ error: "Compile the policy text again before saving; the compiled rules could not be verified.", code: "compile_required" }, { status: 400 });
    const draft = await getPolicyStore().saveDraft(input);
    return Response.json({ draft }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Could not save the draft");
  }
}
