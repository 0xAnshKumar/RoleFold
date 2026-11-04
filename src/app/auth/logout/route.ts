import { NextResponse, type NextRequest } from "next/server";
import { REFRESH_COOKIE, SESSION_COOKIE, appUrl, clearSession, discover, oidc, providerPost, sessionSecret, unseal } from "@/lib/auth";

/** POST /auth/logout (a form, so link prefetch can't sign anyone out): revoke the refresh token, clear the session,
 * then end the provider session if it supports that. */
export async function POST(req: NextRequest) {
  const cfg = oidc();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sealed = req.cookies.get(REFRESH_COOKIE)?.value;
  let to = new URL("/", appUrl(req));
  const d = cfg && (token || sealed) ? await discover(cfg.issuer).catch(() => null) : null;
  const secret = sessionSecret();
  const rt = sealed && secret ? await unseal(sealed, secret) : null;
  if (cfg && d?.revocation_endpoint && rt) await providerPost(cfg, d, d.revocation_endpoint, { token: rt, token_type_hint: "refresh_token" });
  if (cfg && token && d?.end_session_endpoint) {
    const home = to.href;
    to = new URL(d.end_session_endpoint);
    to.searchParams.set("id_token_hint", token);
    to.searchParams.set("client_id", cfg.clientId);
    to.searchParams.set("post_logout_redirect_uri", home);
  }
  const res = NextResponse.redirect(to, 303);
  clearSession(res);
  return res;
}
