// ── TALA DASHBOARD CONFIG ─────────────────────────────────────────────
// This is the ONLY file you need to edit.
//
// 1. In Google Sheets: File → Share → Publish to web
// 2. Select the MASTER tab, format = CSV → copy the URL below
// 3. Repeat for the SCRAPE tab
// 4. Leave DEMO_MODE = true until both URLs are filled in,
//    then set it to false.

window.TALA_CONFIG = {
  DEMO_MODE: true,

  MASTER_CSV_URL: "PASTE_MASTER_PUBLISHED_CSV_URL_HERE",
  SCRAPE_CSV_URL: "PASTE_SCRAPE_PUBLISHED_CSV_URL_HERE",

  // Minutes between automatic refreshes while the tab is open
  REFRESH_MINUTES: 5,
};
