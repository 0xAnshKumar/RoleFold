import { NextResponse, type NextRequest } from "next/server";
import { FLOW_COOKIE, SESSION_COOKIE, appUrl, claims, cookieOptions, discover, live, oidc } from "@/lib/auth";

type Flow = { state: string; nonce: string; verifier: string; next: string };

/** GET /auth/callback?code&state: check state, exchange the code (with the PKCE verifier and client secret), check nonce, set the session cookie. */
export async function GET(req: NextRequest) {
  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/signin?error=${reason}`, appUrl(req)));
    res.cookies.delete({ name: FLOW_COOKIE, path: "/auth" });
    return res;
  };
  const cfg = oidc();
  if (!cfg) return fail("config");
  let flow: Flow;
  try {
    flow = JSON.parse(req.cookies.get(FLOW_COOKIE)?.value ?? "");
  } catch {
    return fail("state");
  }
  const p = req.nextUrl.searchParams;
  const code = p.get("code");
  if (p.get("error") === "access_denied") return fail("denied");
  if (!code || !flow.state || p.get("state") !== flow.state) return fail("state");

  const d = await discover(cfg.issuer).catch(() => null);
  if (!d) return fail("provider");
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: `${appUrl(req)}/auth/callback`, code_verifier: flow.verifier });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  // client_secret_basic is the OIDC default; fall back to client_secret_post when the provider doesn't list basic.
  const methods = d.token_endpoint_auth_methods_supported;
  if (!methods || methods.includes("client_secret_basic")) {
    headers.Authorization = `Basic ${btoa(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`)}`;
  } else {
    body.set("client_id", cfg.clientId);
    body.set("client_secret", cfg.clientSecret);
  }
  const tokens = await fetch(d.token_endpoint, { method: "POST", headers, body, cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ id_token?: string }>) : null))
    .catch(() => null);

  // The token came straight from the provider over TLS (OIDC Core 3.1.3.7); the API checks the signature on every call.
  const idToken = tokens?.id_token;
  const c = claims(idToken);
  if (!idToken || !c || c.nonce !== flow.nonce || c.iss !== cfg.issuer || ![c.aud].flat().includes(cfg.clientId) || !live(idToken)) return fail("token");

  const res = NextResponse.redirect(new URL(flow.next, appUrl(req)));
  res.cookies.set(SESSION_COOKIE, idToken, { ...cookieOptions(req), path: "/", maxAge: c.exp! - Math.floor(Date.now() / 1000) });
  res.cookies.delete({ name: FLOW_COOKIE, path: "/auth" });
  return res;
}
