# Tala pipeline dashboard

Dashboard for the pipeline tracker. Stages, scores and validation are edited here
and written straight into the Google Sheet, which stays the single source of truth
— the app writes *into* it rather than keeping its own copy. No database.

See **DEPLOY.md** for putting it on Vercel, and **V2_REQUIREMENTS.md** for what is
built and what is not.

## How it works

Google Sheet (MASTER, SCRAPE, LOG)
        ↑↓  Sheets API, via Vercel functions in api/
This page (workflow tree, follow-up queue, funnel, filters)

Reads come back live, so a change is visible on the next refresh rather than
minutes later. Writes are restricted to an allowlist of columns, addressed by
building ID rather than row number, and every one is appended to the LOG tab.
Formula columns cannot be written at all.

Without a backend reachable the page falls back to published CSV and goes
read-only, which is what happens if you open index.html straight off disk.

## Setup (10 minutes)

1. **Publish the sheet tabs**
   In Google Sheets: File → Share → Publish to web.
   - Select the `MASTER` tab, format `Comma-separated values (.csv)` → copy the URL
   - Repeat for the `SCRAPE` tab
   (Publishing exposes only those tabs, read-only, at an unguessable URL.)

2. **Edit `config.js`**
   Paste both URLs. Until you do, the page falls back to reading the sheet by
   `SHEET_ID`, which requires the file to be link-readable — publishing and then
   setting the file to Restricted is the safer end state.

3. **Deploy to Vercel**
   - Push this folder to a GitHub repo
   - vercel.com → Add New Project → import the repo
   - Framework preset: **Other**. No build command, no output directory. Deploy.

   Or without GitHub: `npm i -g vercel && vercel` from this folder.

4. Open the deployed URL. It refreshes itself every 5 minutes
   (configurable in `config.js`).

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole dashboard (single file, vanilla JS) |
| `config.js`  | The only file you edit — CSV URLs + refresh interval |
| `vercel.json`| Static hosting config (no-store cache so data is always fresh) |

## Rules that keep it working

- **Never insert, delete, or reorder columns** in MASTER or SCRAPE —
  the dashboard reads columns by position (the column map is at the top
  of the script in `index.html`). Adding rows is always fine.
- Dates in the sheet should stay in `yyyy-mm-dd` format (the template
  already formats them this way).
- Published CSVs update ~5 minutes after a sheet edit; the page's
  Refresh button re-fetches immediately.

## Privacy note

The deployed app reaches the sheet through a service account, so the file itself
should be set to **Restricted** — nothing needs link access once the backend is
live. The app is behind a shared password (`APP_PASSWORD`).

The published-CSV fallback is the exception: it requires the sheet to be readable
by anyone with the link, which exposes agent names, emails and phone numbers. Use
it for a quick look, not as the running setup.
