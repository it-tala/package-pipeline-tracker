// Brings the live workbook up to the V2 structure. Idempotent - safe to re-run.
//
//   node tools/setup-sheet.mjs           show what would change
//   node tools/setup-sheet.mjs --apply   actually write
//
// Auth: your own ADC. Requires the spreadsheets scope and the x-goog-user-project
// header (raw REST calls must send it or they bill against gcloud's own project).

import { api } from "./gsheets.mjs";

const APPLY = process.argv.includes("--apply");

const log = [];
const plan = (msg) => { log.push(msg); console.log((APPLY ? "  " : "  would ") + msg); };

// ── current state ────────────────────────────────────────────────────
const meta = await api("?fields=sheets.properties(title,sheetId,gridProperties)");
const tabs = new Map(meta.sheets.map((s) => [s.properties.title, s.properties]));
console.log(`\nTabs now: ${[...tabs.keys()].join(", ")}\n`);

// ── 1. structural changes ────────────────────────────────────────────
const structural = [];

if (tabs.has("Sheet1") && !tabs.has("RAW")) {
  structural.push({
    updateSheetProperties: {
      properties: { sheetId: tabs.get("Sheet1").sheetId, title: "RAW" },
      fields: "title",
    },
  });
  plan("rename Sheet1 -> RAW");
}

const NEW_TABS = {
  MANUS_IN: ["COUNTRY", "AREA", "HOTEL NAME", "GOOGLE MAPS LINK", "DAILY RATE (RAW)"],
  LOG: ["TIMESTAMP", "ID", "SLOT", "FIELD", "FROM", "TO", "NOTE", "SOURCE"],
};

for (const [title, headers] of Object.entries(NEW_TABS)) {
  if (!tabs.has(title)) {
    structural.push({
      addSheet: {
        properties: {
          title,
          gridProperties: { rowCount: 1000, columnCount: headers.length, frozenRowCount: 1 },
        },
      },
    });
    plan(`create tab ${title} (${headers.length} cols)`);
  }
}

if (APPLY && structural.length) await api(":batchUpdate", "POST", { requests: structural });

// re-read so new tabs have ids
const meta2 = APPLY
  ? await api("?fields=sheets.properties(title,sheetId,gridProperties)")
  : meta;
const tabs2 = new Map(meta2.sheets.map((s) => [s.properties.title, s.properties]));

// ── 2. SCRAPE: split the conflated gate column ───────────────────────
// H currently holds the ENRICHED? formula under the PROCEED TO MANUS header.
// H becomes a human/app-written value; I gets the formula it should have had.
const scrape = tabs2.get("SCRAPE");
const values = [];

values.push({ range: "SCRAPE!I1", values: [["ENRICHED?"]] });
plan("SCRAPE!I1 = ENRICHED?");

// One ARRAYFORMULA rather than 999 copies: rows are appended constantly and this
// covers new ones automatically. Nothing else may write to column I.
values.push({
  range: "SCRAPE!I2",
  values: [[`=ARRAYFORMULA(IF(C2:C="","",IF(COUNTIF(MASTER!$D:$D,C2:C)>0,"YES","NOT YET")))`]],
});
plan("SCRAPE!I2 = ARRAYFORMULA(... COUNTIF MASTER!D ...)");

if (APPLY) {
  await api("/values:batchUpdate", "POST", {
    valueInputOption: "USER_ENTERED",
    data: values,
  });
  // Clear H of the misplaced formula, leaving it for human/app input.
  await api("/values/SCRAPE!H2:H1000:clear", "POST", {});
}
plan("clear SCRAPE!H2:H1000 (was the ENRICHED? formula, now a human gate)");

// headers for the new tabs
if (APPLY) {
  const headerWrites = Object.entries(NEW_TABS)
    .filter(([t]) => tabs2.has(t))
    .map(([t, h]) => ({ range: `${t}!A1`, values: [h] }));
  if (headerWrites.length) {
    await api("/values:batchUpdate", "POST", {
      valueInputOption: "RAW",
      data: headerWrites,
    });
  }
}
for (const t of Object.keys(NEW_TABS)) plan(`${t}!A1 headers`);

// ── 3. formatting + validation ───────────────────────────────────────
const fmt = [];
const boldHeader = (sheetId, cols) => ({
  repeatCell: {
    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols },
    cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.9, blue: 0.87 } } },
    fields: "userEnteredFormat(textFormat,backgroundColor)",
  },
});

for (const [title, headers] of Object.entries(NEW_TABS)) {
  const p = tabs2.get(title);
  if (p) { fmt.push(boldHeader(p.sheetId, headers.length)); plan(`format ${title} header`); }
}

// Pin every date column to ISO. CSV exports emit the *displayed* value, so a
// locale-formatted 8/10/2026 is ambiguous to the dashboard's parser; yyyy-mm-dd
// is not.
const master = tabs2.get("MASTER");
const dateCols = [];
if (scrape) dateCols.push([scrape.sheetId, 6, 7]);               // SCRAPE!G  DATE SCRAPED
if (master) {
  for (const start of [27, 38, 49]) dateCols.push([master.sheetId, start, start + 3]); // each agent's SENT / LAST REPLY / NEXT ACTION
}
for (const [sheetId, from, to] of dateCols) {
  fmt.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: from, endColumnIndex: to },
      cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } } },
      fields: "userEnteredFormat.numberFormat",
    },
  });
}
plan(`ISO date format on ${dateCols.length} column ranges`);

if (scrape) {
  // PROCEED TO MANUS: blank = undecided. Not strict, so the app can still write
  // NOT YET without the API rejecting it.
  fmt.push({
    setDataValidation: {
      range: { sheetId: scrape.sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 7, endColumnIndex: 8 },
      rule: {
        condition: { type: "ONE_OF_LIST", values: [{ userEnteredValue: "YES" }, { userEnteredValue: "NO" }, { userEnteredValue: "NOT YET" }] },
        showCustomUi: true,
        strict: false,
      },
    },
  });
  plan("SCRAPE!H2:H1000 dropdown = YES / NO / NOT YET");
}

if (APPLY && fmt.length) await api(":batchUpdate", "POST", { requests: fmt });

console.log(
  APPLY
    ? `\nApplied ${log.length} changes.\n`
    : `\n${log.length} changes pending. Re-run with --apply to write.\n`
);
