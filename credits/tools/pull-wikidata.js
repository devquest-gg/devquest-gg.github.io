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
WHERE {
  ?game wdt:P31 wd:Q7889 ; wdt:P577 ?date .
  FILTER(?date >= "${startISO}"^^xsd:dateTime && ?date < "${endISO}"^^xsd:dateTime)
  BIND(YEAR(?date) AS ?year)
  ?game rdfs:label ?gameLabel . FILTER(LANG(?gameLabel) = "en")
  OPTIONAL { ?game wdt:P178 ?dev .   ?dev   rdfs:label ?devLabel .   FILTER(LANG(?devLabel)="en") }
  OPTIONAL { ?game wdt:P123 ?pub .   ?pub   rdfs:label ?pubLabel .   FILTER(LANG(?pubLabel)="en") }
  OPTIONAL { ?game wdt:P400 ?plat .  ?plat  rdfs:label ?platLabel .  FILTER(LANG(?platLabel)="en") }
  OPTIONAL { ?game wdt:P136 ?genre . ?genre rdfs:label ?genreLabel . FILTER(LANG(?genreLabel)="en") }
}
GROUP BY ?game ?gameLabel`;
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
    source: "wikidata",
  };
  if (!existing) { games.set(id, rec); return; }
  // seen in another date range: keep earliest year, merge multi-values
  if (year != null && (existing.year == null || year < existing.year)) existing.year = year;
  for (const k of ["studios", "publishers", "platforms", "genres"]) {
    existing[k] = Array.from(new Set([...existing[k], ...rec[k]]));
  }
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
  for (let y = START_YEAR; y < END_YEAR; y++) {
    await pullRange(new Date(`${y}-01-01T00:00:00Z`), new Date(`${y + 1}-01-01T00:00:00Z`), games);
  }

  const gameList = Array.from(games.values());
  // stable order: newest first, then title
  gameList.sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title));
  assignSlugs(gameList);
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
