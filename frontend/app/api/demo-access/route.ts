import { codeMatches, DEMO_COOKIE, rateLimit } from "@/src/lib/security/guard";

const COOKIE_MAX_AGE = 8 * 60 * 60;

// GET: is this browser unlocked? POST { code }: unlock. DELETE: lock again.
export async function GET(req: Request) {
  const raw = req.headers.get("cookie") ?? "";
  const value = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${DEMO_COOKIE}=`))?.slice(DEMO_COOKIE.length + 1);
  return Response.json({ configured: !!process.env.DEMO_ACCESS_CODE, unlocked: codeMatches(value ? decodeURIComponent(value) : null) });
}

export async function POST(req: Request) {
  const limited = rateLimit(req);
  if (limited) return limited;
  if (!process.env.DEMO_ACCESS_CODE) return Response.json({ error: "Demo access is not configured on the server." }, { status: 503 });
  const { code } = (await req.json().catch(() => ({}))) as { code?: unknown };
  if (typeof code !== "string" || !codeMatches(code)) return Response.json({ error: "That code is not valid." }, { status: 401 });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json({ unlocked: true }, {
    headers: { "Set-Cookie": `${DEMO_COOKIE}=${encodeURIComponent(code)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}${secure}` },
  });
}

export async function DELETE() {
  return Response.json({ unlocked: false }, { headers: { "Set-Cookie": `${DEMO_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` } });
}
