// GET: liveness for container healthchecks. Answers as long as the server can
// serve requests; it never touches MongoDB or Vault, so a configuration warning
// (e.g. "Vault restarted") can't mark the container unhealthy. Readiness and
// warnings are at /api/health. No rate limit: it does no I/O.
export function GET() {
  return Response.json({ live: true }, { headers: { "Cache-Control": "no-store" } });
}
