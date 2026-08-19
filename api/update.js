import { update, oidcFrom } from "./_lib/sheets.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!requireAuth(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  try {
    // Vercel parses JSON bodies; the local server passes an object straight through.
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    res.status(200).json(await update(body, oidcFrom(req)));
  } catch (e) {
    console.error(e);
    // 400, not 500: every failure here is a rejected write (unknown id, bad slot,
    // field not on the allowlist), which is the caller's problem to fix.
    res.status(400).json({ error: e.message });
  }
}
