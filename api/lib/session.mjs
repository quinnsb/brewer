/* ============================================================
   SESSION — a signed cookie, and nothing more

   There is one user, so there is no session store and nothing to revoke. The
   cookie carries its own expiry and an HMAC over it, which is enough to prove
   the server issued it. Rotating SESSION_SECRET invalidates every session,
   which is the whole logout-everywhere story.
   ============================================================ */

import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "admin_session";

function mac(secret, payload) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSession(secret, ttlSeconds) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  return `${payload}.${mac(secret, payload)}`;
}

export function verifySession(secret, token) {
  if (!secret || typeof token !== "string") return false;
  const cut = token.indexOf(".");
  if (cut <= 0) return false;
  const payload = token.slice(0, cut);
  const given = token.slice(cut + 1);
  if (!given) return false;

  const expected = mac(secret, payload);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  /* timingSafeEqual throws on a length mismatch, and the length of an HMAC is
     not a secret, so the check is fine to make first. */
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}

export function sessionCookie(token, ttlSeconds) {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ttlSeconds}`;
}

export function clearCookie() {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const cut = part.indexOf("=");
    if (cut === -1) continue;
    if (part.slice(0, cut).trim() === name) return part.slice(cut + 1);
  }
  return null;
}

/* The one call every write function makes before doing anything. */
export function isAuthed(req) {
  return verifySession(process.env.SESSION_SECRET, readCookie(req.headers?.cookie, COOKIE));
}
