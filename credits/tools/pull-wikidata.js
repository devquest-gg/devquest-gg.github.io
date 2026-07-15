#!/usr/bin/env node
/*
 * DevQuest Credits - Wikidata games + studios pull
 * -------------------------------------------------
 * Builds the comprehensive games/studios catalogue from Wikidata (CC0) and
 * writes credits/data/games.json and credits/data/studios.json.
 *
 * This is a SCHEDULED CLOUD JOB (a GitHub Action, same pattern as the jobs
 * scraper). It is NOT a runtime call: we import once on a schedule and cache
 * the result as our own static JSON, so the site never live-depends on Wikidata.
 *
 * No npm dependencies. Requires Node 18+ (uses global fetch).
 *
 * Run the FULL pull:      node credits/tools/pull-wikidata.js
 * Test a single year:     START=2023 END=2024 node credits/tools/pull-wikidata.js
 *   (START inclusive, END exclusive, as calendar years)
 *
 * Politeness: Wikidata asks for a descriptive User-Agent and modest request
 * rates. Set a real contact in UA below before running at scale.
 */

const fs = require("fs");
const path = require("path");

// ---- config ---------------------------------------------------------------
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "DevQuestCredits/0.1 (https://devquest.gg; studios@devquest.gg)"; // set a real contact
const OUT_DIR = path.join(__dirname, "..", "data");
function envYear(name, def) {
  const n = parseInt(String(process.env[name] || "").trim(), 10);
  return Number.isFinite(n) ? n : def; // empty / whitespace / junk -> default
}
// Defaults are a small recent window so a blank run is a safe, fast test.
// For the FULL comprehensive pull, pass START=1970 (and END blank).
const START_YEAR = envYear("START", new Date().getFullYear() - 1);
const END_YEAR = envYear("END", new Date().getFullYear() + 1); // exclusive
const REQ_TIMEOUT_MS = 60000; // Wikidata query timeout
const SLEEP_MS = 1200;        // be polite between requests
const MIN_SPAN_DAYS = 20;     // stop splitting a range narrower than this

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (d) => d.toISOString().slice(0, 10) + "T00:00:00Z";

// ---- SPARQL ---------------------------------------------------------------
function gamesQuery(startISO, endISO) {
  return `
SELECT ?game ?gameLabel (MIN(?year) AS ?minYear)
  (GROUP_CONCAT(DISTINCT ?devLabel; separator="||") AS ?devs)
  (GROUP_CONCAT(DISTINCT ?pubLabel; separator="||") AS ?pubs)
  (GROUP_CONCAT(DISTINCT ?platLabel; separator="||") AS ?plats)
  (GROUP_CONCAT(DISTINCT ?genreLabel; separator="||") AS ?genres)
  (SAMPLE(?steamId) AS ?steam)
WHERE {
  ?game wdt:P31 wd:Q7889 ; wdt:P577 ?date .
  FILTER(?date >= "${startISO}"^^xsd:dateTime && ?date < "${endISO}"^^xsd:dateTime)
  BIND(YEAR(?date) AS ?year)
  ?game rdfs:label ?gameLabel . FILTER(LANG(?gameLabel) = "en")
  OPTIONAL { ?game wdt:P178 ?dev .   ?dev   rdfs:label ?devLabel .   FILTER(LANG(?devLabel)="en") }
  OPTIONAL { ?game wdt:P123 ?pub .   ?pub   rdfs:label ?pubLabel .   FILTER(LANG(?pubLabel)="en") }
  OPTIONAL { ?game wdt:P400 ?plat .  ?plat  rdfs:label ?platLabel .  FILTER(LANG(?platLabel)="en") }
  OPTIONAL { ?game wdt:P136 ?genre . ?genre rdfs:label ?genreLabel . FILTER(LANG(?genreLabel)="en") }
  OPTIONAL { ?game wdt:P1733 ?steamId }
}
GROUP BY ?game ?gameLabel`;
}

// Expansions / DLC linked to a video-game base via P8646 ("expansion of"). These are
// mostly typed as "expansion pack" / "downloadable content" rather than "video game",
// so the date-range query above misses them; we pull them separately (paged) and carry
// the base's QID through so the parent link can be resolved to a slug after slugging.
// Requiring the BASE to be a video game (Q7889) cleanly excludes tabletop / board-game /
// literary "expansions" whose base is not a game.
function expansionsQuery(limit, offset) {
  return `
SELECT ?exp ?expLabel (MIN(?year) AS ?minYear)
  (GROUP_CONCAT(DISTINCT ?devLabel; separator="||") AS ?devs)
  (GROUP_CONCAT(DISTINCT ?pubLabel; separator="||") AS ?pubs)
  (GROUP_CONCAT(DISTINCT ?platLabel; separator="||") AS ?plats)
  (GROUP_CONCAT(DISTINCT ?genreLabel; separator="||") AS ?genres)
  (SAMPLE(?steamId) AS ?steam)
  (SAMPLE(?baseUri) AS ?base)
WHERE {
  ?exp wdt:P8646 ?baseUri .
  ?baseUri wdt:P31 wd:Q7889 .
  ?exp rdfs:label ?expLabel . FILTER(LANG(?expLabel) = "en")
  OPTIONAL { ?exp wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
  OPTIONAL { ?exp wdt:P178 ?dev .   ?dev   rdfs:label ?devLabel .   FILTER(LANG(?devLabel)="en") }
  OPTIONAL { ?exp wdt:P123 ?pub .   ?pub   rdfs:label ?pubLabel .   FILTER(LANG(?pubLabel)="en") }
  OPTIONAL { ?exp wdt:P400 ?plat .  ?plat  rdfs:label ?platLabel .  FILTER(LANG(?platLabel)="en") }
  OPTIONAL { ?exp wdt:P136 ?genre . ?genre rdfs:label ?genreLabel . FILTER(LANG(?genreLabel)="en") }
  OPTIONAL { ?exp wdt:P1733 ?steamId }
}
GROUP BY ?exp ?expLabel
ORDER BY ?exp
LIMIT ${limit} OFFSET ${offset}`;
}

async function sparql(query, tries = 3) {
  const url = ENDPOINT + "?format=json&query=" + encodeURIComponent(query);
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept": "application/sparql-results+json" },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.status === 429 || res.status === 503) throw new Error("busy " + res.status);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      return json.results.bindings;
    } catch (e) {
      clearTimeout(t);
      if (attempt === tries) throw e;
      const backoff = SLEEP_MS * attempt * 2;
      console.warn(`  retry ${attempt}/${tries} after error: ${e.message} (waiting ${backoff}ms)`);
      await sleep(backoff);
    }
  }
}

// Query a date range; on failure (usually a timeout on a dense range), split it
// in half and recurse. This adapts automatically to busy years.
async function pullRange(start, end, games) {
  const spanDays = (end - start) / 86400000;
  const label = `${iso(start).slice(0, 10)} .. ${iso(end).slice(0, 10)}`;
  try {
    const rows = await sparql(gamesQuery(iso(start), iso(end)));
    for (const r of rows) addGame(games, r);
    console.log(`  ${label}: ${rows.length} games (total ${games.size})`);
    await sleep(SLEEP_MS);
  } catch (e) {
    if (spanDays <= MIN_SPAN_DAYS) {
      console.error(`  GAP ${label}: ${e.message} (span too small to split, skipping)`);
      return;
    }
    console.warn(`  ${label}: ${e.message} -> splitting`);
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    await pullRange(start, mid, games);
    await pullRange(mid, end, games);
  }
}

// ---- shaping --------------------------------------------------------------
const qid = (uri) => uri.replace(/.*\/(Q\d+)$/, "$1");
const splitList = (v) => (v ? v.split("||").map((s) => s.trim()).filter(Boolean) : []);

function slugify(s) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function addGame(games, row) {
  const id = qid(row.game.value);
  const year = row.minYear ? parseInt(row.minYear.value, 10) : null;
  const existing = games.get(id);
  const devs = splitList(row.devs && row.devs.value);
  const rec = {
    wikidata_qid: id,
    title: row.gameLabel.value,
    year,
    studios: devs,
    publishers: splitList(row.pubs && row.pubs.value),
    platforms: splitList(row.plats && row.plats.value),
    genres: splitList(row.genres && row.genres.value),
    steam: (row.steam && row.steam.value) || null,
    source: "wikidata",
  };
  if (!existing) { games.set(id, rec); return; }
  // seen in another date range: keep earliest year, merge multi-values
  if (year != null && (existing.year == null || year < existing.year)) existing.year = year;
  for (const k of ["studios", "publishers", "platforms", "genres"]) {
    existing[k] = Array.from(new Set([...existing[k], ...rec[k]]));
  }
  if (rec.steam && !existing.steam) existing.steam = rec.steam;
}

// Merge an expansion row into the games map, carrying its base game's QID (parent_qid).
// If the item was already pulled as a base-year game, we just attach the parent link.
function addExpansion(games, row) {
  const id = qid(row.exp.value);
  const parentQid = row.base && row.base.value ? qid(row.base.value) : null;
  const y = row.minYear && row.minYear.value ? parseInt(row.minYear.value, 10) : null;
  const rec = {
    wikidata_qid: id,
    title: row.expLabel.value,
    year: Number.isFinite(y) ? y : null,
    studios: splitList(row.devs && row.devs.value),
    publishers: splitList(row.pubs && row.pubs.value),
    platforms: splitList(row.plats && row.plats.value),
    genres: splitList(row.genres && row.genres.value),
    steam: (row.steam && row.steam.value) || null,
    source: "wikidata",
    parent_qid: parentQid,
  };
  const existing = games.get(id);
  if (!existing) { games.set(id, rec); return; }
  if (!existing.parent_qid && parentQid) existing.parent_qid = parentQid;
  if (rec.year != null && (existing.year == null || rec.year < existing.year)) existing.year = rec.year;
  for (const k of ["studios", "publishers", "platforms", "genres"]) {
    existing[k] = Array.from(new Set([...(existing[k] || []), ...rec[k]]));
  }
  if (rec.steam && !existing.steam) existing.steam = rec.steam;
}

// Pull ALL P8646-linked expansions (paged). Not date-ranged: the whole set is small
// (a few thousand), so we page through it once per run.
async function pullExpansions(games) {
  console.log("Pulling expansions (P8646 -> video-game base)…");
  const PAGE = 800;
  let offset = 0, got = 0, total = 0;
  do {
    const rows = await sparql(expansionsQuery(PAGE, offset));
    got = rows.length;
    for (const r of rows) addExpansion(games, r);
    total += got;
    console.log(`  expansions ${offset}..${offset + got}`);
    offset += PAGE;
    await sleep(SLEEP_MS);
  } while (got === PAGE);
  console.log(`  ${total} expansion rows processed (total map ${games.size}).`);
}

function assignSlugs(list) {
  const taken = new Set();
  for (const g of list) {
    let base = slugify(g.title) || "game";
    let slug = base;
    if (taken.has(slug)) slug = `${base}-${g.year || ""}`.replace(/-$/, "");
    if (taken.has(slug)) slug = `${base}-${g.wikidata_qid.toLowerCase()}`;
    taken.add(slug);
    g.slug = slug;
  }
}

// ---- main -----------------------------------------------------------------
(async function main() {
  console.log(`raw env START=${JSON.stringify(process.env.START)} END=${JSON.stringify(process.env.END)}`);
  console.log(`Wikidata games pull: years ${START_YEAR}..${END_YEAR - 1}`);
  const games = new Map();
  // Merge mode: seed from the existing catalogue so a windowed (e.g. weekly 2-year)
  // or partially-failed pull can only ADD or refresh games, never shrink the catalogue.
  try {
    const prev = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "games.json"), "utf8"));
    for (const g of prev) {
      if (g && g.wikidata_qid) games.set(g.wikidata_qid, {
        wikidata_qid: g.wikidata_qid, title: g.title, year: (g.year != null ? g.year : null),
        studios: g.studios || [], publishers: g.publishers || [], platforms: g.platforms || [], genres: g.genres || [],
        steam: g.steam || null,
        source: g.source || "wikidata",
        parent_qid: g.parent_qid || null,   // preserve expansion→base link across windowed pulls
      });
    }
    console.log(`Seeded ${games.size} existing games (merge mode).`);
  } catch (e) { console.log("No existing games.json to merge — fresh build."); }
  for (let y = START_YEAR; y < END_YEAR; y++) {
    await pullRange(new Date(`${y}-01-01T00:00:00Z`), new Date(`${y + 1}-01-01T00:00:00Z`), games);
  }
  // Expansions/DLC linked to a video-game base (P8646). Full pull each run (small set).
  await pullExpansions(games);

  const gameList = Array.from(games.values());
  // stable order: newest first, then title
  gameList.sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title));
  assignSlugs(gameList);
  // Resolve each expansion's parent QID to its in-catalogue slug (now that slugs exist).
  // A base outside the pulled set (e.g. a windowed pull) stays unresolved → parent_slug null.
  const slugByQid = new Map();
  for (const g of gameList) if (g.wikidata_qid) slugByQid.set(g.wikidata_qid, g.slug);
  let linkedExp = 0;
  for (const g of gameList) {
    if (g.parent_qid) {
      const ps = slugByQid.get(g.parent_qid) || null;
      g.parent_slug = (ps && ps !== g.slug) ? ps : null;
      if (g.parent_slug) linkedExp++;
    }
  }
  console.log(`Linked ${linkedExp} expansions to an in-catalogue base game.`);
  // primary studio convenience field
  for (const g of gameList) g.studio = g.studios[0] || null;

  // build studios from developer names
  const studioMap = new Map();
  for (const g of gameList) for (const name of g.studios) {
    const s = slugify(name);
    if (!studioMap.has(s)) studioMap.set(s, { slug: s, name });
  }
  const studioList = Array.from(studioMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "games.json"), JSON.stringify(gameList, null, 0));
  fs.writeFileSync(path.join(OUT_DIR, "studios.json"), JSON.stringify(studioList, null, 0));

  console.log(`\nDone. ${gameList.length} games, ${studioList.length} studios written to credits/data/.`);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
