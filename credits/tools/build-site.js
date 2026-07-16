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
// Live claimed people, straight from the API (Node 18+ has global fetch). Fetching here means
// the build needs no extra workflow step. Falls back to a people-live.json file if present, then
// to empty, so a network hiccup or an offline local run never fails the build.
async function fetchPeople() {
  const url = "https://devquest-credits-api.balesdestin.workers.dev/export/people";
  try {
    const r = await fetch(url);
    if (r.ok) { const j = await r.json(); if (j && Array.isArray(j.people)) { console.log(`  live people fetched: ${j.people.length}`); return j; } }
  } catch (e) { console.log(`  (live people fetch failed: ${e && e.message} — falling back to file/empty)`); }
  return readJSON("people-live.json", { people: [] });
}

(async function main() {
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

  // ---- live claimed people ------------------------------------------------
  // Real developers who signed up and claimed credits, pulled from the DB into people-live.json
  // by the build workflow (mirrors the studio-links / covers pattern). A claimed person owns
  // their record, so their live credits replace any same-slug seed entry.
  const liveP = await fetchPeople();
  const yearBySlug = new Map(games.map((g) => [g.slug, g.year || null]));
  for (const lp of (liveP && liveP.people) || []) {
    if (!lp || !lp.slug) continue;
    let rec = people.get(lp.slug);
    if (!rec) { rec = { name: lp.name || lp.slug, credits: [] }; people.set(lp.slug, rec); }
    if (lp.name) rec.name = lp.name;
    if (lp.headline) rec.headline = lp.headline;
    if (lp.links && lp.links.length) rec.links = lp.links;
    if (lp.credits && lp.credits.length) {
      rec.credits = lp.credits.map((c) => ({
        game_slug: c.game_slug, game_title: c.game_title,
        year: (c.year != null ? c.year : (yearBySlug.get(c.game_slug) || null)),
        role: c.role || "", roles_other: c.roles_other || [],
        verification: [], vouch_count: c.vouch_count || 0,
      }));
    }
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
  // Marquee = well-known games WITH box art. We match each famous title against the real catalogue
  // (by a punctuation-insensitive key) so links are valid, prefer the catalogue entry that actually
  // has art (Steam capsule or admin cover — e.g. God of War 2018 over the pre-Steam 2005 one), and
  // keep ONLY games that have art. A big list means ~30 unique covers, so the wall rarely repeats.
  const normKey = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const artUrl = (g) => coverMap[g.slug] || (g.steam ? "https://cdn.cloudflare.steamstatic.com/steam/apps/" + encodeURIComponent(g.steam) + "/library_600x900.jpg" : null);
  const FEATURED = [
    "Elden Ring", "Cyberpunk 2077", "The Witcher 3: Wild Hunt", "Baldur's Gate 3", "Red Dead Redemption 2",
    "Grand Theft Auto V", "God of War", "Hades", "Stardew Valley", "Portal 2", "Dark Souls III",
    "Sekiro: Shadows Die Twice", "Hollow Knight", "Celeste", "Doom Eternal", "Half-Life 2",
    "Disco Elysium", "Death Stranding", "Cuphead", "Persona 5 Royal", "Nier: Automata",
    "Resident Evil 4", "Monster Hunter: World", "Devil May Cry 5", "Terraria", "Deep Rock Galactic",
    "Sea of Thieves", "Subnautica", "Dead Cells", "Slay the Spire", "Vampire Survivors", "Outer Wilds",
    "Divinity: Original Sin 2", "Kingdom Come: Deliverance", "Control", "It Takes Two", "Titanfall 2",
    "The Elder Scrolls V: Skyrim", "Fallout: New Vegas", "XCOM 2", "Sid Meier's Civilization VI",
    "Undertale", "Risk of Rain 2", "Return of the Obra Dinn", "A Plague Tale: Requiem",
    "Ori and the Will of the Wisps", "Frostpunk", "Hollow Knight: Silksong", "Balatro", "The Last of Us Part I"
  ];
  const byNorm = new Map();
  for (const g of games) {
    if (!g.title) continue;
    const k = normKey(g.title), prev = byNorm.get(k);
    // Prefer the entry that HAS art; then the un-suffixed (shortest) slug over "…-2" duplicates.
    if (!prev) { byNorm.set(k, g); continue; }
    const gArt = !!artUrl(g), pArt = !!artUrl(prev);
    if ((gArt && !pArt) || (gArt === pArt && String(g.slug).length < String(prev.slug).length)) byNorm.set(k, g);
  }
  const seen = new Set();
  const covers = [];
  for (const t of FEATURED) {
    const g = byNorm.get(normKey(t));
    if (!g || seen.has(g.slug)) continue;
    const art = artUrl(g);
    if (!art) continue; // no box art → leave it out of the wall entirely
    seen.add(g.slug);
    covers.push([g.slug, g.title, g.year || null, g.studio || "", (g.genres && g.genres[0]) || "", art]);
    if (covers.length >= 30) break;
  }
  const topStudios = studioIndex.slice().sort((a, b) => b[2] - a[2]).slice(0, 12);
  writeJSON("home.json", { covers: covers, trendingGames: [], topStudios: topStudios });

  console.log(`  index: ${index.length} games`);
  console.log(`  game shards: ${GAME_SHARDS}, studio shards: ${STUDIO_SHARDS}, people shards: ${PEOPLE_SHARDS}`);
  console.log(`  studios: ${studioIndex.length}, people: ${peopleIndex.length}, credits: ${stats.credits}`);
  console.log(`Done. Wrote site data to ${OUT_DIR}`);
})();
