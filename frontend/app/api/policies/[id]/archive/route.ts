import { getPolicyStore } from "@/src/lib/policy/store";
import { errorResponse, protect } from "@/src/lib/security/guard";

// POST: archive a policy (one-way). Its versions stay readable; new applications are refused.
export async function POST(req: Request, ctx: RouteContext<"/api/policies/[id]/archive">) {
  const denied = protect(req);
  if (denied) return denied;
  try {
    await getPolicyStore().archive((await ctx.params).id);
    return Response.json({ archived: true });
  } catch (e) {
    return errorResponse(e, "Could not archive the policy");
  }
}
