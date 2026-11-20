import { NextResponse, type NextRequest } from "next/server";
import { REFRESH_COOKIE, SESSION_COOKIE, apiHeaders, clearSession, live, oidc, refresh, setSession } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  let token = req.cookies.get(SESSION_COOKIE)?.value;
  const sealed = req.cookies.get(REFRESH_COOKIE)?.value;
  const { pathname, search } = req.nextUrl;

  // Session expired or about to: swap the refresh token for a new ID token. The request cookie is rewritten too, so
  // server loaders (src/lib/data.ts, cookies()) and the /v1 bearer below already use the new token.
  const renewed = oidc() && sealed && !live(token, 60) ? await refresh(sealed) : null;
  if (renewed) {
    token = renewed.idToken;
    req.cookies.set(SESSION_COOKIE, token);
  }
  const next = async (headers: Headers) => {
    const res = NextResponse.next({ request: { headers } });
    if (renewed) await setSession(res, req, renewed.idToken, renewed.refreshToken);
    return res;
  };

  // Browser API calls (/v1 is rewritten to API_URL in next.config.ts): attach the httpOnly session as a bearer token.
  if (pathname.startsWith("/v1/")) return next(apiHeaders(req.headers, token));

  // App pages need a live session once OIDC is configured (dev users skip it).
  // Admin pages need one too; whether the user is an admin is checked by the API on every call.
  if (!oidc() || process.env.NEXT_PUBLIC_DEV_USER || live(token)) return next(req.headers);
  const res = NextResponse.redirect(new URL(`/signin?next=${encodeURIComponent(pathname + search)}`, req.url));
  if (token || sealed) clearSession(res); // expired, and no refresh token or the provider refused it
  return res;
}

// The routes in src/app/(app)/ and src/app/admin/ plus the API proxy. Keep in step when adding an app section.
export const config = {
  matcher: ["/v1/:path*", "/jobs/:path*", "/feed/:path*", "/skills/:path*", "/resumes/:path*", "/profile/:path*", "/settings/:path*", "/onboarding/:path*", "/admin/:path*"],
};
