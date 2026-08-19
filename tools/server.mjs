// Local runner for the same handlers Vercel serves. No dependencies.
//
//   node tools/server.mjs        then open http://localhost:5173
//
// It imports api/data.js, api/update.js and api/login.js unchanged and gives them
// a minimal Vercel-shaped req/res, so local behaviour and deployed behaviour come
// from one copy of the code rather than two that drift.
//
// Credentials: your gcloud ADC locally, a service account key on Vercel - decided
// inside api/_lib/sheets.js, not here.
// Auth: open unless APP_PASSWORD is set, so local dev needs no login.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { SHEET_ID } from "../api/_lib/sheets.js";
import { authDisabled } from "../api/_lib/auth.js";
import data from "../api/data.js";
import update from "../api/update.js";
import login from "../api/login.js";

const PORT = Number(process.env.PORT) || 5173;
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ROUTES = { "/api/data": data, "/api/update": update, "/api/login": login };

// charset is not optional: these files are UTF-8 and full of em-dashes.
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

// Enough of Vercel's res helpers for the handlers to run untouched.
function shim(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => {
    if (!res.hasHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(o));
    return res;
  };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  shim(res);
  try {
    const route = ROUTES[url.pathname];
    if (route) {
      if (req.method === "POST") req.body = await readBody(req);
      if (url.pathname !== "/api/data") console.log(`  ${req.method} ${url.pathname}`);
      return void (await route(req, res));
    }

    // static files, confined to the repo directory
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = normalize(join(ROOT, rel));
    if (!file.startsWith(normalize(ROOT))) return void res.status(403).json({ error: "outside root" });
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    // Buffers must pass through untouched - JSON.stringify turns one into
    // {"type":"Buffer","data":[...]}, which still returns 200 and renders nothing.
    res.end(body);
  } catch (e) {
    if (e.code === "ENOENT") return void res.status(404).json({ error: "not found" });
    console.error("  " + e.message);
    res.status(500).json({ error: e.message });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Tala pipeline  ->  http://localhost:${PORT}`);
  console.log(`  sheet   ${SHEET_ID}`);
  console.log(`  auth    ${authDisabled() ? "open (APP_PASSWORD unset - local dev)" : "password required"}`);
  console.log(`  writes  allowlisted fields only, every change appended to LOG\n`);
});
