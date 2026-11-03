import { healthReport } from "@/src/lib/health";
import { rateLimit } from "@/src/lib/security/guard";

// GET: MongoDB and Vault status, store switches and configuration warnings, with
// status "ok" or "degraded". Always HTTP 200: this is information, not a
// healthcheck (use /api/health/live). No secrets, connection strings or Vault
// internals. Rate limited, no demo code needed.
export async function GET(req: Request) {
  const limited = rateLimit(req);
  if (limited) return limited;
  return Response.json(await healthReport(), { headers: { "Cache-Control": "no-store" } });
}
