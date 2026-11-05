// node --test src/lib/auth.test.mjs (Node 22.18+ runs auth.ts directly by stripping its types).
import assert from "node:assert/strict";
import test from "node:test";
import { apiHeaders, live, safeNext, seal, unseal, usable } from "./auth.ts";

const SECRET = "x".repeat(32);

test("sealed refresh token round-trips and rejects tampering or another secret", async () => {
  const sealed = await seal("rt-123", SECRET);
  assert.notEqual(sealed, await seal("rt-123", SECRET)); // fresh IV each time
  assert.ok(!sealed.includes("rt-123"));
  assert.equal(await unseal(sealed, SECRET), "rt-123");
  assert.equal(await unseal(sealed, "y".repeat(32)), null);
  const flipped = Buffer.from(sealed, "base64url");
  flipped[flipped.length - 1] ^= 1;
  assert.equal(await unseal(flipped.toString("base64url"), SECRET), null);
  assert.equal(await unseal("not base64!", SECRET), null);
});

const jwt = (c) => `h.${Buffer.from(JSON.stringify(c)).toString("base64url")}.s`;
const now = Math.floor(Date.now() / 1000);

test("expiry margin and usable session tokens", () => {
  assert.ok(live(jwt({ exp: now + 30 })) && !live(jwt({ exp: now + 30 }), 60) && !live(undefined));
  const cfg = { issuer: "https://idp/", clientId: "hunt", clientSecret: "" };
  assert.ok(usable(jwt({ iss: cfg.issuer, aud: ["hunt", "x"], exp: now + 600 }), cfg));
  assert.ok(!usable(jwt({ iss: "https://evil/", aud: "hunt", exp: now + 600 }), cfg));
  assert.ok(!usable(jwt({ iss: cfg.issuer, aud: "other", exp: now + 600 }), cfg));
  assert.ok(!usable(jwt({ iss: cfg.issuer, aud: "hunt", exp: now - 1 }), cfg));
});

test("safeNext keeps post-login redirects on this site", () => {
  for (const n of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "https://evil.example", null])
    assert.equal(new URL(safeNext(n), "https://app.example").origin, "https://app.example", JSON.stringify(n));
  assert.equal(safeNext("/jobs?x=1#top"), "/jobs?x=1#top");
});

test("/v1 headers: a client-sent X-Dev-User is dropped; only the server's own dev user is sent", () => {
  const sent = new Headers({ "X-Dev-User": "victim", Accept: "application/json" });
  const off = apiHeaders(sent, undefined, undefined);
  assert.equal(off.get("X-Dev-User"), null);
  assert.equal(off.get("Accept"), "application/json");
  assert.equal(off.get("Authorization"), null);
  const on = apiHeaders(sent, "tok", "rohan");
  assert.equal(on.get("X-Dev-User"), "rohan");
  assert.equal(on.get("Authorization"), "Bearer tok");
});
