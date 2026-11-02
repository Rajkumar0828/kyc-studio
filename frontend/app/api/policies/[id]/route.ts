import { getPolicyStore } from "@/src/lib/policy/store";
import { rateLimit } from "@/src/lib/security/guard";

// GET: the latest published version (null if none or archived), the draft, the
// version numbers, and the number the next publish will get.
export async function GET(req: Request, ctx: RouteContext<"/api/policies/[id]">) {
  const limited = rateLimit(req);
  if (limited) return limited;
  const { id } = await ctx.params;
  const store = getPolicyStore();
  const [published, draft, versions, archived] = await Promise.all([store.get(id), store.getDraft(id), store.versions(id), store.isArchived(id)]);
  if (!versions.length && !draft) return Response.json({ error: "Unknown policy" }, { status: 404 });
  return Response.json({ published, draft, versions, archived, nextVersion: (versions.at(-1) ?? 0) + 1 });
}
