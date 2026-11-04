// OIDC sign-in (Authorization Code + PKCE), server side only: src/app/auth/* route handlers and src/proxy.ts.
// The session cookie holds the provider's ID token; the API verifies its signature (api/app/core/auth.py),
// so OIDC_AUDIENCE on the API must equal OIDC_CLIENT_ID here.
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "hunt_session";
export const FLOW_COOKIE = "hunt_oidc";

export const oidc = () => {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  return issuer && clientId ? { issuer, clientId, clientSecret: process.env.OIDC_CLIENT_SECRET ?? "" } : null;
};

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  token_endpoint_auth_methods_supported?: string[];
};

let discovery: Promise<Discovery> | undefined;
/** Provider metadata, fetched once per server process (retried after a failure). */
export function discover(issuer: string): Promise<Discovery> {
  discovery ??= fetch(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`, { cache: "no-store" }).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(`OIDC discovery failed: ${r.status}`)),
  );
  discovery.catch(() => (discovery = undefined));
  return discovery;
}

/** Public origin for redirect URIs (APP_URL behind a proxy; the request origin otherwise). */
export const appUrl = (req: NextRequest) => (process.env.APP_URL ?? req.nextUrl.origin).replace(/\/$/, "");

export const cookieOptions = (req: NextRequest) => ({ httpOnly: true, secure: appUrl(req).startsWith("https:"), sameSite: "lax" as const });

/** Unverified JWT payload: only for expiry and nonce checks. The API verifies the signature on every call. */
export function claims(jwt: string | undefined): { exp?: number; nonce?: string; iss?: string; aud?: string | string[] } | null {
  try {
    return JSON.parse(Buffer.from(jwt!.split(".")[1], "base64url").toString());
  } catch {
    return null;
  }
}

export const live = (jwt: string | undefined) => (claims(jwt)?.exp ?? 0) * 1000 > Date.now();

/** Same-origin path only, so ?next= can't bounce the user to another site. */
export const safeNext = (next: string | null) => (next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/jobs");
