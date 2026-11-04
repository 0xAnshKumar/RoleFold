import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, appUrl, discover, oidc } from "@/lib/auth";

/** POST /auth/logout (a form, so link prefetch can't sign anyone out): clear the session, then end the provider session if it supports that. */
export async function POST(req: NextRequest) {
  const cfg = oidc();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  let to = new URL("/", appUrl(req));
  const d = cfg && token ? await discover(cfg.issuer).catch(() => null) : null;
  if (cfg && token && d?.end_session_endpoint) {
    const home = to.href;
    to = new URL(d.end_session_endpoint);
    to.searchParams.set("id_token_hint", token);
    to.searchParams.set("client_id", cfg.clientId);
    to.searchParams.set("post_logout_redirect_uri", home);
  }
  const res = NextResponse.redirect(to, 303);
  res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  return res;
}
