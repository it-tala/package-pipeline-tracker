# Raw scrape → SCRAPE tab

How Instant Data Scraper output becomes rows in the SCRAPE tab. Two throwaway
tabs do the work; nothing here is permanent and nothing overwrites existing data.

---

## Before you scrape

**Set Google Maps to English (Australia) / AUD.** Scraping in Indonesian locale
returns prices as `Rp 1,52M`, and the comma is a *decimal* separator, not
thousands. That single fact is the source of the `$6,994.50/night` ADR in the
Manus outputs — it is not a Manus bug, it is being handed IDR and guessing.

**Scrape one area per search.** AREA is a batch constant below. A wide "Gold
Coast hotels" search returns Coolangatta through Southport in one list and the
constant becomes wrong for most rows.

---

## What the raw columns are

Instant Data Scraper names columns after CSS classes:

| Raw column | Contains | Use |
|---|---|---|
| `hfpxzc href` (B) | Google Maps URL | → GOOGLE MAPS LINK |
| `xxVWCe` (C) | Hotel name | → HOTEL NAME |
| `MW4etd` (D) | Star rating | → STAR RATING |
| `wcldff` (I) | Nightly price | → DAILY RATE (RAW) |
| `W4Efsd` (F) | Category: `3-star hotel`, `Pub`, `hostel` | helper — the cheapest disqualifier you have |
| `UY7F9` (E) | Review count | helper — **arrives negative**, see below |
| A, G, H, J–P | icon, blurb, photo, amenities | drop |

`UY7F9` comes through as `-772`, `-1,835`. The scraper reads the count as
`(772)` and Sheets treats parentheses as accounting-negative. `ABS()` undoes it.

---

## Two tabs

**RAW** — paste the scraper output exactly as it comes out. Never edit it.

**CLEAN** — formulas only. Set three constants, fill the row down as far as RAW
goes, and read off the result.

```
K1:  AUSTRALIA        ← COUNTRY for this batch
K2:  SP NORTH         ← AREA for this batch
K3:  2026-08-18       ← date scraped (type it, don't use TODAY() — it must freeze)
```

Row 2, filled down:

```
A2:  =IF(RAW!$C2="","",$K$1)                                 COUNTRY
B2:  =IF(RAW!$C2="","",$K$2)                                 AREA
C2:  =RAW!C2                                                 HOTEL NAME
D2:  =RAW!B2                                                 GOOGLE MAPS LINK
E2:  =RAW!D2                                                 STAR RATING
F2:  =RAW!I2                                                 DAILY RATE (RAW)
G2:  =IF(RAW!$C2="","",$K$3)                                 DATE SCRAPED
H2:                                                          PROCEED TO MANUS — you fill this
I2:                                                          ENRICHED? — leave blank, MASTER drives it

                                                             helpers, not copied across:
L2:  =RAW!F2                                                 category
M2:  =IFERROR(ABS(RAW!E2),"")                                reviews
N2:  =IF(COUNTIF(SCRAPE!C:C,RAW!C2)>0,"ALREADY IN","new")    duplicate check
```

---

## The five-minute routine

1. Paste raw output into **RAW**.
2. Sort CLEAN on column **N** and delete every `ALREADY IN` row. Area scrapes
   overlap constantly — this is what stops the same building entering twice.
3. Read column **L** and set **H** (`PROCEED TO MANUS`): `NO` for pubs, hostels,
   and anything that clearly is not condo-hotel stock. `YES` for the rest.
   Killing these here rather than after enrichment is free budget.
4. Select `A:I`, copy, and **paste-special → values only** at the bottom of
   SCRAPE. Append only. Never insert, delete, or reorder columns — the dashboard
   reads SCRAPE by position.

---

## Feeding Manus

Filter SCRAPE to `PROCEED TO MANUS = YES` for **one area**, copy those rows into
a fresh empty sheet, and give Manus that sheet. This is not tidiness: Manus only
processes the first data block when it sees two clusters, so a mixed-area sheet
silently loses everything after the first area.

Send name, Maps link, and area. Send `DAILY RATE (RAW)` too — not as an input,
as a **cross-check**. When Manus returns ADR, compare it against the scraped
rate for the same building. Two independent numbers disagreeing catches the
conversion bug by ratio, which is what the absolute `> 1,500` rule missed.

---

## How it joins up

`HOTEL NAME` is the key across all three stages: RAW → SCRAPE → MASTER.

- SCRAPE only grows. MASTER only grows. Nothing is edited in place.
- `ENRICHED?` is a formula on SCRAPE that flips to YES when the name appears in
  MASTER. It is the only signal that a building came back from Manus.
- `PROCEED TO MANUS` is the human gate *before*; `ENRICHED?` is the machine
  answer *after*. They are different questions — keep both.

The dashboard reads these three states directly:

| SCRAPE state | Dashboard step |
|---|---|
| `PROCEED TO MANUS` blank | Scraped — not reviewed yet |
| `= YES`, `ENRICHED?` not YES | Approved — waiting for enrichment |
| `= NO` | Scraped — not proceeding |
| `ENRICHED? = YES` | drops out of SCRAPE steps, picked up by its MASTER row |
