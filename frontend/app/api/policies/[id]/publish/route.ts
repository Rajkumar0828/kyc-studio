import { publish } from "@/src/lib/policy/store";
import { errorResponse, protect } from "@/src/lib/security/guard";

export async function POST(req: Request, ctx: RouteContext<"/api/policies/[id]/publish">) {
  const denied = protect(req);
  if (denied) return denied;
  try {
    return Response.json({ policy: await publish((await ctx.params).id) });
  } catch (e) {
    return errorResponse(e, "Could not publish the policy");
  }
}
