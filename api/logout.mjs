import { clearCookie } from "../lib/session.mjs";
import { json, methodNotAllowed } from "../lib/http.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  return json(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
}
