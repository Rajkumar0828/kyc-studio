import { healthReport } from "@/src/lib/health";
import { rateLimit } from "@/src/lib/security/guard";

// GET: MongoDB and Vault status, store switches and configuration warnings.
// No secrets, connection strings or Vault internals. Rate limited, no demo code
// needed so it can serve as a container healthcheck.
export async function GET(req: Request) {
  const limited = rateLimit(req);
  if (limited) return limited;
  return Response.json(await healthReport(), { headers: { "Cache-Control": "no-store" } });
}
