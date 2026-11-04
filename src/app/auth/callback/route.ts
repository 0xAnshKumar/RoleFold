import { NextResponse, type NextRequest } from "next/server";
import { FLOW_COOKIE, appUrl, claims, discover, oidc, providerPost, setSession, usable } from "@/lib/auth";

type Flow = { state: string; nonce: string; verifier: string; next: string };

/** GET /auth/callback?code&state: check state, exchange the code (with the PKCE verifier and client secret), check nonce, set the session cookies. */
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
  const tokens = await providerPost(cfg, d, d.token_endpoint, {
    grant_type: "authorization_code", code, redirect_uri: `${appUrl(req)}/auth/callback`, code_verifier: flow.verifier,
  });

  // The token came straight from the provider over TLS (OIDC Core 3.1.3.7); the API checks the signature on every call.
  const idToken = tokens?.id_token;
  if (!usable(idToken, cfg) || claims(idToken)?.nonce !== flow.nonce) return fail("token");

  const res = NextResponse.redirect(new URL(flow.next, appUrl(req)));
  await setSession(res, req, idToken, tokens?.refresh_token);
  res.cookies.delete({ name: FLOW_COOKIE, path: "/auth" });
  return res;
}
