# CLAUDE.md — Tala Package Marketing pipeline

Context file for continuing this project in a new session. Read this first,
then ask what the user wants to work on before making changes.

---

## What this project is

PT Talahome / Tala Living runs a **Package Marketing** operation: find dated
condo-hotel buildings, find the real estate agents who sell units in them, and
pitch a renovation/furnishing package. The pitch is a yield argument — a dated
unit under-earns against comparable stock in the same building, and the package
closes that gap.

The pipeline is strictly sequential. Each stage feeds the next:

```
Scrape Maps → Manus enrichment → Human validation → Agent outreach → Call → Pro forma → Deal
```

Once a deal closes, the record leaves this pipeline and moves to a separate
**project tracker** (design → production → install). Don't mix the two — they
run on different clocks (pipeline cycles weekly, projects run months).

**Areas** are worked as cohorts: SP NORTH, SP MIDDLE, SP SOUTH (Surfers
Paradise) and expanding. The lead engine runs continuously — new areas get
scraped and enriched while earlier cohorts are still in outreach. Never wait for
one cohort to settle before starting the next.

---

## Current state (as of Aug 2026)

- **MANUS_PROTOCOL_V5_1_TWO_PASS.txt** is the live enrichment protocol. Working
  well; no rewrite planned.
- **TALA_PIPELINE_TRACKER_TEMPLATE.xlsx** — new tracker template built to
  replace the older 47-column PACKAGE_MARKETING_MESSAGE_TRACKER. Tabs: README,
  SCRAPE, MASTER, LISTS (hidden).
- **Dashboard** — reads and writes the live sheet through `api/`. Runs locally
  with `npm start` (gcloud ADC, no login). Not yet deployed to Vercel.
- **Live sheet** — `1ngkYK5XJijW5JIfUD14IzxAQHxBYXVSGwa9mGejsOhI`, seeded with a
  demo dataset covering every pipeline step. Tabs: README, LISTS, RAW, SCRAPE,
  MASTER, MANUS_IN, LOG.
- Outreach status at last handover: SP NORTH contacted with partial replies,
  SP MIDDLE furthest along with some pro forma forms returned, SP SOUTH agents
  collected but outreach not started.

---

## Architecture decisions already made — don't relitigate these

| Decision | Reasoning |
|---|---|
| **Spreadsheet is the single source of truth** | All updates happen in the sheet — the app writes *into* it rather than alongside it, so there is still one copy of every value. Supabase-as-master rejected twice: two writable stores means constant reconciliation. **Revisit when** more than one person works the pipeline at once, per-user permissions are needed, or the pipeline has to feed another system. Not before. |
| **Dashboard writes an allowlisted set of columns** | Superseded read-only in Aug 2026. Formula columns (`ADR FLAG`, `BEST STAGE`, `OVERDUE?`) stay untouchable, every write is keyed by ID and appended to LOG. |
| **Thin backend, still no database** | Vercel serverless functions in `api/`, service account auth, shared-password gate. Zero npm dependencies, no build step. See DEPLOY.md. |
| **Stages live per agent, not per hotel** | Agents are contacted sequentially and each has its own 7-day clock. Hotel-level status is derived (BEST STAGE = furthest agent). |
| **Human owns judgment, Manus owns collection** | Renovation rating, big rooms, final score are always human-filled. Manus collects the signals. |
| **Rate-vs-area comparison is a sheet formula, not a Manus task** | ADR for every hotel in the area is already collected; comparing is arithmetic. |

---

## Manus capability boundaries (learned the hard way)

**Reliable:** address, room count, condo Yes/No, agent names, agent sales
history, listings count, dominant suburb.

**Needs validation every time:**
- **ADR** — currency conversion fails. A real output had a hotel at
  $6,994.50/night. The protocol's own ">1,500 re-check" rule did NOT catch it.
  Manus does not audit its own numbers.
  **Root cause found Aug 2026:** Maps was being scraped in Indonesian locale, so
  prices arrived as `Rp 1,52M` — IDR, with the comma as a *decimal* separator.
  Manus was guessing at a unit it was never told. Fix is upstream: set Maps to
  English (Australia) / AUD before scraping. Downstream, cross-check Manus's ADR
  against `DAILY RATE (RAW)` on SCRAPE — a ratio check catches what the absolute
  threshold missed.
- **Phone format** — the "no `+`, no `=`" rule gets violated by mid-batch. A
  leading `=` breaks the cell as a spreadsheet formula.
- **Listing links** — the weakest link, literally. Real outputs contained search
  pages, building profile pages, a news article, and a sold house in the wrong
  building, all presented as valid listings. Manus finds *plausible-looking
  URLs*; it does not verify the page opens on one real unit in that building.
  Valid links end in a numeric listing ID.

**Cannot do:** judge interior condition (human, from the review/photo signals
Manus collects). Expect renovation year and agent email to be EMPTY often —
that's the correct output, not a failure. `Empty is always better than wrong` is
the protocol's core rule.

**Known limitation:** Manus only processes the first data block when a sheet
contains two separate hotel clusters. Isolate each cluster before processing.

---

## The tracker (TALA_PIPELINE_TRACKER_TEMPLATE.xlsx)

**SCRAPE tab** — cleaned Instant Data Scraper output, one area per batch.
Columns: COUNTRY | AREA | HOTEL NAME | GOOGLE MAPS LINK | STAR RATING |
DAILY RATE (RAW) | DATE SCRAPED | PROCEED TO MANUS | ENRICHED?

Two gate columns, and they answer different questions. `PROCEED TO MANUS` is the
human call *before* enrichment — blank = undecided, NO = wrong stock type, don't
spend Manus budget on it. `ENRICHED?` is a formula that flips to YES *after*,
when the hotel name appears in MASTER. Red "NOT YET" = still waiting for Manus.

Raw scraper output is never pasted here directly — see **SCRAPE_CLEANING.md**
for the RAW/CLEAN tab formulas, the duplicate check, and the raw column decode.

**MASTER tab** — one row per hotel, three agent blocks side by side.

Property block (cols A–U):
`ID | COUNTRY | AREA | HOTEL NAME | GOOGLE MAPS LINK | ADDRESS | STATUS |
CONDO CONFIRMED | ROOMS | ADR (USD) | ADR FLAG | MAJOR CHAIN | YEAR RENOVATED |
RENO SOURCE | REVIEW SCORE | CONDITION NOTES | RENOVATION RATING | BIG ROOMS? |
FINAL SCORE | VALIDATED? | BEST STAGE`

Agent blocks — 11 columns each, repeated 3×, starting at col V (A1), AG (A2), AR (A3):
`LINK | AGENT NAME | EMAIL | PHONE | DOMINANT SUBURB | STAGE | SENT DATE |
LAST REPLY | NEXT ACTION | OVERDUE? | REMARK`

Built-in formulas:
- **ADR FLAG** — `CHECK` (red) when ADR > 1500 or < 20. Catches the conversion bug at paste time.
- **OVERDUE?** — `MOVE ON` (red) when STAGE = MSG SENT and SENT DATE > 7 days ago.
- **BEST STAGE** — furthest stage across the three agents, via INDEX/MATCH against LISTS.
  Guard the `MAX(...)=0` case: plain `INDEX(range, 0)` returns `#REF!` for any
  building whose agents are all blank, which is most of the review queue.

**Stage vocabulary** (LISTS tab, order matters — it defines progress):
`SKIP → RECYCLED → QUEUED → MSG SENT → REPLIED → CALL SET → FORM BACK →
PRESENTATION → DEAL`

RECYCLED = gave up on this agent, activate the next one. SKIP = do not contact.

**Hard rule: never insert, delete, or reorder columns.** The dashboard reads by
position. Adding rows is always fine.

---

## The dashboard (tala-pipeline-dashboard/)

Static single-page app. Stack: vanilla JS + PapaParse from CDN. No build step.

```
dashboard/
  index.html    ← the entire app; column map is at the top of the <script>
  config.js     ← the ONLY file the user edits (SHEET_ID / CSV URLs, refresh interval)
  vercel.json   ← static config, no-store cache headers
  package.json  ← metadata only; `npm run dev` serves locally
  README.md     ← setup steps
```

Renders: metrics row (hotels / qualified / validated / messaged / replied / reply
rate / forms / deals), follow-up queue (overdue first, then due today), funnel by
BEST STAGE, and a **workflow tree** — every building filed under exactly one
pipeline step, each step stating what is parked there and what moves it forward.
The tree replaced the old filter chips and the separate scrape-status panel.
Area filter chips across the top.

Design tokens (keep consistent if extending): paper `#F7F6F1`, ink `#24261F`,
teal `#0F6E56` (progress/good), coral `#B5401F` (needs attention), violet
`#4A4390` (in-flight outreach), amber `#8A5A0B`. Fonts: Fraunces (display),
Archivo (body).

**To connect it:** it already is — `SHEET_ID` in config.js drives a gviz CSV
read, which needs the file link-readable. To close that off, publish the two tabs
(Sheets → File → Share → Publish to web → CSV), paste the URLs into config.js,
and set the file itself to Restricted. Publishing is independent of sharing.
Deploy: push to GitHub, import in Vercel, framework preset "Other", no build
command.

If the column map in `index.html` and the sheet ever disagree, the sheet wins —
fix the map, not the sheet.

---

## Daily operating routine

1. Filter MASTER on any `OVERDUE?` = MOVE ON → flip those agents to RECYCLED,
   contact the next agent on that property, set their STAGE to MSG SENT.
2. Filter `NEXT ACTION` <= today → work top to bottom, update STAGE and dates.
3. When an agent hits DEAL, copy the reference into the project tracker.
4. Watch the scrape panel — when QUEUED runs low, feed the next area into Manus.

WhatsApp volume is the real throughput cap. High-volume sending risks number
blocking; sequencing and volume management are deliberate, not incidental.

---

## Open items / next steps

- **Deploy the dashboard** — runs against the live sheet, never pushed to Vercel.
- **Migrate live data** from PACKAGE_MARKETING_MESSAGE_TRACKER into the new
  template (map old checkbox columns → STAGE values).
- **SP SOUTH outreach** — agents collected, outreach not started.
- **Agent qualification block for V5.1** — drafted in discussion, not yet added
  to the protocol. Would capture years active, condo sales history, units sold,
  current listings count. This data is public on realestate.com.au / Domain
  agent profiles, so it's within Manus's reliable range. Cost: ~3 extra profile
  pages per qualified building.
- **Validation endpoint (v2)** — a Vercel serverless function where the raw
  Manus CSV is uploaded and checked (ADR sanity, phone regex, numeric listing-ID
  check) *before* anything enters the sheet. Moves QC from "human proofreads"
  to "bad rows can't enter." Highest-value next build.
- **Australian market research** — Sydney corporate housing / serviced
  apartments; separate workstream. Also: obtaining an Australian number for
  WhatsApp outreach.

---

## Working preferences

- Structured reference notes (decisions, sources, open questions, blockers) beat
  narrative recaps.
- Say when something won't work rather than building it anyway — the Manus
  capability limits above came from being direct about failure modes.
- Keep the stack boring. Every added service is another thing to hand over.
