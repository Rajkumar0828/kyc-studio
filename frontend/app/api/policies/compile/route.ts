import { getPolicyCompiler } from "@/src/lib/ai";
import { z } from "zod";
import { CompiledRules } from "@/src/lib/policy/schema";
import { errorResponse, metered, protect } from "@/src/lib/security/guard";

// POST { text }: English policy -> rules + warnings. The compiler's output is
// validated here whichever provider produced it.
const Warnings = z.array(z.object({
  kind: z.enum(["unsupported", "conflict", "default"]),
  sentence: z.string().max(500).optional(),
  message: z.string().max(300),
}).strict()).max(50);

export async function POST(req: Request) {
  const denied = protect(req, { ai: true });
  if (denied) return denied;
  const { text } = (await req.json().catch(() => ({}))) as { text?: unknown };
  if (typeof text !== "string" || !text.trim()) return Response.json({ error: "Enter the policy text to compile." }, { status: 400 });
  if (text.length > 4000) return Response.json({ error: "Policy text is limited to 4000 characters." }, { status: 400 });
  try {
    const compiler = getPolicyCompiler();
    const { rules, warnings } = await metered(compiler).compile(text);
    return Response.json({ rules: CompiledRules.parse(rules), warnings: Warnings.parse(warnings), provider: compiler.name });
  } catch (e) {
    return errorResponse(e, "Could not compile the policy");
  }
}
