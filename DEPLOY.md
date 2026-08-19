# Deploying to Vercel

Local dev needs none of this — `npm start` uses your gcloud ADC and leaves the
login gate open. This file is only for putting the app on the internet, which is
what you need for phone access during outreach.

The same three handlers run in both places. Only the credential source and the
auth gate differ, and both are decided by environment variables.

---

## 1. Connect Vercel to Google without a key

**Service account keys are not an option here.** The org enforces
`constraints/iam.disableServiceAccountKeyCreation`, so
`gcloud iam service-accounts keys create` fails for every service account in
`john-lau-v01`. That is policy, not permissions — no amount of IAM tinkering
changes it.

Workload Identity Federation is the sanctioned replacement, and it is better than
a key would have been: Vercel mints a short-lived OIDC token for each running
function, GCP trades it for a 1-hour access token impersonating the bot, and
nothing long-lived is stored anywhere.

Everything it needs is already permitted — `iam.workloadIdentityPoolProviders` is
`allValues: ALLOW` and you hold `roles/owner`.

### a. Read the claims off the Vercel page

Vercel → Project → Settings → Security → **Secure Backend Access with OIDC
Federation**. Enable it and leave Issuer Mode on **Team** (recommended).

The page then shows a claims table — `iss`, `aud`, `sub` and the rest — with the
exact strings. Copy them from there; there is no need to derive anything.

For this project they are:

| Claim | Value |
|---|---|
| `iss` | `https://oidc.vercel.com/it-4707s-projects` |
| `aud` | `https://vercel.com/it-4707s-projects` |
| `sub` | `owner:it-4707s-projects:project:package-pipeline-tracker:environment:production` |

The team slug is `it-4707s-projects` — the path segment in your Vercel URL, and
what appears in all three values. Switching Issuer Mode to Global would change
`iss` to a bare `https://oidc.vercel.com`, which then no longer identifies your
team; Team mode is the safer default and what the provider below is configured
for.

`sub` ends in the **environment**. The value above is `production`; preview
deployments produce `...:environment:preview`, which is a different principal and
needs its own binding in step (c).

### b. Create the pool and provider

> **Already done for this project** — pool `vercel`, provider `vercel-oidc`, and the
> production binding are all in place and verified. Kept here for reference and for
> setting up a second environment.

One command per line, no continuations — these are written to paste into **either**
Git Bash or PowerShell. (A trailing `` ` `` is PowerShell-only; in bash it opens
command substitution and the command silently does something else entirely.)

```
gcloud services enable sts.googleapis.com --project john-lau-v01
```
```
gcloud iam workload-identity-pools create vercel --location=global --display-name="Vercel" --project john-lau-v01
```
```
gcloud iam workload-identity-pools providers create-oidc vercel-oidc --location=global --workload-identity-pool=vercel --issuer-uri="https://oidc.vercel.com/it-4707s-projects" --allowed-audiences="https://vercel.com/it-4707s-projects" --attribute-mapping="google.subject=assertion.sub" --project john-lau-v01
```

`--allowed-audiences` matters. GCP's other option is a "default audience" of
`https://iam.googleapis.com/projects/.../providers/...`, but a token only carries
that `aud` if the code explicitly requests it, which needs the `@vercel/oidc`
package. Using the allowed-audiences form keeps this app dependency-free.

### c. Let that identity impersonate the bot

`693987894476` is this project's number. Add one binding per environment you
deploy — `production` and `preview` are separate subjects:

```
gcloud iam service-accounts add-iam-policy-binding capture-worker@john-lau-v01.iam.gserviceaccount.com --role=roles/iam.workloadIdentityUser --member="principal://iam.googleapis.com/projects/693987894476/locations/global/workloadIdentityPools/vercel/subject/owner:it-4707s-projects:project:package-pipeline-tracker:environment:production" --project john-lau-v01
```

Scoping to one `subject` rather than the whole pool means only this project's
production functions can assume the bot — not every workload federated into that
pool later.

### Verify before you configure

Guessing a slug wrong costs you a `STS exchange failed` with no indication of
which field is at fault. To read the real claims instead:

```powershell
npx vercel link
npx vercel env pull          # writes .env.local, including VERCEL_OIDC_TOKEN
node tools/decode-oidc.mjs   # prints iss / aud / sub, and the commands above filled in
```

The bot already has `fileOrganizer` (Content Manager) on the spreadsheet, so no
further sharing is needed.

## 2. Set environment variables

Vercel → Project → Settings → Environment Variables. Apply to Production,
Preview and Development.

| Variable | Value |
|---|---|
| `APP_PASSWORD` | the shared password people will type. **Required** |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/693987894476/locations/global/workloadIdentityPools/vercel/providers/vercel-oidc` |
| `GCP_SERVICE_ACCOUNT_EMAIL` | `capture-worker@john-lau-v01.iam.gserviceaccount.com` |
| `SESSION_SECRET` | any long random string (optional) |
| `SHEET_ID` | only if running against a copy |

`VERCEL_OIDC_TOKEN` is injected by Vercel at runtime — you do not set it.

`GOOGLE_SERVICE_ACCOUNT_KEY` is still supported by the code for other hosts, but
cannot be produced for this project. Leave it unset.

Without `APP_PASSWORD` the gate is open, and an open deployment is a public write
endpoint on your tracker. The app cannot tell that apart from deliberate local
dev, so nothing will warn you.

`SESSION_SECRET` exists so you can sign everyone out — change it and every
existing cookie stops validating — without also changing the password people type.

## 3. Deploy

Push to GitHub, then Vercel → Add New Project → import the repo.

- Framework preset: **Other**
- Build command: none
- Output directory: none

`vercel.json` handles the rest. There is no build step and no dependencies, so
the install phase is a no-op.

## 4. Lock the spreadsheet down

Once the deployed app reads through the federated identity, nothing needs link
access any more:

**Share → General access → Restricted.**

It is currently *Anyone with the link — Editor*, which means anyone holding the
URL can edit or delete the tracker. Tightening it does not affect the bot, which
has its own grant.

If you still want the static CSV fallback to work for anyone, publish the two tabs
(File → Share → Publish to web → CSV) and paste those URLs into `config.js`.
Publishing is independent of sharing, so the file itself can stay Restricted.

---

## What runs where

| | Local (`npm start`) | Vercel |
|---|---|---|
| Google auth | your gcloud ADC | Workload Identity Federation (no stored secret) |
| Login gate | open unless `APP_PASSWORD` set | password required |
| Cookie `Secure` flag | off (plain http) | on (https) |
| Handlers | `tools/server.mjs` imports `api/*.js` | `api/*.js` directly |

`tools/server.mjs` deliberately imports the real handlers rather than
reimplementing them, so local behaviour and production behaviour cannot drift.

## Endpoints

| | |
|---|---|
| `POST /api/login` | `{password}` → sets an HttpOnly session cookie |
| `GET /api/data` | MASTER + SCRAPE as raw rows, straight from the Sheets API |
| `POST /api/update` | `{id, slot, field, value, note}` → one allowlisted cell + a LOG row |

`/api/update` never accepts a row index, only an ID, because rows move when the
sheet is sorted. Formula columns — `ADR FLAG`, `BEST STAGE`, `OVERDUE?` — are
absent from the allowlist and are rejected with a 400.

## Troubleshooting

**403 with a message about quota projects** — the ADC path is missing the
`x-goog-user-project` header. Handled in `api/_lib/sheets.js`; if you see it in
new code, that is the cause. Federated and service-account tokens do not need it.

**`STS exchange failed`** — the audience or issuer in the GCP provider does not
match what Vercel is sending. Re-read both from the Vercel OIDC settings page;
they are easy to mistype and the error does not say which one is wrong.

**`impersonation failed`** — the STS exchange worked but the subject is not bound
to the service account. Re-check the `principal://` member in step 1c against the
Subject shown in Vercel.

**401 on every request after deploying** — `APP_PASSWORD` is set but the cookie
is being dropped. Check the site is on https; the cookie is `Secure` in
production and browsers discard `Secure` cookies over plain http.

**Writes succeed but the page shows old values** — you are on the published-CSV
fallback, not the API. CSV lags several minutes. Check `/api/data` returns 200.
