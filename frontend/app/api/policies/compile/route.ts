import { z } from "zod";
import { getPolicyCompiler } from "@/src/lib/ai";
import { metaSettings } from "@/src/lib/ai/meta";
import type { AiCallRecord } from "@/src/lib/ai/recordAiCall";
import { WarningKind, buildReadBack, CompileRecord, UnsupportedReasonSchema } from "@/src/lib/policy/readBack";
import { checkCompileInput } from "@/src/lib/policy/compileCore";
import { signCompile } from "@/src/lib/policy/compileToken";
import { CompiledRules } from "@/src/lib/policy/schema";
import { errorResponse, protect } from "@/src/lib/security/guard";

const Warnings = z.array(z.object({
  kind: WarningKind, sentence: z.string().max(1000).optional(), message: z.string().max(400), reason: UnsupportedReasonSchema.optional(),
}).strict()).max(100);
const sum = (xs: Array<number | null>) => (xs.some((x) => x !== null) ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : null);

// POST { text }: English policy -> rules, read-back table and call details.
// Guards: demo access code, per-IP rate limit, and the daily AI cap (checked
// here and counted per Meta API request inside the provider). The output is
// validated here whichever provider produced it, and signed so a draft can
// only be saved with rules that came from a compile.
export async function POST(req: Request) {
  const denied = protect(req, { ai: true });
  if (denied) return denied;
  const { text } = (await req.json().catch(() => ({}))) as { text?: unknown };
  if (typeof text !== "string") return Response.json({ error: "Enter the policy text to compile." }, { status: 400 });
  try {
    checkCompileInput(text);
    const calls: AiCallRecord[] = [];
    const compiler = getPolicyCompiler({ onRecord: (r) => void calls.push(r) });
    const out = await compiler.compile(text);
    const rules = CompiledRules.parse(out.rules);
    const warnings = Warnings.parse(out.warnings);
    const settings = compiler.name === "meta" ? metaSettings() : null;
    const compile = CompileRecord.parse({
      provider: compiler.name,
      model: settings?.model ?? null,
      effort: settings?.reasoningEffort.compile ?? null,
      attempts: out.attempts,
      calls: calls.length,
      usage: calls.length
        ? { inputTokens: sum(calls.map((c) => c.inputTokens)), outputTokens: sum(calls.map((c) => c.outputTokens)), reasoningTokens: sum(calls.map((c) => c.reasoningTokens)), latencyMs: sum(calls.map((c) => c.latencyMs)) }
        : null,
      rows: buildReadBack(out.sentences, { applied: out.applied, platform: out.platform, warnings }),
      compiledAt: new Date().toISOString(),
    });
    return Response.json({ rules, warnings, compile, token: signCompile({ sourceText: text, rules, compile }) });
  } catch (e) {
    return errorResponse(e, "Could not compile the policy");
  }
}
