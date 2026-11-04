import { NextResponse, type NextRequest } from "next/server";
import { FLOW_COOKIE, appUrl, cookieOptions, discover, oidc, safeNext } from "@/lib/auth";

const b64url = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes as ArrayBuffer).toString("base64url");
const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

/** GET /auth/login?next=/jobs → the provider's sign-in page (Authorization Code + PKCE). */
export async function GET(req: NextRequest) {
  const cfg = oidc();
  if (!cfg) return NextResponse.redirect(new URL("/signin", req.url));
  const d = await discover(cfg.issuer).catch(() => null);
  if (!d) return NextResponse.redirect(new URL("/signin?error=provider", req.url));

  const state = random();
  const nonce = random();
  const verifier = random();
  const url = new URL(d.authorization_endpoint);
  const params = {
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: `${appUrl(req)}/auth/callback`,
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
    code_challenge_method: "S256",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = NextResponse.redirect(url);
  const flow = { state, nonce, verifier, next: safeNext(req.nextUrl.searchParams.get("next")) };
  res.cookies.set(FLOW_COOKIE, JSON.stringify(flow), { ...cookieOptions(req), path: "/auth", maxAge: 600 });
  return res;
}
