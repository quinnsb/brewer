import { createHash, timingSafeEqual } from "node:crypto";
import { signSession, sessionCookie } from "../lib/session.mjs";
import { readJson, json, methodNotAllowed, requireEnv, sleep } from "../lib/http.mjs";

const TTL = 60 * 60 * 12;

/* Both sides are hashed first so the comparison is over two fixed-length
   buffers, which is what timingSafeEqual needs and also stops the length of the
   real password leaking through the length of the comparison. */
function samePassword(given, expected) {
  const a = createHash("sha256").update(String(given)).digest();
  const b = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!requireEnv(res, "ADMIN_PASSWORD", "SESSION_SECRET")) return;

  const { password } = await readJson(req);
  if (!password || !samePassword(password, process.env.ADMIN_PASSWORD)) {
    /* Serverless has no shared memory, so there is no honest per-IP rate limit
       without adding a store. A fixed delay plus a long random password is the
       tradeoff, and it is written down rather than pretended away. */
    await sleep(250);
    return json(res, 401, { error: "Wrong password" });
  }

  return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(signSession(process.env.SESSION_SECRET, TTL), TTL) });
}
