import { getCustomerGuide } from "@/src/lib/ai";
import { latestPublished } from "@/src/lib/policy/store";
import { errorResponse, metered, protect } from "@/src/lib/security/guard";

// POST { policyId }: help text for every step of the apply journey.
export async function POST(req: Request) {
  const denied = protect(req, { ai: true });
  if (denied) return denied;
  const { policyId } = (await req.json().catch(() => ({}))) as { policyId?: unknown };
  const policy = typeof policyId === "string" ? await latestPublished(policyId) : undefined;
  if (!policy) return Response.json({ error: "Unknown or unpublished policy" }, { status: 404 });
  try {
    const guide = getCustomerGuide();
    return Response.json({ steps: await metered(guide).stepHelp(policy), provider: guide.name });
  } catch (e) {
    return errorResponse(e, "Could not load the guide");
  }
}
