import { generateGuide } from "@/src/lib/policy/guide";
import { getPolicyStore, PolicyStoreError, specFromDraft } from "@/src/lib/policy/store";
import { getAuditLog } from "@/src/lib/audit";
import { actorOf, errorResponse, protect } from "@/src/lib/security/guard";

// POST: publish the draft as version N+1 with step wording generated from that
// exact version. Guarded by the demo access code and the rate limit. The guide
// call counts toward the daily AI cap, but a reached cap or any AI failure falls
// back to the template guide (marked) instead of blocking the publish.
export async function POST(req: Request, ctx: RouteContext<"/api/policies/[id]/publish">) {
  const denied = protect(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const store = getPolicyStore();
    const draft = await store.getDraft(id);
    if (!draft) throw new PolicyStoreError("There is no draft to publish.", 404);
    const version = ((await store.versions(id)).at(-1) ?? 0) + 1;
    const guide = await generateGuide(specFromDraft(draft, version, new Date().toISOString()));
    const published = await store.publish(id, { guide, version, draftUpdatedAt: draft.updatedAt });
    await getAuditLog().append({ type: "policy_published", actor: actorOf(req), policyId: id, policyVersion: published.spec.version });
    return Response.json({ policy: published });
  } catch (e) {
    return errorResponse(e, "Could not publish the policy");
  }
}
