import { recentAiCalls } from "@/src/lib/ai/aiCallsMongo";
import { summarizeUsage } from "@/src/lib/ai/usage";
import { storageRequirement } from "@/src/lib/health";
import { protect } from "@/src/lib/security/guard";
import { errorResponse, requiresStorage } from "@/src/lib/security/errors";

// GET: AI usage from the ai_calls collection (metadata only). Demo code required.
export async function GET(req: Request) {
  const denied = protect(req);
  if (denied) return denied;
  const missing = storageRequirement("usage");
  if (missing) return requiresStorage(missing);
  try {
    return Response.json(summarizeUsage(await recentAiCalls()), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "Could not load AI usage");
  }
}
