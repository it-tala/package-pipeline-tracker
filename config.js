// ── TALA DASHBOARD CONFIG ─────────────────────────────────────────────
// This is the ONLY file you need to edit. The page reads the live sheet; there
// is no demo data in the app any more.
//
// Two ways to reach the tabs, in order of preference:
//
// A. PUBLISHED CSV (preferred)
//    Sheets → File → Share → Publish to web → MASTER tab → CSV → copy the URL
//    into MASTER_CSV_URL, then repeat for SCRAPE.
//    Publishing is separate from file sharing, so the file itself can stay on
//    "Restricted" and nobody needs edit access to view the dashboard.
//
// B. SHEET_ID fallback (used automatically when the URLs above are unset)
//    No publish step, but the file must be readable by "anyone with the link",
//    which makes agent names, emails and phones publicly readable. Fine for a
//    quick look, not how this should run.

window.TALA_CONFIG = {
  SHEET_ID: "1ngkYK5XJijW5JIfUD14IzxAQHxBYXVSGwa9mGejsOhI",

  MASTER_CSV_URL: "PASTE_MASTER_PUBLISHED_CSV_URL_HERE",
  SCRAPE_CSV_URL: "PASTE_SCRAPE_PUBLISHED_CSV_URL_HERE",

  // Minutes between automatic refreshes while the tab is open
  REFRESH_MINUTES: 5,
};
