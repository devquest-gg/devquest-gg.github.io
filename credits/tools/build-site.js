#!/usr/bin/env node
/*
 * DevQuest Credits - static site builder
 * --------------------------------------
 * Turns the catalogue (games.json + studios.json) and hand-entered
 * seed-credits.json into the browsable data the /credits pages read:
 *
 *   data/site/index.json           compact search index (all games)
 *   data/site/games/<0..255>.json  sharded full game detail (by slug)
 *   data/site/studios-index.json   studio search index
 *   data/site/studios/<0..63>.json sharded studio detail + gameography
 *   data/site/people-index.json    people search index (from seed credits)
 *   data/site/people/<0..15>.json  sharded person detail + gameography
 *   data/site/stats.json           headline counts for the homepage
 *
 * At 130k+ games we do NOT pre-render one HTML file per entity. The site is a
 * few HTML templates that fetch exactly the one shard they need. The browser
 * computes the same shard bucket with the same hash used here (see bkt()).
 *
 * No npm dependencies. Requires Node 18+.
 *
 * Run:  node credits/tools/build-site.js
 * Test: DATA_DIR=/path/to/fixture node credits/tools/build-site.js
 */

const fs = require("fs");
const path = require("path");

// ---- config ---------------------------------------------------------------
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const OUT_DIR = path.join(DATA_DIR, "site");
const GAME_SHARDS = 256;
const STUDIO_SHARDS = 64;
const PEOPLE_SHARDS = 16;

// FNV-1a 32-bit. MUST stay byte-identical to the copy in the page scripts so a
// slug maps to the same shard on both sides. Uses Math.imul (Node + browsers).
function bkt(s, n) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % n;
}

function slugify(s) {
  return String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function readJSON(name, fallback) {
  const p = path.join(DATA_DIR, name);
  if (!fs.existsSync(p)) {
    console.warn(`  (missing ${name}, using fallback)`);
    return fallback;
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJSON(rel, obj) {
  const p = path.join(OUT_DIR, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj));
}

// Write a bucketed map: entries -> N shard files, each an object keyed by slug.
function writeShards(subdir, n, entries) {
  const buckets = Array.from({ length: n }, () => ({}));
  for (const [slug, detail] of entries) buckets[bkt(slug, n)][slug] = detail;
  for (let i = 0; i < n; i++) writeJSON(path.join(subdir, i + ".json"), buckets[i]);
}

// ---- main -----------------------------------------------------------------
(function main() {
  console.log("Building /credits site data from", DATA_DIR);

  const games = readJSON("games.json", []);
  const studiosRaw = readJSON("studios.json", []);
  const seed = readJSON("seed-credits.json", { games: [] });

  // Index games by slug for merging + studio gameography.
  const bySlug = new Map();
  for (const g of games) if (g.slug) bySlug.set(g.slug, g);

  // ---- merge seed credits ------------------------------------------------
  // Seed games either enrich an existing catalogue entry (matched by slug) or
  // are added as new hand-sourced games. Every credit is attached to its game.
  const seedGames = (seed && seed.games) || [];
  for (const sg of seedGames) {
    if (!sg || !sg.slug || sg.slug === "example-game") continue; // skip the template
    let g = bySlug.get(sg.slug);
    if (!g) {
      g = {
        slug: sg.slug, title: sg.title || sg.slug, year: sg.year || null,
        studios: sg.studio ? [sg.studio] : [], studio: sg.studio || null,
        publishers: [], platforms: sg.platforms || [],
        genres: sg.genre ? [sg.genre] : [],
        wikidata_qid: sg.wikidata_qid || "", source: "hand",
      };
      bySlug.set(sg.slug, g);
      games.push(g);
    }
    g.credits = (g.credits || []).concat(
      (sg.credits || []).map((c) => ({
        name: c.name, role: c.role || "",
        roles_other: c.roles_other || [],
        verification: c.verification || [],
        source_url: c.source_url || "", note: c.note || "",
      }))
    );
  }

  // ---- moderation studio links -------------------------------------------
  // Games an admin linked to a studio the import missed (or mis-attributed), exported
  // from the live DB into studio-links.json by the build workflow. Adding the studio
  // name to the game's `studios` makes the studio aggregation below pick it up, and sets
  // a primary studio if the game had none — so the link becomes permanent after rebuild.
  const linkData = readJSON("studio-links.json", { links: [] });
  let linkedCount = 0;
  for (const lk of (linkData && linkData.links) || []) {
    if (!lk || !lk.game_slug || !lk.studio_name) continue;
    const g = bySlug.get(lk.game_slug);
    if (!g) continue;
    g.studios = g.studios || [];
    if (!g.studios.some((n) => slugify(n) === slugify(lk.studio_name))) { g.studios.push(lk.studio_name); linkedCount++; }
    if (!g.studio) g.studio = lk.studio_name;
  }
  if (linkedCount) console.log(`  applied ${linkedCount} moderation studio link(s)`);

  // Admin-set cover art (games with no Steam capsule), exported from the live DB.
  const coverData = readJSON("game-covers.json", { covers: [] });
  const coverMap = {};
  for (const cv of (coverData && coverData.covers) || []) { if (cv && cv.game_slug && cv.cover_url) coverMap[cv.game_slug] = cv.cover_url; }
  if (Object.keys(coverMap).length) console.log(`  applied ${Object.keys(coverMap).length} admin cover(s)`);

  // ---- search index (all games) ------------------------------------------
  // Compact positional rows: [slug, title, year, primaryStudio].
  const index = games.map((g) => [g.slug, g.title, g.year || null, g.studio || (g.studios && g.studios[0]) || ""]);

  // ---- game detail shards ------------------------------------------------
  const gameEntries = games.map((g) => [g.slug, {
    title: g.title, year: g.year || null,
    studios: g.studios || [], publishers: g.publishers || [],
    platforms: g.platforms || [], genres: g.genres || [],
    qid: g.wikidata_qid || "", steam: g.steam || null, cover: coverMap[g.slug] || null, source: g.source || "wikidata",
    credits: g.credits || [],
  }]);

  // ---- studios: build gameography + people from credits -------------------
  const studioGames = new Map();   // studioSlug -> {name, games:[[slug,title,year]]}
  const studioName = new Map();
  for (const s of studiosRaw) { studioName.set(s.slug, s.name); studioGames.set(s.slug, { name: s.name, games: [] }); }
  for (const g of games) {
    for (const name of g.studios || []) {
      const sslug = slugify(name);
      if (!studioGames.has(sslug)) { studioGames.set(sslug, { name, games: [] }); studioName.set(sslug, name); }
      studioGames.get(sslug).games.push([g.slug, g.title, g.year || null]);
    }
  }
  // newest-first gameography, cap huge studios to keep shards sane
  for (const v of studioGames.values()) v.games.sort((a, b) => (b[2] || 0) - (a[2] || 0) || String(a[1]).localeCompare(String(b[1])));

  const studioIndex = Array.from(studioGames.entries())
    .map(([slug, v]) => [slug, v.name, v.games.length])
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const studioEntries = Array.from(studioGames.entries());

  // ---- people (from seed credits only, for now) --------------------------
  const people = new Map(); // personSlug -> {name, credits:[]}
  for (const g of games) {
    for (const c of g.credits || []) {
      if (!c.name) continue;
      const pslug = slugify(c.name);
      if (!people.has(pslug)) people.set(pslug, { name: c.name, credits: [] });
      people.get(pslug).credits.push({
        game_slug: g.slug, game_title: g.title, year: g.year || null,
        role: c.role || "", roles_other: c.roles_other || [],
        verification: c.verification || [],
      });
    }
  }
  // Opt-in public profile info (links) from seed.people. Public and separate
  // from the private proof/verification links attached to individual credits.
  for (const pp of (seed.people || [])) {
    if (!pp) continue;
    const pslug = pp.slug || slugify(pp.name || "");
    if (!pslug) continue;
    let rec = people.get(pslug);
    if (!rec) { rec = { name: pp.name || pslug, credits: [] }; people.set(pslug, rec); }
    if (pp.name) rec.name = pp.name;
    if (pp.links && pp.links.length) rec.links = pp.links;
  }
  const peopleIndex = Array.from(people.entries())
    .map(([slug, v]) => [slug, v.name, v.credits.length])
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const peopleEntries = Array.from(people.entries());

  // ---- write everything --------------------------------------------------
  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeJSON("index.json", index);
  writeShards("games", GAME_SHARDS, gameEntries);
  writeJSON("studios-index.json", studioIndex);
  writeShards("studios", STUDIO_SHARDS, studioEntries);
  writeJSON("people-index.json", peopleIndex);
  writeShards("people", PEOPLE_SHARDS, peopleEntries);

  const stats = {
    games: games.length,
    studios: studioIndex.length,
    people: peopleIndex.length,
    credits: games.reduce((n, g) => n + ((g.credits && g.credits.length) || 0), 0),
    generated: new Date().toISOString(),
  };
  writeJSON("stats.json", stats);

  // ---- home.json: tiny curated payload so the landing page stays light ----
  const byYear = games.slice().sort((a, b) => (b.year || 0) - (a.year || 0) || String(a.title).localeCompare(String(b.title)));
  // Marquee = well-known games, so the catalogue reads as familiar rather than a pile of unknowns.
  // We match each famous TITLE against the real catalogue (by a punctuation-insensitive key) and
  // use its actual slug — so links are always valid. Anything not in the catalogue is skipped;
  // recent titles pad out to 24 so the wall is always full. Curated list, not a popularity signal.
  const normKey = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const FEATURED = [
    "Elden Ring", "God of War", "The Witcher 3: Wild Hunt", "Baldur's Gate 3", "Cyberpunk 2077",
    "Red Dead Redemption 2", "The Legend of Zelda: Breath of the Wild", "Hades", "Stardew Valley",
    "Minecraft", "Portal 2", "Dark Souls III", "Hollow Knight", "Celeste", "Grand Theft Auto V",
    "Doom Eternal", "Half-Life 2", "Bloodborne", "Sekiro: Shadows Die Twice", "Disco Elysium",
    "Death Stranding", "Persona 5", "Cuphead", "The Last of Us Part II"
  ];
  const byNorm = new Map();
  for (const g of games) {
    if (!g.title) continue;
    const k = normKey(g.title);
    const prev = byNorm.get(k);
    // Prefer the canonical entry (the un-suffixed, shortest slug wins over "…-2" duplicates).
    if (!prev || String(g.slug).length < String(prev.slug).length) byNorm.set(k, g);
  }
  const seen = new Set();
  const featuredGames = [];
  for (const t of FEATURED) { const g = byNorm.get(normKey(t)); if (g && !seen.has(g.slug)) { seen.add(g.slug); featuredGames.push(g); } }
  for (const g of byYear) { if (featuredGames.length >= 24) break; if (g.title && !seen.has(g.slug)) { seen.add(g.slug); featuredGames.push(g); } }
  const covers = featuredGames.slice(0, 24)
    .map((g) => [g.slug, g.title, g.year || null, g.studio || "", (g.genres && g.genres[0]) || ""]);
  const topStudios = studioIndex.slice().sort((a, b) => b[2] - a[2]).slice(0, 12);
  writeJSON("home.json", { covers: covers, trendingGames: [], topStudios: topStudios });

  console.log(`  index: ${index.length} games`);
  console.log(`  game shards: ${GAME_SHARDS}, studio shards: ${STUDIO_SHARDS}, people shards: ${PEOPLE_SHARDS}`);
  console.log(`  studios: ${studioIndex.length}, people: ${peopleIndex.length}, credits: ${stats.credits}`);
  console.log(`Done. Wrote site data to ${OUT_DIR}`);
})();
