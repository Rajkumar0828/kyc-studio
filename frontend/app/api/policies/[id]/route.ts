import { getDraft, getVersions, latestPublished } from "@/src/lib/policy/store";
import { rateLimit } from "@/src/lib/security/guard";

export async function GET(req: Request, ctx: RouteContext<"/api/policies/[id]">) {
  const limited = rateLimit(req);
  if (limited) return limited;
  const { id } = await ctx.params;
  const versions = await getVersions(id);
  if (!versions.length) return Response.json({ error: "Unknown policy" }, { status: 404 });
  return Response.json({ published: (await latestPublished(id)) ?? null, draft: (await getDraft(id)) ?? null, versions });
}
