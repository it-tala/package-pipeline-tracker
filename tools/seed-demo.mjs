// Fills SCRAPE and MASTER with a demo dataset that exercises every step of the
// pipeline, so the dashboard can be driven off the live sheet instead of data
// baked into index.html.
//
//   node tools/seed-demo.mjs           show what would be written
//   node tools/seed-demo.mjs --apply   write it
//
// Overwrites rows 2+ on SCRAPE and MASTER. Formula columns (ADR FLAG, BEST STAGE,
// each agent's OVERDUE?) are written as formulas, never as values, and filled down
// past the data so appended rows keep working.

import { api, tabs } from "./gsheets.mjs";

const APPLY = process.argv.includes("--apply");
const FORMULA_ROWS = 100;
// The region qualifier keeps the Maps search honest once the sheet is not
// Gold Coast only.
const REGION = { AUSTRALIA: "Gold Coast QLD", INDONESIA: "Bali Indonesia" };
const maps = (n, country) =>
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent(n + " " + (REGION[country] || REGION.AUSTRALIA));
const profile = (n) => "https://example.com/agent-profile/" + n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// agent: [name, phone, suburb, stage, sentDate, lastReply, nextAction, remark]
// An empty agent link or email is correct output, not missing data - Manus leaves
// them blank rather than guessing, so the demo reflects that.
const A = (name, phone, suburb, stage, sent = "", reply = "", next = "", remark = "", link = true) =>
  [link ? profile(name) : "", name, "", phone, suburb, stage, sent, reply, next, remark];

const H = [
  // review pending - Manus is back, nobody has checked it
  { id: "TL-0003", area: "SP SOUTH", name: "Broadbeach Savannah", addr: "8 Old Burleigh Rd, Broadbeach QLD 4218",
    status: "QUALIFIED", condo: "Yes", rooms: 92, adr: 88, chain: "No", reno: "", renoSrc: "", review: 4.1,
    notes: "Reviews mention dated bathrooms, original kitchens in several units.", rating: "", big: "", score: "", valid: "", agents: [] },
  { id: "TL-0004", area: "SP SOUTH", name: "Phoenician Resort", addr: "8 Fern St, Surfers Paradise QLD 4217",
    status: "QUALIFIED", condo: "Yes", rooms: 140, adr: 6994, rawRate: "AUD 142", chain: "No", reno: "", renoSrc: "", review: 3.9,
    notes: "ADR came back in the wrong currency - check against DAILY RATE (RAW).", rating: "", big: "", score: "", valid: "", agents: [] },
  { id: "TL-0005", area: "BROADBEACH", name: "Hi Surf Beachfront Apartments", addr: "5 Elizabeth Ave, Broadbeach QLD 4218",
    status: "QUALIFIED", condo: "Yes", rooms: 64, adr: 79, chain: "No", reno: "", renoSrc: "", review: 4.0,
    notes: "Photos show 1990s fitout. No renovation year found.", rating: "", big: "", score: "", valid: "", agents: [] },

  // validated, agents not collected yet
  { id: "TL-0006", area: "BROADBEACH", name: "Aegean Resort", addr: "12 Queensland Ave, Broadbeach QLD 4218",
    status: "QUALIFIED", condo: "Yes", rooms: 180, adr: 97, chain: "No", reno: "", renoSrc: "", review: 4.2,
    notes: "Large floorplates, strong yield gap against renovated stock.", rating: 2, big: "Yes", score: 4, valid: "YES", agents: [] },

  // ready for outreach
  { id: "TL-0007", area: "SP SOUTH", name: "Meriton Suites Southport", addr: "1 Nind St, Southport QLD 4215",
    status: "QUALIFIED", condo: "Yes", rooms: 208, adr: 115, chain: "No", reno: 2014, renoSrc: "Building profile", review: 4.3,
    notes: "Partial refurb 2014, lower floors untouched.", rating: 3, big: "Yes", score: 3, valid: "YES",
    agents: [A("T. Reyes", "61 4 1111 2222", "Southport", "QUEUED"), A("A. Kim", "61 4 3333 4444", "Southport", "QUEUED")] },
  { id: "TL-0008", area: "SP SOUTH", name: "Xanadu Resort", addr: "2 Ocean Ave, Surfers Paradise QLD 4217",
    status: "QUALIFIED", condo: "Yes", rooms: 88, adr: 71, chain: "No", reno: "", renoSrc: "", review: 3.8,
    notes: "Dated throughout. Best yield gap in SP SOUTH.", rating: 1, big: "Yes", score: 4, valid: "YES",
    agents: [A("J. Baptiste", "61 4 2222 3333", "Surfers Paradise", "QUEUED"), A("P. Nguyen", "61 4 4444 5555", "Surfers Paradise", "QUEUED", "", "", "", "", false)] },
  { id: "TL-0009", area: "BROADBEACH", name: "Ultra Broadbeach", addr: "24 Queensland Ave, Broadbeach QLD 4218",
    status: "QUALIFIED", condo: "Yes", rooms: 132, adr: 121, chain: "No", reno: "", renoSrc: "", review: 4.4,
    notes: "Mixed condition by floor.", rating: 2, big: "Yes", score: 3, valid: "YES",
    agents: [A("M. Okonkwo", "61 4 5151 6262", "Broadbeach", "QUEUED")] },

  // messaged, clock running
  { id: "TL-0010", area: "SP NORTH", name: "Surfers Beachside Holiday Apartments", addr: "18 Hanlan St, Surfers Paradise QLD 4217",
    status: "QUALIFIED", condo: "Yes", rooms: 76, adr: 66, chain: "No", reno: "", renoSrc: "", review: 3.7,
    notes: "Original 1980s interiors in most units.", rating: 1, big: "No", score: 4, valid: "YES",
    agents: [A("C. Duval", "61 4 6666 7777", "Surfers Paradise", "MSG SENT", "2026-08-05", "", "2026-08-12", "No response to first message.")] },
  { id: "TL-0011", area: "SP MIDDLE", name: "Focus Apartments", addr: "8 Northcliffe Terrace, Surfers Paradise QLD 4217",
    status: "QUALIFIED", condo: "Yes", rooms: 210, adr: 92, chain: "No", reno: 2011, renoSrc: "Agent listing", review: 4.0,
    notes: "Common areas redone 2011, units original.", rating: 2, big: "Yes", score: 3, valid: "YES",
    agents: [A("H. Iwata", "61 4 8888 9999", "Surfers Paradise", "MSG SENT", "2026-08-17", "", "2026-08-19", "Sent via WhatsApp."),
             A("G. Fontaine", "61 4 1010 2020", "Surfers Paradise", "QUEUED")] },

  // replied / call set
  { id: "TL-0001", area: "SP NORTH", name: "Chateau Beachside", addr: "44-52 The Esplanade, Surfers Paradise QLD 4217",
    status: "QUALIFIED", condo: "Yes", rooms: 100, adr: 69, chain: "No", reno: "", renoSrc: "", review: 3.6,
    notes: "Dated. Strong candidate - reviews repeatedly mention tired rooms.", rating: 1, big: "Yes", score: 4, valid: "YES",
    agents: [A("D. Harper", "61 4 1234 5678", "Surfers Paradise", "REPLIED", "2026-08-12", "2026-08-15", "2026-08-19", "Asked for comparable rates in the building."),
             A("M. Chen", "61 4 2345 6789", "Surfers Paradise", "QUEUED"),
             A("S. Patel", "61 4 3456 7890", "Surfers Paradise", "QUEUED")] },
  { id: "TL-0012", area: "SP NORTH", name: "Paradise Island Resort", addr: "10 Paradise Island, Surfers Paradise QLD 4217",
    status: "QUALIFIED", condo: "Yes", rooms: 120, adr: 64, chain: "No", reno: "", renoSrc: "", review: 3.9,
    notes: "Island position, dated interiors.", rating: 2, big: "Yes", score: 3, valid: "YES",
    agents: [A("B. Singh", "61 4 5555 6666", "Surfers Paradise", "CALL SET", "2026-08-10", "2026-08-14", "2026-08-20", "Call booked Thursday 10am."),
             A("E. Moss", "61 4 7777 8888", "Surfers Paradise", "QUEUED")] },
  { id: "TL-0013", area: "BROADBEACH", name: "Sierra Grand", addr: "5 First Ave, Broadbeach QLD 4218",
    status: "QUALIFIED", condo: "Yes", rooms: 158, adr: 134, chain: "No", reno: 2009, renoSrc: "Building profile", review: 4.2,
    notes: "Two towers, north tower never refurbished.", rating: 2, big: "Yes", score: 3, valid: "YES",
    agents: [A("R. Bianchi", "61 4 3131 4141", "Broadbeach", "REPLIED", "2026-08-13", "2026-08-16", "2026-08-19", "Wants the yield numbers before a call.")] },

  // pro forma / presentation
  { id: "TL-0002", area: "SP MIDDLE", name: "Mantra on View Surfers Paradise", addr: "22 View Ave, Surfers Paradise QLD 4217",
    status: "QUALIFIED", condo: "Yes", rooms: 355, adr: 106, chain: "Yes", reno: 2016, renoSrc: "Press release", review: 4.1,
    notes: "Chain-managed but individually owned units.", rating: 3, big: "Yes", score: 4, valid: "YES",
    agents: [A("R. Novak", "61 4 9876 5432", "Surfers Paradise", "FORM BACK", "2026-08-04", "2026-08-11", "2026-08-20", "Pro forma returned, numbers check out."),
             A("L. Ortiz", "61 4 8765 4321", "Surfers Paradise", "RECYCLED", "2026-07-20", "", "", "No reply in 7 days."),
             A("K. Webb", "61 4 7654 3210", "Surfers Paradise", "MSG SENT", "2026-08-06", "", "2026-08-13", "")] },
  { id: "TL-0014", area: "SP MIDDLE", name: "Circle on Cavill", addr: "9 Ferny Ave, Surfers Paradise QLD 4217",
    status: "QUALIFIED", condo: "Yes", rooms: 240, adr: 128, chain: "No", reno: "", renoSrc: "", review: 4.3,
    notes: "High owner-occupier ratio, strong resale comps.", rating: 2, big: "Yes", score: 4, valid: "YES",
    agents: [A("V. Petrov", "61 4 3030 4040", "Surfers Paradise", "PRESENTATION", "2026-07-28", "2026-08-08", "2026-08-21", "Presenting to two owners next week.")] },

  // closed
  { id: "TL-0015", area: "SP MIDDLE", name: "Peninsula Private Apartments", addr: "8 Stanhill Dr, Surfers Paradise QLD 4217",
    status: "QUALIFIED", condo: "Yes", rooms: 68, adr: 84, chain: "No", reno: "", renoSrc: "", review: 4.0,
    notes: "Small building, single decision maker per unit.", rating: 1, big: "Yes", score: 4, valid: "YES",
    agents: [A("N. Okafor", "61 4 5050 6060", "Surfers Paradise", "DEAL", "2026-07-15", "2026-07-22", "", "Signed. Moved to project tracker.")] },

  // every agent recycled
  { id: "TL-0016", area: "SP NORTH", name: "Budds Beach Apartments", addr: "6 Whelan St, Surfers Paradise QLD 4217",
    status: "QUALIFIED", condo: "Yes", rooms: 40, adr: 58, chain: "No", reno: "", renoSrc: "", review: 3.5,
    notes: "Good target, but both agents went quiet.", rating: 1, big: "No", score: 3, valid: "YES",
    agents: [A("F. Adeyemi", "61 4 7070 8080", "Surfers Paradise", "RECYCLED", "2026-07-18", "", "", "No reply in 7 days."),
             A("W. Kowalski", "61 4 9090 1010", "Surfers Paradise", "RECYCLED", "2026-07-29", "", "", "No reply in 7 days.")] },

  // second country - the pipeline is worldwide, not Gold Coast only
  { id: "TL-0019", country: "INDONESIA", area: "BALI - SEMINYAK", name: "Bhuana Suites Seminyak", addr: "Jl. Kayu Aya 12, Seminyak, Bali 80361",
    status: "QUALIFIED", condo: "Yes", rooms: 58, adr: 74, rawRate: "IDR 1.180.000", chain: "No", reno: "", renoSrc: "", review: 4.1,
    notes: "Villa-style units, original 2012 fitout.", rating: 2, big: "Yes", score: 4, valid: "YES",
    agents: [A("I. Wirawan", "62 81 2345 6789", "Seminyak", "MSG SENT", "2026-08-16", "", "2026-08-19", "First contact sent.")] },
  { id: "TL-0020", country: "INDONESIA", area: "BALI - CANGGU", name: "Echo Beach Residences", addr: "Jl. Pantai Batu Mejan, Canggu, Bali 80361",
    status: "QUALIFIED", condo: "Yes", rooms: 42, adr: 66, rawRate: "IDR 1.050.000", chain: "No", reno: "", renoSrc: "", review: 4.3,
    notes: "Strong ADR gap against renovated stock nearby.", rating: 1, big: "No", score: 4, valid: "", agents: [] },

  // out of pipeline
  { id: "TL-0017", area: "SP MIDDLE", name: "Dorsett Gold Coast", addr: "3 Charles Ave, Surfers Paradise QLD 4217",
    status: "DISQUALIFIED - NOT CONDO", condo: "No", rooms: 313, adr: 119, chain: "Yes", reno: 2022, renoSrc: "Press release", review: 4.5,
    notes: "Single-owner hotel, no strata units.", rating: "", big: "", score: "", valid: "", agents: [] },
  { id: "TL-0018", area: "SP NORTH", name: "Q1 Resort and Spa", addr: "9 Hamilton Ave, Surfers Paradise QLD 4217",
    status: "DISQUALIFIED - MAJOR CHAIN", condo: "Yes", rooms: 526, adr: 165, chain: "Yes", reno: 2019, renoSrc: "Press release", review: 4.4,
    notes: "Chain-controlled refurbishment programme already running.", rating: "", big: "", score: "", valid: "", agents: [] },
];

// SCRAPE = every MASTER building (ENRICHED? resolves to YES) plus rows still at the gate.
const QUEUE = [
  ["SP NORTH", "Ocean Pacific Resort", 3.8, "AUD 92", "YES"],
  ["SP NORTH", "Sandpiper Apartments", 3.6, "AUD 74", "YES"],
  ["SP SOUTH", "Talisman Apartments", 3.9, "AUD 88", "YES"],
  ["BROADBEACH", "Freshwater Point Resort", 4.2, "AUD 141", "YES"],
  ["BROADBEACH", "Chevron Renaissance", 4.0, "AUD 118", ""],
  ["BROADBEACH", "Wyndham Surfers Paradise", 4.1, "AUD 129", ""],
  ["SP SOUTH", "Longbeach Apartments", 3.7, "AUD 81", ""],
  ["SP SOUTH", "Southport Backpackers YHA", 3.4, "AUD 38", "NO"],
  ["BROADBEACH", "The Wharf Tavern", 4.0, "AUD 0", "NO"],
  ["SP NORTH", "Palm Beach Hotel", 4.2, "AUD 45", "NO"],
  ["BALI - CANGGU", "Batu Bolong Beach Apartments", 4.0, "IDR 890.000", "YES", "INDONESIA"],
  ["BALI - SEMINYAK", "Petitenget Suites", 4.2, "IDR 1.320.000", "", "INDONESIA"],
  ["BALI - ULUWATU", "Bingin Cliff Residences", 4.4, "IDR 1.640.000", "", "INDONESIA"],
];

// ── build rows ────────────────────────────────────────────────────────
const BLANK_AGENT = ["", "", "", "", "", "", "", "", "", ""];
const masterRows = H.map((h) => {
  const ags = [0, 1, 2].map((i) => h.agents[i] || BLANK_AGENT);
  return [
    h.id, h.country || "AUSTRALIA", h.area, h.name, maps(h.name, h.country), h.addr, h.status, h.condo, h.rooms, h.adr, // 0-9
    null,                                                                                       // 10 K formula
    h.chain, h.reno, h.renoSrc, h.review, h.notes, h.rating, h.big, h.score, h.valid,            // 11-19
    null,                                                                                       // 20 U formula
    ...ags[0].slice(0, 9), null, ags[0][9],                                                     // 21-31
    ...ags[1].slice(0, 9), null, ags[1][9],                                                     // 32-42
    ...ags[2].slice(0, 9), null, ags[2][9],                                                     // 43-53
  ];
});

const scrapeRows = [
  // The scraped rate is captured independently of Manus, so it is the anchor the
  // enriched ADR gets checked against. Phoenician's disagree on purpose.
  ...H.map((h) => [h.country || "AUSTRALIA", h.area, h.name, maps(h.name, h.country), h.review, h.rawRate || `AUD ${h.adr}`, "2026-08-10", "YES"]),
  ...QUEUE.map(([area, name, star, rate, proceed, country]) => [country || "AUSTRALIA", area, name, maps(name, country), star, rate, "2026-08-18", proceed]),
];

const n = masterRows.length;
const slice = (a, b) => masterRows.map((r) => r.slice(a, b));
const col = (tpl) => Array.from({ length: FORMULA_ROWS }, (_, i) => [tpl(i + 2)]);

const data = [
  { range: "SCRAPE!A2", values: scrapeRows },
  // Re-asserted here as well as in setup-sheet: column I is a single spilling
  // formula, so anything that clears the SCRAPE block has to put it back.
  { range: "SCRAPE!I2", values: [[`=ARRAYFORMULA(IF(C2:C="","",IF(COUNTIF(MASTER!$D:$D,C2:C)>0,"YES","NOT YET")))`]] },
  { range: "MASTER!A2", values: slice(0, 10) },
  { range: "MASTER!L2", values: slice(11, 20) },
  { range: "MASTER!V2", values: slice(21, 30) },
  { range: "MASTER!AF2", values: slice(31, 41) },
  { range: "MASTER!AQ2", values: slice(42, 52) },
  { range: "MASTER!BB2", values: slice(53, 54) },
  // formulas, filled past the data so appended rows keep computing
  { range: "MASTER!K2", values: col((r) => `=IF(J${r}="","",IF(OR(J${r}>1500,J${r}<20),"CHECK","OK"))`) },
  // LET guard on m=0: the template's original INDEX(range, MAX(...)) returns #REF!
  // for a building with no agent stages yet, which is most of the review queue.
  { range: "MASTER!U2", values: col((r) => `=IF(D${r}="","",LET(m,MAX(IFERROR(MATCH(AA${r},LISTS!$A$1:$A$9,0),0),IFERROR(MATCH(AL${r},LISTS!$A$1:$A$9,0),0),IFERROR(MATCH(AW${r},LISTS!$A$1:$A$9,0),0)),IF(m=0,"",INDEX(LISTS!$A$1:$A$9,m))))`) },
  { range: "MASTER!AE2", values: col((r) => `=IF(AND(AA${r}="MSG SENT",AB${r}<>"",TODAY()-AB${r}>7),"MOVE ON","")`) },
  { range: "MASTER!AP2", values: col((r) => `=IF(AND(AL${r}="MSG SENT",AM${r}<>"",TODAY()-AM${r}>7),"MOVE ON","")`) },
  { range: "MASTER!BA2", values: col((r) => `=IF(AND(AW${r}="MSG SENT",AX${r}<>"",TODAY()-AX${r}>7),"MOVE ON","")`) },
];

// ── report / apply ────────────────────────────────────────────────────
const t = await tabs();
for (const req of ["SCRAPE", "MASTER"]) {
  if (!t.has(req)) throw new Error(`Tab ${req} is missing. Run tools/setup-sheet.mjs --apply first.`);
}

console.log(`\nMASTER  ${n} buildings, ${H.reduce((s, h) => s + h.agents.length, 0)} agents`);
console.log(`SCRAPE  ${scrapeRows.length} rows (${H.length} enriched, ${QUEUE.length} at the gate)`);
console.log(`formula columns K / U / AE / AP / BA filled to row ${FORMULA_ROWS + 1}\n`);

if (!APPLY) {
  console.log("Dry run. Re-run with --apply to write.\n");
} else {
  await api("/values/SCRAPE!A2:H1000:clear", "POST", {});
  await api("/values/MASTER!A2:BB1000:clear", "POST", {});
  await api("/values:batchUpdate", "POST", { valueInputOption: "USER_ENTERED", data });
  console.log("Written.\n");
}
