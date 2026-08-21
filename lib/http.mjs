/* Small shared plumbing for the admin functions. Vercel parses a JSON body for
   us, the local dev server does not, so readJson handles both. */

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

export function json(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  /* Nothing the admin returns should ever sit in a cache. */
  res.setHeader("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return json(res, 405, { error: `Use ${allowed.join(" or ")}` });
}

/* Missing configuration is the most likely thing to go wrong on a fresh deploy,
   and a 500 with no explanation is a miserable way to find that out. */
export function requireEnv(res, ...names) {
  const missing = names.filter((name) => !process.env[name]);
  if (!missing.length) return true;
  json(res, 500, { error: `Server is missing ${missing.join(", ")}. Set it in the Vercel project settings.` });
  return false;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
