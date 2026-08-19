import { getData, oidcFrom } from "./_lib/sheets.js";
import { requireAuth, authDisabled } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  try {
    res.status(200).json({ ...(await getData(oidcFrom(req))), authDisabled: authDisabled() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
