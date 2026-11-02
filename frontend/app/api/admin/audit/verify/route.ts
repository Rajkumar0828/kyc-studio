import { getAuditLog } from "@/src/lib/audit";
import { storageRequirement } from "@/src/lib/health";
import { errorResponse, protect, requiresStorage } from "@/src/lib/security/guard";

// POST: recompute the whole hash chain and report the first broken link, if any.
export async function POST(req: Request) {
  const denied = protect(req);
  if (denied) return denied;
  const missing = storageRequirement("audit");
  if (missing) return requiresStorage(missing);
  try {
    const t0 = Date.now();
    const result = await getAuditLog().verify();
    return Response.json({ ...result, checkedAt: new Date().toISOString(), tookMs: Date.now() - t0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "Could not verify the audit chain");
  }
}
