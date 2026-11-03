import { getAuditLog } from "@/src/lib/audit";
import { storageRequirement } from "@/src/lib/health";
import { protect } from "@/src/lib/security/guard";
import { errorResponse, requiresStorage } from "@/src/lib/security/errors";

// GET: the most recent audit events (ids, types and codes only). Demo code required.
export async function GET(req: Request) {
  const denied = protect(req);
  if (denied) return denied;
  const missing = storageRequirement("audit");
  if (missing) return requiresStorage(missing);
  try {
    const log = getAuditLog();
    return Response.json({ kind: log.kind, events: await log.recent(50) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "Could not load the audit log");
  }
}
