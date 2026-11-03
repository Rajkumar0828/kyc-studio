import { healthReport } from "@/src/lib/health";
import { rateLimit } from "@/src/lib/security/guard";
import { errorResponse } from "@/src/lib/security/errors";

// GET: MongoDB and Vault status, store switches and configuration warnings, with
// status "ok" or "degraded". Always HTTP 200: this is information, not a
// healthcheck (use /api/health/live). No secrets, connection strings or Vault
// internals. Rate limited, no demo code needed.
export async function GET(req: Request) {
  const limited = rateLimit(req);
  if (limited) return limited;
  try {
    return Response.json(await healthReport(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "Could not build the health report");
  }
}
