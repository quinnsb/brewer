import { test } from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession, sessionCookie, clearCookie, readCookie } from "../../lib/session.mjs";

const SECRET = "test-secret-value";

test("a freshly signed session verifies", () => {
  const token = signSession(SECRET, 3600);
  assert.equal(verifySession(SECRET, token), true);
});

test("a session signed with another secret is rejected", () => {
  assert.equal(verifySession(SECRET, signSession("different-secret", 3600)), false);
});

test("a tampered payload is rejected", () => {
  const token = signSession(SECRET, 3600);
  const [payload, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ exp: Date.now() + 9e9 })).toString("base64url");
  assert.notEqual(forged, payload);
  assert.equal(verifySession(SECRET, `${forged}.${mac}`), false);
});

test("an expired session is rejected even though the signature is good", () => {
  assert.equal(verifySession(SECRET, signSession(SECRET, -1)), false);
});

test("garbage is rejected rather than throwing", () => {
  for (const junk of ["", "no-dot", "a.b", "....", null, undefined]) {
    assert.equal(verifySession(SECRET, junk), false, `should reject ${JSON.stringify(junk)}`);
  }
});

test("a missing secret can never verify", () => {
  assert.equal(verifySession("", signSession(SECRET, 3600)), false);
  assert.equal(verifySession(undefined, signSession(SECRET, 3600)), false);
});

test("the cookie is HttpOnly, Secure, SameSite and path-scoped", () => {
  const cookie = sessionCookie(signSession(SECRET, 3600), 3600);
  assert.match(cookie, /^admin_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=3600/);
});

test("clearing the cookie expires it immediately", () => {
  assert.match(clearCookie(), /admin_session=;/);
  assert.match(clearCookie(), /Max-Age=0/);
});

test("readCookie picks one cookie out of a header", () => {
  assert.equal(readCookie("a=1; admin_session=xyz; b=2", "admin_session"), "xyz");
  assert.equal(readCookie("admin_session=xyz", "admin_session"), "xyz");
  assert.equal(readCookie("other=1", "admin_session"), null);
  assert.equal(readCookie(undefined, "admin_session"), null);
});

/* A session value that happens to contain an equals sign, which base64url does
   not produce but a hand-edited cookie could. */
test("readCookie keeps everything after the first equals", () => {
  assert.equal(readCookie("admin_session=a=b=c", "admin_session"), "a=b=c");
});
