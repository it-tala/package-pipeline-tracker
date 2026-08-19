// Kept as the entry point for the maintenance scripts (setup-sheet, seed-demo).
// The implementation moved to api/_lib/sheets.js so the scripts, the local server
// and the Vercel functions all share one credential path.

export { api, SHEET_ID } from "../api/_lib/sheets.js";

import { api } from "../api/_lib/sheets.js";

export const tabs = async () => {
  const meta = await api("?fields=sheets.properties(title,sheetId,gridProperties)");
  return new Map(meta.sheets.map((s) => [s.properties.title, s.properties]));
};

export const PROJECT = process.env.GOOGLE_QUOTA_PROJECT || "john-lau-v01";
