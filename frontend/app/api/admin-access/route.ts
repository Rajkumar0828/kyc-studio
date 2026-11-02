import { ADMIN_COOKIE, adminCodeMatches, rateLimit, requireDemoAccess } from "@/src/lib/security/guard";

const COOKIE_MAX_AGE = 60 * 60; // admin unlock lasts one hour

const adminCookie = (req: Request) => {
  const raw = req.headers.get("cookie") ?? "";
  const value = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
  return value ? decodeURIComponent(value) : null;
};

// GET: is admin unlocked? POST { code }: unlock (needs the demo code first). DELETE: lock again.
export async function GET(req: Request) {
  return Response.json({ configured: !!process.env.ADMIN_ACCESS_CODE && process.env.ADMIN_ACCESS_CODE !== process.env.DEMO_ACCESS_CODE, unlocked: adminCodeMatches(adminCookie(req)) });
}

export async function POST(req: Request) {
  const denied = rateLimit(req) ?? requireDemoAccess(req);
  if (denied) return denied;
  const { code } = (await req.json().catch(() => ({}))) as { code?: unknown };
  if (typeof code !== "string" || !adminCodeMatches(code)) return Response.json({ error: "That admin code is not valid, or admin access is not configured." }, { status: 401 });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json({ unlocked: true }, {
    headers: { "Set-Cookie": `${ADMIN_COOKIE}=${encodeURIComponent(code)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}${secure}` },
  });
}

export async function DELETE() {
  return Response.json({ unlocked: false }, { headers: { "Set-Cookie": `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` } });
}
