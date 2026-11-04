import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, live, oidc } from "@/lib/auth";

export function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const { pathname, search } = req.nextUrl;

  // Browser API calls (/v1 is rewritten to API_URL in next.config.ts): attach the httpOnly session as a bearer token.
  if (pathname.startsWith("/v1/")) {
    if (!token) return;
    const headers = new Headers(req.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return NextResponse.next({ request: { headers } });
  }

  // App pages need a live session once OIDC is configured (dev users and forced demo mode skip it).
  if (!oidc() || process.env.NEXT_PUBLIC_DEV_USER || process.env.HUNT_DEMO === "1" || live(token)) return;
  const res = NextResponse.redirect(new URL(`/signin?next=${encodeURIComponent(pathname + search)}`, req.url));
  if (token) res.cookies.delete({ name: SESSION_COOKIE, path: "/" }); // expired
  return res;
}

// The routes in src/app/(app)/ plus the API proxy. Keep in step when adding an app section.
export const config = {
  matcher: ["/v1/:path*", "/jobs/:path*", "/resumes/:path*", "/profile/:path*", "/settings/:path*", "/onboarding/:path*"],
};
