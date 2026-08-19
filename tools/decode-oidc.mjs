// Reads a real Vercel OIDC token and prints the exact values the GCP setup needs,
// so the issuer / audience / subject are never guessed from a pattern.
//
//   npx vercel link
//   npx vercel env pull          # writes .env.local with VERCEL_OIDC_TOKEN
//   node tools/decode-oidc.mjs
//
// Or paste a token directly:  node tools/decode-oidc.mjs eyJhbGci...
//
// Decodes only - it never verifies the signature and never calls out anywhere.

import { readFileSync } from "node:fs";

const PROJECT_NUMBER = "693987894476";
const SA = "capture-worker@john-lau-v01.iam.gserviceaccount.com";
const POOL = "vercel";

function findToken() {
  const arg = process.argv[2];
  if (arg) return arg.trim();
  if (process.env.VERCEL_OIDC_TOKEN) return process.env.VERCEL_OIDC_TOKEN;
  for (const f of [".env.local", ".env"]) {
    try {
      const m = readFileSync(f, "utf8").match(/^VERCEL_OIDC_TOKEN\s*=\s*"?([^"\r\n]+)"?/m);
      if (m) return m[1].trim();
    } catch { /* next candidate */ }
  }
  return null;
}

const token = findToken();
if (!token) {
  console.error(
    "\nNo token found. Run `npx vercel link` then `npx vercel env pull`,\n" +
    "or pass one directly: node tools/decode-oidc.mjs eyJhbGci...\n\n" +
    "If `vercel env pull` produced no VERCEL_OIDC_TOKEN, OIDC federation is not\n" +
    "enabled yet: Project -> Settings -> Security -> Secure backend access.\n"
  );
  process.exit(1);
}

const parts = token.split(".");
if (parts.length !== 3) { console.error("\nThat does not look like a JWT (expected three dot-separated parts).\n"); process.exit(1); }

const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
const { iss, aud, sub, exp } = claims;

console.log("\n  CLAIMS");
console.log(`    iss  ${iss}`);
console.log(`    aud  ${Array.isArray(aud) ? aud.join(", ") : aud}`);
console.log(`    sub  ${sub}`);
if (exp) {
  const left = Math.round((exp * 1000 - Date.now()) / 60000);
  console.log(`    exp  ${new Date(exp * 1000).toISOString()} (${left} min from now)`);
}

const audience = Array.isArray(aud) ? aud[0] : aud;

// One command per line, no continuations. A trailing backslash is bash-only and a
// trailing backtick is PowerShell-only; pasting the wrong one into the other shell
// fails in a way that looks like nothing happened.
console.log(`\n  RUN THESE - one line each, paste into any shell\n`);
console.log(`gcloud services enable sts.googleapis.com --project john-lau-v01\n`);
console.log(`gcloud iam workload-identity-pools create ${POOL} --location=global --display-name="Vercel" --project john-lau-v01\n`);
console.log(`gcloud iam workload-identity-pools providers create-oidc ${POOL}-oidc --location=global --workload-identity-pool=${POOL} --issuer-uri="${iss}" --allowed-audiences="${audience}" --attribute-mapping="google.subject=assertion.sub" --project john-lau-v01\n`);
console.log(`gcloud iam service-accounts add-iam-policy-binding ${SA} --role=roles/iam.workloadIdentityUser --member="principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/subject/${sub}" --project john-lau-v01\n`);

console.log(`  VERCEL ENV VARS\n`);
console.log(`    GCP_WORKLOAD_IDENTITY_PROVIDER = projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${POOL}-oidc`);
console.log(`    GCP_SERVICE_ACCOUNT_EMAIL      = ${SA}`);
console.log(`    APP_PASSWORD                   = <the shared password>\n`);

if (/environment:development$/.test(sub || "")) {
  console.log("  NOTE  This token is from the development environment. The subject for your");
  console.log("        deployed site ends in :production - bind that one too, or production");
  console.log("        will fail with `impersonation failed`.\n");
}
