import { checkPassword, sessionCookie, authDisabled } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  res.setHeader("Cache-Control", "no-store");

  if (authDisabled()) return res.status(200).json({ ok: true, authDisabled: true });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  if (!checkPassword(body.password)) {
    // Deliberately slow and vague: no hint about whether the password was close,
    // and enough delay to make guessing at this endpoint unattractive.
    await new Promise((r) => setTimeout(r, 700));
    return res.status(401).json({ error: "wrong password" });
  }

  // Secure only over HTTPS - a Secure cookie is dropped on plain-http localhost.
  const https = (req.headers["x-forwarded-proto"] || "").includes("https");
  res.setHeader("Set-Cookie", sessionCookie(https));
  res.status(200).json({ ok: true });
}
