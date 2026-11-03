import { getPolicyStore } from "@/src/lib/policy/store";
import { getAuditLog } from "@/src/lib/audit";
import { actorOf, protect } from "@/src/lib/security/guard";
import { errorResponse } from "@/src/lib/security/errors";

// POST: archive a policy (one-way). Its versions stay readable; new applications are refused.
export async function POST(req: Request, ctx: RouteContext<"/api/policies/[id]/archive">) {
  const denied = protect(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    await getPolicyStore().archive(id);
    await getAuditLog().append({ type: "policy_archived", actor: actorOf(req), policyId: id });
    return Response.json({ archived: true });
  } catch (e) {
    return errorResponse(e, "Could not archive the policy");
  }
}
