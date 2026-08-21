import { isAuthed } from "../lib/session.mjs";
import { json, methodNotAllowed } from "../lib/http.mjs";
import { coverHostAllowed } from "../lib/sources.mjs";

const MAX_BYTES = 8 * 1024 * 1024;

/* Same-origin proxy so the browser can draw a cover to a canvas and read its
   pixels. Cross-origin images taint a canvas, and the catalogue hosts do not
   all send CORS headers, so this is the only way to sample colour client side. */
export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (!isAuthed(req)) return json(res, 401, { error: "Not signed in" });

  const url = new URL(req.url, "http://localhost").searchParams.get("url");
  if (!coverHostAllowed(url)) return json(res, 400, { error: "That host is not on the cover allowlist" });

  try {
    const upstream = await fetch(url, { headers: { "user-agent": "brewer-library-admin/0.1" }, redirect: "follow" });
    if (!upstream.ok) return json(res, 502, { error: `Cover host returned ${upstream.status}` });

    const type = upstream.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return json(res, 415, { error: `Expected an image, got ${type || "nothing"}` });

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.length > MAX_BYTES) return json(res, 413, { error: "Cover is larger than 8MB" });

    res.statusCode = 200;
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "no-store");
    return res.end(bytes);
  } catch (err) {
    return json(res, 502, { error: `Could not fetch the cover: ${err.message}` });
  }
}
