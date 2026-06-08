#!/usr/bin/env node
/**
 * DevQuest scraper — pulls jobs from studio career boards.
 * Usage: node scrape.js                      (live fetch)
 *        node scrape.js --sample <dir|file>  (offline test with saved payloads)
 * Output: jobs.json + jobs.js (loaded by index.html)
 *
 * Supports Greenhouse (boards-api.greenhouse.io) and Lever (api.lever.co).
 * Greenhouse is fetched with ?content=true so we can extract salary ranges
 * and years-of-experience from job descriptions (descriptions are NOT stored).
 */

const fs = require("fs");
const path = require("path");

const sampleIdx = process.argv.indexOf("--sample");
const SAMPLE_FILE = sampleIdx > -1 ? process.argv[sampleIdx + 1] : null;

// ---- Directory ("misfit island") -------------------------------------------
// Studios we can't scrape per-job (no clean ATS feed), but still want to surface.
// We link players straight to the studio's own careers page. Honest + useful.
// Adding one is a single line: { name, url, note }.
const DIRECTORY = [
  { name: "Turn 10 Studios", url: "https://www.turn10studios.com/careers", note: "Forza — Xbox Game Studios" },
  { name: "Ninja Theory", url: "https://www.ninjatheory.com/careers/opportunities", note: "Hellblade — Xbox Game Studios" },
  { name: "Eidos-Montréal", url: "https://www.eidosmontreal.com/careers/", note: "Deus Ex, Tomb Raider — Embracer (Dayforce)" },
  { name: "Valve", url: "https://www.valvesoftware.com/en/jobs", note: "Steam, Half-Life, Dota 2 — custom site" },
  { name: "Remedy Entertainment", url: "https://www.remedygames.com/careers", note: "Control, Alan Wake — Finland" },
  { name: "Virtuos", url: "https://www.virtuosgames.com/careers", note: "AAA co-dev / outsourcing — global" },
  { name: "Playground Games", url: "https://www.playground-games.com/careers", note: "Forza Horizon, Fable — Xbox" },
  { name: "Creative Assembly", url: "https://www.creative-assembly.com/careers", note: "Total War, Alien — Sega" },
  { name: "Fuse Games", url: "https://fusegames.com/careers", note: "ex-Criterion devs — UK" },
  { name: "Undead Labs", url: "https://www.undeadlabs.com/careers", note: "State of Decay — Xbox" },
  { name: "Saber Interactive", url: "https://saber.games/careers/", note: "World War Z, Space Marine 2" },
  { name: "Supermassive Games", url: "https://www.supermassivegames.com/careers", note: "Until Dawn, The Quarry — UK" },
  { name: "The Coalition", url: "https://www.thecoalitionstudio.com/careers", note: "Gears of War — Xbox" },
  { name: "Hello Games", url: "https://hellogames.org/join-us/", note: "No Man's Sky — Guildford, UK" },
  { name: "Telltale Games", url: "https://telltale.com/careers/", note: "The Wolf Among Us — revived studio" },
  // Notable studios we can't cleanly scrape yet (Xbox first-party / custom corporate portals) — link-outs for now.
  { name: "Obsidian Entertainment", url: "https://www.obsidian.net/careers", note: "Pillars of Eternity, Avowed — Xbox Game Studios" },
  { name: "Square Enix", url: "https://www.square-enix-games.com/en_us/careers", note: "Final Fantasy, Dragon Quest — JP publisher" },
  { name: "NetEase Games", url: "https://www.neteasegames.com/careers/en/", note: "Marvel Rivals, Naraka — global/CN publisher" },
  { name: "LightSpeed Studios", url: "https://www.lightspeed-studios.com/join-us.html", note: "PUBG Mobile — Tencent" },
  // Self-hosted / non-standard boards — link-outs until a bespoke fetcher is worth building.
  { name: "Techland", url: "https://techland.net/job-offers", note: "Dying Light — self-hosted board, ~35 roles (PL)" },
  { name: "Warhorse Studios", url: "https://warhorsestudios.cz/kariera", note: "Kingdom Come: Deliverance — Embracer (CZ)" },
  { name: "Playdead", url: "https://playdead.com/jobs/", note: "Limbo, Inside — Denmark" },
];

// ---- "The Moon": smaller / indie studios, often ones who reached out to be listed.
// Kept separate from the curated island so that list can stay small + well-known while
// this one grows freely. Lives in an easy-to-edit moon.json so adding one is a one-line
// change (no code). Each entry: { "name": "Studio", "url": "https://…careers", "note": "" }
let MOON = [];
try { MOON = JSON.parse(fs.readFileSync(path.join(__dirname, "moon.json"), "utf8")); }
catch (e) { MOON = []; }

// ---- Studio registry -------------------------------------------------------
const STUDIOS = [
  { name: "Riot Games", type: "greenhouse", token: "riotgames" },
  { name: "Insomniac Games", type: "greenhouse", token: "insomniac" },
  { name: "Bungie", type: "greenhouse", token: "bungie" },
  { name: "2K", type: "greenhouse", token: "2k" },
  { name: "Crystal Dynamics", type: "greenhouse", token: "crystaldynamics" },
  { name: "Scopely", type: "greenhouse", token: "scopely" },
  { name: "Theorycraft Games", type: "lever", token: "theorycraftgames" },
  { name: "Naughty Dog", type: "greenhouse", token: "naughtydog" },
  // SIE's master board (careers.playstation.com). deptAsStudio attributes each
  // job to its actual studio (Naughty Dog, Santa Monica...) instead of "SIE";
  // jobs with no studio department show as the fallback name below (= HQ roles).
  { name: "Sony Interactive (HQ)", type: "greenhouse", token: "sonyinteractiveentertainmentglobal", deptAsStudio: true, parentCompany: "Sony Interactive" },
  { name: "Epic Games", type: "greenhouse", token: "epicgames" },
  { name: "Zynga", type: "greenhouse", token: "zyngacareers" },
  { name: "Zynga", type: "greenhouse", token: "zyngaearlycareers" },
  // EA runs Avature (jobs.ea.com): server-rendered HTML parsed page by page.
  // Listings carry no posted dates -> the site shows "date n/a" for these.
  { name: "Electronic Arts (HQ)", type: "avature", token: "ea",
    host: "jobs.ea.com", path: "/en_US/careers/Home", deptAsStudio: true, parentCompany: "Electronic Arts" },
  // Blizzard's public careers site runs on Phenom (not the Workday backend, which
  // bounces external requests). Captured via browser: jobs are embedded in each
  // search-results page's HTML. Fixed!
  { name: "Blizzard Entertainment", type: "phenom", token: "blizzard", host: "careers.blizzard.com" },
  // Activision's careers feed tags each job with its studio (jobCompany / legal entity), so we
  // split the Call of Duty studios out as their own studios; everything else stays "Activision".
  // (parentCompany groups them all under @Activision on the site.)
  { name: "Activision", type: "phenom", token: "activision", host: "careers.activision.com", path: "/search-results",
    parentCompany: "Activision",
    companySplit: {
      "INFINITY WARD": "Infinity Ward",
      "TREYARCH": "Treyarch",
      "SLEDGEHAMMER GAMES": "Sledgehammer Games",
      "RAVEN SOFTWARE": "Raven Software",
    } },
  // ZeniMax / Bethesda (jobs.zenimax.com) embeds its full posting list as encoded JSON
  // in the /jobs page; each posting names its real studio (Bethesda Game Studios,
  // MachineGames, Arkane...), so jobs split into proper studios under this umbrella.
  { name: "ZeniMax / Bethesda", type: "zenimax", parentCompany: "ZeniMax / Bethesda" },
  // Ubisoft tags every job department as just "Ubisoft", so we attribute named
  // studios by location (only unambiguous cities; everything else stays "Ubisoft").
  { name: "Ubisoft", type: "smartrecruiters", token: "Ubisoft2", parentCompany: "Ubisoft", subStudios: {
    "malmö": "Massive Entertainment", "malmo": "Massive Entertainment",
    "newcastle": "Ubisoft Reflections",
    "annecy": "Ubisoft Annecy",
    "montpellier": "Ubisoft Montpellier",
    "bordeaux": "Ubisoft Bordeaux",
    "montreal": "Ubisoft Montreal", "montréal": "Ubisoft Montreal",
    "quebec": "Ubisoft Quebec", "québec": "Ubisoft Quebec",
    "toronto": "Ubisoft Toronto",
    "saguenay": "Ubisoft Saguenay", "sherbrooke": "Ubisoft Sherbrooke",
    "winnipeg": "Ubisoft Winnipeg", "halifax": "Ubisoft Halifax",
    "bucharest": "Ubisoft Bucharest",
    "sofia": "Ubisoft Sofia",
    "belgrade": "Ubisoft Belgrade",
    "milan": "Ubisoft Milan",
    "barcelona": "Ubisoft Barcelona",
    "da nang": "Ubisoft Da Nang", "da-nang": "Ubisoft Da Nang",
    "osaka": "Ubisoft Osaka",
    "pune": "Ubisoft Pune", "mumbai": "Ubisoft Mumbai",
    "singapore": "Ubisoft Singapore",
    "kyiv": "Ubisoft Kyiv", "kiev": "Ubisoft Kyiv",
    // Paris/Saint-Mandé left as "Ubisoft" — HQ + studio share the city (ambiguous)
  } },
  { name: "Roblox", type: "greenhouse", token: "roblox" },
  { name: "Discord", type: "greenhouse", token: "discord" },
  { name: "Blackbird Interactive", type: "lever", token: "blackbirdinteractive" },
  { name: "Larian Studios", type: "lever", token: "larian" },
  { name: "Unity", type: "greenhouse", token: "unity3d" },
  { name: "Team17", type: "workable", token: "team-17-digital" },
  { name: "Rockstar Games", type: "greenhouse", token: "rockstargames" },
  { name: "People Can Fly", type: "smartrecruiters", token: "PeopleCanFly" },
  { name: "Kabam", type: "lever", token: "kabam" },
  { name: "CD Projekt Red", type: "smartrecruiters", token: "CDPROJEKTRED" },
  { name: "Rovio", type: "lever", token: "rovio-2" },
  { name: "The Pokémon Company", type: "greenhouse", token: "pokemoncareers" },
  { name: "Jam City", type: "lever", token: "jamcity" },
  { name: "Take-Two Interactive", type: "greenhouse", token: "taketwo" },
  { name: "Krafton", type: "greenhouse", token: "kraftonamericas" },
  { name: "Gearbox Software", type: "greenhouse", token: "gearbox" },
  { name: "Second Dinner", type: "ashby", token: "seconddinner" },
  { name: "Supercell", type: "ashby", token: "supercell" },
  { name: "King", type: "phenom", token: "king", host: "careers.king.com", path: "/us/en/search-results" },
  { name: "ArenaNet", type: "ashby", token: "arenanet" },
  { name: "Avalanche Studios", type: "lever", token: "avalanchestudios" },
  { name: "Paradox Interactive", type: "teamtailor", token: "paradox", host: "career.paradoxplaza.com" },
  { name: "Arrowhead Game Studios", type: "teamtailor", token: "arrowhead", host: "jobs.arrowheadgamestudios.com" },
  { name: "Fatshark", type: "teamtailor", token: "fatshark", host: "jobs.fatsharkgames.com" },
  { name: "Sharkmob", type: "teamtailor", token: "sharkmob", host: "career.sharkmob.com" },
  { name: "Embark Studios", type: "teamtailor", token: "embark", host: "careers.embark-studios.com" },
  { name: "CI Games", type: "teamtailor", token: "cigames", host: "cigames.teamtailor.com" },
  { name: "Fortis Games", type: "greenhouse", token: "fortisgames" },
  { name: "Gameloft", type: "smartrecruiters", token: "Gameloft" },
  // Netflix: giant non-gaming co — capture ONLY game-studio departments (no false positives).
  { name: "Netflix Games", type: "eightfold", token: "netflix", host: "explore.jobs.netflix.net", domain: "netflix.com",
    departments: ["Games", "Netflix Games Studio", "Next Games", "MoonLoot Games"] },
  // Amazon: keyword search + team allow-list (Amazon Games + Luna cloud gaming).
  { name: "Amazon Games", type: "amazonjobs", token: "amazon",
    queries: ["games", "game", "luna", "gameplay"], teams: ["team-games", "team-luna"] },
  // Wizards of the Coast = Hasbro's games division (Magic, D&D). Hasbro runs Eightfold
  // on the "pcsx" search endpoint; keep ONLY department "WIZARDS" (drops toys/corporate).
  { name: "Wizards of the Coast", type: "eightfold", token: "wotc", host: "careers.hasbro.com",
    domain: "hasbro.com", api: "pcsx", departments: ["WIZARDS"] },
  // Warner Bros. Games = the games studios on WBD's all-divisions Phenom board
  // (Rocksteady, NetherRealm, Avalanche, TT Games, WB Games Montreal). Keep only
  // category "Game Development" so we don't pull WBD's ~415 non-game roles.
  { name: "Warner Bros. Games", type: "phenom", token: "wbgames", host: "careers.wbd.com",
    path: "/global/en/search-results", categories: ["Game Development"] },
  // Niche-platform studios promoted by the June 7 2026 island re-audit.
  { name: "Studio Wildcard", type: "bamboohr", token: "studiowildcard" },
  { name: "Nexon", type: "jobscore", token: "nexonamericainc" },
  { name: "Certain Affinity", type: "jazzhr", token: "certainaffinityinc" },
  { name: "Capcom", type: "jobvite", token: "capcomusa" },
  { name: "Frontier Developments", type: "lever", token: "frontier", region: "eu" }, // public feed is on the EU host
  { name: "Aspyr Media", type: "greenhouse", token: "aspyrmediainc" }, // proxied under aspyr.com but a standard Greenhouse board
  // Workday fetcher kept for future boards (EA, Nintendo...). Sony's Workday
  // board is superseded by the Greenhouse board above.
  // { name: "PlayStation (Sony)", type: "workday", token: "sonyglobal",
  //   host: "sonyglobal.wd1.myworkdayjobs.com", tenant: "sonyglobal", site: "SonyGlobalCareers", search: "PlayStation" },
  // ---- Promoted from the directory by the June 7 2026 island re-audit ----
  { name: "Nintendo", type: "greenhouse", token: "nintendo" },
  { name: "Mojang Studios", type: "greenhouse", token: "mojangab" },
  { name: "Bandai Namco", type: "greenhouse", token: "bandainamco" },
  { name: "Firaxis Games", type: "greenhouse", token: "firaxis" },
  { name: "That's No Moon", type: "greenhouse", token: "thatsnomoonentertainment" },
  { name: "NCSOFT", type: "greenhouse", token: "ncamerica" },
  { name: "HoYoverse", type: "greenhouse", token: "hoyoverse" },
  { name: "Behaviour Interactive", type: "lever", token: "bhvr" },
  { name: "Jagex", type: "workable", token: "jagex-limited" },
  { name: "Climax Studios", type: "workable", token: "climax-studios" },
  { name: "Rebellion", type: "workable", token: "rebellion" },
  { name: "Keywords Studios", type: "smartrecruiters", token: "KeywordsStudios" },
  { name: "IO Interactive", type: "teamtailor", token: "ioi", host: "apply.ioi.dk" },
  { name: "OtherSide Entertainment", type: "teamtailor", token: "otherside", host: "careers.otherside-e.com" },
  { name: "Sega", type: "workday", token: "sega", host: "sega.wd3.myworkdayjobs.com", tenant: "sega", site: "SEGA_Careers" },
  { name: "Cloud Imperium Games", type: "workday", token: "cig", host: "cloudimperiumgames.wd1.myworkdayjobs.com", tenant: "cloudimperiumgames", site: "CIG_Global_Careers" },

  // ---- June 2026 batch ----
  { name: "Digital Extremes", type: "greenhouse", token: "digitalextremes" }, // Warframe (London, Ontario)
  { name: "Asobo Studio", type: "lever", token: "asobostudio", region: "eu" }, // MS Flight Sim, A Plague Tale (public feed on Lever EU host)
  // LEGO Digital Play is the LEGO Group's in-house GAMES studio — its own Teamtailor careers
  // site, so we get games-only roles without filtering LEGO corporate's giant Workday board.
  { name: "LEGO Digital Play", type: "teamtailor", token: "legodigitalplay", host: "careers.legodigitalplay.com" },
  { name: "Focus Entertainment", type: "recruitee", token: "focusentertainment" }, // FR publisher/dev (Recruitee)

  // ---- June 2026 batch 2 (verified live feeds; a few have valid boards sitting at 0 today) ----
  { name: "Bonfire Studios", type: "greenhouse", token: "bonfirestudios" },        // ex-Blizzard/Riot, LA (0 open now)
  { name: "Wildlife Studios", type: "greenhouse", token: "wildlifestudios" },      // BR mobile
  { name: "Absurd Ventures", type: "greenhouse", token: "absurdventures" },        // Dan Houser's new studio
  { name: "Dream Games", type: "greenhouse", token: "dreamgames" },                // Royal Match (0 open now)
  { name: "Crytek", type: "lever", token: "crytek" },                              // Crysis, Hunt: Showdown (DE)
  { name: "thatgamecompany", type: "ashby", token: "thatgamecompany" },            // Journey, Sky
  { name: "Quantic Dream", type: "lever", token: "quanticdream", region: "eu" },   // Detroit: Become Human (FR, Lever EU)
  { name: "Don't Nod", type: "smartrecruiters", token: "DONTNOD" },                // Life is Strange (FR)

  // ---- batch 2 verification pass (real ATS tokens confirmed from each careers page) ----
  { name: "Atari", type: "greenhouse", token: "atariinc" },                        // 9 live
  { name: "Bloober Team", type: "recruitee", token: "blooberteam" },               // Silent Hill 2 remake (PL)
  { name: "11 bit studios", type: "recruitee", token: "11bitstudios" },            // Frostpunk (PL)
  { name: "Raw Fury", type: "teamtailor", token: "rawfury", host: "jobs.rawfury.com" }, // indie publisher (SE)
  { name: "Wargaming", type: "greenhouse", token: "wargamingen" },                 // World of Tanks (public board API ~0 today — recheck)
];

// ---- Normalization helpers -------------------------------------------------

const DISCIPLINE_MAP = {
  art: "Art", animation: "Animation", audio: "Audio", design: "Design",
  engineering: "Engineering", "software engineering": "Engineering",
  production: "Production", "quality assurance": "QA", qa: "QA",
  marketing: "Marketing", communications: "Marketing", publishing: "Marketing",
  data: "Data & Analytics", analytics: "Data & Analytics", research: "Data & Analytics",
  esports: "Esports", "player support": "Player Support",
  hr: "People & Ops", people: "People & Ops", finance: "People & Ops",
  legal: "People & Ops", facilities: "People & Ops", security: "IT & Security",
  it: "IT & Security", "information technology": "IT & Security",
};

function mapDiscipline(raw, title) {
  const key = (raw || "").toLowerCase().trim();
  if (DISCIPLINE_MAP[key]) return DISCIPLINE_MAP[key];
  for (const [k, v] of Object.entries(DISCIPLINE_MAP)) if (key.includes(k)) return v;
  // Title-keyword fallback. ORDER MATTERS — most specific first. This is what
  // keeps roles out of the "Business & Ops" catch-all, so it's fairly thorough.
  const t = title.toLowerCase();
  if (/engineer|programmer|\bdeveloper|software|\bsre\b|devops|\bsdet\b/.test(t)) return "Engineering";
  if (/product (manager|owner|management)|head of product/.test(t)) return "Production"; // PMs grouped with Production
  if (/artist|concept|\bvfx\b|lighting|illustrat|sculpt/.test(t)) return "Art";
  if (/animator|animation|rigging/.test(t)) return "Animation";
  if (/\bux\b|\bui\b|user experience|user research/.test(t)) return "Design";
  if (/designer|design/.test(t)) return "Design";
  if (/producer|production/.test(t)) return "Production";
  if (/audio|sound|composer|\bmusic\b/.test(t)) return "Audio";
  if (/\bqa\b|quality|tester|\btest\b/.test(t)) return "QA";
  if (/writer|narrative/.test(t)) return "Design";
  // data: only clear data signals (NOT bare "analyst", which catches finance/business analysts)
  if (/\bdata\b|data scien|\banalytics\b|business intelligence|\bbi\b|insights/.test(t)) return "Data & Analytics";
  if (/esports/.test(t)) return "Esports";
  if (/player support|customer support|community support/.test(t)) return "Player Support";
  if (/market|\bbrand\b|public relations|\bpr\b|social media|communit|influencer|communication/.test(t)) return "Marketing";
  return raw || "Other";
}

function inferSeniority(title) {
  const t = title.toLowerCase();
  if (/\b(director|head of|vp|chief)\b/.test(t)) return "Director+";
  if (/\b(lead|principal|staff)\b/.test(t)) return "Lead";
  if (/\b(senior|sr\.?)\b/.test(t)) return "Senior";
  if (/\b(junior|jr\.?|associate|intern|entry|apprentice)\b/.test(t)) return "Entry";
  return "Mid";
}

function inferRegion(location) {
  const l = location.toLowerCase();
  if (/(united states|usa|\b(ca|wa|tx|ny|md|fl|il|ma|nc|ga)\b|los angeles|seattle|austin|new york|san (francisco|mateo|diego)|bellevue|irvine|burbank|santa monica|redmond|mercer island|atlanta|chicago|boston|novato)/.test(l)) return "North America";
  if (/(canada|montreal|montréal|toronto|vancouver|quebec)/.test(l)) return "North America";
  if (/(mexico|brazil|são paulo|sao paulo|argentina|chile|colombia)/.test(l)) return "Latin America";
  if (/(uk|united kingdom|london|oxford|horsham|brighton|ireland|dublin|france|paris|lyon|germany|berlin|poland|warsaw|spain|barcelona|madrid|belgium|ghent|netherlands|amsterdam|finland|espoo|helsinki|sweden|stockholm|turkey|istanbul|czech|prague)/.test(l)) return "Europe";
  if (/(japan|tokyo|china|shanghai|guangzhou|beijing|hong kong|korea|seoul|singapore|taiwan|taipei|australia|sydney|india|bangalore|vietnam|thailand|bangkok|malaysia|philippines|manila)/.test(l)) return "Asia-Pacific";
  if (/(dubai|uae|saudi|riyadh|israel|tel aviv|south africa)/.test(l)) return "Middle East & Africa";
  if (/remote/.test(l)) return "Remote";
  return "Other";
}

// Honest work type: only claim Remote/Hybrid/Onsite with an explicit signal.
// Work-type detection. We separate HIGH-TRUST signals (title/location text, where a
// bare word like "Remote" is meaningful) from LOWER-TRUST description text (where
// "remote" can appear innocently, e.g. "remote teams"). Description mining therefore
// requires explicit phrases. We never guess: no signal -> "Unknown". Hybrid is checked
// before Remote so "hybrid (2 days remote)" isn't miscounted as fully remote.
function inferWorkType(title, location, metadata, desc) {
  const head = `${title || ""} ${location || ""}`.toLowerCase();

  // 1) high-trust: explicit words in the title or location field
  if (/\bhybrid\b/.test(head)) return "Hybrid";
  if (/\bremote\b|\boffsite\b|work from home|\bwfh\b|telecommut/.test(head)) return "Remote";
  if (/on-?site|in-?office|in office|in[- ]person/.test(head)) return "Onsite";

  // 2) structured metadata (e.g. Greenhouse custom "Work Model" fields)
  const wm = (metadata || []).find(m => /work (model|type|arrangement)|remote/i.test(m.name || ""));
  if (wm && typeof wm.value === "string") {
    const v = wm.value.toLowerCase();
    if (v.includes("hybrid")) return "Hybrid";
    if (v.includes("remote")) return "Remote";
    if (v.includes("site") || v.includes("office")) return "Onsite";
  }

  // 3) lower-trust: mine the description, but only for explicit, unambiguous phrases.
  const body = (desc || "").toLowerCase();
  if (body) {
    if (/\bhybrid\b|\d+\s*days?\s*(?:per week|a week|\/wk|\/week|in[- ]?office|on-?site)|split between (?:home|the office)/.test(body))
      return "Hybrid";
    if (/fully remote|100% remote|remote[- ]first|work[- ]from[- ]home|\bwfh\b|telecommut|fully distributed|this (?:role|position) is remote|(?:role|position) (?:is|can be) (?:fully )?remote|remote(?:[- ]eligible| position| role| opportunity)|open to (?:fully )?remote|work remotely from/.test(body))
      return "Remote";
    if (/\bon-?site\b|\bin-?office\b|in[- ]person|relocation (?:is )?required|this (?:role|position) is (?:on-?site|in-?office)|based (?:in|at) our [a-z ]{0,20}(?:office|studio|campus|hq)/.test(body))
      return "Onsite";
  }
  return "Unknown";
}

// Departments that are actual game studios (vs corporate orgs like Finance/Legal).
// Matches "X Studio(s)", "X Games", and known PlayStation studio names.
const STUDIO_DEPT = /studios?\b|games\b|naughty dog|sucker punch|guerrilla|housemarque|polyphony|media molecule|team asobi|bluepoint|nixxes|firesprite|valkyrie|xdev|creative arts/i;

// Resolve a publisher sub-studio from a job's location (curated city map).
// Returns the studio name if a mapped city matches, else the publisher name.
function subStudioName(studio, location) {
  if (!studio.subStudios) return studio.name;
  const s = (location || "").toLowerCase();
  for (const [city, name] of Object.entries(studio.subStudios))
    if (s.includes(city)) return name;
  return studio.name;
}

function metaValue(metadata, fieldName) {
  const m = (metadata || []).find(x => (x.name || "").toLowerCase() === fieldName.toLowerCase());
  if (!m || m.value == null) return null;
  return Array.isArray(m.value) ? m.value.join(", ") : String(m.value);
}

// ---- Description mining (salary + years of experience) ---------------------

function stripHtml(s) {
  return (s || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&").replace(/&#\d+;/g, " ").replace(/&\w+;/g, " ")
    .replace(/<[^>]*>/g, " ");
}

function extractSalary(text) {
  if (!text) return null;
  let lo = null, hi = null;
  // 1) adjacent range: "$120,000 - $150,000", "$120K to $150K", "$134,320 – $248,404"
  let m = text.match(/\$\s?([\d][\d,.]*)\s*([kK])?\s*(?:-|–|—|to|through)\s*\$?\s?([\d][\d,.]*)\s*([kK])?/);
  if (m) {
    lo = parseFloat(m[1].replace(/,/g, "")); if (m[2]) lo *= 1000;
    hi = parseFloat(m[3].replace(/,/g, "")); if (m[4]) hi *= 1000;
  } else {
    // 2) verbose range where words sit between the numbers, but an annual marker
    // anchors the first figure as a yearly salary: "...ranges from $99,500/year in
    // our lowest geographic market up to $185,000/year..." (Amazon and similar).
    // The annual marker + bounded gap (no other $ between) guards against matching
    // unrelated amounts like sign-on bonuses or relocation caps.
    m = text.match(/\$\s?([\d][\d,.]*)\s*([kK])?\s*\/?\s*(?:yr|year|annually|annum|per year|\/yr)[^$]{0,80}?(?:up to|to|through|-|–|—)[^$]{0,20}?\$\s?([\d][\d,.]*)\s*([kK])?/i);
    if (m) {
      lo = parseFloat(m[1].replace(/,/g, "")); if (m[2]) lo *= 1000;
      hi = parseFloat(m[3].replace(/,/g, "")); if (m[4]) hi *= 1000;
    }
  }
  if (lo == null) {
    // 3) currency-suffixed range with NO dollar sign: "151,300.00 - 264,700.00 USD
    // annually" (Amazon). Require comma-grouped thousands + an explicit currency
    // word so we never match stray numbers.
    const m3 = text.match(/([\d]{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(?:-|–|—|to)\s*([\d]{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(?:USD|CAD|EUR|GBP)\b/i);
    if (m3) { lo = parseFloat(m3[1].replace(/,/g, "")); hi = parseFloat(m3[2].replace(/,/g, "")); }
  }
  if (lo == null || hi == null) return null;
  // sanity: annual USD salaries only (skip hourly rates and nonsense)
  if (!(lo >= 10000 && hi > lo && hi <= 2000000)) return null;
  const f = n => "$" + Math.round(n / 1000) + "K";
  return f(lo) + "–" + f(hi);
}

function extractYoe(text) {
  if (!text) return null;
  const m = text.match(/(\d{1,2})\s*\+?\s*(?:or more\s+)?years?/i);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return y >= 1 && y <= 15 ? y : null;
}

// Convert a Workday "viewable" job URL (or apply URL) into its JSON detail
// endpoint (/wday/cxs/<tenant>/<site>/job/...), which carries the full
// description and the legally-required pay band. Returns null for non-Workday URLs.
function workdayDetailUrl(url) {
  try {
    const u = new URL(url);
    if (!/\.myworkdayjobs\.com$/i.test(u.hostname)) return null;
    const tenant = u.hostname.split(".")[0];
    let parts = u.pathname.split("/").filter(Boolean);
    if (/^[a-z]{2}-[A-Z]{2}$/.test(parts[0])) parts.shift();   // drop locale (e.g. en-US)
    if (parts[parts.length - 1] === "apply") parts.pop();        // drop trailing /apply
    if (parts[1] !== "job") return null;
    return `https://${u.hostname}/wday/cxs/${tenant}/${parts.join("/")}`;
  } catch (e) { return null; }
}

// ---- Fetchers ---------------------------------------------------------------

function loadSample(studio) {
  const p = fs.statSync(SAMPLE_FILE).isDirectory()
    ? path.join(SAMPLE_FILE, studio.token + ".json") : SAMPLE_FILE;
  if (!fs.existsSync(p)) { console.log(`-- ${studio.name}: no sample, skipped`); return null; }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "DevQuest/0.1 (game-dev job aggregator)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchGreenhouse(studio) {
  const data = SAMPLE_FILE ? loadSample(studio)
    : await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${studio.token}/jobs?content=true`);
  if (!data) return [];
  return data.jobs.map(j => {
    const location = j.location?.name || "Unlisted";
    const craft = ["Craft", "Career Page - Sub Department", "Job Family", "Job Family Group"]
      .map(f => metaValue(j.metadata, f)).find(v => v) || null;
    const desc = stripHtml(j.content);
    const dept = studio.deptAsStudio ? metaValue(j.metadata, "Career Page - Department") : null;
    const isStudioDept = dept && STUDIO_DEPT.test(dept);
    return {
      id: `gh-${studio.token}-${j.id}`,
      title: j.title,
      studio: isStudioDept ? dept : studio.name,
      discipline: mapDiscipline(craft, j.title),
      workType: inferWorkType(j.title, location, j.metadata, desc.slice(0, 1200)),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(j.title),
      salary: extractSalary(desc),
      yoe: extractYoe(desc),
      postedAt: j.first_published || j.updated_at,
      url: j.absolute_url,
    };
  });
}

// ---- Recruitee (Focus Entertainment + many EU studios) -----------------------
// Public JSON API: https://<token>.recruitee.com/api/offers/ -> { offers: [...] }.
async function fetchRecruitee(studio) {
  const data = SAMPLE_FILE ? loadSample(studio)
    : await fetchJson(`https://${studio.token}.recruitee.com/api/offers/`);
  if (!data) return [];
  const offers = (data.offers || []).filter(o => (o.status || "published") === "published");
  return offers.map(o => {
    const location = o.location || [o.city, o.country].filter(Boolean).join(", ") || "Unlisted";
    const desc = stripHtml(o.description || "");
    return {
      id: `rec-${studio.token}-${o.id}`,
      title: o.title,
      studio: studio.name,
      discipline: mapDiscipline(o.department || o.category_code || "", o.title || ""),
      workType: inferWorkType(o.title || "", location, [], desc.slice(0, 1200)),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(o.title || ""),
      salary: extractSalary(desc),
      yoe: extractYoe(desc),
      postedAt: o.published_at || o.created_at || null,
      url: o.careers_url || o.careers_apply_url || "",
    };
  });
}

async function fetchLever(studio) {
  const data = SAMPLE_FILE ? loadSample(studio)
    : await fetchJson(`https://${studio.region === "eu" ? "api.eu.lever.co" : "api.lever.co"}/v0/postings/${studio.token}?mode=json`); // some studios (Frontier) post on Lever's EU host
  if (!data) return [];
  return data.map(j => {
    const location = (j.categories?.allLocations || [j.categories?.location]).filter(Boolean).join("; ") || "Unlisted";
    const dept = j.categories?.team || j.categories?.department;
    const wt = (j.workplaceType || "").toLowerCase();
    const desc = [j.descriptionPlain, j.additionalPlain, j.openingPlain].filter(Boolean).join(" ");
    let salary = null;
    if (j.salaryRange && j.salaryRange.min && j.salaryRange.max) {
      const f = n => "$" + Math.round(n / 1000) + "K";
      salary = f(j.salaryRange.min) + "–" + f(j.salaryRange.max);
    } else salary = extractSalary(desc);
    return {
      id: `lever-${studio.token}-${j.id}`,
      title: j.text,
      studio: studio.name,
      discipline: mapDiscipline(dept, j.text),
      workType: wt === "remote" ? "Remote" : wt === "hybrid" ? "Hybrid" : wt === "onsite" ? "Onsite"
        : inferWorkType(j.text, location, [], desc),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(j.text),
      salary,
      yoe: extractYoe(desc),
      postedAt: new Date(j.createdAt).toISOString(),
      url: j.hostedUrl,
    };
  });
}

// Workday: no official public API. Career sites are backed by a JSON endpoint
// (POST /wday/cxs/<tenant>/<site>/jobs). Used politely: 20/page, 400ms between
// pages, capped at 1000 jobs. postedOn is humanized text -> approximate date.
function workdayPostedDate(s) {
  const t = (s || "").toLowerCase();
  let days;
  if (t.includes("today")) days = 0;
  else if (t.includes("yesterday")) days = 1;
  else { const m = t.match(/(\d+)\+?\s*day/); days = m ? parseInt(m[1], 10) : 31; }
  if (t.includes("+")) days += 1; // "30+ days" -> at least 31
  return new Date(Date.now() - days * 864e5).toISOString();
}

async function workdayPost(base, body) {
  return fetch(base, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "DevQuest/0.1 (game-dev job aggregator)",
    },
    body: JSON.stringify(body),
  });
}

async function fetchWorkday(studio) {
  let postings = [];
  if (SAMPLE_FILE) {
    const data = loadSample(studio);
    if (!data) return [];
    postings = data.jobPostings || [];
  } else {
    const base = `https://${studio.host}/wday/cxs/${studio.tenant}/${studio.site}/jobs`;
    const LIMIT = 20;
    // Some tenants 422 on certain body shapes. Probe variants on the first page,
    // then reuse whichever the tenant accepted for pagination.
    const variants = [
      o => ({ appliedFacets: {}, limit: LIMIT, offset: o, searchText: studio.search || "" }),
      o => ({ appliedFacets: {}, limit: LIMIT, offset: o, searchText: studio.search || "a" }),
      o => ({ limit: LIMIT, offset: o, searchText: studio.search || "" }),
    ];
    let body = null, total = 0;
    for (const v of variants) {
      const res = await workdayPost(base, v(0));
      if (res.ok) { body = v; const d = await res.json(); total = d.total ?? 0; postings.push(...(d.jobPostings || [])); break; }
      if (res.status !== 422) throw new Error(`HTTP ${res.status}`);
    }
    if (!body) throw new Error("HTTP 422 (all request variants rejected)");
    let offset = LIMIT;
    await new Promise(r => setTimeout(r, 400));
    while (offset < total && offset < 1000) {
      const res = await workdayPost(base, body(offset));
      if (!res.ok) throw new Error(`HTTP ${res.status} at offset ${offset}`);
      const data = await res.json();
      postings.push(...(data.jobPostings || []));
      offset += LIMIT;
      await new Promise(r => setTimeout(r, 400)); // be polite
    }
  }
  return postings.map(j => {
    const location = j.locationsText || "Unlisted";
    const ref = (j.bulletFields && j.bulletFields[0]) || (j.externalPath || "").split("/").pop();
    return {
      id: `wd-${studio.token}-${ref}`,
      title: j.title,
      studio: studio.name,
      discipline: mapDiscipline(null, j.title || ""),
      workType: inferWorkType(j.title || "", location, []),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(j.title || ""),
      salary: null, // not in Workday list responses
      yoe: null,
      postedAt: workdayPostedDate(j.postedOn),
      url: `https://${studio.host}/en-US/${studio.site}${j.externalPath || ""}`,
    };
  });
}

// ---- Avature (EA) -----------------------------------------------------------
// jobs.ea.com is server-rendered HTML. We page through ?jobOffset=N and parse
// job cards: <a href=".../JobDetail/<slug>/<id>">Title</a> followed by
// "Location(s) • Role ID NNN • Worker Type • Studio/Department".

const EA_STUDIO = /maxis|dice|respawn|bioware|motive|criterion|codemasters|full circle|ripple effect|pop\s?cap|slingshot|firemonkeys|cliffhanger|sports/i;
function eaStudioFromDept(dept) {
  if (!dept || !EA_STUDIO.test(dept)) return null;
  const d = dept.replace(/ /g, " ").replace(/^EA\s+(Studios|Mobile)\s*-\s*/i, "").trim();
  return /^sports$/i.test(d) ? "EA Sports" : d;
}

function decodeEnt(s) {
  return (s || "").replace(/&amp;/g, "&").replace(/&#8482;|&trade;/g, "™")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&middot;|&#183;|&#8226;|&bull;/g, "·")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

function parseAvaturePage(html, studio) {
  const re = /<a[^>]+href="([^"]*\/JobDetail\/[^"\/]+\/(\d+))"[^>]*>([\s\S]*?)<\/a>/g;
  const anchors = [];
  let m;
  while ((m = re.exec(html)))
    anchors.push({ href: m[1], id: m[2], inner: m[3].replace(/<[^>]*>/g, "").trim(), pos: m.index, end: m.index + m[0].length });
  const out = [];
  const seen = new Set();
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (!a.inner || seen.has(a.id)) continue;
    if (/more information|linkedin|facebook|whatsapp|email|^x$|^share/i.test(a.inner)) continue;
    seen.add(a.id);
    const next = anchors.slice(i + 1).find(b => b.id !== a.id);
    const chunk = html.slice(a.end, next ? next.pos : a.end + 3000);
    // raw HTML uses entities for the separators: &#8226;/&bull; (•) and &nbsp;.
    // Decode those BEFORE splitting, or the bullet split finds nothing.
    const text = chunk.replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&#8226;|&bull;/gi, "•")
      .replace(/\s+/g, " ");
    const parts = text.split("•").map(s => s.trim()).filter(Boolean);
    const ri = parts.findIndex(p => /Role ID/i.test(p));
    const location = ri > 0 ? decodeEnt(parts.slice(0, ri).join("; ")) : "Unlisted";
    const dept = ri > -1 ? decodeEnt((parts[ri + 2] || "").split(/More Information|Share/i)[0].trim()) : "";
    const isStudio = studio.deptAsStudio ? eaStudioFromDept(dept) : null;
    const title = decodeEnt(a.inner);
    out.push({
      id: `av-${studio.token}-${a.id}`,
      title,
      studio: isStudio || studio.name,
      discipline: mapDiscipline(isStudio ? null : dept, title),
      workType: inferWorkType(title, location, []),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null,
      yoe: null,
      postedAt: null, // Avature listings don't expose posted dates
      url: a.href.startsWith("http") ? a.href : `https://${studio.host}${a.href}`,
    });
  }
  return out;
}

async function fetchAvature(studio) {
  if (SAMPLE_FILE) {
    const data = loadSample(studio);
    if (!data) return [];
    return (data.pages || []).flatMap(p => parseAvaturePage(p, studio));
  }
  // Browser-like UA: some HTML career sites (EA/Avature) serve a bot page or
  // rate-limit unknown clients, which silently yields 0 jobs. Look like Chrome.
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const all = {};
  for (let offset = 0; offset < 2000; offset += 20) {
    const url = `https://${studio.host}${studio.path}/?jobRecordsPerPage=20&jobOffset=${offset}`;
    // fetch with one retry on transient failure
    let page = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, { headers });
      if (res.ok) { page = parseAvaturePage(await res.text(), studio); break; }
      if (attempt === 0) { await new Promise(r => setTimeout(r, 1500)); continue; }
      // second failure: keep whatever we have rather than losing the whole studio
      if (Object.keys(all).length) return Object.values(all);
      throw new Error(`HTTP ${res.status} at offset ${offset}`);
    }
    const before = Object.keys(all).length;
    for (const j of page || []) all[j.id] = j;
    if (!page || !page.length || Object.keys(all).length === before) break; // no new jobs -> done
    await new Promise(r => setTimeout(r, 500)); // be polite
  }
  if (!Object.keys(all).length) throw new Error("0 jobs parsed (site may be blocking the scraper or changed layout)");
  return Object.values(all);
}

// ---- SmartRecruiters (Ubisoft) ------------------------------------------------
// Public JSON API, paginated: /v1/companies/<id>/postings?limit=100&offset=N

const SR_COUNTRY = { us:"United States", ca:"Canada", gb:"United Kingdom", fr:"France", de:"Germany",
  es:"Spain", it:"Italy", ro:"Romania", pl:"Poland", se:"Sweden", fi:"Finland", ua:"Ukraine",
  cn:"China", jp:"Japan", kr:"Korea", sg:"Singapore", in:"India", au:"Australia", nz:"New Zealand",
  br:"Brazil", mx:"Mexico", ae:"UAE", sa:"Saudi Arabia", nl:"Netherlands", be:"Belgium", dk:"Denmark",
  cz:"Czech Republic", pt:"Portugal", ma:"Morocco", ph:"Philippines", vn:"Vietnam" };

async function fetchSmartRecruiters(studio) {
  let content = [];
  if (SAMPLE_FILE) {
    const data = loadSample(studio);
    if (!data) return [];
    content = data.content || [];
  } else {
    let offset = 0, total = Infinity;
    while (offset < total && offset < 2000) {
      const data = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${studio.token}/postings?limit=100&offset=${offset}`);
      total = data.totalFound ?? 0;
      content.push(...(data.content || []));
      offset += 100;
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return content.map(j => {
    const country = SR_COUNTRY[(j.location?.country || "").toLowerCase()] || (j.location?.country || "").toUpperCase();
    const location = [j.location?.city, country].filter(Boolean).join(", ") || "Unlisted";
    const dept = j.function?.label || j.department?.label;
    const exp = (j.experienceLevel?.label || "").toLowerCase();
    const seniority = /director|executive/.test(exp) ? "Director+"
      : /senior/.test(exp) ? "Senior" : /entry|junior|intern|apprentice/.test(exp) ? "Entry"
      : /mid/.test(exp) ? "Mid" : inferSeniority(j.name || "");
    return {
      id: `sr-${studio.token}-${j.id}`,
      title: j.name,
      studio: subStudioName(studio, location),
      discipline: mapDiscipline(dept, j.name || ""),
      workType: j.location?.remote ? "Remote" : inferWorkType(j.name || "", location, []),
      location,
      region: inferRegion(location),
      seniority,
      salary: null,
      yoe: null,
      postedAt: j.releasedDate || null,
      url: `https://jobs.smartrecruiters.com/${studio.token}/${j.id}`,
    };
  });
}

// ---- Workable (Team17 + many indies) -----------------------------------------
// Public widget API: GET https://apply.workable.com/api/v1/widget/accounts/<subdomain>
// Returns { name, jobs: [{ title, shortcode, department, city, state, country,
// url/shortlink, employment_type, remote/telecommuting, published_on }] }.
async function fetchWorkable(studio) {
  let jobs = [];
  if (SAMPLE_FILE) {
    const data = loadSample(studio);
    if (!data) return [];
    jobs = data.jobs || [];
  } else {
    const data = await fetchJson(`https://apply.workable.com/api/v1/widget/accounts/${studio.token}`);
    jobs = data.jobs || [];
  }
  return jobs.map(j => {
    const location = [j.city, j.state, j.country].filter(Boolean).join(", ") || "Unlisted";
    const remote = j.remote || j.telecommuting;
    return {
      id: `wk-${studio.token}-${j.shortcode || j.id}`,
      title: j.title,
      studio: studio.name,
      discipline: mapDiscipline(j.department || j.function, j.title || ""),
      workType: remote ? "Remote" : inferWorkType(j.title || "", location, []),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(j.title || ""),
      salary: null,
      yoe: null,
      postedAt: j.published_on || j.created_at || null,
      url: j.shortlink || j.url || j.application_url
        || `https://apply.workable.com/${studio.token}/j/${j.shortcode}/`,
    };
  });
}

// ---- Phenom People (Blizzard, Activision + many big employers) ---------------
// No JSON API, but each search-results page embeds the data in a
// "eagerLoadRefineSearch":{...} object in the HTML. We page through ?from=N&s=1
// and extract it with a string-aware brace scanner (descriptions contain braces).
function extractPhenomEager(html) {
  const key = '"eagerLoadRefineSearch":';
  const i = html.indexOf(key);
  if (i < 0) return null;
  const s = html.indexOf("{", i);
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let k = s; k < html.length; k++) {
    const c = html[k];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; }
    else { if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) { end = k + 1; break; } } }
  }
  if (end < 0) return null;
  try { return JSON.parse(html.slice(s, end)); } catch (e) { return null; }
}

// Pick the best public link for a Phenom job. Prefer the careers-site detail page
// (jobUrl); if only a Workday apply URL is given, convert it to the viewable job
// page: drop trailing /apply and insert the /en-US/ locale segment.
function phenomJobUrl(j) {
  if (j.jobUrl) return j.jobUrl;
  let u = j.applyUrl || j.exApplyUrl || "";
  if (!u) return "";
  u = u.replace(/\/apply\/?$/i, "");
  u = u.replace(/(myworkdayjobs\.com)\/(?!en-US\/|[a-z]{2}-[A-Z]{2}\/)/i, "$1/en-US/");
  return u;
}

async function fetchPhenom(studio) {
  let all = [];
  if (SAMPLE_FILE) {
    const data = loadSample(studio);
    if (!data) return [];
    all = data.jobs || [];
  } else {
    const path = studio.path || "/global/en/search-results";
    const PAGE = 10;
    let from = 0, total = Infinity;
    while (from < total && from < 2000) {
      const res = await fetch(`https://${studio.host}${path}?from=${from}&s=1`, {
        headers: { "User-Agent": "DevQuest/0.1 (game-dev job aggregator)", "Accept": "text/html" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} at from=${from}`);
      const eager = extractPhenomEager(await res.text());
      if (!eager) throw new Error("could not parse embedded job data (page layout changed?)");
      total = eager.totalHits || 0;
      const jobs = (eager.data && eager.data.jobs) || [];
      if (!jobs.length) break;
      all.push(...jobs);
      from += PAGE;
      await new Promise(r => setTimeout(r, 400)); // be polite
    }
  }
  // Giant employers (Warner Bros. Discovery) post all divisions on one Phenom board;
  // studio.categories keeps ONLY game roles (category "Game Development").
  const allow = studio.categories ? new Set(studio.categories) : null;
  const kept = allow ? all.filter(j => allow.has(j.category)) : all;
  // companySplit: relabel individual studios out of a publisher's shared board, keyed on the
  // job's jobCompany (legal entity). e.g. Activision's feed tags Infinity Ward / Sledgehammer /
  // Treyarch / Raven jobs by company, so we surface them as their own studios (parent stays the
  // publisher via parentCompany). Match is a case-insensitive substring (entities have suffixes
  // like "INFINITY WARD, INC." / "SLEDGEHAMMER GAMES UK LIMITED").
  const split = studio.companySplit ? Object.entries(studio.companySplit) : null;
  return kept.map(j => {
    const location = j.cityStateCountry || j.location || "Unlisted";
    let studioName = studio.name;
    if (split && j.jobCompany) {
      const jc = String(j.jobCompany).toUpperCase();
      for (const [needle, name] of split) { if (jc.includes(needle)) { studioName = name; break; } }
    }
    return {
      id: `ph-${studio.token}-${j.reqId || j.jobId}`,
      title: j.title,
      studio: studioName,
      discipline: mapDiscipline(j.category, j.title || ""),
      workType: inferWorkType(j.title || "", location, [], stripHtml(j.description || j.descriptionTeaser || "").slice(0, 1200)),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(j.title || ""),
      salary: null,
      yoe: null,
      postedAt: j.postedDate || j.dateCreated || null,
      url: phenomJobUrl(j),
    };
  });
}

// ---- Teamtailor (Paradox, Arrowhead + many European studios) -----------------
// No public API without a key, but the /jobs career page is server-rendered HTML.
// Each job is an <a href=".../jobs/<id>-<slug>"> card with the title in a title="..."
// attribute and department/location as "·"-separated <span>s. No posted dates on the
// listing (shows "date n/a"). Paginates via ?page=N.
function parseTeamtailor(html, studio) {
  const re = /<a[^>]*href="(https?:\/\/[^"]*\/jobs\/(\d+)-[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  const out = [], seen = new Set();
  let m;
  while ((m = re.exec(html))) {
    const url = m[1], id = m[2], inner = m[3];
    if (seen.has(id)) continue;
    // title: prefer the link-style span's title attribute (one Teamtailor theme);
    // fall back to the anchor's plain text (minimal themes like Paradox have no title attr).
    let title = null;
    const t = inner.match(/company-link-style[^"]*"[^>]*title="([^"]+)"/) || inner.match(/title="([^"]+)"/);
    if (t) title = decodeEnt(t[1].trim());
    else {
      const txt = decodeEnt(inner.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
      if (txt.length >= 3 && txt.length <= 120) title = txt;
    }
    if (!title) continue;
    seen.add(id);
    // department + location from the "mt-1" meta div (spans split by ·)
    let dept = null, location = "Unlisted";
    const meta = inner.match(/<div class="mt-1[^"]*">([\s\S]*?)<\/div>/);
    if (meta) {
      // decode entities first (so · separators are real), strip tags, split on the bullet
      const text = decodeEnt(meta[1].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
      const parts = text.split("·").map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) { dept = parts[0]; location = parts.slice(1).join(", "); }
      else if (parts.length === 1) location = parts[0];
    }
    out.push({
      id: `tt-${studio.token}-${id}`,
      title,
      studio: studio.name,
      discipline: mapDiscipline(dept, title),
      workType: inferWorkType(title, location, []),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null,
      yoe: null,
      postedAt: null,
      url,
    });
  }
  return out;
}

async function fetchTeamtailor(studio) {
  if (SAMPLE_FILE) {
    const data = loadSample(studio);
    if (!data) return [];
    return (data.pages || [data.html || ""]).flatMap(h => parseTeamtailor(h, studio));
  }
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html",
  };
  const all = {};
  let firstHtml = "";
  for (let page = 1; page <= 25; page++) {
    const res = await fetch(`https://${studio.host}/jobs?page=${page}`, { headers });
    if (!res.ok) { if (page === 1) throw new Error(`HTTP ${res.status}`); break; }
    const html = await res.text();
    if (page === 1) firstHtml = html;
    const jobs = parseTeamtailor(html, studio);
    const before = Object.keys(all).length;
    for (const j of jobs) all[j.id] = j;
    if (!jobs.length || Object.keys(all).length === before) break; // no new jobs -> done
    await new Promise(r => setTimeout(r, 400));
  }
  if (!Object.keys(all).length) {
    // distinguish a genuinely empty board (studio has no openings) from a real break
    if (/no open positions|no current openings|no vacancies|no jobs found|connect with us/i.test(firstHtml)) return [];
    throw new Error("0 jobs parsed (page layout changed?)");
  }
  return Object.values(all);
}

// ---- Eightfold (Netflix) -----------------------------------------------------
// For giant non-gaming companies (Netflix), we must capture ONLY gaming roles.
// Netflix's Eightfold API tags each job with a "department"; gaming roles fall
// under a known set of game-studio departments. We paginate all jobs and keep
// only those whose department is in studio.departments (the allow-list).
// API: GET /api/apply/v2/jobs?domain=<domain>&query=&start=N&num=10 (page size 10).
async function fetchEightfold(studio) {
  let all = [];
  if (SAMPLE_FILE) {
    const data = loadSample(studio);
    if (!data) return [];
    all = data.positions || [];
  } else {
    // Two Eightfold flavours: classic /api/apply/v2/jobs (Netflix) and the "pcsx"
    // search namespace (Hasbro) which nests results under data.data and 403s the
    // apply/v2 path. studio.api === "pcsx" switches endpoint + parsing + adds Referer.
    const pcsx = studio.api === "pcsx";
    const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json" };
    if (pcsx) headers["Referer"] = `https://${studio.host}/careers`;
    let start = 0, total = Infinity, pages = 0;
    while (start < total && pages < 200) {
      const path = pcsx ? "/api/pcsx/search" : "/api/apply/v2/jobs";
      const url = `https://${studio.host}${path}?domain=${studio.domain}&query=&start=${start}&num=10&sort_by=relevance`;
      const res = await fetch(url, { headers });
      if (!res.ok) { if (pages === 0) throw new Error(`HTTP ${res.status}`); break; }
      const raw = await res.json();
      const data = raw.data || raw; // pcsx nests positions/count under .data
      total = data.count ?? 0;
      const jobs = data.positions || [];
      if (!jobs.length) break;
      all.push(...jobs);
      start += 10; pages++;
      await new Promise(r => setTimeout(r, 300));
    }
  }
  const allow = studio.departments ? new Set(studio.departments) : null;
  const games = all.filter(j => !allow || allow.has(j.department));
  return games.map(j => {
    const location = (j.locations && j.locations[0]) || j.location || "Unlisted";
    const wl = ((j.work_location_option || "") + " " + (j.location_flexibility || "")).toLowerCase();
    const efWt = wl.includes("hybrid") ? "Hybrid" : wl.includes("remote") ? "Remote"
      : (/on-?site|in office/.test(wl)) ? "Onsite"
      : inferWorkType(j.name || "", location, [], stripHtml(j.job_description || "").slice(0, 1200));
    return {
      id: `ef-${studio.token}-${j.id || j.display_job_id}`,
      title: j.name,
      studio: studio.name,
      discipline: mapDiscipline(j.department, j.name || ""),
      workType: efWt,
      location,
      region: inferRegion(location),
      seniority: inferSeniority(j.name || ""),
      salary: null,
      yoe: null,
      postedAt: null, // Eightfold timestamps are unreliable to interpret; show "date n/a"
      url: j.canonicalPositionUrl || `https://${studio.host}/careers?query=&pid=${j.id}`,
    };
  });
}

// ---- Amazon Jobs (Amazon Games / Luna) ---------------------------------------
// Amazon's API can't filter by team via querystring, so: search a few gaming
// keywords to get a small candidate set, then keep only jobs whose team.label is
// in the allow-list (team-games, team-luna). Dedupe by id. Amazon gives real dates.
async function fetchAmazonJobs(studio) {
  const allow = new Set(studio.teams || []);
  const kept = {};
  if (SAMPLE_FILE) {
    const data = loadSample(studio);
    if (!data) return [];
    for (const j of (data.jobs || [])) kept[j.id_icims || j.id] = j;
  } else {
    const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json" };
    for (const q of (studio.queries || ["games"])) {
      let offset = 0, total = Infinity, pages = 0;
      while (offset < total && pages < 6) {
        const res = await fetch(`https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(q)}&result_limit=100&offset=${offset}`, { headers });
        if (!res.ok) break;
        const d = await res.json();
        total = d.hits || 0;
        const jobs = d.jobs || [];
        if (!jobs.length) break;
        for (const j of jobs) { const lbl = j.team && j.team.label; if (!allow.size || allow.has(lbl)) kept[j.id_icims || j.id] = j; }
        offset += 100; pages++;
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }
  return Object.values(kept).map(j => {
    const location = j.normalized_location || j.location || "Unlisted";
    const pd = j.posted_date ? new Date(j.posted_date) : null;
    return {
      id: `az-${studio.token}-${j.id_icims || j.id}`,
      title: j.title,
      studio: studio.name,
      discipline: mapDiscipline(null, j.title || ""),
      workType: inferWorkType(j.title || "", location, [], stripHtml((j.description_short || "") + " " + (j.basic_qualifications || "")).slice(0, 1200)),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(j.title || ""),
      salary: null,
      yoe: null,
      postedAt: pd && !isNaN(pd) ? pd.toISOString() : null,
      url: j.job_path ? `https://www.amazon.jobs${j.job_path}` : "",
    };
  });
}

// ---- Ashby (Second Dinner + many newer studios) ------------------------------
// Public posting API: GET https://api.ashbyhq.com/posting-api/job-board/<token>
// Returns { jobs: [{ id, title, department, team, location, isRemote, employmentType,
// publishedAt/updatedAt, jobUrl, applyUrl }] }.
async function fetchAshby(studio) {
  const data = SAMPLE_FILE ? loadSample(studio)
    : await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${studio.token}?includeCompensation=true`);
  if (!data || !data.jobs) return [];
  return data.jobs.filter(j => j.isListed !== false).map(j => {
    const location = j.location
      || (j.address && j.address.postalAddress && j.address.postalAddress.addressLocality)
      || (j.isRemote ? "Remote" : "Unlisted");
    const dept = j.department || j.team || null;
    const desc = stripHtml(j.descriptionPlain || j.descriptionHtml || "");
    const wt = (j.workplaceType || "").toLowerCase();
    return {
      id: `ashby-${studio.token}-${j.id}`,
      title: j.title,
      studio: studio.name,
      discipline: mapDiscipline(dept, j.title || ""),
      workType: wt.includes("remote") || j.isRemote ? "Remote" : wt.includes("hybrid") ? "Hybrid"
        : wt.includes("site") || wt.includes("office") ? "Onsite"
        : inferWorkType(j.title || "", location, [], desc),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(j.title || ""),
      salary: extractSalary(desc),
      yoe: extractYoe(desc),
      postedAt: j.publishedAt || j.updatedAt || null,
      url: j.jobUrl || j.applyUrl || `https://jobs.ashbyhq.com/${studio.token}/${j.id}`,
    };
  });
}

// ---- ZeniMax / Bethesda (jobs.zenimax.com) -----------------------------------
// Custom careers site (iCIMS underneath) that embeds the full posting list as an
// HTML-entity-encoded JSON array right in the /jobs page. We fetch the page, decode
// the entities, and bracket-match the array out (it begins at [{"id":...). Each
// posting carries its real studio in location.name (Bethesda Game Studios,
// MachineGames, Arkane Studios...), which we use for studio attribution. The apply
// links are absolute iCIMS URLs, so salary backfill reads them via the generic path.
// No posted dates on the list page -> "date n/a", like our other HTML feeds.
function zenimaxStudio(raw) {
  const s = decodeEnt(raw || "").replace(/\s+/g, " ").trim();
  if (/^zenimax media/i.test(s)) return "ZeniMax Media (HQ)"; // corporate, not a game studio
  return s || "ZeniMax / Bethesda";
}

function parseZenimax(html) {
  const dec = decodeEnt(html);
  const start = dec.indexOf('[{"id":');
  if (start < 0) return [];
  // balanced scan (string-aware) to find the end of the postings array
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let k = start; k < dec.length; k++) {
    const c = dec[k];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") { depth--; if (depth === 0) { end = k; break; } }
  }
  if (end < 0) return [];
  let arr;
  try { arr = JSON.parse(dec.slice(start, end + 1)); } catch (e) { return []; }
  return arr.map(j => {
    const loc = j.location || {};
    const extra = (j.additionalLocations || []).map(a => a && a.formatted_name).filter(Boolean);
    const location = [loc.formatted_name, ...extra].filter(Boolean).join("; ") || "Unlisted";
    const title = decodeEnt(j.title);
    return {
      id: `zmx-${j.id}`,
      title,
      studio: zenimaxStudio(loc.name),
      discipline: mapDiscipline(j.department_name, title),
      workType: inferWorkType(title, location, []),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null,
      yoe: null,
      postedAt: null, // the list page doesn't expose posted dates
      url: j.link,
    };
  });
}

async function fetchZenimax(studio) {
  let html;
  if (SAMPLE_FILE) {
    const data = loadSample(studio);
    if (!data) return [];
    html = typeof data === "string" ? data : (data.html || "");
  } else {
    html = await fetchText("https://jobs.zenimax.com/jobs");
  }
  const jobs = parseZenimax(html);
  if (!jobs.length) throw new Error("0 jobs parsed (Zenimax page may have changed layout)");
  return jobs;
}

// ---- BambooHR (Studio Wildcard + many indies) --------------------------------
// Public JSON: GET https://<token>.bamboohr.com/careers/list -> { result: [...] }.
async function fetchBambooHr(studio) {
  let result = [];
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; result = d.result || []; }
  else { const d = await fetchJson(`https://${studio.token}.bamboohr.com/careers/list`); result = d.result || []; }
  return result.map(j => {
    const loc = j.location ? [j.location.city, j.location.state].filter(Boolean).join(", ") : "";
    const location = loc || "Unlisted";
    return {
      id: `bamboo-${studio.token}-${j.id}`,
      title: j.jobOpeningName,
      studio: studio.name,
      discipline: mapDiscipline(j.departmentLabel, j.jobOpeningName || ""),
      workType: inferWorkType(j.jobOpeningName || "", location, []),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(j.jobOpeningName || ""),
      salary: null,
      yoe: null,
      postedAt: null, // BambooHR list endpoint omits posted dates
      url: `https://${studio.token}.bamboohr.com/careers/${j.id}`,
    };
  });
}

// ---- JobScore (Nexon + others) -----------------------------------------------
// Public Atom feed: hire.jobscore.com/jobs/<token>/feed.atom. Each <entry> carries
// <title>, <link>, <updated>, three <category term> values (department, "City, ST
// (WorkType)", employment type) and optional <j:publicCompensation><j:formatted>.
function parseJobScore(xml, studio) {
  const entries = xml.split("<entry>").slice(1).map(e => e.split("</entry>")[0]);
  return entries.map(e => {
    const rawTitle = (e.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "";
    const title = decodeEnt(rawTitle.replace(/<!\[CDATA\[|\]\]>/g, "")).trim();
    const url = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "";
    const cats = [...e.matchAll(/<category[^>]*term="([^"]+)"/g)].map(m => decodeEnt(m[1]));
    const isEmp = c => /full[- ]?time|part[- ]?time|contract|intern|temporary|freelance/i.test(c);
    const locCat = cats.find(c => /\(.*\)|,\s*[A-Z]{2}\b|remote/i.test(c)) || "";
    const dept = cats.find(c => c !== locCat && !isEmp(c)) || null;
    const location = locCat.replace(/\s*\(([^)]*)\)\s*$/, "").trim() || "Unlisted";
    const wtm = locCat.match(/\(([^)]*)\)/);
    const workType = wtm ? (/remote/i.test(wtm[1]) ? "Remote" : /hybrid/i.test(wtm[1]) ? "Hybrid"
      : /on-?site|office/i.test(wtm[1]) ? "Onsite" : inferWorkType(title, location, []))
      : inferWorkType(title, location, []);
    const postedAt = (e.match(/<updated>([^<]+)<\/updated>/) || [])[1] || null;
    const salForm = (e.match(/<j:formatted>([\s\S]*?)<\/j:formatted>/) || [])[1];
    const salary = (salForm && /\d/.test(salForm)) ? decodeEnt(stripHtml(salForm)).trim() : null;
    return {
      id: `js-${studio.token}-${(url.match(/[^/]+$/) || [""])[0]}`,
      title, studio: studio.name,
      discipline: mapDiscipline(dept, title),
      workType, location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary, yoe: null, postedAt, url,
    };
  });
}
async function fetchJobScore(studio) {
  let xml;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; xml = typeof d === "string" ? d : (d.xml || ""); }
  else { xml = await fetchText(`https://hire.jobscore.com/jobs/${studio.token}/feed.atom`); }
  return parseJobScore(xml, studio);
}

// ---- JazzHR (Certain Affinity + others) --------------------------------------
// Server-rendered board at https://<token>.applytojob.com/apply. Each role is an
// <h3 class='list-group-item-heading'><a href=".../apply/<code>/<slug>">Title</a>
// followed by a <ul class='list-inline list-group-item-text'> whose first <li> is
// the location. No posted dates on the list page.
function parseJazzHr(html, studio) {
  const re = /<h3 class='list-group-item-heading'>\s*<a href="([^"]+\/apply\/[^"]+)">([\s\S]*?)<\/a>\s*<\/h3>\s*<ul[^>]*list-inline list-group-item-text[^>]*>([\s\S]*?)<\/ul>/g;
  const out = []; let m;
  while ((m = re.exec(html))) {
    const url = m[1];
    const title = decodeEnt(m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
    if (!title) continue;
    const lis = [...m[3].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
      .map(x => decodeEnt(x[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())).filter(Boolean);
    const location = lis[0] || "Unlisted";
    out.push({
      id: `jazz-${studio.token}-${(url.match(/apply\/([A-Za-z0-9]+)/) || [])[1] || url.slice(-8)}`,
      title, studio: studio.name,
      discipline: mapDiscipline(null, title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null, yoe: null, postedAt: null, url,
    });
  }
  return out;
}
async function fetchJazzHr(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(`https://${studio.token}.applytojob.com/apply`); }
  return parseJazzHr(html, studio);
}

// ---- Jobvite (Capcom + others) -----------------------------------------------
// Server-rendered table at https://jobs.jobvite.com/<token>/jobs. Each <tr> has a
// td.jv-job-list-name (anchor + title) and td.jv-job-list-location. No posted dates.
function parseJobvite(html, studio) {
  const re = /<td class="jv-job-list-name">\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/td>\s*<td class="jv-job-list-location">([\s\S]*?)<\/td>/g;
  const out = []; let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const title = decodeEnt(m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
    if (!title) continue;
    const location = decodeEnt(m[3].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()) || "Unlisted";
    const url = href.startsWith("http") ? href : `https://jobs.jobvite.com${href}`;
    out.push({
      id: `jvite-${studio.token}-${(href.match(/job\/([A-Za-z0-9]+)/) || [])[1] || href.slice(-8)}`,
      title, studio: studio.name,
      discipline: mapDiscipline(null, title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null, yoe: null, postedAt: null, url,
    });
  }
  return out;
}
async function fetchJobvite(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(`https://jobs.jobvite.com/${studio.token}/jobs`); }
  return parseJobvite(html, studio);
}


const FETCHERS = { greenhouse: fetchGreenhouse, lever: fetchLever, workday: fetchWorkday, avature: fetchAvature, smartrecruiters: fetchSmartRecruiters, workable: fetchWorkable, phenom: fetchPhenom, teamtailor: fetchTeamtailor, eightfold: fetchEightfold, amazonjobs: fetchAmazonJobs, ashby: fetchAshby, zenimax: fetchZenimax, bamboohr: fetchBambooHr, jobscore: fetchJobScore, jazzhr: fetchJazzHr, jobvite: fetchJobvite, recruitee: fetchRecruitee };

// ---- Ghost-job tracking -----------------------------------------------------
// Because we scrape on a schedule, we can see how long a listing has REALLY been
// live (independent of the studio's posted date, which is often reset to look new
// and which several sources don't provide). We stamp each listing's first-seen date
// and remember it across runs in seen.json. We also flag "re-lists": the studio's
// posted date jumping forward while we've been tracking the same listing for weeks.
// We surface facts (days listed, re-list count) — never an accusation.
const HISTORY_FILE = path.join(__dirname, "seen.json");
const DAY = 86400000;

function applyListingHistory(jobs) {
  let hist = {};
  try { hist = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch (e) { hist = {}; }
  const now = Date.now();

  for (const j of jobs) {
    const postedMs = j.postedAt ? Date.parse(j.postedAt) : null;
    let h = hist[j.id];
    if (!h) {
      // first sighting: bootstrap firstSeen from the studio's posted date if we have
      // one (so ages are realistic on day one), otherwise from now.
      const seed = (postedMs && postedMs < now) ? postedMs : now;
      h = { firstSeen: seed, lastPostedAt: postedMs || null, relistCount: 0 };
    } else {
      // re-list: posted date jumped >10 days newer while we've tracked it >21 days.
      if (postedMs && h.lastPostedAt && postedMs - h.lastPostedAt > 10 * DAY && (now - h.firstSeen) > 21 * DAY)
        h.relistCount = (h.relistCount || 0) + 1;
      if (postedMs) h.lastPostedAt = postedMs;
    }
    h.lastSeen = now;
    hist[j.id] = h;

    j.firstSeen = new Date(h.firstSeen).toISOString();
    j.daysListed = Math.floor((now - h.firstSeen) / DAY);
    j.relistCount = h.relistCount || 0;
    j.relisted = j.relistCount > 0;
  }

  // forget listings we haven't seen in 90 days so the file doesn't grow unbounded
  for (const id of Object.keys(hist))
    if (hist[id].lastSeen && now - hist[id].lastSeen > 90 * DAY) delete hist[id];

  try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(hist)); }
  catch (e) { console.error("Could not write seen.json:", e.message); }
}

// ---- Salary backfill --------------------------------------------------------
// Studio "list" feeds omit salary; the legally-required pay band lives on each
// job's detail page. For jobs still missing a salary we open the posting and
// parse the band, then CACHE the result in seen.json so a given job is only ever
// fetched once (salaries don't change). Workday needs its JSON endpoint; every
// other ATS (SmartRecruiters, Amazon, Teamtailor, Workable, Avature, ...) serves
// a server-rendered posting page, so we read its HTML. Capped + throttled per run
// so the hourly scrape stays fast and polite. Runs AFTER applyListingHistory so
// every job already has a seen.json entry to annotate.
const SALARY_MAX_FETCH = 400;     // detail fetches per run (bounds runtime)
const SALARY_RECHECK = 30 * DAY;  // re-open "no salary found" jobs at most this often
const SALARY_CACHE_VERSION = 2;   // bump to re-check previously-empty results after parser/fetcher upgrades

async function fetchDetailJson(url, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "DevQuest/0.1 (game-dev job aggregator)", "Accept": "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function fetchText(url, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

// Full description text for salary mining. Workday needs its JSON detail endpoint;
// for every other ATS the public posting page is server-rendered, so read its HTML.
async function jobDescriptionText(job) {
  const wd = workdayDetailUrl(job.url);
  if (wd) { const d = await fetchDetailJson(wd); return stripHtml(d.jobPostingInfo?.jobDescription || ""); }
  // SmartRecruiters posting pages are a single-page app (no salary in the raw HTML),
  // so read its public posting API instead: /v1/companies/<token>/postings/<id>.
  const sr = (job.url || "").match(/jobs\.smartrecruiters\.com\/([^/]+)\/([^/?#]+)/);
  if (sr) {
    const d = await fetchDetailJson(`https://api.smartrecruiters.com/v1/companies/${sr[1]}/postings/${sr[2]}`);
    const s = d.jobAd?.sections || {};
    return stripHtml([s.jobDescription?.text, s.qualifications?.text, s.additionalInformation?.text].filter(Boolean).join(" "));
  }
  return stripHtml(await fetchText(job.url));
}

async function backfillSalaries(jobs) {
  if (SAMPLE_FILE) return; // offline/sample mode: skip network backfill
  let hist = {};
  try { hist = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch (e) { hist = {}; }
  const now = Date.now();
  const toFetch = [];

  for (const j of jobs) {
    if (j.salary) continue;                         // already supplied by the feed
    const h = hist[j.id];
    // Cached if: we found a salary before (keep it, any version), OR we checked it
    // empty recently AND under the current cache version (a version bump re-opens
    // old empties so parser/fetcher upgrades take effect).
    if (h && h.salaryAt && (h.salary || (h.salaryV === SALARY_CACHE_VERSION && (now - h.salaryAt) < SALARY_RECHECK))) {
      if (h.salary) { j.salary = h.salary; if (j.yoe == null && h.yoe != null) j.yoe = h.yoe; }
      continue;
    }
    if (j.url && /^https?:\/\//.test(j.url)) toFetch.push(j); // any public posting page
  }
  // Order: never-checked before stale rechecks; within that, North America first
  // (US/CO/NY/CA/WA pay-transparency laws mean those pages are likeliest to list a band).
  const naFirst = j => (j.region === "North America" ? 0 : 1);
  toFetch.sort((a, b) =>
    ((hist[a.id]?.salaryAt ? 1 : 0) - (hist[b.id]?.salaryAt ? 1 : 0)) || (naFirst(a) - naFirst(b)));

  let fetched = 0, found = 0;
  for (const j of toFetch) {
    if (fetched >= SALARY_MAX_FETCH) break;
    fetched++;
    try {
      const desc = await jobDescriptionText(j);
      const sal = extractSalary(desc);
      const yoe = extractYoe(desc);
      if (sal) { j.salary = sal; found++; }
      if (j.yoe == null && yoe != null) j.yoe = yoe;
      hist[j.id] = { ...(hist[j.id] || {}), salary: sal || null, yoe: yoe ?? (hist[j.id]?.yoe ?? null), salaryAt: now, salaryV: SALARY_CACHE_VERSION };
    } catch (e) {
      // back off on error too (e.g. a host that blocks us), so one bad source can't
      // consume the whole per-run budget every run. Rechecked like a "not found".
      hist[j.id] = { ...(hist[j.id] || {}), salary: hist[j.id]?.salary ?? null, salaryAt: now, salaryV: SALARY_CACHE_VERSION };
    }
    await new Promise(r => setTimeout(r, 250)); // be polite between detail fetches
  }

  try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(hist)); }
  catch (e) { console.error("Could not write seen.json (salary cache):", e.message); }
  console.log(`Salary backfill: ${fetched} detail fetches, ${found} new salaries (cap ${SALARY_MAX_FETCH}, ${toFetch.length} eligible).`);
}

// ---- Hiring momentum --------------------------------------------------------
// One snapshot of each studio's open-role count per day, kept in trends.json. From
// the time series we can show whether a studio is ramping up or pulling back — a
// signal derived purely from our own data (NOT official layoff news). On a fetch
// error we carry the previous count forward so a transient failure isn't mistaken
// for a studio going dark.
const TRENDS_FILE = path.join(__dirname, "trends.json");

function buildTrends(runCounts, okSet) {
  let store = { days: [] };
  try { store = JSON.parse(fs.readFileSync(TRENDS_FILE, "utf8")); } catch (e) { store = { days: [] }; }
  const days = store.days || [];
  const today = new Date().toISOString().slice(0, 10);

  const prev = days.length ? days[days.length - 1].counts : {};
  const counts = { ...prev };       // carry forward, then overwrite the OK ones
  for (const name of okSet) counts[name] = runCounts[name] || 0;

  if (days.length && days[days.length - 1].date === today) days[days.length - 1] = { date: today, counts };
  else days.push({ date: today, counts });
  while (days.length > 120) days.shift();           // keep ~4 months
  store.days = days;
  try { fs.writeFileSync(TRENDS_FILE, JSON.stringify(store)); }
  catch (e) { console.error("Could not write trends.json:", e.message); }

  const snapNearest = (nDaysAgo) => {
    const target = Date.now() - nDaysAgo * DAY;
    let best = null, bestDiff = Infinity;
    for (const d of days) { const diff = Math.abs(Date.parse(d.date) - target); if (diff < bestDiff) { bestDiff = diff; best = d; } }
    return best;
  };
  const cur = days[days.length - 1].counts;
  const d7 = snapNearest(7), d30 = snapNearest(30);
  const out = { asOf: today, span: days.length, studios: {} };
  for (const name of Object.keys(cur)) {
    out.studios[name] = {
      now: cur[name],
      d7: d7 ? (d7.counts[name] ?? null) : null,
      d30: d30 ? (d30.counts[name] ?? null) : null,
      series: days.slice(-30).map(d => (d.counts[name] ?? null)),
    };
  }
  return out;
}

// ---- Main -------------------------------------------------------------------

(async () => {
  const all = [];
  const errors = [];
  const runCounts = {};      // studio name -> open roles this run (successful fetches only)
  const okSet = new Set();   // studios that fetched without error
  for (const studio of STUDIOS) {
    try {
      const jobs = await FETCHERS[studio.type](studio);
      // parent company tag: a studio's umbrella (e.g. Massive Entertainment -> Ubisoft);
      // for independent studios the parent is just itself.
      jobs.forEach(j => { j.parent = studio.parentCompany || j.studio; });
      console.log(`OK ${studio.name}: ${jobs.length} jobs`);
      all.push(...jobs);
      runCounts[studio.name] = (runCounts[studio.name] || 0) + jobs.length;
      okSet.add(studio.name);
    } catch (e) {
      errors.push(`${studio.name}: ${e.message}`);
      console.error(`FAIL ${studio.name}: ${e.message}`);
    }
  }
  applyListingHistory(all); // stamp first-seen dates + flag re-lists (writes seen.json)
  await backfillSalaries(all); // open detail pages for jobs missing salary; cache in seen.json
  const trends = buildTrends(runCounts, okSet); // per-studio hiring momentum (writes trends.json)
  all.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

  const out = {
    scrapedAt: new Date().toISOString(),
    studios: STUDIOS.length,
    jobCount: all.length,
    errors,
    jobs: all,
    directory: DIRECTORY,
    moon: MOON,
    trends,
  };
  const dir = __dirname;
  fs.writeFileSync(path.join(dir, "jobs.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(dir, "jobs.js"), "window.JOBS_DATA = " + JSON.stringify(out) + ";");
  console.log(`\nWrote ${all.length} jobs -> jobs.json + jobs.js`);
})();
