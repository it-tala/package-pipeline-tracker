# V2 — writable pipeline app

**Status: proposed, not approved.** Nothing in CLAUDE.md's decision table has been
changed yet. On approval, three rows in that table need rewriting — see
*Consequences* at the bottom.

V1 is a read-only viewer over published CSV. V2 is a small CRUD app over the same
spreadsheet. That is a different class of thing, not an extension of the current
page, and it should be costed that way.

---

## Corrected workflow

| # | Step | Where | Writes |
|---|---|---|---|
| 1 | Upload raw Instant Data Scraper file | app | SCRAPE rows, `PROCEED TO MANUS = NOT YET` |
| 2 | Build the Manus batch, one area | app | MANUS_IN tab (replaced, not appended) |
| 3 | Upload Manus output file | app | MASTER row + assigned ID |
| 4 | **Gate** — worth pitching? | app | `STATUS`, `VALIDATED?`, rating, score |
| 5 | Rank agents into A1 / A2 / A3 | app | agent blocks |
| 6 | Work the follow-up queue | app | — |
| 7 | Advance stages, add notes | app | `STAGE`, dates, `REMARK`, LOG |

The pre-enrichment gate is no longer an app step. `PROCEED TO MANUS` stays a
column on SCRAPE with a YES / NO / NOT YET dropdown, set by hand in the sheet when
it is worth doing; step 2 reads it and only batches rows marked YES. So the gate
still works, the app just doesn't own a screen for it.

The cost of skipping it is Manus budget spent on stock that was never a candidate
— pubs and hostels are visible in the scraped category column before enrichment,
and invisible in spend afterwards. Cheap to reinstate later: it is one column of
buttons on a list the app already renders.

---

## Corrections to the proposal

### Manus ingest tab is app-owned and single-batch

`MANUS_IN` is **replaced** on every generation, never appended to, and holds
exactly one area. Manus only processes the first data block when it sees two
clusters — a second area in that tab is silently dropped, not flagged. Humans do
not edit this tab; the app owns it end to end.

### Upload the Manus output, do not paste it

Both routes were floated. Upload is the one that earns its keep, because the
upload path is where validation runs *before* bad data reaches the sheet — the
"validation endpoint v2" already logged in CLAUDE.md as highest-value next build.
Pasting bypasses every check.

Checks that run on upload, from the known Manus failure modes:

| Check | Rejects |
|---|---|
| ADR sanity | outside 20–1500, or off `DAILY RATE (RAW)` by more than ~40% |
| Phone format | leading `=` or `+` (a leading `=` breaks the cell as a formula) |
| Listing link | anything not ending in a numeric listing ID |
| Cluster count | more than one area in the file |

Rejected rows come back as a downloadable diff to re-run, and never enter MASTER.
`Empty is always better than wrong` stays the rule — an empty field passes, a
plausible-looking wrong one does not.

ID assignment (`TL-####`) must happen server-side against the current max in
MASTER. Two uploads racing for the same number is the one way this corrupts
silently.

### Agent ranking locks once outreach starts

A1 / A2 / A3 are fixed column blocks (U, AF, AQ). Ranking means choosing which
agent's 11 values land in which block. Swapping after outreach has begun either
scrambles stage history or moves an agent away from their own dates.

**Rule: ranking is editable only while all three agents are QUEUED.** After that
the order is frozen; RECYCLED is the mechanism for moving on, not re-ranking.

The V5.1 agent qualification block (years active, condo sales history, units sold,
listings count — drafted in CLAUDE.md, not yet added to the protocol) is exactly
the data this ranking should key on. Until it exists, ranking is manual.

### Writes are allowlisted and keyed by ID

Never writable — these are formulas, and a single write destroys one silently
with nothing to warn you:

`ENRICHED?` · `ADR FLAG` · `OVERDUE?` · `BEST STAGE`

Writable: `STATUS`, `VALIDATED?`, `RENOVATION RATING`, `BIG ROOMS?`,
`FINAL SCORE`, `CONDITION NOTES`, `PROCEED TO MANUS`, and per agent block
`LINK`, `AGENT NAME`, `EMAIL`, `PHONE`, `STAGE`, `SENT DATE`, `LAST REPLY`,
`NEXT ACTION`, `REMARK`.

Address every write as **ID + agent slot + field name**. Never row index — rows
move when the sheet is sorted, and a stale index writes to the wrong building.

### New tab: LOG, append-only

`TIMESTAMP | ID | SLOT | FIELD | FROM | TO | NOTE | SOURCE`

Every write appends one row. This is the cheapest part of V2 and the only part
that produces something the sheet cannot do today: stage history. Without it you
cannot answer how long MSG SENT → REPLIED actually takes, which agents ever reply,
or whether the 7-day rule is the right number. Appending rows is also the safest
sheet operation there is.

---

## What has to be built

**Phase 0 — plumbing.** Service account credentials in Vercel env; `/api/sheet`
read+write wrapper with the allowlist above; auth on the app; unpublish the
CSV endpoints; LOG tab.

**Phase 1 — scrape intake.** Upload raw file, clean it server-side, dedupe
against existing SCRAPE, append. Replaces the manual RAW/CLEAN tabs in
SCRAPE_CLEANING.md.

**Phase 2 — batch out.** Generate MANUS_IN from the SCRAPE rows marked
`PROCEED TO MANUS = YES` for one area.

**Phase 3 — Manus intake.** Upload output, run the validation table above, assign
IDs, append to MASTER, return the reject diff.

**Phase 4 — gate + ranking.** Validation UI on the review step; agent ranking
while QUEUED.

**Phase 5 — stage updates.** Advance / recycle from the follow-up queue, notes,
LOG writes.

Each phase is independently useful. Phase 0 + 5 alone would remove most of the
daily friction; phases 1–3 are about data quality and Manus budget.

### Stack

Front end stays vanilla JS, no build step.

**Local first.** `tools/server.mjs` is a dependency-free Node server that serves
the page and exposes `/api/data` and `/api/update` against the live sheet using
your own ADC. No key to store, no deploy, no auth surface — it only listens on
localhost. This is what makes V2 runnable the same day.

**Vercel second.** The same handlers move to `/api/*.js` as serverless functions,
swapping ADC for a service account key in an env var and adding app auth. Needed
the moment you want this on a phone during outreach, which is the real use case.

Reads move off published CSV onto the API in both cases. Not optional: published
CSV lags several minutes behind edits, so writing a value and seeing the old one
come back would make the app look broken.

---

## Blockers

1. **Credentials.** Which service account was shared with the sheet, and at what
   access level? Project `john-lau-v01` has `capture-worker@…` and the default
   compute SA. No key exists locally and no ADC is configured, so the sheet is
   currently unreachable from this machine (403 — missing `spreadsheets` scope,
   not missing permission).
2. **Live sheet structure unverified.** The column map in index.html reflects the
   template, not the live file at
   `1ngkYK5XJijW5JIfUD14IzxAQHxBYXVSGwa9mGejsOhI`. Confirm before building
   against it — where they disagree, the sheet wins.
3. **V1 never deployed.** It now reads the live sheet and is seeded with a demo
   dataset, but has never been pushed to Vercel. Worth a week of real use before
   committing to V2 scope; it will change which phases matter.

---

## Consequences for CLAUDE.md (on approval)

| Decision | Now reads | Would become |
|---|---|---|
| Dashboard is strictly read-only | "It visualizes, never writes" | Writes an allowlisted set of columns; formula columns stay untouchable |
| No backend | "No database, no API keys, no auth" | Vercel functions + service account key + app auth. Still no database |
| Spreadsheet is single source of truth | unchanged | unchanged — this is what keeps the change safe |

The third row is the one that matters. The app writing *into* the sheet does not
create a second source of truth, so the reasoning that rejected Supabase-as-master
— two writable stores means constant reconciliation — is not being overturned
here. One store, one copy of every value.

Also on approval: the app becomes a public write surface, so app auth stops being
optional, and the published-to-web CSV should be switched off — it currently
exposes every agent name, email and phone to anyone holding the link.
