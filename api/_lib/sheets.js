// Sheets access, shared by the Vercel functions and the local server.
// Files under api/_lib are ignored by Vercel's function detection.
//
// Three credential strategies, tried in order:
//   1. Workload Identity Federation  - Vercel. No stored secret at all.
//   2. Service account key           - other hosts. Blocked by org policy here.
//   3. gcloud ADC                    - local dev.
//
// This project enforces constraints/iam.disableServiceAccountKeyCreation, so (2)
// cannot be used with john-lau-v01 and (1) is the deployed path. It is kept because
// the code is short and the constraint is a property of the org, not of this app.
//
// No npm dependencies: both token flows are plain fetch plus node:crypto, which is
// less surface than pulling in googleapis for two endpoints.

import { createSign } from "node:crypto";
import { execSync } from "node:child_process";

export const SHEET_ID = process.env.SHEET_ID || "1ngkYK5XJijW5JIfUD14IzxAQHxBYXVSGwa9mGejsOhI";
const QUOTA_PROJECT = process.env.GOOGLE_QUOTA_PROJECT || "john-lau-v01";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const b64url = (b) => Buffer.from(b).toString("base64url");

let cached = { token: null, exp: 0, viaKey: false };

function serviceAccountKey() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  // Accept both raw JSON and base64, since Vercel's UI mangles multi-line values.
  const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const key = JSON.parse(json);
  if (!key.client_email || !key.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is missing client_email or private_key");
  return key;
}

async function tokenFromServiceAccount(key) {
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: key.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
  const body = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claim))}`;
  const sig = createSign("RSA-SHA256").update(body).sign(key.private_key.replace(/\\n/g, "\n"), "base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${body}.${sig}` }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`token exchange failed: ${j.error_description || j.error || res.status}`);
  return { token: j.access_token, exp: now + (j.expires_in || 3600) - 120 };
}

function tokenFromAdc() {
  for (const g of ["gcloud", "C:\\Program Files (x86)\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd"]) {
    try {
      // execSync, not execFileSync: Node 20+ refuses to spawn .cmd without a shell.
      const t = execSync(`"${g}" auth application-default print-access-token`, {
        encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (t) return { token: t, exp: Math.floor(Date.now() / 1000) + 1800 };
    } catch { /* try the next candidate */ }
  }
  throw new Error(
    "No credentials. Either set GOOGLE_SERVICE_ACCOUNT_KEY, or run:\n" +
    "  gcloud auth application-default login --scopes=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/cloud-platform"
  );
}

// Workload Identity Federation: Vercel mints a short-lived OIDC token for the
// running function, GCP's STS trades it for a federated token, and that is used to
// impersonate the service account. Nothing is stored and nothing is long-lived.
async function tokenFromFederation(oidc) {
  const provider = process.env.GCP_WORKLOAD_IDENTITY_PROVIDER;
  const sa = process.env.GCP_SERVICE_ACCOUNT_EMAIL;

  const sts = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audience: `//iam.googleapis.com/${provider}`,
      grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
      // cloud-platform here is for the impersonation call below, not for Sheets.
      scope: "https://www.googleapis.com/auth/cloud-platform",
      subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
      subjectToken: oidc,
    }),
  });
  const s = await sts.json();
  if (!sts.ok) throw new Error(`STS exchange failed: ${s.error_description || s.error || sts.status}`);

  const imp = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(sa)}:generateAccessToken`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: [SCOPE], lifetime: "3600s" }),
    }
  );
  const i = await imp.json();
  if (!imp.ok) throw new Error(`impersonation failed: ${i.error?.message || imp.status}`);

  return { token: i.accessToken, exp: Math.floor(Date.parse(i.expireTime) / 1000) - 120 };
}

/**
 * Where the Vercel OIDC token actually lives.
 *
 * In a Function it is the `x-vercel-oidc-token` request header. VERCEL_OIDC_TOKEN
 * only exists during builds and in local dev after `vercel env pull` - reading only
 * the env var works everywhere except the place that matters.
 */
export const oidcFrom = (req) =>
  req?.headers?.["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN || null;

const federationConfigured = (oidc) =>
  !!(oidc && process.env.GCP_WORKLOAD_IDENTITY_PROVIDER && process.env.GCP_SERVICE_ACCOUNT_EMAIL);

async function accessToken(oidc) {
  // Cached across requests on purpose: every invocation federates to the same
  // service account, so the resulting GCP token is identical whoever asked for it.
  if (cached.token && cached.exp > Math.floor(Date.now() / 1000)) return cached;
  const key = serviceAccountKey();

  if (federationConfigured(oidc)) cached = { ...(await tokenFromFederation(oidc)), viaKey: true };
  else if (key) cached = { ...(await tokenFromServiceAccount(key)), viaKey: true };
  else cached = { ...tokenFromAdc(), viaKey: false };

  return cached;
}

export async function api(path, method = "GET", body, oidc) {
  const { token, viaKey } = await accessToken(oidc);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  // User ADC bills against gcloud's own client project unless this is sent, and
  // then 403s with a message that reads like a permissions problem. A service
  // account uses its own project, so the header is only needed for the ADC path.
  if (!viaKey) headers["x-goog-user-project"] = QUOTA_PROJECT;

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}\n${text}`);
  return text ? JSON.parse(text) : {};
}

// ── column model, mirrored from index.html ───────────────────────────
const AGENT0 = 21, ABLK = 11;
const PROPERTY_FIELDS = {
  "STATUS": 6, "CONDITION NOTES": 15, "RENOVATION RATING": 16,
  "BIG ROOMS?": 17, "FINAL SCORE": 18, "VALIDATED?": 19,
};
const AGENT_FIELDS = {
  "LINK": 0, "AGENT NAME": 1, "EMAIL": 2, "PHONE": 3, "DOMINANT SUBURB": 4,
  "STAGE": 5, "SENT DATE": 6, "LAST REPLY": 7, "NEXT ACTION": 8, "REMARK": 10,
};
// Deliberately absent from both maps, because they are formulas and one write
// destroys them silently: ADR FLAG (10), BEST STAGE (20), each OVERDUE? (base+9).

function colName(i) {
  let n = "";
  for (let x = i; x >= 0; x = Math.floor(x / 26) - 1) n = String.fromCharCode(65 + (x % 26)) + n;
  return n;
}

function resolveColumn(field, slot) {
  if (slot == null) {
    const c = PROPERTY_FIELDS[field];
    if (c === undefined) throw new Error(`field "${field}" is not writable without a slot`);
    return c;
  }
  if (!(slot >= 1 && slot <= 3)) throw new Error(`slot must be 1, 2 or 3 (got ${slot})`);
  const off = AGENT_FIELDS[field];
  if (off === undefined) throw new Error(`agent field "${field}" is not writable`);
  return AGENT0 + (slot - 1) * ABLK + off;
}

export async function getData(oidc) {
  const r = await api("/values:batchGet?majorDimension=ROWS&ranges=MASTER!A1:BB1000&ranges=SCRAPE!A1:I1000", "GET", undefined, oidc);
  const [master, scrape] = r.valueRanges.map((v) => v.values || []);
  return { master, scrape, ts: new Date().toISOString() };
}

export async function update({ id, slot = null, field, value, note = "" }, oidc) {
  if (!id) throw new Error("id is required");
  const col = resolveColumn(field, slot);

  // Find the row by ID, never by index - rows move when the sheet is sorted.
  const ids = (await api("/values/MASTER!A1:A1000", "GET", undefined, oidc)).values || [];
  const row = ids.findIndex((r) => (r[0] || "").trim() === id) + 1;
  if (row < 2) throw new Error(`no MASTER row with ID ${id}`);

  const cell = `MASTER!${colName(col)}${row}`;
  const before = ((await api(`/values/${cell}`, "GET", undefined, oidc)).values || [[""]])[0]?.[0] ?? "";

  await api(`/values/${cell}?valueInputOption=USER_ENTERED`, "PUT", { values: [[value]] }, oidc);
  await api("/values/LOG!A:H:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS", "POST", {
    values: [[new Date().toISOString(), id, slot ?? "", field, before, value, note, "dashboard"]],
  }, oidc);

  return { ok: true, cell, before, after: value };
}
