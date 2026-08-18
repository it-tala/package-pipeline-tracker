# Tala pipeline dashboard

Read-only dashboard for the pipeline tracker. The Google Sheet stays the single
source of truth — this page only visualizes it. No backend, no database, no login.

## How it works

Google Sheet (MASTER + SCRAPE tabs, published as CSV)
        ↓  fetched on load + every 5 min
This static page on Vercel (funnel, follow-up queue, hotel cards, scrape status)

## Setup (10 minutes)

1. **Publish the sheet tabs**
   In Google Sheets: File → Share → Publish to web.
   - Select the `MASTER` tab, format `Comma-separated values (.csv)` → copy the URL
   - Repeat for the `SCRAPE` tab
   (Publishing exposes only those tabs, read-only, at an unguessable URL.)

2. **Edit `config.js`**
   Paste both URLs and set `DEMO_MODE: false`.

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

"Publish to web" makes the two tabs readable by anyone who has the exact URL.
The URL is long and random, and the page never shows it, but if the tracker
must be strictly private, switch to the Google Sheets API v4 with a read-only
API key instead (share the sheet as anyone-with-link **viewer**, restrict the
key to the Sheets API + your Vercel domain). The fetch code change is ~5 lines.
