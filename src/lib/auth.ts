// OIDC sign-in (Authorization Code + PKCE), server side only: src/app/auth/* route handlers and src/proxy.ts.
// The session cookie holds the provider's ID token; the API verifies its signature (api/app/core/auth.py),
// so OIDC_AUDIENCE on the API must equal OIDC_CLIENT_ID here.
// Refresh: when SESSION_SECRET is set and the provider lists offline_access, the refresh token is kept in its own
// httpOnly cookie, AES-GCM encrypted, and src/proxy.ts swaps it for a new ID token when the session expires.
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE = "hunt_session";
export const REFRESH_COOKIE = "hunt_refresh";
export const FLOW_COOKIE = "hunt_oidc";
const REFRESH_MAX_AGE = 30 * 24 * 3600; // the provider's own refresh-token lifetime still applies

export const oidc = () => {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  return issuer && clientId ? { issuer, clientId, clientSecret: process.env.OIDC_CLIENT_SECRET ?? "" } : null;
};

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
  scopes_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
};
type Config = NonNullable<ReturnType<typeof oidc>>;
type Tokens = { id_token?: string; refresh_token?: string };

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

/** Unexpired, with `marginS` seconds to spare. */
export const live = (jwt: string | undefined, marginS = 0) => (claims(jwt)?.exp ?? 0) * 1000 > Date.now() + marginS * 1000;

/** POST to a provider endpoint with client authentication. client_secret_basic is the OIDC default; fall back to
 * client_secret_post when the provider doesn't list basic. Null on any failure. */
export async function providerPost(cfg: Config, d: Discovery, url: string, params: Record<string, string>): Promise<Tokens | null> {
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  const methods = d.token_endpoint_auth_methods_supported;
  if (!methods || methods.includes("client_secret_basic")) {
    headers.Authorization = `Basic ${btoa(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`)}`;
  } else {
    body.set("client_id", cfg.clientId);
    body.set("client_secret", cfg.clientSecret);
  }
  return fetch(url, { method: "POST", headers, body, cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<Tokens>) : null))
    .catch(() => null);
}

/** A provider ID token we can use as the session: ours (issuer, audience) and unexpired. */
export function usable(idToken: string | undefined, cfg: Config): idToken is string {
  const c = claims(idToken);
  return !!c && c.iss === cfg.issuer && [c.aud].flat().includes(cfg.clientId) && live(idToken);
}

// ---- refresh token: sealed with AES-GCM under a key derived from SESSION_SECRET (Web Crypto)

const secretKey = async (secret: string) =>
  crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)), "AES-GCM", false, ["encrypt", "decrypt"]);

/** Refresh tokens are kept only with a SESSION_SECRET of 32+ characters. */
export const sessionSecret = () => ((process.env.SESSION_SECRET?.length ?? 0) >= 32 ? process.env.SESSION_SECRET! : null);

/** base64url(12-byte IV + ciphertext with GCM tag). */
export async function seal(value: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await secretKey(secret), new TextEncoder().encode(value));
  return Buffer.concat([iv, new Uint8Array(ct)]).toString("base64url");
}

/** Null when tampered with, sealed under another secret, or malformed. */
export async function unseal(sealed: string, secret: string): Promise<string | null> {
  try {
    const raw = Buffer.from(sealed, "base64url");
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.subarray(0, 12) }, await secretKey(secret), raw.subarray(12));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/** Session cookie (lives as long as the ID token) and, when there is one, the sealed refresh token. */
export async function setSession(res: NextResponse, req: NextRequest, idToken: string, refreshToken?: string) {
  res.cookies.set(SESSION_COOKIE, idToken, { ...cookieOptions(req), path: "/", maxAge: claims(idToken)!.exp! - Math.floor(Date.now() / 1000) });
  const secret = sessionSecret();
  if (refreshToken && secret) res.cookies.set(REFRESH_COOKIE, await seal(refreshToken, secret), { ...cookieOptions(req), path: "/", maxAge: REFRESH_MAX_AGE });
}

export function clearSession(res: NextResponse) {
  res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  res.cookies.delete({ name: REFRESH_COOKIE, path: "/" });
}

const refreshing = new Map<string, Promise<{ idToken: string; refreshToken: string } | null>>();

/** Swap the sealed refresh token for a new ID token (and the provider's rotated refresh token, if any).
 * Null means sign in again. Concurrent requests with the same cookie share one provider call, so a provider that
 * rotates refresh tokens doesn't see the old one reused.
 * shortcut: the de-duplication is per server process; with several Next instances, use sticky sessions or a shared lock. */
export function refresh(sealed: string): Promise<{ idToken: string; refreshToken: string } | null> {
  let p = refreshing.get(sealed);
  if (!p) {
    p = (async () => {
      const cfg = oidc();
      const secret = sessionSecret();
      const rt = cfg && secret ? await unseal(sealed, secret) : null;
      const d = rt ? await discover(cfg!.issuer).catch(() => null) : null;
      const t = d ? await providerPost(cfg!, d, d.token_endpoint, { grant_type: "refresh_token", refresh_token: rt! }) : null;
      return t && usable(t.id_token, cfg!) ? { idToken: t.id_token, refreshToken: t.refresh_token ?? rt! } : null;
    })().finally(() => setTimeout(() => refreshing.delete(sealed), 10_000));
    refreshing.set(sealed, p);
  }
  return p;
}

/** Same-origin path only, so ?next= can't bounce the user to another site. */
export const safeNext = (next: string | null) => (next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/jobs");
