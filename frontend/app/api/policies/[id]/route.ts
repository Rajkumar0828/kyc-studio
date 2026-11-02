import { providerName } from "@/src/lib/ai/provider";
import { signCompile } from "@/src/lib/policy/compileToken";
import { CompiledRules } from "@/src/lib/policy/schema";
import { getPolicyStore } from "@/src/lib/policy/store";
import { rateLimit } from "@/src/lib/security/guard";

// Rule fields of a stored spec, for re-signing what the store already holds.
const rulesOf = (spec: CompiledRules) => CompiledRules.parse(Object.fromEntries(Object.keys(CompiledRules.shape).map((k) => [k, spec[k as keyof CompiledRules]])));

// GET: the latest published version (null if none or archived), the draft, the
// version numbers, the number the next publish will get, and compile tokens so
// the Studio can save the stored rules again without recompiling unchanged text.
export async function GET(req: Request, ctx: RouteContext<"/api/policies/[id]">) {
  const limited = rateLimit(req);
  if (limited) return limited;
  const { id } = await ctx.params;
  const store = getPolicyStore();
  const [published, draft, versions, archived] = await Promise.all([store.get(id), store.getDraft(id), store.versions(id), store.isArchived(id)]);
  if (!versions.length && !draft) return Response.json({ error: "Unknown policy" }, { status: 404 });
  return Response.json({
    published, draft, versions, archived, nextVersion: (versions.at(-1) ?? 0) + 1,
    provider: providerName(), // which AI mode this server runs (mock|meta), for labels in the UI
    draftToken: draft ? signCompile({ sourceText: draft.sourceText, rules: draft.rules, compile: draft.compile }) : null,
    publishedToken: published ? signCompile({ sourceText: published.spec.sourceText, rules: rulesOf(published.spec), compile: published.compile }) : null,
  });
}
