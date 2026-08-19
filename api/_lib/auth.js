// Shared-password gate. A deployed write endpoint with no auth is a public write
// endpoint, so this is not optional once the app leaves localhost.
//
// Env:
//   APP_PASSWORD    required in production. Unset = local dev, gate is open.
//   SESSION_SECRET  optional; defaults to APP_PASSWORD. Set it to be able to
//                   invalidate every session without changing the password.
//
// The cookie carries an HMAC, never the password. It is HttpOnly, so page
// scripts cannot read it and a stored XSS cannot exfiltrate it.

import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "tala_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const password = () => process.env.APP_PASSWORD || "";
const secret = () => process.env.SESSION_SECRET || password();

/** Local dev with no password set: the gate is open and login is a no-op. */
export const authDisabled = () => !password();

const token = () => createHmac("sha256", secret()).update("v1").digest("hex");

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(supplied) {
  return !!supplied && safeEqual(supplied, password());
}

export function sessionCookie(secure = true) {
  return `${COOKIE}=${token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}` + (secure ? "; Secure" : "");
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function isAuthed(req) {
  if (authDisabled()) return true;
  const raw = req.headers?.cookie || "";
  const found = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith(COOKIE + "="));
  return !!found && safeEqual(found.slice(COOKIE.length + 1), token());
}

/** Returns true when the request may proceed; otherwise answers 401 itself. */
export function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "auth required" }));
  return false;
}
