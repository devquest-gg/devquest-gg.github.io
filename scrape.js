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
  { name: "Ninja Theory", url: "https://www.ninjatheory.com/careers/opportunities", note: "Hellblade — Xbox Game Studios", city: "Cambridge, UK" },
  { name: "Valve", url: "https://www.valvesoftware.com/en/jobs", note: "Steam, Half-Life, Dota 2", city: "Bellevue, WA" },
  { name: "Remedy Entertainment", url: "https://www.remedygames.com/careers", note: "Control, Alan Wake — Finland", city: "Espoo, Finland" },
  { name: "Saber Interactive", url: "https://saber.games/careers/", note: "World War Z, Space Marine 2", city: "Fort Lauderdale, FL" },
  { name: "Supermassive Games", url: "https://www.supermassivegames.com/careers", note: "Until Dawn, The Quarry — UK", city: "Guildford, UK" },
  { name: "The Coalition", url: "https://www.thecoalitionstudio.com/careers", note: "Gears of War — Xbox", city: "Vancouver, BC" },
  // (Hello Games promoted to mainland 2026-07-05 — self-hosted static careers page; see fetchHelloGames.)
  { name: "Telltale Games", url: "https://telltale.com/careers/", note: "The Wolf Among Us — revived studio", city: "Malibu, CA" },
  // Notable studios we can't cleanly scrape yet (Xbox first-party / custom corporate portals) — link-outs for now.
  // (Square Enix (Japan) promoted to mainland 2026-07-04 — its jp.square-enix.com career site posts to HRMOS (hrmos.co/pages/square-enix); see fetchHrmos.)
  // ---- June 2026: requested / community additions (link-outs; no clean scrapeable feed yet) ----
  // (PUBG Studios is now a live source — see the KRAFTON krafton.com scraper below, which covers PUBG
  //  Studios and the other KRAFTON sub-studios — so its link-out was removed.)
  // Can't cleanly scrape (Xbox first-party portals, custom sites, or a Pinpoint board) — link-outs.
  // (Retro Studios promoted to mainland 2026-07-05 — carved out of Nintendo's shared Greenhouse board via titleInclude "(Retro Studios)"; see fetchGreenhouse.)
  { name: "Rare", url: "https://www.rare.co.uk/careers", note: "Sea of Thieves — Xbox Game Studios (UK)", city: "Twycross, UK" },
  // (Atlus promoted to mainland 2026-07-04 — atlus.com/careers redirects to a Paycom portal; see fetchAtlus.)
  // Custom / first-party / unsupported-ATS boards — link-outs (June 2026 batch).
  // (Owlcat Games promoted to mainland 2026-07-04 — owlcat.games/careers Next.js site, jobs in __NEXT_DATA__; see fetchOwlcat.)
  { name: "Sucker Punch Productions", url: "https://jobs.suckerpunch.com/", note: "Ghost of Tsushima/Yōtei — Sony first-party (Bellevue, WA)", city: "Bellevue, WA" },
  // (Grinding Gear Games promoted to mainland 2026-07-05 — self-hosted careers page (email apply); see fetchGrindingGear.)
  // batch 3 (2026-06-08): self-hosted / no-API boards — browse directly
  { name: "Void Interactive", url: "https://voidinteractive.net/careers/", note: "Ready or Not (Dublin)", city: "Dublin, Ireland" },
  { name: "Grip Studios", url: "https://grip-studios.com/hiring.php", note: "Co-development on Indiana Jones and Civ VII (Prague)", city: "Prague, Czechia" },
  { name: "Mad Head Games", type: "madhead", city: "Belgrade, Serbia" }, // Scars Above, Pavilion — self-hosted careers site; jobs via an AJAX "JobList" endpoint (X-Requested-With header). ~5 roles in Belgrade (Art/Animation/Design/People), all Hybrid; skips "Open application". Promoted from Island 2026-07-05 — spot-check first scrape
  { name: "Trailmix Games", type: "trailmix", careersUrl: "https://www.trailmixgames.com/careers", city: "London, UK" }, // Love & Pies — mobile; self-hosted Webflow careers page, <a> links to /jobs/<slug>. ~3 roles (London + Berlin), discipline/location from title. Promoted from Island 2026-07-05 — spot-check first scrape
  // (LightFury Games promoted to mainland 2026-07-05 — Keka careers JSON API; see fetchKeka.)
  // 2026-06-19 batch: custom sites / unsupported ATS (Paylocity, HiringThing, Talentsoft, Webflow) — link-outs
  // (Trailmix Games promoted to mainland 2026-07-05 — self-hosted Webflow careers page; see fetchTrailmix.)
  { name: "Gunfire Games", url: "https://gunfiregames.com/careers", note: "Remnant, Darksiders — Paylocity board", city: "Austin, TX" },
  { name: "10:10 Games", type: "bamboohr", token: "1010games", city: "Warrington, UK" }, // ex-Playtonic / Crash devs — BambooHR board (1010games.bamboohr.com); ~3 roles in Warrington (Art/Design). Skips speculative applications. Promoted from Island 2026-07-05 — spot-check first scrape
  // batch 4 (2026-06-09): notable + mobile studios on custom / region-specific ATS — browse directly
  // (Kojima Productions promoted to mainland 2026-07-04 — kojimaproductions.jp POST /kjpviewloader/load; see fetchKojima.)
  // (Cygames promoted to mainland 2026-07-04 — recruit.cygames.co.jp/career server-renders all roles; see fetchCygames.)
  // (Garena promoted to mainland 2026-07-04 — careers.garena.com exposes POST /api/job/list JSON; see fetchGarena.)
  // (Plarium promoted to mainland 2026-07-05 — Next.js careers site, vacancies in the RSC flight payload; see fetchPlarium.)
  // (SuperPlay promoted to mainland 2026-07-04 — superplay.co/careers WordPress SSR; see fetchSuperPlay.)
  // (Playrix promoted to mainland 2026-07-04 — playrix.com POST /api/v1 job/getList JSON; see fetchPlayrix.)
  // batch 5 (2026-06-11): big names with custom / no-API careers sites (christran sweep holdouts) — browse directly.
  // (CCP Games promoted to mainland 2026-07-05 — Pinpoint ATS on a custom domain; see fetchPinpoint host option.)
  // (Miniclip promoted to mainland 2026-07-04 — miniclip.com/careers/vacancies server-renders all roles; see fetchMiniclip.)
  { name: "Keen Software House", url: "https://www.keenswh.com/careers/", note: "Space Engineers (Prague)", city: "Prague, Czechia" },
  // From the Grackle HQ comparison (2026-06-11): notable studios on custom careers sites.
  // (FromSoftware promoted to mainland 2026-07-05 — self-hosted recruiting site (.bluebox links); see fetchFromSoftware.)
  { name: "Robot Entertainment", url: "https://robotentertainment.com/careers", note: "Orcs Must Die! — fully remote (US Central)", city: "Plano, TX" },
  // batch 6 (2026-06-13): Hitmarker gap analysis — notable independents + JP/KR studios on
  // boutique/custom ATS (Teamtailor, Pinpoint, JazzHR, regional). Link-outs for now; several
  // cluster onto the same ATS, so a single Teamtailor or Pinpoint fetcher could promote a batch.
  // (Konami promoted to mainland 2026-07-05 — self-hosted US careers page (Yu-Gi-Oh! TCG/organized-play roles); see fetchKonami.)
  { name: "PlatinumGames", url: "https://www.platinumgames.com/recruit/mid-career/", note: "Bayonetta, NieR: Automata (Japan)", city: "Osaka, Japan" },
  { name: "Level-5", url: "https://www.level5.co.jp/", note: "Professor Layton, Ni no Kuni (Japan)", city: "Fukuoka, Japan" },
  { name: "Koei Tecmo", url: "https://www.koeitecmo.com.sg/index.php/careers/", note: "Dynasty Warriors, Nioh, Atelier (Japan)", city: "Yokohama, Japan" },
  { name: "Pearl Abyss", url: "https://www.pearlabyss.com/en-US/Company/Careers/List", note: "Black Desert, Crimson Desert (South Korea)", city: "Anyang, South Korea" },
  // (Shift Up promoted to mainland 2026-07-04 — shiftup.co.kr/recruit.php server-renders all roles; see fetchShiftUp.)
  { name: "Moon Studios", url: "https://www.moongamestudios.com/", note: "Ori, No Rest for the Wicked — fully remote", city: "Vienna, Austria" },
  { name: "Iron Gate Studio", url: "https://irongate.se/", note: "Valheim — small Swedish studio", city: "Skövde, Sweden" },
  { name: "Devolver Digital", url: "https://www.devolverdigital.com/jobs", note: "Indie publisher — Cult of the Lamb, Cuphead", city: "Austin, TX" },
  { name: "Klei Entertainment", url: "https://www.klei.com/careers", note: "Don't Starve, Oxygen Not Included (Vancouver)", city: "Vancouver, BC" },
  { name: "Electric Square", url: "https://electricsquare.com/come-join-us/open-positions/", note: "Co-development (Lively, Hot Wheels Unleashed) — part of Keywords Studios", city: "Brighton, UK" },
  { name: "Archetype Entertainment", url: "https://www.archetype-entertainment.com/en-US", note: "AAA sci-fi RPG (ex-BioWare) — Wizards of the Coast / Hasbro", city: "Austin, TX" },
  // ---- 2026-06-26 batch: gap analysis vs alexanderrehm.com. Notable studios on UNsupported ATS
  // (Kenjo, Huntflow, or custom sites) — link-outs for now. NOTE: Com2uS, KING Art and Travian
  // were here too but moved to mainland once fetchPersonio was added (see STUDIOS). GAME FREAK moved
  // to the Mainland 2026-07-04 once fetchHrmos was added (HRMOS server-renders its list after all).
  // (Codemasters is EA-owned, covered by the EA board.)
  // (Kepler Interactive promoted to mainland 2026-07-05 — classic Teamtailor theme; see fetchTeamtailor.)
  // (Sloclap promoted to mainland 2026-07-05 — Teamtailor "cards" theme; roles deduped off Kepler's aggregator board. See fetchTeamtailor.)
  { name: "Deck13 Interactive", type: "kenjo", token: "deck13jobs", city: "Frankfurt, Germany" }, // Lords of the Fallen, The Surge — Kenjo careers site, public positions JSON API (/api/controller/career-site/public/deck13jobs/positions). ~2 roles (Art/Tech), Frankfurt + remote-in-Germany (Hybrid). Skips General Application. Promoted from Island 2026-07-05 — spot-check first scrape
  { name: "Gameforge", url: "https://corporate.gameforge.com/en/career/", note: "browser/MMO publisher (AION, Metin2)", city: "Karlsruhe, Germany" },
  { name: "DeNA", url: "https://herp.careers/v1/dena/", note: "mobile publisher (Pokémon Masters EX) — HERP board (JP)", city: "Tokyo, Japan" },
  // (Spike Chunsoft promoted to mainland 2026-07-05 — HRMOS board (hrmos.co/pages/spchun); same fetchHrmos as GAME FREAK / Square Enix.)
  // (Moon Active promoted to mainland 2026-07-04 — Comeet ATS (comeet.co positions API); see fetchComeet.)
  { name: "Toca Boca", url: "https://www.tocaboca.com/careers", note: "Toca Boca World — kids", city: "Stockholm, Sweden" },
  { name: "Star Stable Entertainment", url: "https://jobs.starstableentertainment.com/", note: "Star Stable Online", city: "Stockholm, Sweden" },
  // (Snowprint Studios promoted to mainland 2026-07-05 — classic Teamtailor theme; see fetchTeamtailor team-strip.)
  { name: "MAG Interactive", url: "https://career.maginteractive.com/", note: "WordBrain, Ruzzle — mobile", city: "Stockholm, Sweden" },
  { name: "Neon Giant", url: "https://jobs.neongiant.se/", note: "The Ascent", city: "Uppsala, Sweden" },
  // (Madbox promoted to mainland 2026-07-05 — Teamtailor "cards" theme; see parseTeamtailorCards.)
  { name: "Manticore Games", url: "https://www.manticoregames.com/careers/", note: "Core — UGC platform", city: "San Mateo, CA" },
  { name: "Red Rover Interactive", url: "https://careers.redroverinteractive.com/", note: "Pioneers of Pagonia", city: "Oslo, Norway" },
  // (Steel City Interactive promoted to mainland 2026-07-05 — Teamtailor "cards" theme; see parseTeamtailorCards.)
  { name: "Vivid Games", url: "https://jobs.vividgames.com/", note: "Real Boxing — mobile", city: "Bydgoszcz, Poland" },
  // (SayGames promoted to mainland 2026-07-04 — Huntflow board with a public /api/vacancy JSON API; see fetchHuntflow.)
  // (Yodo1 Games promoted to mainland 2026-07-05 — Teamtailor "cards" theme; see parseTeamtailorCards.)
  { name: "BKOM Studios", url: "https://jobs.bkom.com/", note: "co-dev / work-for-hire", city: "Québec City, Canada" },
  // ---- July 2026 additions: real studios on unsupported ATSes (link-outs until a fetcher exists) ----
  { name: "Nitro Games", url: "https://nitrogames.careers.haileyhr.app", note: "Nasdaq-listed mobile studio — HaileyHR board (no fetcher yet)", city: "Helsinki, Finland" },
  { name: "Enduring Games", url: "https://enduring.games/jobs/", note: "Console co-dev & ports — email apply, no ATS feed", city: "Austin, TX" },
  { name: "Tarsier Studios", url: "https://tarsier.recruitment.simployer.com/careers", note: "Little Nightmares 1 & 2 — Simployer ATS (no scrapeable feed)", city: "Malmö, Sweden" },
  { name: "Room 8 Studio", url: "https://room8studio.com/careers/", note: "Game art & co-development services (CoD, Diablo, AC) — WordPress careers, no ATS feed", city: "" },
  { name: "Critical Path Games", url: "https://critpath.com/careers", note: "Unannounced multiplayer, cross-platform game (Vancouver indie). Custom Astro site, no scrapeable ATS feed. Requested by studio 2026-07-14", city: "Vancouver, BC" }, // COO Jeanne-Marie Owens emailed studios@; ~1 real role (Senior Animator) plus a General Applications catch-all, hardcoded static pages, nothing to scrape, so Island
  { name: "Webcore Games", url: "https://www.webcoregames.com/careers/", note: "Co-dev, porting & LiveOps studio (São Paulo, since 2004). Applies via a ClickUp form, no scrapeable ATS feed. Requested 2026-07-15", city: "São Paulo, Brazil" }, // apply link goes to forms.clickup.com; ~1 role (Game Engineer) + talent-bank form. No ATS feed to scrape, so Island. Same co-dev pattern as Room 8 / Enduring.
  { name: "Arcanaut Studios", url: "https://www.arcanautstudios.com/careers", note: "Star Wars: Fate of the Old Republic (Casey Hudson / ex-BioWare, with Lucasfilm Games). applytojobs.ca board, no fetcher yet; no open roles as of 2026-07-15", city: "Edmonton, Canada" }, // Webflow careers page embeds arcanautstudios.applytojobs.ca (/v1/embedded). Notable studio, promotable to mainland once they post roles + a fetcher exists. Requested 2026-07-15
  { name: "Rezzil", url: "https://rezzil.com/careers/", note: "VR sports-performance training (Rezzil Player on Quest) — Unity/XR roles. Charlie HR Recruit ATS, no fetcher yet", city: "Manchester, UK" }, // vacancies are an iframe of rezzil.recruit.charliehr.com/job-openings; unsupported ATS and only a handful of roles, so Island. Promotable if a Charlie HR fetcher ever earns its keep. Added 2026-07-31
  // (Torpor Games promoted to mainland 2026-07-05 — HiBob (Bob) ATS, /api/job-ad JSON; see fetchHibob.)
  // (Flix Interactive promoted to mainland 2026-07-05 — self-hosted WP careers page (.vacancy-card list); see fetchFlix.)
  // (Anshar Studios promoted to mainland 2026-07-05 — WP careers page → Traffit board; see fetchTraffit.)
  // (Overwolf promoted to mainland 2026-07-04 — Comeet ATS, same fetcher as Moon Active; see fetchComeet.)
  // (Nekki promoted to mainland 2026-07-05 — self-hosted WordPress careers page; see fetchNekki.)
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
  { name: "Cloud Chamber Games", type: "greenhouse", token: "cloudchamberen" },   // next BioShock — 2K studio (Novato, CA + Montréal)
  { name: "Scopely", type: "greenhouse", token: "scopely" },
  { name: "Theorycraft Games", type: "lever", token: "theorycraftgames" },
  { name: "Naughty Dog", type: "greenhouse", token: "naughtydog" },
  // SIE's master board (careers.playstation.com). deptAsStudio attributes each
  // job to its actual studio (Naughty Dog, Santa Monica...) instead of "SIE";
  // jobs with no studio department show as the fallback name below (= HQ roles).
  { name: "Sony Interactive (HQ)", type: "greenhouse", token: "sonyinteractiveentertainmentglobal", deptAsStudio: true, parentCompany: "Sony Interactive" },
  // Firesprite (The Persistence, Horizon Call of the Mountain) runs its OWN Greenhouse board
  // rather than posting to SIE's master board above, so deptAsStudio never sees these roles.
  // Small board (~1 open as of 2026-07-31) — added 2026-07-31, spot-check first scrape.
  { name: "Firesprite", type: "greenhouse", token: "firesprite", city: "Liverpool, UK", parentCompany: "Sony Interactive" },
  { name: "Epic Games", type: "greenhouse", token: "epicgames" },
  { name: "Zynga", type: "greenhouse", token: "zyngacareers" },
  { name: "Zynga", type: "greenhouse", token: "zyngaearlycareers" },
  // NaturalMotion (CSR Racing, Clumsy Ninja) — Zynga/Take-Two subsidiary with its own Greenhouse
  // board, separate from zyngacareers above. ~4 London roles as of 2026-07-31 (UI/UX, systems +
  // meta design, licensing). NB the public HTML board renders "no current openings" while the
  // API returns 4 — trust ?content=true, not the page. Added 2026-07-31.
  { name: "NaturalMotion", type: "greenhouse", token: "nmcareers", city: "London, UK", parentCompany: "Zynga" },
  // EA runs Avature (jobs.ea.com): server-rendered HTML parsed page by page.
  // Listings carry no posted dates -> the site shows "date n/a" for these.
  { name: "Electronic Arts (HQ)", type: "avature", token: "ea",
    host: "jobs.ea.com", path: "/en_US/careers/Home", deptAsStudio: true, parentCompany: "Electronic Arts" },
  // Blizzard's public careers site runs on Phenom (not the Workday backend, which
  // bounces external requests). Captured via browser: jobs are embedded in each
  // search-results page's HTML. Fixed!
  { name: "Blizzard Entertainment", type: "phenom", token: "blizzard", host: "careers.blizzard.com" },
  // Activision's careers feed tags each job with its studio (jobCompany / legal entity), so we
  // split the Call of Duty studios out as their own studios; everything else stays "Activision (HQ)".
  // (parentCompany groups them all under @Activision on the site.)
  { name: "Activision (HQ)", type: "phenom", token: "activision", host: "careers.activision.com", path: "/search-results",
    parentCompany: "Activision",
    companySplit: {
      "INFINITY WARD": "Infinity Ward",
      "TREYARCH": "Treyarch",
      "SLEDGEHAMMER GAMES": "Sledgehammer Games",
      "RAVEN SOFTWARE": "Raven Software",
      "ELSEWHERE": "Elsewhere Entertainment",   // new AAA narrative studio (Warsaw/Malmö), splits out of the Activision feed
      "BEENOX": "Beenox",                       // Quebec — Crash Team Racing, CoD ports (2026-06-27: live feed jobCompany "BEENOX, INC.")
      "DEMONWARE": "Demonware",                 // online services / netcode — Dublin/Vancouver/Shanghai ("DEMONWARE (CANADA), INC." etc.)
      "DIGITAL LEGENDS": "Digital Legends",     // Barcelona — CoD: Warzone Mobile ("DIGITAL LEGENDS ENTERTAINMENT S.L.")
    } },
  // ZeniMax / Bethesda (jobs.zenimax.com) embeds its full posting list as encoded JSON
  // in the /jobs page; each posting names its real studio (Bethesda Game Studios,
  // MachineGames, Arkane...), so jobs split into proper studios under this umbrella.
  { name: "ZeniMax / Bethesda", type: "zenimax", parentCompany: "ZeniMax / Bethesda" },
  // Ubisoft tags every job department as just "Ubisoft", so we attribute named
  // studios by location (only unambiguous cities; everything else stays "Ubisoft (HQ)").
  { name: "Ubisoft (HQ)", type: "smartrecruiters", token: "Ubisoft2", parentCompany: "Ubisoft", subStudios: {
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
  { name: "Xsolla", type: "lever", token: "xsolla" },   // game commerce / monetization / publishing platform (HQ LA); community-requested via search
  { name: "Unity", type: "workday", host: "unitytech.wd1.myworkdayjobs.com", tenant: "unitytech", site: "Unity", token: "unity" }, // moved off Greenhouse (old unity3d board now 404s) to Workday — July 2026; jobs live at unitytech.wd1.myworkdayjobs.com/Unity/... — spot-check first scrape
  { name: "Team17", type: "workable", token: "team-17-digital" },
  { name: "Kinetic Games", type: "rippling", token: "kinetic-games-careers", city: "Southampton, UK" }, // Phasmophobia · Rippling ATS (promoted from Island 2026-06-17)
  // batch 8 (2026-06-17): promoted from Island — confirmed on a supported ATS.
  { name: "Guerrilla Games", type: "greenhouse", token: "guerrilla-games", city: "Amsterdam, Netherlands" }, // Horizon
  { name: "Playdead", type: "breezy", token: "playdead", city: "Copenhagen, Denmark" },
  { name: "Warhorse Studios", type: "breezy", token: "warhorsestudios", city: "Prague, Czechia" }, // Kingdom Come: Deliverance
  { name: "Fool's Theory", type: "teamtailor", token: "foolstheory", host: "careers.foolstheory.com", city: "Bielsko-Biała, Poland" }, // The Witcher Remake
  { name: "Raw Power Games", type: "teamtailor", token: "rawpowergames", host: "careers.rawpowergames.com", city: "Copenhagen, Denmark" }, // ex-IO Interactive/Hitman & AAA devs (incl. Raw Power Labs entity on same board) — spot-check first scrape
  { name: "Kepler Interactive", type: "teamtailor", token: "kepler", host: "careers.kepler-interactive.com", city: "London, UK", aggregator: true },
  { name: "Snowprint Studios", type: "teamtailor", token: "snowprintstudios", team: "Snowprint", host: "career.snowprintstudios.com", city: "Stockholm, Sweden" }, // Warhammer 40K: Tacticus — classic Teamtailor theme; meta reads "Dept · Snowprint <City> · WorkType", so team:"Snowprint" strips the office prefix + pulls work-type. ~4 roles (Code/Audio/Marketing) across Stockholm + Berlin, Hybrid. Promoted from Island 2026-07-05 — spot-check first scrape // Clair Obscur: Expedition 33, Sifu — publisher/group of 11 studios; classic Teamtailor theme (careers.kepler-interactive.com), ~9 roles across London/Paris/Tokyo/Montréal, all Hybrid. aggregator:true so roles also listed on a member studio's own board (e.g. Sloclap) are deduped in favour of that studio. Promoted from Island 2026-07-05 — spot-check first scrape
  { name: "Yodo1 Games", type: "teamtailor", theme: "cards", token: "yodo1", team: "Yodo1", host: "careers.yodo1.com", city: "Remote" }, // Crossy Road, Rodeo Stampede — mobile publisher, fully remote. Teamtailor "cards" theme (meta div is a sibling of the title anchor); all roles Remote (~18: publishing, licensing, product, ops). Promoted from Island 2026-07-05 — spot-check first scrape
  { name: "LightFury Games", type: "keka", token: "lightfury", city: "Bengaluru, India" }, // AAA game-tech studio (India/UK) — Keka careers portal, clean JSON API (/careers/api/jobs/default/active). ~14 roles (mostly Engineering/Design/Product in Bengaluru); real per-job URLs + posted dates + YOE, no salary. Promoted from Island 2026-07-05 — spot-check first scrape
  { name: "Madbox", type: "teamtailor", theme: "cards", token: "madbox", team: "Madbox", host: "careers.madbox.io", city: "Paris, France" }, // hypercasual/casual mobile (Pocket Champs) — Teamtailor "cards" theme; team name is a prefix on office tokens ("Madbox Paris"/"Madbox Barcelona"), all roles Hybrid across Paris + Barcelona (~13). Promoted from Island 2026-07-05 — spot-check first scrape
  { name: "Anshar Studios", type: "traffit", token: "anshar", careersUrl: "https://ansharstudios.com/careers/", city: "Katowice, Poland" }, // Co-dev (Larian, Saber, PCF partners) — WP careers page server-renders offers linking to its Traffit board (ansharstudios.traffit.com); ~10 roles (Art/Animation/Eng/Design), category tag drives discipline, all Katowice. Promoted from Island 2026-07-05 — spot-check first scrape
  // Shadow Fight, Vector — self-hosted WordPress, server-rendered vacancy list; roles are Remote.
  // The /vacancy INDEX has been 404ing on every run since this was added (individual /vacancy/<slug>/
  // pages are fine, only the listing page is gone). The list now lives on the homepage, and the parser
  // needed no change at all — it finds all 8 there. This one at least failed loudly, as an HTTP 404.
  { name: "Nekki", type: "nekki", careersUrl: "https://nekki.com/", city: "Limassol, Cyprus" },
  { name: "Plarium", type: "plarium", careersUrl: "https://company.plarium.com/en/career/", city: "Herzliya, Israel" }, // RAID: Shadow Legends — Next.js careers site; vacancies live in the RSC flight payload (direction + offices + remoteLocation + hybrid). ~12 roles across Ukraine/Poland/Israel/Spain. Promoted from Island 2026-07-05 — spot-check first scrape
  { name: "Hello Games", type: "hellogames", careersUrl: "https://hellogames.org/join-us/", city: "Guildford, UK" }, // No Man's Sky — self-hosted static careers page (hellogames.org/join-us), server-rendered <a href="/jobs/slug/"> list; ~8 roles (Eng/Art/QA/Production), all Guildford. Discipline from title. Promoted from Island 2026-07-05 — spot-check first scrape
  { name: "Torpor Games", type: "hibob", token: "torporgames", city: "Berlin, Germany" }, // The Conformist, Project Vanguard — HiBob (Bob) ATS; clean JSON API (torporgames.careers.hibob.com/api/job-ad). ~6 roles (Writing/Design/Eng/Finance), all Berlin HQ, Hybrid; posted dates + workspaceType. Skips speculative applications. Promoted from Island 2026-07-05 — spot-check first scrape
  { name: "Flix Interactive", type: "flix", careersUrl: "https://www.flixinteractive.com/", city: "West Midlands, UK" }, // Unreal co-dev (Sea of Thieves, Mafia, Sniper Elite) — self-hosted WP careers page, .vacancy-card links to /vacancies/slug/ with title + location; ~4 roles (email apply), all UK Remote/Hybrid. Skips speculative applications. Promoted from Island 2026-07-05 — spot-check first scrape
  { name: "FromSoftware", type: "fromsoftware", careersUrl: "https://careers.fromsoftware.jp/en/openpositions.html", city: "Tokyo, Japan" },
  { name: "Grinding Gear Games", type: "grindinggear", careersUrl: "https://www.grindinggear.com/?page=careers", city: "Auckland, New Zealand", parentCompany: "Tencent" },
  { name: "Konami", type: "konami", careersUrl: "https://www.konami.com/games/us/en/jobs/", city: "Hawthorne, CA" }, // Yu-Gi-Oh! TCG / US organized-play & card-business roles — self-hosted careers page; <h3> titles under <h2> location groups, all Hybrid (Hawthorne, CA). Discipline from title. Promoted from Island 2026-07-05 — spot-check first scrape
 // Path of Exile — self-hosted careers page (email apply); roles as <h2> titles, all Auckland/Onsite (relocation offered). Discipline from title. Promoted from Island 2026-07-05 — spot-check first scrape // Elden Ring, Dark Souls — self-hosted recruiting site; roles as .bluebox links grouped under <h3> discipline headers, all Tokyo/Onsite. English board (roles open to non-Japanese speakers). Promoted from Island 2026-07-05 — spot-check first scrape
  { name: "Sloclap", type: "teamtailor", theme: "cards", token: "sloclap", team: "Sloclap", host: "careers.sloclap.com", city: "Paris, France" },
  { name: "Dashy Studios", type: "teamtailor", theme: "cards", token: "dashystudios", host: "careers.dashystudios.com", city: "Stockholm, Sweden" }, // Game/interactive consulting studio (clients incl. Mojang, King, Embark). Teamtailor "cards" theme, plain "Dept · Location · WorkType" meta, no team token. ~3 Stockholm consulting roles (C++/Unreal, backend, tech lead). Added by request 2026-07-15. Spot-check first scrape.
  { name: "Steel City Interactive", type: "teamtailor", theme: "cards", token: "steelcityinteractive", host: "careers.steelcityinteractive.co.uk", city: "Sheffield, UK" }, // Undisputed (boxing) — Teamtailor "cards" theme; meta is plain "Dept · Location · WorkType" (no team token). ~5 roles across Sheffield/Leamington Spa (Programming/Design/Ops), mostly Hybrid. Promoted from Island 2026-07-05 — spot-check first scrape // Sifu, Absolver — Kepler member studio; Teamtailor "cards" theme (careers.sloclap.com), ~3 Paris roles (Art/VFX/Producing), all Hybrid. Shares Kepler's Teamtailor tenant, so these same IDs are deduped off the Kepler aggregator board. Promoted from Island 2026-07-05 — spot-check first scrape
  { name: "GIANTS Software", type: "smartrecruiters", token: "GIANTSSoftwareGmbH", city: "Zurich, Switzerland" }, // Farming Simulator — spot-check first scrape
  { name: "Mad Mushroom", type: "workable", token: "otk-media", city: "Austin, TX" }, // OTK Network — spot-check first scrape
  { name: "LightSpeed Studios", type: "workday", host: "tencent.wd1.myworkdayjobs.com", tenant: "tencent", site: "Lightspeed", token: "lightspeed", city: "Los Angeles, CA" }, // PUBG Mobile (Tencent) — spot-check first scrape
  { name: "Rockstar Games", type: "greenhouse", token: "rockstargames" },
  { name: "People Can Fly", type: "smartrecruiters", token: "PeopleCanFly" },
  { name: "Kabam", type: "lever", token: "kabam" },
  { name: "CD Projekt Red", type: "smartrecruiters", token: "CDPROJEKTRED" },
  { name: "Rovio", type: "lever", token: "rovio-2" },
  { name: "The Pokémon Company", type: "greenhouse", token: "pokemoncareers" },
  { name: "Jam City", type: "lever", token: "jamcity" },
  { name: "Take-Two Interactive", type: "greenhouse", token: "taketwo" },
  { name: "KRAFTON", type: "krafton", parentCompany: "KRAFTON", city: "Seoul, South Korea" }, // custom SSR board (krafton.com) covering HQ + all sub-studios (~200 roles); replaced the Greenhouse "kraftonamericas" board, which only held ~3 US corporate roles
  { name: "Cygames", type: "cygames", city: "Tokyo, Japan" }, // Uma Musume, Granblue Fantasy — custom SSR page linking to HRMOS (~170 JP-language roles); promoted from Island 2026-07-04 — spot-check first scrape
  { name: "GAME FREAK", type: "hrmos", token: "gamefreak", city: "Tokyo, Japan" }, // Pokémon developer — HRMOS board (~57 JP-language roles, Tokyo HQ); promoted from Island 2026-07-04 — spot-check first scrape
  { name: "Garena", type: "garena", city: "Singapore" }, // Free Fire (Sea Ltd) — careers.garena.com Nuxt site, POST /api/job/list JSON (~96 roles across APAC/LatAm/Casablanca); promoted from Island 2026-07-04 — spot-check first scrape
  { name: "Shift Up", type: "shiftup", city: "Seoul, South Korea" }, // Stellar Blade, NIKKE — shiftup.co.kr/recruit.php SSR (~38 open KR-language roles). Its Greeting ATS hides per-job IDs, so every role links to the main recruit page (owner-approved 2026-07-04). Promoted from Island 2026-07-04 — spot-check first scrape
  { name: "Miniclip", type: "miniclip", city: "Lisbon, Portugal" }, // 8 Ball Pool, Agar.io — miniclip.com/careers/vacancies Nuxt SSR (~31 roles across PT/UK/NL/TR, real per-job URLs); backed by SuccessFactors but the Miniclip page renders all roles. Promoted from Island 2026-07-04 — spot-check first scrape
  { name: "Playrix", type: "playrix" }, // Gardenscapes, Township — playrix.com custom API (POST /api/v1 job/getList, ~26 real dated roles). Fully remote ("work from anywhere"), so all roles are Remote. Promoted from Island 2026-07-04 — spot-check first scrape
  { name: "SuperPlay", type: "superplay", city: "Tel-Aviv, Israel" }, // Dice Dreams, Domino Dreams (Playtika) — superplay.co/careers WordPress SSR (~30 roles across Tel-Aviv/Bucharest/Poland, real per-job URLs). Promoted from Island 2026-07-04 — spot-check first scrape
  { name: "Atlus", type: "atlus", token: "E743DEB45C5896F708643C7D7B581397", city: "Irvine, CA", parentCompany: "SEGA" }, // Persona, Shin Megami Tensei (SEGA West / Atlus West) — atlus.com/careers → Paycom portal (~21 mostly publishing/marketing roles in Irvine/Burbank). Promoted from Island 2026-07-04 — spot-check first scrape
  { name: "Kojima Productions", type: "kojima", city: "Tokyo, Japan" }, // Death Stranding, OD — kojimaproductions.jp Drupal careers, POST /kjpviewloader/load returns the job-listing view HTML (~37 roles, all Tokyo, real per-job URLs). Promoted from Island 2026-07-04 — spot-check first scrape
  { name: "Square Enix (Japan)", type: "hrmos", token: "square-enix", city: "Tokyo, Japan", parentCompany: "Square Enix" }, // Final Fantasy, Dragon Quest — Japan HQ careers run on HRMOS (hrmos.co/pages/square-enix, ~35 JP roles incl. game dev + publishing/manga/EC). Same fetcher as GAME FREAK. Promoted from Island 2026-07-04 — spot-check first scrape
  { name: "Spike Chunsoft", type: "hrmos", token: "spchun", city: "Tokyo, Japan" }, // Danganronpa, Zero Escape, Shiren the Wanderer — HRMOS board (hrmos.co/pages/spchun, ~19 JP roles: producers, designers/animators, planners, sales/licensing/legal/HR). Same fetcher as GAME FREAK. Promoted from Island 2026-07-05 — spot-check first scrape
  { name: "Owlcat Games", type: "owlcat", city: "Nicosia, Cyprus" }, // Pathfinder, Rogue Trader — owlcat.games/careers Next.js site; jobs embedded in __NEXT_DATA__ (~7 roles, real dates + per-job URLs). Promoted from Island 2026-07-04 — spot-check first scrape
  // Coin Master. WAS Comeet (company A2.00C) — they migrated to Ashby around 2026-07-29 and their
  // Comeet feed now answers 200 with an empty array on every endpoint variant, which is exactly the
  // failure mode that reads as "no open roles" instead of "moved house". The careers page still
  // carries dead Comeet globals, but the live board is Ashby (28 roles, matching the site's count).
  { name: "Moon Active", type: "ashby", token: "moonactive", city: "Tel Aviv, Israel" },
  { name: "Overwolf", type: "comeet", token: "B1.001", comeetToken: "1B16C4BD7005131B1A26F391B1", city: "Ramat Gan, Israel" }, // CurseForge, Tebex — Comeet ATS (~13 roles across Ramat Gan/London/Hoboken). Same fetcher as Moon Active. Promoted from Island 2026-07-04 — spot-check first scrape
  { name: "SayGames", type: "huntflow", token: "saygameshr", city: "Limassol, Cyprus" }, // hybrid-casual publisher — Huntflow board, public /api/vacancy JSON (~24 roles, no per-job city → studio HQ). Promoted from Island 2026-07-04 — spot-check first scrape
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
  // Hasbro retired its Eightfold board (careers.hasbro.com now errors "Group ID not found: hasbro.com") and
  // moved ALL brands onto one Greenhouse board (token "hasbro", ~141 roles incl. toys + corporate). Keep only
  // Wizards of the Coast's game brands via deptInclude. (fixed 2026-07-12 — was eightfold/careers.hasbro.com)
  { name: "Wizards of the Coast", type: "greenhouse", token: "hasbro", city: "Renton, WA",
    deptInclude: "wizards|magic the gathering|dungeons ?& ?dragons|marketing: ?d&d|\\barena\\b|skeleton key|digital games" },
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
  { name: "ProbablyMonsters", type: "jobvite", token: "probablymonsters" },   // family of studios (Bellevue/Dallas); careers UI wraps a Jobvite board
  { name: "Frontier Developments", type: "lever", token: "frontier", region: "eu" }, // public feed is on the EU host
  { name: "Aspyr Media", type: "greenhouse", token: "aspyrmediainc" }, // proxied under aspyr.com but a standard Greenhouse board
  // Workday fetcher kept for future boards (EA, Nintendo...). Sony's Workday
  // board is superseded by the Greenhouse board above.
  // { name: "PlayStation (Sony)", type: "workday", token: "sonyglobal",
  //   host: "sonyglobal.wd1.myworkdayjobs.com", tenant: "sonyglobal", site: "SonyGlobalCareers", search: "PlayStation" },
  // ---- Promoted from the directory by the June 7 2026 island re-audit ----
  { name: "Nintendo", type: "greenhouse", token: "nintendo", titleExclude: "\\(Retro Studios\\)" }, // shares its Greenhouse board with subsidiary studios tagged in the title; Retro Studios is listed separately, so exclude its roles here to avoid duplicates
  { name: "Retro Studios", type: "greenhouse", token: "nintendo", titleInclude: "\\(Retro Studios\\)", titleStrip: "\\s*\\(Retro Studios\\)\\s*", city: "Austin, TX", parentCompany: "Nintendo" }, // Metroid Prime, Donkey Kong — Nintendo subsidiary; roles live on the shared Nintendo Greenhouse board tagged "(Retro Studios)". ~6 Austin roles (Art/Animation/Eng). Promoted from Island 2026-07-05 — spot-check first scrape
  // Mojang moved its Redmond hiring onto Microsoft's central careers board (Xbox first-party). The old
  // Greenhouse board ("mojangab" / jobs.mojang.com) now carries only Stockholm roles and sits empty today,
  // which is why the greenhouse feed read as "failing". Scrape the live Redmond roles from MS Careers via a
  // keyword query; titleInclude keeps it to Minecraft/Mojang. Re-add the Greenhouse board as a 2nd source if
  // Stockholm reopens. (fixed 2026-07-12)
  { name: "Mojang Studios", type: "mscareers", query: "Mojang", titleInclude: "minecraft|mojang", token: "mojang" },
  { name: "Bandai Namco", type: "greenhouse", token: "bandainamco" },
  { name: "Firaxis Games", type: "greenhouse", token: "firaxis" },
  { name: "That's No Moon", type: "greenhouse", token: "thatsnomoonentertainment" },
  { name: "NCSOFT", type: "greenhouse", token: "ncamerica" },
  { name: "HoYoverse", type: "smartrecruiters", token: "HoYoverse" },              // Genshin/Star Rail — migrated greenhouse→SmartRecruiters (gh board went empty), fixed Jun 2026
  { name: "Behaviour Interactive", type: "lever", token: "bhvr" },
  { name: "Jagex", type: "workable", token: "jagex-limited" },
  { name: "Climax Studios", type: "workable", token: "climax-studios" },
  { name: "Rebellion", type: "workable", token: "rebellion" },
  { name: "Keywords Studios", type: "smartrecruiters", token: "KeywordsStudios" },
  // d3t (Daresbury co-dev, 150+ devs) is a Keywords subsidiary with no board of its own — its own
  // careers page just says "email us a CV". Its roles live on Keywords' *international* Workable
  // account (keywords-intl1, ~220 roles across 26 countries) tagged in the title, e.g.
  // "Principal Level Designer - d3t". titleInclude carves those out and titleStrip drops the tag
  // so the card reads "Principal Level Designer" under studio "d3t". The rest of keywords-intl1
  // (Volta, Lakshya, localisation/QA) is deliberately NOT ingested — see note in the review.
  // Added 2026-07-31 — spot-check first scrape.
  { name: "d3t", type: "workable", token: "keywords-intl1", titleInclude: "\\bd3t\\b",
    titleStrip: "\\s*[-–—]?\\s*\\bd3t\\b\\s*", city: "Daresbury, UK", parentCompany: "Keywords Studios" },
  { name: "IO Interactive", type: "teamtailor", token: "ioi", host: "apply.ioi.dk" },
  { name: "OtherSide Entertainment", type: "teamtailor", token: "otherside", host: "careers.otherside-e.com" },
  { name: "Sega", type: "workday", token: "sega", host: "sega.wd3.myworkdayjobs.com", tenant: "sega", site: "SEGA_Careers" },

  // ---- June 2026 batch ----
  { name: "Digital Extremes", type: "greenhouse", token: "digitalextremes" }, // Warframe (London, Ontario)
  { name: "Asobo Studio", type: "lever", token: "asobostudio", region: "eu" }, // MS Flight Sim, A Plague Tale (public feed on Lever EU host)
  // LEGO Digital Play is the LEGO Group's in-house GAMES studio — its own Teamtailor careers
  // site, so we get games-only roles without filtering LEGO corporate's giant Workday board.
  { name: "LEGO Digital Play", type: "teamtailor", token: "legodigitalplay", host: "careers.legodigitalplay.com" },
  { name: "Focus Entertainment", type: "recruitee", token: "focusentertainment" }, // FR publisher/dev (Recruitee)

  // ---- June 2026 batch 2 (verified live feeds; a few have valid boards sitting at 0 today) ----
  { name: "Bonfire Studios", type: "greenhouse", token: "bonfirestudiosinc" },     // ex-Blizzard/Riot (Irvine, CA) — token was "bonfirestudios" (stale/empty); fixed Jun 2026
  { name: "Wildlife Studios", type: "greenhouse", token: "wildlifestudios" },      // BR mobile
  { name: "Absurd Ventures", type: "greenhouse", token: "absurdventures" },        // Dan Houser's new studio
  { name: "Dream Games", type: "greenhouse", token: "dreamgames" },                // Royal Match (0 open now)
  { name: "Crytek", type: "lever", token: "crytek" },                              // Crysis, Hunt: Showdown (DE)
  { name: "thatgamecompany", type: "ashby", token: "thatgamecompany" },            // Journey, Sky
  // Added from the christran/Unstoppable Guild sweep (feeds verified live, June 2026).
  { name: "Housemarque", type: "greenhouse", token: "housemarque" },               // Returnal (Sony, FI)
  { name: "Haven Studios", type: "greenhouse", token: "haven" },                   // Fairgame$ (Sony, CA)
  { name: "Turtle Rock Studios", type: "greenhouse", token: "turtlerockstudios" }, // Back 4 Blood, L4D
  { name: "Tripwire Interactive", type: "greenhouse", token: "tripwireinteractive" }, // Killing Floor
  { name: "Unknown Worlds", type: "greenhouse", token: "unknownworlds" },          // Subnautica
  { name: "Gravity Well", type: "greenhouse", token: "gravitywell" },              // ex-Respawn founders
  // christran sweep, round 2 (feeds verified game-dev, June 2026).
  { name: "Bad Robot Games", type: "ashby", token: "badrobotgames" },              // J.J. Abrams' game division
  { name: "Stellar Entertainment", type: "ashby", token: "stellarentertainment" },// racing studio, Guildford UK
  { name: "The Believer Company", type: "ashby", token: "believer" },              // ex-Riot founders
  { name: "VRChat", type: "lever", token: "vrchat" },                              // social VR platform
  { name: "Singularity 6", type: "greenhouse", token: "singularity6" },            // Palia
  { name: "Night Dive Studios", type: "greenhouse", token: "nightdivestudios" },   // classic remasters
  { name: "Wooga", type: "greenhouse", token: "wooga" },                           // mobile (Berlin)
  { name: "Kolibri Games", type: "lever", token: "kolibrigames" },                 // Idle Miner Tycoon (Berlin)
  { name: "Demiurge Studios", type: "lever", token: "demiurgestudios" },           // Marvel Puzzle Quest
  // christran sweep, round 3 (full-list probe; each feed peeked to confirm game-dev, June 2026).
  { name: "Peak Games", type: "lever", token: "peakgames" },                       // Toon Blast (Zynga, Istanbul)
  { name: "Easybrain", type: "lever", token: "easybrain" },                        // mobile puzzle (Cyprus)
  { name: "Fanatee", type: "lever", token: "fanatee" },                            // CodyCross (mobile)
  { name: "Limit Break", type: "lever", token: "limitbreak" },                     // mobile (Tokyo)
  { name: "Sun Studio", type: "lever", token: "sunstudio" },                       // casual games (Vietnam)
  { name: "Voldex", type: "ashby", token: "voldex" },                              // Roblox games (Brookhaven)
  { name: "HyperHug", type: "ashby", token: "hyperhug" },                          // mobile (Cyprus)
  { name: "Joyteractive", type: "ashby", token: "joyteractive" },                  // mobile (Poland)
  { name: "TapBlaze", type: "ashby", token: "tapblaze" },                          // Good Pizza, Great Pizza
  { name: "Tactile Games", type: "greenhouse", token: "tactilegames" },            // Lily's Garden (DK)
  { name: "MobilityWare", type: "greenhouse", token: "mobilityware" },             // solitaire (US)
  { name: "Dots", type: "greenhouse", token: "dots" },                             // TwoDots (NYC)
  { name: "PlayQ", type: "greenhouse", token: "playq" },                           // mobile (Santa Monica)
  { name: "Rushdown Studios", type: "greenhouse", token: "rushdownstudios" },      // indie
  { name: "Nex", type: "greenhouse", token: "nex" },                               // active-play games (HK)
  { name: "Kano", type: "greenhouse", token: "kano" },                             // social games (Victoria BC)
  { name: "Hangar 13", type: "greenhouse", token: "hangar13" },                    // Mafia (2K studio)
  { name: "Visual Concepts", type: "greenhouse", token: "visualconcepts" },        // NBA 2K (2K studio)
  { name: "5minlab", type: "greenhouse", token: "5minlab" },                       // Krafton studio (Korea)
  // christran sweep, round 4 (Workable-hosted studios, feeds peeked, June 2026).
  { name: "nDreams", type: "workable", token: "ndreams" },                         // VR (Megabit, Ghostbusters VR; UK)
  { name: "Velan Studios", type: "workable", token: "velanstudios" },              // Knockout City, Mario Kart Live
  { name: "ZeptoLab", type: "workable", token: "zeptolab" },                       // Cut the Rope
  { name: "Studio Gobo", type: "workable", token: "studiogobo" },                  // Brighton (Disney Illusion Island)
  { name: "Hutch", type: "workable", token: "hutch" },                             // mobile racing (F1 Clash; UK)
  { name: "BeamNG", type: "workable", token: "beamng" },                           // BeamNG.drive (DE)
  { name: "DECA Games", type: "workable", token: "deca-games" },                   // live-game operator (0 open now)
  { name: "Kwalee", type: "lever", token: "kwalee", region: "eu" },                // mobile + PC publisher (UK, Lever EU)
  { name: "Double Eleven", type: "workable", token: "double-eleven" },             // Minecraft Dungeons, Prison Architect 2 (UK/KL)
  { name: "Tactical Adventures", type: "teamtailor", token: "tacticaladventures", host: "tacticaladventures.teamtailor.com" }, // Solasta (Paris)
  // Promoted from island/moon (2026-06-11): link-outs that turned out to have a scrapeable feed.
  { name: "NetEase Games", type: "greenhouse", token: "neteasegames" },            // was island — Western/UK roles
  { name: "Outfit7", type: "greenhouse", token: "outfit7" },                       // was island — Talking Tom (Ljubljana)
  { name: "Innersloth", type: "bamboohr", token: "innersloth" },                   // was moon — Among Us
  { name: "Balor Games", type: "ashby", token: "balorgames" },                     // was moon
  { name: "Coffee Stain Studios", type: "teamtailor", token: "coffeestain", host: "jobs.coffeestain.com" }, // was moon — Satisfactory
  { name: "Ghost Ship Games", type: "teamtailor", token: "ghostship", host: "jobs.ghostship.dk" },          // was moon — Deep Rock Galactic
  { name: "Stunlock Studios", type: "teamtailor", token: "stunlock", host: "jobs.stunlockstudios.com" },    // was moon — V Rising
  { name: "Cinnamon", type: "teamtailor", token: "cinnamonsoftware", host: "cinnamonsoftware.teamtailor.com" }, // Roblox game studio (UK, fully remote)
  // From the Grackle HQ comparison (2026-06-11): notable studios with verified feeds.
  { name: "Amber", type: "ashby", token: "amber" },                                // AAA co-dev/outsourcing (Bucharest/Tirana/Köln)
  { name: "Panic Button", type: "greenhouse", token: "panicbutton" },              // porting studio (Austin) — Doom Switch
  { name: "SkyBox Labs", type: "lever", token: "skyboxlabs" },                     // Minecraft/Halo co-dev (Vancouver)
  { name: "Keen Games", type: "teamtailor", token: "keengames", host: "jobs.keengames.com" }, // Enshrouded (Frankfurt) — not Keen Software House
  { name: "Neowiz", type: "lever", token: "neowiz" },                              // Lies of P / ROUND8 Studio (Korea) — from Alexander Rehm sweep
  // From the Animation/VFX/Game community spreadsheet (2026-06-11) — only feeds that verified live.
  { name: "Tango Gameworks", type: "greenhouse", token: "tangogameworks" },        // Hi-Fi Rush, The Evil Within (Krafton, Tokyo)
  { name: "Bigger Games", type: "ashby", token: "biggergames" },                   // mobile (Istanbul)
  { name: "Exploding Kittens", type: "lever", token: "explodingkittens" },         // card + digital games
  { name: "Sumo Digital", type: "sumodigital", url: "https://www.sumo-digital.com/careers/" }, // bespoke parser — moved off Lever to a custom WP board
  { name: "Quantic Dream", type: "lever", token: "quanticdream", region: "eu" },   // Detroit: Become Human (FR, Lever EU)
  { name: "Don't Nod", type: "smartrecruiters", token: "DONTNOD" },                // Life is Strange (FR)

  // ---- batch 2 verification pass (real ATS tokens confirmed from each careers page) ----
  { name: "Atari", type: "greenhouse", token: "atariinc" },                        // 9 live
  { name: "Digital Eclipse", type: "greenhouse", token: "digitaleclipse" },        // Atari-owned (remasters)
  { name: "Bloober Team", type: "teamtailor", token: "blooberteam", host: "careers.blooberteam.com" }, // Silent Hill 2 remake (PL) — migrated Recruitee→Teamtailor Jun 2026
  { name: "11 bit studios", type: "recruitee", token: "11bitstudios" },            // Frostpunk (PL)
  { name: "Raw Fury", type: "teamtailor", token: "rawfury", host: "jobs.rawfury.com" }, // indie publisher (SE)
  { name: "Wargaming", type: "greenhouse", token: "wargamingen" },                 // World of Tanks (public board API ~0 today — recheck)

  // ---- batch 3 (2026-06-08): confirmed live ATS tokens ----
  { name: "Mob Entertainment", type: "greenhouse", token: "mobentertainment" },    // Poppy Playtime (St. Louis)
  { name: "Highdive", type: "greenhouse", token: "highdive" },                     // NetEase-owned dev (Montreal/Toronto)
  { name: "Daybreak Game Company", type: "greenhouse", token: "daybreakgames" },   // EverQuest, DCUO — EG7 (San Diego)
  { name: "Cast Iron Games", type: "teamtailor", token: "castirongames", host: "careers.castirongames.com" }, // co-dev/porting, Double Eleven sister (UK)
  { name: "Escape Velocity Entertainment", type: "workable", token: "escape-velocity-entertainment-inc" },    // ex-Blizzard MMO (remote)
  { name: "Snowed In Studios", type: "workable", token: "snowed-in-studios-3" },   // Keywords co-dev (Ottawa)

  // ---- batch 4 (2026-06-09): mobile + notable studios (cross-referenced from ASGC, feeds verified live) ----
  { name: "Voodoo", type: "ashby", token: "voodoo" },                              // hyper-casual mobile publisher (Paris)
  { name: "Tripledot Studios", type: "greenhouse", token: "tripledotstudios" },    // casual mobile, owns Lion Studios (London)
  { name: "Good Job Games", type: "greenhouse", token: "goodjobgames" },           // hyper-casual mobile (Istanbul)
  { name: "Eleventh Hour Games", type: "greenhouse", token: "eleventhhourgames" }, // Last Epoch — ARPG (Chicago/remote)
  { name: "Homa Games", type: "workable", token: "homa-games" },                   // mobile publisher (Paris)
  { name: "Amanotes", type: "lever", token: "amanotes" },                          // #1 music games (Ho Chi Minh City)
  { name: "Scorewarrior", type: "ashby", token: "scorewarrior" },                  // Total Battle — MMO strategy (Limassol). Migrated recruitee→Ashby (old recruitee board 404s); fixed 2026-07-12

  // ---- June 2026: community / requested studios (verified ATS feeds) ----
  { name: "Counterplay Games", type: "breezy", token: "counterplay-games-inc" },   // Godfall, Duelyst — fully remote (board may sit at 0)
  { name: "Thought Pennies", type: "manatal", token: "thought-pennies" },          // story-first RPG, fully remote (first community request)
  { name: "PikPok", type: "workable", token: "pikpok" },                           // mobile (Wellington, NZ) — promoted from directory; Workable already supported
  // ---- Promoted from the Island 2026-06-13 (Hitmarker gap batch) — existing + new fetchers ----
  { name: "Netmarble", type: "workable", token: "netmarbleus" },                   // Marvel Future Fight, Seven Knights — US office board (KR parent)
  { name: "Hazelight Studios", type: "teamtailor", token: "hazelight", host: "careers.hazelight.se" }, // It Takes Two, Split Fiction (Stockholm)
  { name: "10 Chambers", type: "teamtailor", token: "10chambers", host: "careers.10chambers.com" },    // GTFO, Den of Wolves (Stockholm)
  { name: "Build A Rocket Boy", type: "pinpoint", token: "buildarocketboy" },       // MindsEye (Edinburgh) — new Pinpoint fetcher
  { name: "Pipeworks Studios", type: "pinpoint", token: "pipeworks" },              // co-dev/porting (Eugene, OR) — new Pinpoint fetcher
  { name: "CCP Games", type: "pinpoint", token: "fenris", host: "careers.fenriscreations.com", city: "Reykjavík, Iceland" }, // EVE Online — now under Fenris Creations; Pinpoint ATS on a custom domain (careers.fenriscreations.com/postings.json). ~10 roles across Reykjavík + London, mostly Hybrid, absolute apply URLs. Promoted from Island 2026-07-05 — spot-check first scrape
  // ---- Promoted from the Island 2026-06-13 (big-studio dig) — already-supported ATS ----
  { name: "tinyBuild", type: "manatal", token: "tinybuild" },                       // Hello Neighbor — careers-page.com/Manatal (verified 6 roles)
  { name: "Hi-Rez Studios", type: "jazzhr", token: "hirezstudios" },               // SMITE, Paladins — JazzHR
  // CIG left Workday for a self-hosted GraphQL board (2026-06-18); see fetchCig.
  { name: "Cloud Imperium Games", type: "cig", token: "cig" }, // Star Citizen, Squadron 42
  // ---- July 2026 batch 2: promoted to Mainland (confirmed live on a supported ATS) — spot-check first scrape ----
  { name: "Tripledot Studios", type: "greenhouse", token: "tripledotstudios" }, // aggregate board across acquired studios (~58 roles; standard greenhouse API works despite the EU display host)
  { name: "Rocket Science", type: "ashby", token: "rocketsciencegg" }, // co-dev group incl. Atomic Theory
  { name: "Volka", type: "ashby", token: "volka", city: "Limassol, Cyprus" }, // Taonga — mobile
  { name: "Companion Group", type: "recruitee", token: "companiongroupltd" },
  { name: "Liquid Development", type: "workable", token: "liquid-development", city: "Portland, OR" }, // Keywords Studios art co-dev
  { name: "Goodbye Kansas", type: "teamtailor", token: "goodbyekansas", host: "career.goodbyekansas.com", city: "Stockholm, Sweden" }, // VFX / game cinematics
  { name: "Beffio", type: "teamtailor", token: "beffio", host: "careers.beffio.com", city: "Poznań, Poland" }, // art co-dev
  // Xbox first-party studio on its own SSR careers site (Microsoft's central board can't attribute studios).
  { name: "Playground Games", type: "playground", token: "playground", city: "Leamington Spa, UK" }, // Fable, Forza Horizon
  { name: "Obsidian Entertainment", type: "obsidian", token: "obsidian", city: "Irvine, CA" }, // Avowed, Pillars of Eternity — own SSR board
  { name: "Undead Labs", type: "greenhouse", token: "undeadlabsllc" },                         // State of Decay — Greenhouse
  { name: "inXile Entertainment", type: "bamboohr", token: "inxile" },                         // Wasteland, Clockwork Revolution — BambooHR
  { name: "Sperasoft", type: "workable", token: "sperasoft" },                                 // AAA co-dev (Halo, Battlefield, AC) — Keywords Studios
  { name: "Virtuos", type: "oracle", token: "fa-exhj-saasfaprod1", site: "CX_1", city: "Singapore" }, // AAA co-dev/outsourcing — Oracle Recruiting Cloud (promoted from Island 2026-06-18)
  { name: "Techland", type: "techland", token: "techland", city: "Wrocław, Poland" },           // Dying Light — own SSR board (promoted from Island 2026-06-18)
  { name: "Lighthouse Games", type: "workable", token: "lighthousegames" },                     // ex-Codemasters AAA studio (Leamington Spa, UK) — Workable
  // ---- 2026-06-19 batch (requested) ----
  { name: "Ludia", type: "bamboohr", token: "ludia", city: "Montréal, Canada" },                // mobile (Jurassic World Alive, DragonVale) — BambooHR
  { name: "Astrid Entertainment", type: "workable", token: "astrid-entertainment", city: "United Kingdom" }, // co-op open-world studio (UK, remote) — Workable
  // Total War, Alien (SEGA). WAS Jobvite ("creative-assembly"), which is dead — the token 302s to an
  // invalid-account page and CA's own careers site no longer lists vacancies at all, it just points at
  // SEGA. Moved onto the same careers.sega.co.uk feed its sibling SEGA Europe studios already use.
  // NOTE the facet is "The Creative Assembly", with the article — "Creative Assembly" matches nothing,
  // which is worth knowing because a wrong facet fails the silent way (200 OK, empty list, no error).
  { name: "Creative Assembly", type: "segacareers", token: "creative-assembly", studioFacet: "The Creative Assembly", city: "Horsham, UK", parentCompany: "SEGA" },
  // ---- 2026-06-19 studio batch ----
  { name: "Torn Banner Studios", type: "bamboohr", token: "tornbanner", city: "Toronto, Canada" },          // Chivalry, No More Room in Hell 2
  { name: "Devoted Studios", type: "workable", token: "devoted-studios-1", city: "Los Angeles, CA" },        // distributed co-dev / production management
  { name: "Triband", type: "teamtailor", token: "triband", host: "careers.triband.net", city: "Copenhagen, Denmark" }, // WHAT THE GOLF? comedy games
  { name: "Next Level Games", type: "jazzhr", token: "nextlevelgames", city: "Vancouver, Canada" },          // Luigi's Mansion, Mario Strikers — Nintendo subsidiary
  { name: "Critical Path Games", type: "critpath", token: "critpath", city: "Vancouver, BC" },               // custom static careers site — fetchCritpath (requested mainland)
  { name: "Eidos-Montréal", type: "eidos", token: "eidos", city: "Montréal, QC, Canada", parentCompany: "Embracer" }, // Deus Ex, Tomb Raider — careers page is Dayforce-backed SSR (promoted from Island 2026-06-28)
  { name: "Snail Games", type: "hiringthing", token: "snail-games-usa-inc", city: "Culver City, CA" }, // ARK publisher (NASDAQ: SNAL) — HiringThing SSR board (promoted from Island 2026-06-28)
  { name: "Sports Interactive", type: "segacareers", token: "sports-interactive", studioFacet: "Sports Interactive", city: "London, UK", parentCompany: "SEGA" }, // Football Manager — careers.sega.co.uk Drupal site, studio-scoped (promoted from Island 2026-06-28)
  { name: "Two Point Studios", type: "segacareers", token: "two-point-studios", studioFacet: "Two Point Studios", city: "Farnham, UK", parentCompany: "SEGA" }, // Two Point Hospital/Campus — careers.sega.co.uk, studio-scoped (promoted from Island 2026-06-28)
  { name: "Square Enix Europe", type: "workable", token: "square-enix", city: "London, UK", parentCompany: "Square Enix" },        // FF, Dragon Quest — UK/Europe office on Workable (promoted from Island 2026-06-28; Japan stays a link-out)
  { name: "Square Enix America", type: "workable", token: "square-enix-america", city: "El Segundo, CA", parentCompany: "Square Enix" }, // Square Enix Americas (LA) on Workable (promoted from Island 2026-06-28)
  { name: "Turn 10 Studios", type: "turn10", token: "turn10", city: "Redmond, WA", parentCompany: "Xbox Game Studios" }, // Forza — own SSR page deep-links to MS Careers (promoted from Island 2026-06-28)
  { name: "Kalypso Media", type: "hrworks", token: "kalypso", feedUrl: "https://jobs.kalypsomedia.com/en", city: "Worms, Germany", parentCompany: "Kalypso Media Group" }, // Tropico, Commandos — HRworks SSR portal (promoted from Island 2026-06-28)
  { name: "Smilegate", type: "smilegate", token: "smilegate", city: "Seongnam, South Korea", parentCompany: "Smilegate" }, // Lost Ark, CrossFire — Korean SPA, game-production category only (promoted from Island 2026-06-28)
  // ---- 2026-06-26 batch: gap analysis vs alexanderrehm.com directory. Tier-1 studios already on a
  // supported ATS (tokens read from their public careers URLs) — spot-check first scrape, a wrong
  // token just shows 0 roles (per-source try/catch). See competitor-studio-gap-analysis.md. ----
  // Greenhouse
  { name: "Nordeus", type: "greenhouse", token: "nordeus", city: "Belgrade, Serbia" },                       // Top Eleven — EA-owned mobile sports
  { name: "Playtika", type: "greenhouse", token: "playtikaltd", city: "Herzliya, Israel" },                  // mobile/casual giant (Bingo Blitz, Slotomania)
  // Lever
  { name: "InnoGames", type: "lever", token: "innogames", region: "eu", city: "Hamburg, Germany" },           // Forge of Empires, Elvenar — Lever EU host (jobs.eu.lever.co)
  // Ashby
  { name: "Agave Games", type: "ashby", token: "agavegames", city: "Istanbul, Turkey" },                     // mobile (Mergeland)
  { name: "BulletFarm", type: "ashby", token: "bulletfarm", city: "Los Angeles, CA" },                       // NetEase-backed AAA FPS (ex-COD lead)
  { name: "Pocket Worlds", type: "ashby", token: "Pocket Worlds", city: "Austin, TX" },                      // Highrise — social metaverse; token has a space, spot-check
  // Workable
  { name: "Ace Games", type: "workable", token: "ace-games", city: "Istanbul, Turkey" },                     // mobile (Spades Royale)
  { name: "Brightrock Games", type: "workable", token: "brightrockgames", city: "London, UK" },              // War for the Overworld, Ministry of Broadcast
  { name: "Carry1st", type: "workable", token: "carry1st", city: "Cape Town, South Africa" },                // Africa-focused mobile publisher
  { name: "Forgotten Empires", type: "workable", token: "forgotten-empires", city: "Remote (EU/US)" },       // Age of Empires / Mythology Definitive Editions
  { name: "KingsIsle Entertainment", type: "workable", token: "kingsisle-entertainment-inc", city: "Austin, TX" }, // Wizard101, Pirate101
  { name: "Lockwood Publishing", type: "workable", token: "lockwood", city: "Nottingham, UK" },              // Avakin Life
  { name: "Longdue Games", type: "workable", token: "longdue-games", city: "Remote (UK)" },                  // narrative studio (ex-AAA vets)
  { name: "Owlchemy Labs", type: "workable", token: "owlchemy-labs", city: "Austin, TX" },                   // VR (Job Simulator, Vacation Simulator) — Google
  { name: "SNK", type: "workable", token: "snk", city: "Osaka, Japan" },                                     // King of Fighters, Metal Slug, Fatal Fury
  { name: "StoryToys", type: "workable", token: "storytoys", city: "Dublin, Ireland" },                      // kids' educational games
  { name: "Tamatem Games", type: "workable", token: "tamatem", city: "Amman, Jordan" },                      // MENA mobile publisher
  // SmartRecruiters
  { name: "Frima Studio", type: "smartrecruiters", token: "frimastudio", city: "Québec City, Canada" },      // co-dev / work-for-hire
  { name: "Weta Workshop", type: "smartrecruiters", token: "WetaWorkshop", city: "Wellington, New Zealand" }, // Tales of the Shire — now a game dev
  // Breezy
  { name: "Fugo Games", type: "breezy", token: "fugo-games", city: "Istanbul, Turkey" },                     // Tile Busters, word/puzzle mobile
  // JazzHR
  { name: "Maximum Entertainment", type: "jazzhr", token: "maximumgames", city: "Walnut Creek, CA" },        // publisher (Maximum Games / Modus)
  { name: "Sago Mini", type: "jazzhr", token: "sagomini", city: "Toronto, Canada" },                         // preschool games
  // Teamtailor (default <token>.teamtailor.com host)
  { name: "Starbreeze Entertainment", type: "teamtailor", token: "starbreeze", host: "starbreeze.teamtailor.com", city: "Stockholm, Sweden" }, // Payday
  { name: "Stillfront Group", type: "teamtailor", token: "stillfrontgroup", host: "stillfrontgroup.teamtailor.com", city: "Stockholm, Sweden" }, // mobile/strategy group
  { name: "SYBO Games", type: "teamtailor", token: "sybo", host: "sybo.teamtailor.com", city: "Copenhagen, Denmark" }, // Subway Surfers
  { name: "Sandbox Interactive", type: "teamtailor", token: "sandboxinteractive", host: "sandboxinteractive.teamtailor.com", city: "Berlin, Germany" }, // Albion Online
  { name: "Nanobit", type: "teamtailor", token: "nanobit", host: "nanobit.teamtailor.com", city: "Zagreb, Croatia" }, // narrative mobile (Stillfront)
  { name: "Goodgame Studios", type: "teamtailor", token: "goodgamestudios", host: "goodgamestudios.teamtailor.com", city: "Hamburg, Germany" }, // Empire: Four Kingdoms
  { name: "BULKHEAD", type: "teamtailor", token: "bulkheadinteractive", host: "bulkheadinteractive.teamtailor.com", city: "Derby, UK" }, // Battalion, co-dev
  // Recruitee
  { name: "CipSoft", type: "recruitee", token: "cipsoft", city: "Regensburg, Germany" },                     // Tibia
  { name: "Dovetail Games", type: "recruitee", token: "dovetailgames", city: "Chatham, UK" },                // Train Sim World, fishing sims
  { name: "Huuuge Games", type: "recruitee", token: "huuuge", city: "Warsaw, Poland" },                      // social casino mobile
  { name: "Lucid Games", type: "recruitee", token: "lucidgames", city: "Liverpool, UK" },                    // Destruction AllStars
  { name: "RocketWerkz", type: "recruitee", token: "rocketwerkz", city: "Auckland, New Zealand" },           // Dean Hall (DayZ) — Icarus, Stationeers
  { name: "Ten Square Games", type: "recruitee", token: "tensquaregames", city: "Wrocław, Poland" },         // Fishing Clash, Hunting Clash
  // BambooHR
  { name: "Beamdog", type: "bamboohr", token: "beamdog", city: "Edmonton, Canada" },                         // Baldur's Gate Enhanced Editions
  { name: "BetaDwarf", type: "bamboohr", token: "betadwarfaps", city: "Copenhagen, Denmark" },               // Minion Masters
  { name: "Blazing Griffin", type: "bamboohr", token: "blazinggriffin", city: "Glasgow, UK" },               // games + film/TV
  { name: "Fuse Games", type: "bamboohr", token: "fusegames", city: "Guildford, UK" },                       // ex-Criterion devs — BambooHR (promoted from Island 2026-06-28)
  { name: "Ember Lab", type: "bamboohr", token: "emberlab", city: "Orange County, CA" },                     // Kena: Bridge of Spirits
  { name: "Final Strike Games", type: "bamboohr", token: "finalstrikegames", city: "Bellevue, WA" },         // Gigantic / FOAMSTARS-adjacent
  { name: "GungHo Online Entertainment", type: "bamboohr", token: "gungho", city: "Tokyo, Japan" },          // Puzzle & Dragons
  { name: "Hyper Hippo", type: "bamboohr", token: "hyperhippoproductions", city: "Kelowna, Canada" },        // AdVenture Capitalist
  { name: "Hypixel Studios", type: "bamboohr", token: "hypixel", city: "Derry, UK" },                        // Hytale — Riot-owned
  { name: "IGG Canada", type: "bamboohr", token: "igg", city: "Vancouver, Canada" },                         // Lords Mobile
  { name: "Mundfish", type: "bamboohr", token: "mundfish", city: "Limassol, Cyprus" },                       // Atomic Heart
  { name: "Pixel Toys", type: "bamboohr", token: "pixeltoysltd", city: "Leamington Spa, UK" },               // Warhammer: Realms of Ruin, Knights & Dragons
  { name: "Red Barrels", type: "bamboohr", token: "redbarrels", city: "Montréal, Canada" },                  // Outlast
  { name: "Relic Entertainment", type: "bamboohr", token: "relicentertainment", city: "Vancouver, Canada" }, // Company of Heroes, Age of Empires IV — now independent
  { name: "Stardock", type: "bamboohr", token: "stardock", city: "Plymouth, MI" },                           // Galactic Civilizations, Sins of a Solar Empire
  { name: "Wolcen Studio", type: "bamboohr", token: "wolcenstudio", city: "Nice, France" },                  // Wolcen: Lords of Mayhem
  // Personio (added fetchPersonio 2026-06-26 — promoted from Island). search.json feed has no posted date.
  { name: "Com2uS", type: "personio", token: "gvc2u", city: "Seoul, South Korea" },                          // Summoners War (KR)
  { name: "KING Art", type: "personio", token: "king-art-gmbh", city: "Bremen, Germany" },                   // Iron Harvest, The Dwarves
  { name: "Travian Games", type: "personio", token: "traviangames", city: "Munich, Germany" },               // Travian
  // ---- July 2026 batch (user-submitted) ----
  { name: "Game District", type: "jazzhr", token: "gamedistrict", city: "Lahore, Pakistan" },                // Pakistani mobile game dev/publisher (JazzHR board, gamedistrict.applytojob.com)
  { name: "Ares Interactive", type: "rippling", token: "ares-interactive-careers", city: "San Francisco, CA" }, // The Walking Dead: Aftermath — game dev/publisher, SF + Berlin (Rippling ATS)
  { name: "Lightfox Games", type: "lightfox", token: "lightfox", city: "Seattle, WA" },                      // ex-King Seattle vets; mobile studio, Seattle + Vancouver (self-hosted /roles.json)
];

// ---- Studio type tags (Michelle's idea) ------------------------------------
// A studio's *type* almost never changes, so this is a one-time, fire-and-forget tag:
// the scraper bakes it into jobs.js and the site filters on it. We only list studios that
// are NOT a plain developer — anything absent here defaults to ["dev"] on the client.
// Tags: "publisher" (publishes games, often its own + others'), "codev" (co-development /
// porting / outsourcing services), "tech" (engine / platform / infrastructure). Multi-tag
// is fine (e.g. EA is dev + publisher). Keys match the studio name as it appears on jobs;
// owned dev studios (Naughty Dog, Massive…) stay developers by default — only the umbrella
// publisher names are tagged. To tag a new studio later, add one line here.
const STUDIO_KIND = {
  "Virtuos": ["codev"],
  "Take-Two Interactive": ["publisher"],
  "2K": ["publisher", "dev"],
  "Electronic Arts (HQ)": ["publisher", "dev"],
  "Activision (HQ)": ["publisher", "dev"],
  "ZeniMax / Bethesda": ["publisher", "dev"],
  "Ubisoft (HQ)": ["publisher", "dev"],
  "Sony Interactive (HQ)": ["publisher"],
  "Sega": ["publisher", "dev"],
  "Bandai Namco": ["publisher", "dev"],
  "Nintendo": ["publisher", "dev"],
  "NCSOFT": ["publisher", "dev"],
  "KRAFTON": ["publisher", "dev"],
  "PUBG Studios": ["dev"],
  "Nexon": ["publisher", "dev"],
  "Capcom": ["publisher", "dev"],
  "Gameloft": ["publisher", "dev"],
  "Paradox Interactive": ["publisher", "dev"],
  "Team17": ["publisher", "dev"],
  "Wizards of the Coast": ["publisher", "dev"],
  "Warner Bros. Games": ["publisher", "dev"],
  "Focus Entertainment": ["publisher", "dev"],
  "Raw Fury": ["publisher"],
  "Atari": ["publisher", "dev"],
  "The Pokémon Company": ["publisher"],
  "HoYoverse": ["publisher", "dev"],
  "Netflix Games": ["publisher", "tech"],
  "Don't Nod": ["publisher", "dev"],
  "Wargaming": ["publisher", "dev"],
  "Amazon Games": ["publisher", "dev", "tech"],
  // Tech / platform / engine
  "Unity": ["tech"],
  "Xsolla": ["tech", "publisher"],
  "Roblox": ["tech"],
  "Discord": ["tech"],
  "Epic Games": ["tech", "dev"],
  // Co-development / porting / outsourcing services
  "Keywords Studios": ["codev"],
  "d3t": ["codev"],
  "Aspyr Media": ["codev", "dev"],
  "Behaviour Interactive": ["codev", "dev"],
  "Snowed In Studios": ["codev"],
  "Cast Iron Games": ["codev"],
  "Daybreak Game Company": ["publisher", "dev"],
  "Voodoo": ["publisher", "dev"],
  "Homa Games": ["publisher", "dev"],
  "Tripledot Studios": ["publisher", "dev"],
};

// ---- Tech-stack tagging -----------------------------------------------------
// Pulls a compact skill list from each job's title + description so the site's search
// stops failing on skill terms (c#, unreal, python, houdini…). Word-boundary matched to
// avoid noise; high-signal engines/languages/tools only. Fire-and-forget — add a line to extend.
const TECH_VOCAB = [
  ["C++", /\bc\+\+/i],
  ["C#", /\bc#|\bc\s?sharp\b/i],
  ["Unreal", /\bunreal\b|\bue4\b|\bue5\b/i],
  ["Unity", /\bunity\b/i],
  ["Godot", /\bgodot\b/i],
  ["Frostbite", /\bfrostbite\b/i],
  // Proprietary / in-house and other engines — scoped tightly so common words ("source",
  // "stride", "anvil") only match in an explicit engine context. Improves engine coverage.
  ["CryEngine", /\bcryengine\b/i],
  ["Source 2", /\bsource\s?2\b|\bsource engine\b/i],
  ["id Tech", /\bid\s?tech\b/i],
  ["REDengine", /\bred\s?engine\b/i],
  ["RE Engine", /\bre engine\b/i],
  ["Decima", /\bdecima\b/i],
  ["Snowdrop", /\bsnowdrop\b/i],
  ["Anvil", /\banvil(next)?\b/i],
  ["Creation Engine", /\bcreation engine\b/i],
  ["Luminous", /\bluminous (engine|studio)\b/i],
  ["Cocos", /\bcocos\s?2?d?-?x?\b/i],
  ["GameMaker", /\bgamemaker\b/i],
  ["O3DE", /\bo3de\b|\blumberyard\b/i],
  ["PlayCanvas", /\bplaycanvas\b/i],
  ["Bevy", /\bbevy\b/i],
  ["Stride", /\bstride engine\b/i],
  ["Python", /\bpython\b/i],
  ["Lua", /\blua\b/i],
  ["Rust", /\brust\b/i],
  ["Golang", /\bgolang\b/i],
  ["Java", /\bjava\b(?!script)/i],
  ["JavaScript", /\bjavascript\b/i],
  ["TypeScript", /\btypescript\b/i],
  ["Kotlin", /\bkotlin\b/i],
  ["Swift", /\bswift\b/i],
  ["Objective-C", /\bobjective-?c\b/i],
  ["SQL", /\bsql\b/i],
  ["Kusto", /\bkusto\b/i],
  ["AWS", /\baws\b/i],
  ["Azure", /\bazure\b/i],
  ["GCP", /\bgcp\b|google cloud/i],
  ["Kubernetes", /\bkubernetes\b|\bk8s\b/i],
  ["Docker", /\bdocker\b/i],
  ["Perforce", /\bperforce\b|\bp4v?\b/i],
  ["Maya", /\bmaya\b/i],
  ["Houdini", /\bhoudini\b/i],
  ["Blender", /\bblender\b/i],
  ["ZBrush", /\bzbrush\b/i],
  ["Substance", /\bsubstance\b/i],
  ["3ds Max", /\b3ds ?max\b/i],
  ["Photoshop", /\bphotoshop\b/i],
  // --- Art / animation / VFX tools: artists care which software a role uses, just
  //     as engineers care about the language. Keeps the skill Trends meaningful for Art. ---
  ["Marmoset", /\bmarmoset\b/i],
  ["Marvelous Designer", /\bmarvelous designer\b/i],
  ["SpeedTree", /\bspeedtree\b/i],
  ["Quixel", /\bquixel\b|\bmegascans\b/i],
  ["Mudbox", /\bmudbox\b/i],
  ["Krita", /\bkrita\b/i],
  ["Procreate", /\bprocreate\b/i],
  ["Clip Studio", /\bclip studio\b/i],
  ["Spine", /\bspine ?2d\b|\bspine animation\b/i],   // require 2D/anim context so "spine of the team" never matches
  ["After Effects", /\bafter ?effects\b/i],
  ["Nuke", /\bnukex\b|\bnuke\b(?!\s+(?:the|it|that|this|everything|from|out)\b)/i],   // Foundry Nuke; skip the verb "nuke the cache"
  ["Toon Boom", /\btoon ?boom\b/i],
  ["MotionBuilder", /\bmotion ?builder\b/i],
  ["Cascadeur", /\bcascadeur\b/i],
  ["Shaders", /\bhlsl\b|\bglsl\b|\bshader/i],
  ["Wwise", /\bwwise\b/i],
  ["FMOD", /\bfmod\b/i],
  ["Havok", /\bhavok\b/i],
  // --- Specialisms people search for that we were returning ZERO results for. The board had the
  //     roles; nothing tagged them, so "xr" and "vr" were our two biggest empty searches (26 in the
  //     July export). Matched against the full description, so a role only needs to mention it. ---
  ["XR", /\bxr\b|\bextended reality\b|\bmixed reality\b|\bmr\/vr\b/i],
  ["VR", /\bvr\b|\bvirtual reality\b|\boculus\b|\bquest\s?[23]\b|\bopenxr\b/i],
  ["AR", /\bar\b(?=\s*(?:\/|,|\)|develop|experien|applicat))|\baugmented reality\b|\barkit\b|\barcore\b/i],
  ["Destruction", /\bdestruction\b|\bchaos (physics|destruction)\b|\bdestructib\w+/i],
  ["Netcode", /\bnetcode\b|\bnetworked? (gameplay|multiplayer)\b|\breplication\b|\blag compensation\b|\brollback\b/i],
  ["Multiplayer", /\bmultiplayer\b|\bmatchmaking\b|\bdedicated server\b/i],
  ["Procedural", /\bprocedural\b|\bpcg\b|\bproc-?gen\b/i],
  ["Live Ops", /\blive ?ops\b|\blive service\b|\bgames? as a service\b|\bgaas\b/i],
  ["Monetization", /\bmonetization\b|\bmonetisation\b|\bin-?app purchase\b|\biap\b/i],
  ["Accessibility", /\baccessibility\b|\ba11y\b|\bwcag\b/i],
  ["Localization", /\blocalization\b|\blocalisation\b|\bl10n\b|\bloc kit\b/i],
  ["Physics", /\bphysics (engine|simulation|programmer)\b|\brigid ?body\b|\bragdoll\b/i],
  ["Machine Learning", /\bmachine learning\b|\bdeep learning\b|\bpytorch\b|\btensorflow\b/i],
  ["Rigging", /\brigging\b|\brigger\b|\bskinning\b|\bcontrol rig\b/i],
  ["Lighting", /\blighting artist\b|\blightmap\b|\bglobal illumination\b|\blumen\b/i],
  ["Motion Capture", /\bmotion ?capture\b|\bmocap\b|\bperformance capture\b/i],
  ["Photogrammetry", /\bphotogrammetry\b|\bscan data\b/i],
  ["Technical Art", /\btechnical artist\b|\btech art\b|\bta\s*\/\s*td\b|\btechnical director\b/i],
  ["Outsourcing", /\boutsourc\w+\b|\bexternal development\b|\bexterna(l|is)ation\b|\bvendor management\b/i],
  ["UX Research", /\buser research\b|\bux research\b|\bplaytest\w*\b|\bgames? user research\b/i],
  ["Anti-Cheat", /\banti-?cheat\b|\bcheat detection\b/i],
  ["Console Cert", /\bcertification\b|\btrc\b|\btcr\b|\blotcheck\b|\bfirst ?party (submission|cert)\b/i],
];
function extractTech(text) {
  if (!text) return [];
  const out = [];
  for (const [tag, re] of TECH_VOCAB) if (re.test(text)) out.push(tag);
  return out;
}

// ---- per-job pages (Google for Jobs) ---------------------------------------
// One crawlable leaf page per job carrying JobPosting JSON-LD. Google is explicit that the markup
// must sit on the detail page ("don't add structured data to pages intended to present a list of
// jobs"), which is why the ~340 category pages can never qualify no matter how good they get.
//
// Everything here is GATED: a job is only published if we can supply every property Google requires
// AND show it on the page. Publishing a job with a missing/incomplete description or an unknown
// country is worse than not publishing it — "failure to take timely action on expired jobs may
// result in a manual action", and thin/incomplete postings are a stated policy violation. About half
// the board currently has a description, so expect roughly half of it to qualify; every future
// improvement to description coverage automatically publishes more pages with no change here.
const JOB_DIR = "job";                                    // /job/<id> — NOT /jobs, which is the category hub
const JOB_MIN_DESC = 220;                                 // below this a description isn't a description
let JOB_PAGE_IDS = new Set();                             // consulted by landingRoleRow for internal links
let JOB_PAGE_URLS = [];                                   // handed to the sitemap builder
const JOB_PAGE_URLS_EXTRA = [];                           // live jobs whose existing page we kept this run

// Country is required for any non-remote posting and our location strings are free text
// ("Ireland, Dublin", "El Segundo, CA", "ES - Barcelona, Spain"). Resolve conservatively; if we
// can't be sure, the job simply doesn't publish.
const CTRY = {
  "united states":"US","united states of america":"US","usa":"US","u.s.":"US","us":"US",
  "canada":"CA","united kingdom":"GB","uk":"GB","england":"GB","scotland":"GB","wales":"GB","northern ireland":"GB",
  "ireland":"IE","france":"FR","germany":"DE","spain":"ES","portugal":"PT","italy":"IT","netherlands":"NL",
  "belgium":"BE","sweden":"SE","norway":"NO","denmark":"DK","finland":"FI","iceland":"IS","poland":"PL",
  "czechia":"CZ","czech republic":"CZ","slovakia":"SK","austria":"AT","switzerland":"CH","romania":"RO",
  "bulgaria":"BG","hungary":"HU","ukraine":"UA","serbia":"RS","croatia":"HR","greece":"GR","turkey":"TR",
  "china":"CN","japan":"JP","south korea":"KR","korea":"KR","singapore":"SG","india":"IN","vietnam":"VN",
  "malaysia":"MY","philippines":"PH","thailand":"TH","indonesia":"ID","taiwan":"TW","hong kong":"HK",
  "australia":"AU","new zealand":"NZ","brazil":"BR","mexico":"MX","argentina":"AR","chile":"CL","colombia":"CO",
  "israel":"IL","united arab emirates":"AE","uae":"AE","saudi arabia":"SA","south africa":"ZA","egypt":"EG",
  "ghana":"GH","nigeria":"NG","kenya":"KE","morocco":"MA","tunisia":"TN",
  // Added after auditing every location string the board could not resolve. Cyprus alone accounted
  // for ~90 roles (Limassol/Nicosia are a real games hub now), and "viet nam"/"deutschland" are just
  // the same countries spelled the way those feeds spell them.
  // NB: no "georgia" key on purpose — it is ambiguous with the US state, and US_ST would claim it
  // first anyway. Tbilisi in HUB_CTRY is the unambiguous signal for the country.
  "cyprus":"CY","armenia":"AM","azerbaijan":"AZ","belarus":"BY","slovenia":"SI",
  "lithuania":"LT","latvia":"LV","estonia":"EE","malta":"MT","jordan":"JO","pakistan":"PK","bangladesh":"BD",
  "kazakhstan":"KZ","uzbekistan":"UZ","sri lanka":"LK","peru":"PE","uruguay":"UY","costa rica":"CR",
  "viet nam":"VN","deutschland":"DE","españa":"ES","brasil":"BR","méxico":"MX","polska":"PL","suomi":"FI",
};
// ISO-3166 alpha-2 for feeds that abbreviate. Anything colliding with a US state abbreviation is
// already caught above, so this only fires on unambiguous codes.
const ISO2 = new Set(("GH GB FR ES PT IT NL BE SE NO DK FI PL CZ SK AT CH RO BG HU UA RS HR GR TR CN JP KR SG "
  + "VN MY PH TH TW HK AU NZ BR MX CL IL AE ZA EG NG KE MA IE IS SA "
  // Matching the country additions above. AZ and MT are deliberately absent: they are Arizona and
  // Montana to US_ST, which is checked first, so listing them here would be dead code at best.
  + "CY AM BY GE SI LT LV EE JO PK BD KZ UZ LK PE UY CR").split(" "));
const US_ST = new Set(("al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny "
  + "nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc").split(" "));
// Big game-dev hubs, for strings that name only a city.
const HUB_CTRY = { london:"GB", brighton:"GB", guildford:"GB", leamington:"GB", manchester:"GB", edinburgh:"GB",
  dublin:"IE", stockholm:"SE", malmo:"SE", "malmö":"SE", helsinki:"FI", oslo:"NO", copenhagen:"DK",
  warsaw:"PL", krakow:"PL", "kraków":"PL", barcelona:"ES", madrid:"ES", lisbon:"PT", paris:"FR", lyon:"FR",
  montpellier:"FR", annecy:"FR", bordeaux:"FR", berlin:"DE", munich:"DE", hamburg:"DE", cologne:"DE",
  amsterdam:"NL", utrecht:"NL", brussels:"BE", zurich:"CH", vienna:"AT", prague:"CZ", budapest:"HU",
  bucharest:"RO", sofia:"BG", belgrade:"RS", montreal:"CA", "montréal":"CA", toronto:"CA", vancouver:"CA",
  // US hubs — feeds often give a metro with no state or country ("San Francisco Bay Area").
  "san francisco":"US", "san francisco bay area":"US", "los angeles":"US", seattle:"US", austin:"US",
  "new york":"US", "new york city":"US", "san diego":"US", boston:"US", chicago:"US", orlando:"US",
  raleigh:"US", irvine:"US", redmond:"US", bellevue:"US", "santa monica":"US", "culver city":"US",
  sunnyvale:"US", "san jose":"US", kirkland:"US", "salt lake city":"US", atlanta:"US", dallas:"US",
  quebec:"CA", ottawa:"CA", edmonton:"CA", tokyo:"JP", osaka:"JP", kyoto:"JP", seoul:"KR", shanghai:"CN",
  beijing:"CN", shenzhen:"CN", guangzhou:"CN", chengdu:"CN", singapore:"SG", bangalore:"IN", bengaluru:"IN",
  hyderabad:"IN", pune:"IN", gurugram:"IN", hanoi:"VN", "ho chi minh city":"VN", sydney:"AU", melbourne:"AU",
  brisbane:"AU", auckland:"NZ", "tel aviv":"IL", dubai:"AE", "sao paulo":"BR", "são paulo":"BR",
  // Cities the board was already listing roles in but could not place on a map. Each of these was
  // pulled from the actual unresolved-location audit, not guessed at: they are where the jobs are.
  limassol:"CY", nicosia:"CY", istanbul:"TR", "sarıyer":"TR", ankara:"TR", jakarta:"ID",
  "kuala lumpur":"MY", manila:"PH", bangkok:"TH", "ho chi minh":"VN", "da nang":"VN",
  "köln":"DE", koln:"DE", frankfurt:"DE", regensburg:"DE", aachen:"DE", stuttgart:"DE", dusseldorf:"DE",
  "düsseldorf":"DE", leipzig:"DE", dresden:"DE", mainz:"DE",
  herzliya:"IL", raanana:"IL", "ra'anana":"IL", jerusalem:"IL", haifa:"IL",
  minsk:"BY", baku:"AZ", yerevan:"AM", tbilisi:"GE", tblisi:"GE", ljubljana:"SI", amman:"JO",
  lahore:"PK", karachi:"PK", islamabad:"PK", vilnius:"LT", riga:"LV", tallinn:"EE",
  kyiv:"UA", kiev:"UA", kharkiv:"UA", lviv:"UA", odesa:"UA", wroclaw:"PL", "wrocław":"PL",
  poznan:"PL", "poznań":"PL", gdansk:"PL", "gdańsk":"PL", katowice:"PL", brno:"CZ",
  valencia:"ES", seville:"ES", malaga:"ES", "málaga":"ES", porto:"PT", braga:"PT",
  milan:"IT", rome:"IT", turin:"IT", bologna:"IT", cambridge:"GB", oxford:"GB", bristol:"GB",
  leeds:"GB", liverpool:"GB", birmingham:"GB", glasgow:"GB", newcastle:"GB", sheffield:"GB",
  nottingham:"GB", southampton:"GB", horsham:"GB", "royal leamington spa":"GB",
  gothenburg:"SE", "göteborg":"SE", uppsala:"SE", aarhus:"DK", tampere:"FI", espoo:"FI",
  reykjavik:"IS", "reykjavík":"IS", calgary:"CA", winnipeg:"CA", halifax:"CA",
  fukuoka:"JP", yokohama:"JP", sapporo:"JP", busan:"KR", "pangyo":"KR", taipei:"TW",
  hangzhou:"CN", "xi'an":"CN", wuhan:"CN", "hong kong":"HK", macau:"MO",
  "mexico city":"MX", "ciudad de mexico":"MX", guadalajara:"MX", monterrey:"MX",
  "buenos aires":"AR", bogota:"CO", "bogotá":"CO", santiago:"CL", lima:"PE", montevideo:"UY",
  "san jose, costa rica":"CR", cairo:"EG", "cape town":"ZA", johannesburg:"ZA", nairobi:"KE",
  lagos:"NG", accra:"GH", casablanca:"MA", tunis:"TN", perth:"AU", adelaide:"AU", wellington:"NZ",
  "abu dhabi":"AE", riyadh:"SA", almaty:"KZ", tashkent:"UZ", colombo:"LK", dhaka:"BD" };
// Words that describe HOW you work, not WHERE — they carry no geography and must not stop us reading
// the geography sitting next to them.
const LOC_NOISE = /\b(fully\s+)?remote(ly)?\b|\bwork from home\b|\bwfh\b|\banywhere\b|\bunlisted\b|\bmultiple locations\b|\b\d+\s+locations?\b|\bworldwide\b|\bhybrid\b|\bon[- ]?site\b|\bin[- ]?office\b|\bfull[- ]time\b|\bpart[- ]time\b|\bany\b/gi;
function resolveCountry(loc){
  const raw = String(loc || "").toLowerCase();
  // The old guard was `!t || /unlisted|multiple locations|remote/.test(t) && !/,/.test(t)`, which by
  // precedence means "contains a noise word AND has no comma -> give up". That threw away the country
  // in "Remote - US", "USA - Remote" and "United Kingdom-Remote" while "Remote, US" resolved fine —
  // the only difference being a comma. Strip the noise words instead, and give up only if what's left
  // has no geography in it at all.
  const t = raw.replace(LOC_NOISE, " ").replace(/\s+/g, " ").trim();
  if (!t.replace(/[(),;\/\-–—.]+/g, "").trim()) return "";
  const parts = t.split(/[,;\/]|\s-\s/)
    .map(x => x.replace(/^[\s\-–—(),;\/]+|[\s\-–—(),;\/]+$/g, "").trim())   // "- us" -> "us", "(remote)" leftovers -> ""
    .filter(Boolean);
  for (const p of parts) if (CTRY[p]) return CTRY[p];              // an exact segment is the strongest signal
  for (const p of parts) if (US_ST.has(p)) return "US";            // "El Segundo, CA"
  for (const p of parts) if (p.length === 2 && ISO2.has(p.toUpperCase())) return p.toUpperCase();
  for (const k in CTRY) if (new RegExp("\\b" + k.replace(/[.]/g, "\\.") + "\\b").test(t)) return CTRY[k];
  for (const p of parts) if (HUB_CTRY[p]) return HUB_CTRY[p];
  for (const k in HUB_CTRY) if (new RegExp("\\b" + k + "\\b").test(t)) return HUB_CTRY[k];
  return "";
}
function jobCity(loc){
  const parts = String(loc || "").split(/[,;]/).map(x => x.trim()).filter(Boolean);
  for (const p of parts){
    const low = p.toLowerCase();
    if (CTRY[low] || US_ST.has(low) || /^[a-z]{2}$/i.test(p)) continue;
    return p.replace(/^[A-Z]{2}\s*-\s*/, "").trim();               // "ES - Barcelona" -> "Barcelona"
  }
  return "";
}
// baseSalary from our pretty "$146K–$210K" form. Only emitted when unambiguous.
function jobSalaryLd(sal){
  if (!sal) return null;
  const cur = /£/.test(sal) ? "GBP" : /€/.test(sal) ? "EUR" : /\$/.test(sal) ? "USD" : null;
  if (!cur) return null;
  const nums = String(sal).replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*[kK]?/g) || [];
  const vals = nums.map(t => { const m = t.match(/(\d+(?:\.\d+)?)\s*([kK])?/); if (!m) return null;
    let n = parseFloat(m[1]); if (m[2]) n *= 1000; return n >= 1000 ? n : null; }).filter(Boolean);
  if (!vals.length) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return { "@type":"MonetaryAmount", currency: cur,
    value: { "@type":"QuantitativeValue", minValue: lo, maxValue: hi, unitText: "YEAR" } };
}
// employmentType: only when we actually know. Guessing FULL_TIME for everything would mislabel every
// contract and internship on the board, and wrong markup is worse than an omitted optional property.
const EMP_MAP = { "full-time":"FULL_TIME", "full time":"FULL_TIME", "fulltime":"FULL_TIME",
  "part-time":"PART_TIME", "part time":"PART_TIME", "contract":"CONTRACTOR", "contractor":"CONTRACTOR",
  "freelance":"CONTRACTOR", "temporary":"TEMPORARY", "temp":"TEMPORARY", "intern":"INTERN",
  "internship":"INTERN", "apprenticeship":"INTERN", "volunteer":"VOLUNTEER", "per diem":"PER_DIEM" };
function jobEmploymentType(j){
  const ex = String(j.empType || "").trim().toLowerCase();
  if (ex && EMP_MAP[ex]) return EMP_MAP[ex];                       // the source told us plainly
  const t = String(j.title || "");
  if (/\bintern(ship)?\b/i.test(t) && !/\binternal\b/i.test(t)) return "INTERN";
  if (/\bapprentice(ship)?\b/i.test(t)) return "INTERN";
  if (/\bcontract(or)?\b|\bfixed[- ]term\b|\b\d+[- ]month(s)?\b|\bftc\b/i.test(t)) return "CONTRACTOR";
  if (/\bpart[- ]time\b/i.test(t)) return "PART_TIME";
  if (/\btemp(orary)?\b/i.test(t)) return "TEMPORARY";
  return "";                                                       // unknown -> omit the property
}
// validThrough: only a real, future date. A past one tells Google the job is already expired, so a
// bad value here is actively harmful — worse than leaving it out and relying on the page 404ing.
function jobValidThrough(j){
  if (!j.deadline) return "";
  const t = Date.parse(j.deadline);
  if (isNaN(t) || t <= Date.now()) return "";
  return new Date(t).toISOString();
}
// ---- Where may the applicant actually be? ------------------------------------------------------
// Google treats a TELECOMMUTE posting with no applicantLocationRequirements as a CRITICAL error, and
// critical means the page does not appear in Search at all. ~250 of our pages were in that state:
// roles whose location string is just "Remote" or "Anywhere", which names no geography to inherit.
// Rather than invent one, fall back to where that studio's OTHER roles actually are — evidence from
// the same feed. Only used when one country holds a clear majority of the studio's located roles;
// below that bar we would be guessing, and a wrong country is worse than no page.
const STUDIO_CC = new Map();
function buildStudioCountries(all){
  STUDIO_CC.clear();
  const tally = new Map();
  for (const j of all){
    const nm = j.studio || j.parent; if (!nm) continue;
    const cc = resolveCountry(j.location); if (!cc) continue;
    if (!tally.has(nm)) tally.set(nm, new Map());
    const t = tally.get(nm); t.set(cc, (t.get(cc) || 0) + 1);
  }
  for (const [nm, t] of tally){
    let total = 0, best = "", bestN = 0;
    for (const [cc, n] of t){ total += n; if (n > bestN){ bestN = n; best = cc; } }
    if (total >= 2 && bestN / total >= 0.6) STUDIO_CC.set(nm, best);
  }
}
// The country we are willing to publish for a job: what its own location says, else its studio's.
function jobApplicantCountry(j){
  return resolveCountry(j.location) || STUDIO_CC.get(j.studio || j.parent) || "";
}
// addressRegion — the state/province half of a US or Canadian address. We never get streetAddress or
// postalCode from an ATS feed, so those two stay absent by necessity, but the region is sitting right
// there in "Los Angeles, CA" and Google asks for it.
const CA_PROV = new Set("ab bc mb nb nl ns nt nu on pe qc sk yt".split(" "));
function jobAddressRegion(loc, cc){
  if (cc !== "US" && cc !== "CA") return "";
  for (const p of String(loc || "").split(/[,;]/).map(x => x.trim())){
    const low = p.toLowerCase();
    if (cc === "US" && US_ST.has(low)) return p.toUpperCase();
    if (cc === "CA" && CA_PROV.has(low)) return p.toUpperCase();
  }
  return "";
}
// Every gate, in one place, so the reasons can be counted and reported.
function jobPageCheck(j){
  if (!j.id || !j.title || !j.studio) return "missing core fields";
  const d = typeof j.desc === "string" ? j.desc.trim() : "";
  if (d.length < JOB_MIN_DESC) return "no description";
  if (isPool(j.title)) return "talent pool / speculative";
  const posted = j.postedAt || j.firstSeen;                        // datePosted is REQUIRED; firstSeen is our own honest fallback
  if (!posted || isNaN(Date.parse(posted))) return "no datePosted";
  const remote = j.workType === "Remote";
  if (!remote && !resolveCountry(j.location)) return "country not resolvable";
  // A remote job needs no jobLocation — jobLocationType TELECOMMUTE covers it — but it DOES need
  // applicantLocationRequirements, without which Google drops the page from Search entirely. If
  // neither the job nor its studio can tell us a country, publishing the page buys nothing.
  if (remote && !jobApplicantCountry(j)) return "remote, applicant country unknown";
  return "";
}
function renderJobPage(j){
  const posted = new Date(j.postedAt || j.firstSeen).toISOString();
  const cc = resolveCountry(j.location);
  const city = jobCity(j.location);
  const remote = j.workType === "Remote";
  const desc = j.desc.trim();
  const descHtml = desc.split(/(?:\r?\n){1,}|(?<=\.)\s{2,}/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${escHtml(p)}</p>`).join("\n");
  const url = `https://devquest.gg/${JOB_DIR}/${encodeURIComponent(j.id)}`;
  const ld = { "@context":"https://schema.org/", "@type":"JobPosting",
    title: String(j.title).split("|")[0].trim(),
    description: descHtml,                                          // Google wants HTML; this is what's on the page
    datePosted: posted,
    identifier: { "@type":"PropertyValue", name: String(j.studio), value: String(j.id) },
    hiringOrganization: { "@type":"Organization", name: String(j.studio) },
    directApply: false,                                             // we hand off to the studio's own ATS
  };
  if (remote){
    ld.jobLocationType = "TELECOMMUTE";
    // Falls back to the studio's country when the role's own string is a bare "Remote". jobPageCheck
    // guarantees this is non-empty, so the critical missing-field error cannot recur.
    // (j.region is "Europe" / "North America", which is NOT a valid Country name — never use it.)
    ld.applicantLocationRequirements = { "@type":"Country", name: jobApplicantCountry(j) };
  }
  if (cc) {
    const region = jobAddressRegion(j.location, cc);
    ld.jobLocation = { "@type":"Place", address: Object.assign(
      { "@type":"PostalAddress", addressCountry: cc },
      city ? { addressLocality: city } : {},
      region ? { addressRegion: region } : {}) };
    // streetAddress and postalCode are intentionally absent: no ATS feed we read publishes them, and
    // Google would rather have three accurate address fields than five with two invented.
  }
  const sal = jobSalaryLd(j.salary); if (sal) ld.baseSalary = sal;
  // Google flags a missing employmentType. Our inference already picks out intern / contract /
  // part-time / temporary from the title and the feed; anything with none of those markers is a
  // standard permanent role, which is what FULL_TIME means. That is a read of the data, not a guess.
  const emp = jobEmploymentType(j) || "FULL_TIME";     // NB: also rendered as a tag in the page body below
  ld.employmentType = emp;
  const vt = jobValidThrough(j); if (vt) ld.validThrough = vt;
  const cat = (j.discipline && j.discipline !== "Other") ? `<a href="/${slugify("game " + j.discipline)}-jobs">${escHtml(j.discipline)} jobs</a>` : "";
  const studioPage = `/${slugify(j.parent || j.studio)}-jobs`;
  const metaDesc = `${String(j.title).split("|")[0].trim()} at ${j.studio}${city ? " in " + city : ""}. ${desc.slice(0, 150).replace(/\s+\S*$/, "")}…`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(String(j.title).split("|")[0].trim())} · ${escHtml(j.studio)} · DevQuest</title>
<meta name="description" content="${escHtml(metaDesc)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:title" content="${escHtml(String(j.title).split("|")[0].trim())} · ${escHtml(j.studio)}">
<meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<script type="application/ld+json">
${JSON.stringify(ld)}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"DevQuest","item":"https://devquest.gg/"},{"@type":"ListItem","position":2,"name":"Jobs","item":"https://devquest.gg/jobs"},{"@type":"ListItem","position":3,"name":${JSON.stringify(String(j.studio))},"item":"https://devquest.gg${studioPage}"}]}
</script>
<style>
  :root{--bg:#0a0d14;--panel:#11161f;--border:#232a35;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--gold:#e0b23a}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6}
  header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 22px;border-bottom:1px solid var(--border)}
  .logo{display:flex;align-items:center;gap:8px;color:var(--text);text-decoration:none;font-weight:800}
  .logo span span{color:var(--accent)} .logo .tld{color:var(--gold)}
  .wrap{max-width:820px;margin:0 auto;padding:26px 22px 60px}
  .crumbs{font-size:13px;color:var(--muted);margin-bottom:14px}
  .crumbs a{color:var(--muted)}
  h1{font-size:27px;line-height:1.25;margin:0 0 8px}
  .sub{color:var(--muted);font-size:15px;margin:0 0 14px}
  .tags{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 20px}
  .tag{font-size:12px;font-weight:700;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:4px 11px}
  .tag.sal{color:var(--gold);border-color:rgba(224,178,58,.4)}
  .tag.remote{color:#4ad38b;border-color:rgba(74,211,139,.4)}
  .apply{display:inline-block;font-weight:800;border-radius:10px;padding:12px 22px;background:linear-gradient(135deg,#7cc0ff,#58a6ff);color:#04121f;text-decoration:none}
  .desc{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin:22px 0}
  .desc p{margin:0 0 12px;color:#c9d1d9;font-size:15px}
  .note{color:var(--muted);font-size:13px;margin-top:18px}
  .more{margin-top:26px;padding-top:18px;border-top:1px solid var(--border)}
  .more a{color:var(--accent)}
  footer{border-top:1px solid var(--border);padding:20px 22px;text-align:center;color:var(--muted);font-size:13px}
  footer a{color:var(--muted)}
</style>
</head>
<body>
<header>
  <a class="logo" href="/"><span>Dev<span>Quest</span></span><span class="tld">.gg</span></a>
  <a class="apply" href="${escHtml(j.url || "/")}" target="_blank" rel="noopener nofollow">Apply on ${escHtml(j.studio)}&rsquo;s site →</a>
</header>
<div class="wrap">
  <nav class="crumbs"><a href="/">DevQuest</a> › <a href="/jobs">Jobs</a> › <a href="${studioPage}">${escHtml(j.studio)}</a></nav>
  <h1>${escHtml(String(j.title).split("|")[0].trim())}</h1>
  <p class="sub">${escHtml(j.studio)}${city ? " · " + escHtml(city) : ""}${remote ? " · Remote" : ""}</p>
  <div class="tags">
    ${j.seniority ? `<span class="tag">${escHtml(j.seniority)}</span>` : ""}
    ${j.discipline ? `<span class="tag">${escHtml(j.discipline)}</span>` : ""}
    ${remote ? `<span class="tag remote">Remote</span>` : (j.workType && j.workType !== "Unknown" ? `<span class="tag">${escHtml(j.workType)}</span>` : "")}
    ${j.salary ? `<span class="tag sal">${escHtml(j.salary)}</span>` : ""}
    <span class="tag">Posted ${escHtml(posted.slice(0, 10))}</span>
    ${emp ? `<span class="tag">${escHtml(emp.replace("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase()))}</span>` : ""}
    ${vt ? `<span class="tag">Apply by ${escHtml(vt.slice(0, 10))}</span>` : ""}
  </div>
  <a class="apply" href="${escHtml(j.url || "/")}" target="_blank" rel="noopener nofollow">Apply on ${escHtml(j.studio)}&rsquo;s site →</a>
  <div class="desc">
${descHtml}
  </div>
  <p class="note">Posted by ${escHtml(j.studio)} and synced from their own careers page. DevQuest doesn&rsquo;t take a fee, doesn&rsquo;t sit between you and the studio, and doesn&rsquo;t sell your data — you apply directly with them.</p>
  <div class="more">
    <p>More like this: ${cat ? cat + " · " : ""}<a href="${studioPage}">All ${escHtml(j.studio)} openings</a> · <a href="/jobs">Browse every category</a></p>
  </div>
</div>
<footer>DevQuest.gg · <a href="/">Browse all jobs</a> · <a href="/jobs">All categories</a> · <a href="/about">Our mission</a></footer>
</body>
</html>
`;
}
function writeJobPages(all, root){
  const dir = path.join(root, JOB_DIR);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  const reasons = {};
  const wanted = new Map();
  buildStudioCountries(all);        // must precede jobPageCheck — the remote gate consults it
  JOB_PAGE_URLS_EXTRA.length = 0;
  for (const j of all){
    const why = jobPageCheck(j);
    if (why){ reasons[why] = (reasons[why] || 0) + 1; continue; }
    wanted.set(String(j.id), j);
  }
  let written = 0, unchanged = 0;
  for (const [id, j] of wanted){
    const file = path.join(dir, id + ".html");
    const body = renderJobPage(j);
    let prev = null; try { prev = fs.readFileSync(file, "utf8"); } catch (e) {}
    if (prev === body){ unchanged++; continue; }
    try { fs.writeFileSync(file, body); written++; } catch (e){ console.error(`job page ${id}: ${e.message}`); }
  }
  // Expiry. Google: "Jobs that are no longer open for applications must be expired… failure to take
  // timely action on expired jobs may result in a manual action." Deleting the file makes it 404,
  // which is one of the three remedies Google accepts, and it happens the same hour the job vanishes.
  let removed = 0, kept = 0;
  const liveIds = new Set(all.map(j => String(j.id)));
  try {
    for (const f of fs.readdirSync(dir)){
      if (!f.endsWith(".html")) continue;
      const id = f.slice(0, -5);
      if (wanted.has(id)) continue;
      // Expire ONLY when the job has actually left the board. A live job that merely failed a gate
      // this run (usually: its description wasn't re-fetched, since detail fetches are budgeted and
      // cached) keeps the page it already has — otherwise pages would flap in and out every hour.
      if (liveIds.has(id)){ kept++; JOB_PAGE_URLS_EXTRA.push(`https://devquest.gg/${JOB_DIR}/${encodeURIComponent(id)}`); continue; }
      try { fs.unlinkSync(path.join(dir, f)); removed++; } catch (e) {}
    }
  } catch (e) {}
  JOB_PAGE_IDS = new Set(wanted.keys());
  JOB_PAGE_URLS = [...wanted.keys()].map(id => `https://devquest.gg/${JOB_DIR}/${encodeURIComponent(id)}`).concat(JOB_PAGE_URLS_EXTRA);
  JOB_PAGE_URLS_EXTRA.forEach(u => JOB_PAGE_IDS.add(decodeURIComponent(u.split("/").pop())));
  const skipped = Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(", ");
  console.log(`Job pages: ${wanted.size}/${all.length} eligible -> ${written} written, ${unchanged} unchanged, ${removed} expired`);
  if (skipped) console.log(`  skipped — ${skipped}`);
  return JOB_PAGE_URLS;
}

// ---- job descriptions ------------------------------------------------------
// Descriptions are by far the biggest thing we scrape (~3-4 KB each, ~20 MB across the board) and
// they must NEVER reach jobs.js — that file loads on every page view and mobile is already half our
// traffic. So they are split off here into 256 content-addressed shards under data/jobs/:
//   * the board payload is completely unchanged,
//   * a job detail view can lazy-load one ~80 KB shard instead of everything,
//   * the hourly commit only touches shards whose contents actually changed, so git stays sane,
//   * and they are the source a per-job page (Google for Jobs) would be generated from later.
// Rewriting each shard in full from the current run also prunes descriptions of dead jobs for free.
const DESC_SHARDS = 256;
// We commit an EXCERPT, not the whole posting. Full descriptions are ~3-4 KB each (~21 MB across the
// board); committing that hourly would add hundreds of MB to the repo per month even after git's own
// compression. An excerpt is all the board needs to show a real preview instead of bouncing someone
// to the ATS — and anything that needs the FULL text (per-job pages for Google for Jobs) can be
// generated during the same scrape run, while the complete description is still in memory. So the
// full text never has to be stored at all.
const DESC_MAX = 1500;
function descBucket(id){                                  // FNV-1a, same scheme the credits site uses
  let h = 2166136261 >>> 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % DESC_SHARDS;
}
// Trim to DESC_MAX, then back off to the last sentence end so a preview never stops mid-word.
function descExcerpt(d){
  if (d.length <= DESC_MAX) return d;
  const cut = d.slice(0, DESC_MAX);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (stop > DESC_MAX * 0.6 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, "")) + " …";
}
function writeDescriptionShards(all, dir){
  const shards = new Map();
  let kept = 0;
  for (const j of all){
    const d = typeof j.desc === "string" ? j.desc.replace(/\s+/g, " ").trim() : "";
    delete j.desc;                                        // off the record before jobs.js is serialised
    if (!d || !j.id) continue;
    const b = descBucket(j.id);
    if (!shards.has(b)) shards.set(b, {});
    shards.get(b)[j.id] = descExcerpt(d);
    kept++;
  }
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  let written = 0, unchanged = 0;
  for (let b = 0; b < DESC_SHARDS; b++){
    const file = path.join(dir, b + ".json");
    const body = JSON.stringify(shards.get(b) || {});
    let prev = null;
    try { prev = fs.readFileSync(file, "utf8"); } catch (e) {}
    if (prev === body){ unchanged++; continue; }           // don't churn git for an unchanged shard
    try { fs.writeFileSync(file, body); written++; }
    catch (e){ console.error(`desc shard ${b}: ${e.message}`); }
  }
  const bytes = [...shards.values()].reduce((n, o) => n + JSON.stringify(o).length, 0);
  console.log(`Descriptions: ${kept}/${all.length} jobs (${(bytes / 1048576).toFixed(1)} MB) -> ${written} shard(s) rewritten, ${unchanged} unchanged`);
  return kept;
}

// ---- SEO landing pages -----------------------------------------------------
// Static category "doorway" pages, regenerated from the live data every run, so a Google search
// for e.g. "remote game programming jobs" lands on a relevant, current page that funnels into the
// main board. Existing visitors never see these — they're entry points from search. Fire-and-forget.
function escHtml(s){ return String(s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }
const LANDING_PAGES = [
  { slug:"remote-game-programming-jobs", h1:"Remote Game Programming Jobs", noun:"remote programming and engineering", disc:"Engineering", remote:true },
  { slug:"game-programming-jobs",        h1:"Game Programming Jobs",        noun:"programming and engineering",        disc:"Engineering" },
  { slug:"game-design-jobs",             h1:"Game Design Jobs",             noun:"game design",                        disc:"Design" },
  { slug:"game-art-jobs",                h1:"Game Art Jobs",                noun:"game art",                           disc:"Art" },
  { slug:"game-animation-jobs",          h1:"Game Animation Jobs",          noun:"animation and rigging",              disc:"Animation" },
  { slug:"game-audio-jobs",              h1:"Game Audio Jobs",              noun:"audio and sound design",             disc:"Audio" },
  { slug:"game-production-jobs",         h1:"Game Production Jobs",         noun:"production and project-management",   disc:"Production" },
  { slug:"game-qa-tester-jobs",          h1:"Game QA & Tester Jobs",        noun:"QA and testing",                     disc:"QA" },
  { slug:"remote-game-jobs",             h1:"Remote Game Dev Jobs",         noun:"remote game-dev",                    remote:true },
  { slug:"entry-level-game-jobs",        h1:"Entry-Level Game Dev Jobs",    noun:"entry-level and junior",             sen:"Entry" },
];

// URL-safe slug. "C++"→"c-plus-plus", "Insomniac Games"→"insomniac-games".
function slugify(s){
  return String(s||"").toLowerCase()
    .replace(/\+/g, "-plus").replace(/&/g, "-and-")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
}

// Curated skill/engine/tool pages — one per high-intent search term ("unreal engine jobs",
// "maya jobs games"). Only emitted when enough live roles carry the tag (see skillPageSpecs).
const SKILL_PAGES = [
  { tag:"Unreal",    slug:"unreal-engine-jobs",    h1:"Unreal Engine Jobs",       noun:"Unreal Engine" },
  { tag:"Unity",     slug:"unity-developer-jobs",  h1:"Unity Developer Jobs",     noun:"Unity" },
  { tag:"C++",       slug:"cpp-game-jobs",         h1:"C++ Game Programming Jobs", noun:"C++" },
  { tag:"C#",        slug:"csharp-game-jobs",      h1:"C# Game Programming Jobs",  noun:"C#" },
  { tag:"Python",    slug:"python-game-jobs",      h1:"Python Game Dev Jobs",     noun:"Python" },
  { tag:"Maya",      slug:"maya-game-jobs",        h1:"Maya Jobs in Games",       noun:"Maya" },
  { tag:"ZBrush",    slug:"zbrush-game-jobs",      h1:"ZBrush Jobs in Games",     noun:"ZBrush" },
  { tag:"Houdini",   slug:"houdini-game-jobs",     h1:"Houdini Jobs in Games",    noun:"Houdini" },
  { tag:"Blender",   slug:"blender-game-jobs",     h1:"Blender Jobs in Games",    noun:"Blender" },
  { tag:"Substance", slug:"substance-painter-jobs",h1:"Substance Painter Jobs",   noun:"Substance" },
  { tag:"Spine",     slug:"spine-animation-jobs",  h1:"Spine 2D Animation Jobs",  noun:"Spine 2D" },
  { tag:"Wwise",     slug:"wwise-audio-jobs",      h1:"Wwise Audio Jobs",         noun:"Wwise" },
  { tag:"FMOD",      slug:"fmod-audio-jobs",       h1:"FMOD Audio Jobs",          noun:"FMOD" },
];

// Evergreen "talent pool" / speculative reqs aren't real openings — keep them off the SEO pages.
function isPool(title){
  return /\b(talent\s+)?(pool|pipeline)\b|general application|open applications?\b|open\s+(?:[\w\/&-]+\s+){1,3}applications?(?=\s*$|\s*[\(\[\-–|\/])|candidature\s+(?:libre|ouverte|spontan)|speculative|expression of interest|future opportunit|don'?t see (a|your)/i.test(title || "");
}
// Each job's discipline is already normalized to the canonical label set by mapDiscipline()
// at scrape time, so this is an identity-safe pass-through (kept as a seam for future synonyms).
function normDisc(d){ return d || ""; }

function landingMatches(cfg, jobs){
  const seen = new Set(), out = [];
  for (const j of jobs){
    if (isPool(j.title)) continue;
    if (cfg.match) { if (!cfg.match(j)) continue; }    // spec-driven pages (studio / skill / combo)
    else {                                             // legacy field-driven discipline pages
      if (cfg.disc && normDisc(j.discipline) !== cfg.disc) continue;
      if (cfg.remote && j.workType !== "Remote") continue;
      if (cfg.sen && j.seniority !== cfg.sen) continue;
    }
    const k = (j.studio||"") + "|" + (j.title||"");
    if (seen.has(k)) continue; seen.add(k);
    out.push(j);
  }
  return out;
}

function landingRoleRow(j){
  const sen = j.seniority ? `<span class="tag">${escHtml(j.seniority)}</span>` : "";
  const sal = j.salary ? `<span class="tag sal">${escHtml(j.salary)}</span>` : "";
  const rem = j.workType === "Remote" ? `<span class="tag remote">Remote</span>`
    : (j.workType && j.workType !== "Unknown" ? `<span class="tag">${escHtml(j.workType)}</span>` : "");
  const days = j.firstSeen ? Math.max(0, Math.round((Date.now() - Date.parse(j.firstSeen)) / 864e5)) : null;
  const age = days == null ? "" : `<span class="tag age">${days<=0?"new today":days===1?"1 day ago":days+" days ago"}</span>`;
  const loc = j.workType === "Remote" ? "Remote" : escHtml((j.location || "").split(",")[0]);
  // Link to our own job page when we published one: it gives every job page an internal link from
  // a category page (otherwise they'd be discoverable only via the sitemap, which is how the whole
  // category cluster ended up orphaned in the first place). Otherwise link straight out, as before.
  const own = JOB_PAGE_IDS.has(String(j.id));
  const href = own ? `/${JOB_DIR}/${encodeURIComponent(j.id)}` : (j.url || "https://devquest.gg");
  const tgt = own ? "" : ` target="_blank" rel="noopener"`;
  return `    <a class="role" href="${escHtml(href)}"${tgt}>
      <div class="rt">${escHtml((j.title||"").split("|")[0].trim())}</div>
      <div class="rs">${escHtml(j.studio)}${loc?" · "+loc:""}</div>
      <div class="tags">${rem}${sen}${sal}${age}</div>
    </a>`;
}

// ---- per-page market data --------------------------------------------------
// These pages used to be one template with a swapped noun and a swapped list: ~400 words of prose
// byte-identical across all ~340 of them. That is the doorway/thin-content pattern Google demotes,
// and it is why they were indexed but earning almost no search traffic. Everything below is computed
// from THIS page's own slice of the board, so each page carries facts no other page (and no
// competitor) has. No new scraping — it is all already in the job records.
function _pct(n, d){ return d ? Math.round((n / d) * 100) : 0; }
function _tally(rows, key){
  const m = new Map();
  for (const r of rows){ const v = r && r[key]; if (!v || v === "Unknown") continue; m.set(v, (m.get(v) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
// "$146K–$210K" / "$80,000 - $90,000" → [min, max] in whole dollars.
function _parseSalary(s){
  if (!s) return null;
  const nums = String(s).replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)\s*([kK])?/g);
  if (!nums || nums.length < 1) return null;
  const vals = nums.map(t => {
    const m = t.match(/(\d+(?:\.\d+)?)\s*([kK])?/); if (!m) return null;
    let n = parseFloat(m[1]); if (m[2]) n *= 1000;
    return n >= 1000 ? n : null;                       // ignore stray small numbers
  }).filter(Boolean);
  if (!vals.length) return null;
  return [Math.min(...vals), Math.max(...vals)];
}
function _median(a){ if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); const i = b.length >> 1;
  return b.length % 2 ? b[i] : Math.round((b[i - 1] + b[i]) / 2); }
function _usd(n){ return "$" + Math.round(n / 1000) + "K"; }

function sliceStats(rows){
  const total = rows.length;
  const sal = rows.map(r => _parseSalary(r.salary)).filter(Boolean);
  const days = rows.map(r => Number(r.daysListed)).filter(n => Number.isFinite(n));
  const fresh = rows.filter(r => Number(r.daysListed) <= 7).length;
  const work = _tally(rows, "workType");
  const workKnown = work.reduce((a, b) => a + b[1], 0);
  const tech = new Map();
  for (const r of rows) if (Array.isArray(r.tech)) for (const t of r.tech) tech.set(t, (tech.get(t) || 0) + 1);
  const SEN = ["Entry", "Mid", "Senior", "Lead", "Director+"];
  const senTally = _tally(rows, "seniority");
  const senMap = new Map(senTally);
  return {
    total,
    studios:   _tally(rows, "studio").slice(0, 8),
    disciplines: _tally(rows, "discipline").slice(0, 8),
    locations: _tally(rows, "location").slice(0, 6),
    regions:   _tally(rows, "region").slice(0, 5),
    seniority: SEN.map(k => [k, senMap.get(k) || 0]).filter(x => x[1]),
    topSeniority: senTally[0] || null,
    payCount: sal.length,
    payPct: _pct(sal.length, total),
    payLow:  sal.length >= 5 ? _median(sal.map(x => x[0])) : null,
    payHigh: sal.length >= 5 ? _median(sal.map(x => x[1])) : null,
    fresh, freshPct: _pct(fresh, total),
    medianDays: _median(days),
    remotePct: workKnown ? _pct((work.find(w => w[0] === "Remote") || [0, 0])[1], workKnown) : null,
    workKnown,
    tech: [...tech.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
}

// A sentence of real analysis, different on every page, built from that page's own numbers.
function sliceLede(cfg, st){
  if (!st.total) return "";
  const bits = [];
  if (st.topSeniority) bits.push(`hiring skews <strong>${escHtml(st.topSeniority[0])}</strong> (${_pct(st.topSeniority[1], st.total)}% of open ${escHtml(cfg.noun)} roles)`);
  if (cfg.kind === "studio"){
    if (st.disciplines.length) bits.push(`the biggest team they're growing is <strong>${escHtml(st.disciplines[0][0])}</strong> (${st.disciplines[0][1]} open)`);
  } else if (st.studios.length) bits.push(`<strong>${escHtml(st.studios[0][0])}</strong> has the most live openings (${st.studios[0][1]})`);
  if (st.payPct) bits.push(`${st.payPct}% publish a salary range`);
  else bits.push(`almost none publish a salary range`);
  if (st.freshPct) bits.push(`${st.freshPct}% were posted in the last week`);
  return bits.length ? `<p class="analysis">Right now, ${bits.join(", ")}.</p>` : "";
}

function renderMarketBlock(cfg, st){
  if (!st.total) return "";
  const bar = st.seniority.map(([k, n]) =>
    `<div class="mrow"><span class="mk">${escHtml(k)}</span><span class="mbar"><i style="width:${Math.max(2, _pct(n, st.total))}%"></i></span><span class="mv">${n} · ${_pct(n, st.total)}%</span></div>`).join("");
  const studioList = st.studios.map(([k, n]) =>
    `<li><a href="/${slugify(k)}-jobs">${escHtml(k)}</a> <span class="mv">${n}</span></li>`).join("");
  const locList = st.locations.map(([k, n]) => `<li>${escHtml(k)} <span class="mv">${n}</span></li>`).join("");
  const techList = st.tech.length
    ? `<div class="mcard"><h3>Tools &amp; engines asked for</h3><ul class="mlist">${st.tech.map(([k, n]) => `<li>${escHtml(k)} <span class="mv">${n}</span></li>`).join("")}</ul></div>` : "";
  const pay = st.payLow
    ? `<p><strong>${st.payCount}</strong> of these roles publish a range (${st.payPct}%). Median advertised band: <strong>${_usd(st.payLow)}–${_usd(st.payHigh)}</strong>.</p>`
    : `<p>Only <strong>${st.payCount}</strong> of these ${st.total} roles publish a salary range (${st.payPct}%). We never invent one — if a studio doesn't say, we leave it blank.</p>`;
  const remote = st.remotePct != null && st.workKnown >= 10
    ? `<p><strong>${st.remotePct}%</strong> of the roles that state a work model are fully remote${st.remotePct < 15 ? " — this is a mostly on-site corner of the industry." : "."}</p>` : "";
  return `
  <section class="market">
    <h2>${cfg.kind === "studio" ? `Hiring at ${escHtml(cfg.breadcrumb || cfg.noun)} right now` : `The ${escHtml(cfg.noun)} market right now`}</h2>
    <p class="msub">Computed from the ${st.total} live role${st.total === 1 ? "" : "s"} on this page, refreshed hourly.</p>
    <div class="mgrid">
      <div class="mcard">
        <h3>Seniority mix</h3>
        ${bar}
      </div>
      ${cfg.kind === "studio"
        ? `<div class="mcard"><h3>Teams they're hiring for</h3><ul class="mlist">${st.disciplines.map(([k,n])=>`<li>${escHtml(k)} <span class="mv">${n}</span></li>`).join("")}</ul></div>`
        : `<div class="mcard"><h3>Who's hiring most</h3><ul class="mlist">${studioList}</ul></div>`}
      <div class="mcard">
        <h3>Where the roles are</h3>
        <ul class="mlist">${locList}</ul>
      </div>
      ${techList}
      <div class="mcard wide">
        <h3>Pay &amp; freshness</h3>
        ${pay}
        <p><strong>${st.fresh}</strong> posted in the last 7 days${st.medianDays != null ? `; the median role here has been live <strong>${st.medianDays} day${st.medianDays === 1 ? "" : "s"}</strong>` : ""}.</p>
        ${remote}
      </div>
    </div>
  </section>`;
}

// ---- Game Industry Hiring Report -------------------------------------------------------------
// A page the scrape regenerates, not a blog post. One URL that is always current, so a citation
// earned in September still points at accurate data in March — and so every link earned lands on
// the same address instead of scattering across dated posts.
//
// The lead finding is the one thing this board can measure that a single-country job site cannot:
// pay transparency is a legislative artefact, not a cultural one. It is ~70% in the US (Colorado,
// California, New York, Washington), ~37% in Canada (BC and Ontario phasing in) and effectively
// zero in Japan, Korea, France and Poland.
// jobCity() returns the first segment that isn't a country or a state — so for a location string of
// "Unlisted" or "Multiple Locations" it hands back that placeholder as though it were a place name.
// Measured on live data, "Unlisted" alone would have been the 6th largest "city" on the board.
const NOT_A_CITY = /^(unlisted|multiple locations|\d+\s+locations?|any|anywhere|hybrid|remote|on-?site|in-?office|full[- ]?time|part[- ]?time|various|worldwide|global|tbd|n\/?a)$/i;

const CC_NAME = { US:"United States", CA:"Canada", GB:"United Kingdom", JP:"Japan", KR:"South Korea",
  FR:"France", DE:"Germany", PL:"Poland", CN:"China", ES:"Spain", IN:"India", VN:"Vietnam",
  SG:"Singapore", CY:"Cyprus", RS:"Serbia", SE:"Sweden", IL:"Israel", TR:"Türkiye", NL:"Netherlands",
  FI:"Finland", AU:"Australia", BR:"Brazil", MX:"Mexico", IE:"Ireland", IT:"Italy", PT:"Portugal",
  RO:"Romania", CZ:"Czechia", DK:"Denmark", NO:"Norway", AT:"Austria", CH:"Switzerland", BE:"Belgium",
  HU:"Hungary", UA:"Ukraine", GR:"Greece", HK:"Hong Kong", TW:"Taiwan", MY:"Malaysia", TH:"Thailand",
  ID:"Indonesia", PH:"Philippines", NZ:"New Zealand", AE:"United Arab Emirates", ZA:"South Africa",
  AR:"Argentina", CL:"Chile", CO:"Colombia", EG:"Egypt", MA:"Morocco", PK:"Pakistan", AM:"Armenia",
  AZ:"Azerbaijan", BY:"Belarus", GE:"Georgia", SI:"Slovenia", LT:"Lithuania", LV:"Latvia",
  EE:"Estonia", MT:"Malta", JO:"Jordan", KZ:"Kazakhstan", BD:"Bangladesh", LK:"Sri Lanka",
  PE:"Peru", UY:"Uruguay", CR:"Costa Rica", IS:"Iceland", SK:"Slovakia", BG:"Bulgaria", HR:"Croatia",
  SA:"Saudi Arabia", NG:"Nigeria", KE:"Kenya", GH:"Ghana", TN:"Tunisia", MO:"Macau" };
const REPORT_MIN_COUNTRY = 40;      // below this a percentage is noise, not a finding
function _repMidK(s){
  const ks = String(s || "").match(/(\d+(?:\.\d+)?)\s*K/gi);
  if (!ks || !ks.length) return null;
  const n = ks.map(x => parseFloat(x));
  return n.reduce((a, b) => a + b, 0) / n.length;
}
function _repMedian(a){ if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const i = Math.floor(s.length / 2);
  return s.length % 2 ? Math.round(s[i]) : Math.round((s[i - 1] + s[i]) / 2); }
function hiringReportData(all){
  const jobs = all.filter(j => j && j.title && !isPool(j.title));
  const n = jobs.length;
  const pc = x => n ? Math.round(100 * x / n) : 0;
  // --- pay transparency by country ------------------------------------------------------------
  const byC = {};
  for (const j of jobs){
    const cc = resolveCountry(j.location); if (!cc) continue;
    const b = byC[cc] || (byC[cc] = { n: 0, sal: 0 });
    b.n++; if (j.salary) b.sal++;
  }
  const countries = Object.entries(byC).filter(([, v]) => v.n >= REPORT_MIN_COUNTRY)
    .map(([cc, v]) => ({ cc, name: CC_NAME[cc] || cc, n: v.n, sal: v.sal, pct: Math.round(100 * v.sal / v.n) }))
    .sort((a, b) => b.n - a.n);
  const us = byC.US || { n: 0, sal: 0 };
  const rest = countries.filter(c => c.cc !== "US").reduce((a, c) => ({ n: a.n + c.n, s: a.s + c.sal }), { n: 0, s: 0 });
  const zero = countries.filter(c => c.pct === 0);
  // --- pay ladder -----------------------------------------------------------------------------
  const bySen = {};
  for (const j of jobs){ if (!j.salary) continue; const m = _repMidK(j.salary); if (!m) continue;
    (bySen[j.seniority || "?"] || (bySen[j.seniority || "?"] = [])).push(m); }
  const pay = ["Entry","Mid","Senior","Lead","Director+"].filter(s => (bySen[s] || []).length >= 10)
    .map(s => ({ sen: s, med: _repMedian(bySen[s]), n: bySen[s].length }));
  const payOf = s => (pay.find(p => p.sen === s) || {}).med || null;
  const midToSenior = (payOf("Mid") && payOf("Senior")) ? Math.round(100 * (payOf("Senior") - payOf("Mid")) / payOf("Mid")) : null;
  // --- seniority mix (the junior story) -------------------------------------------------------
  const senMix = {};
  for (const j of jobs) senMix[j.seniority || "?"] = (senMix[j.seniority || "?"] || 0) + 1;
  const entry = senMix.Entry || 0, mid = senMix.Mid || 0;
  // --- age: ghost listings and churn ----------------------------------------------------------
  const now = Date.now();
  let d90 = 0, d60 = 0, fresh7 = 0, dated = 0;
  for (const j of jobs){
    if (!j.firstSeen) continue;
    const t = Date.parse(j.firstSeen); if (!isFinite(t)) continue;
    dated++;
    const days = (now - t) / 864e5;
    if (days >= 90) d90++; if (days >= 60) d60++; if (days < 7) fresh7++;
  }
  // --- experience -----------------------------------------------------------------------------
  const yo = jobs.map(j => j.yoe).filter(y => typeof y === "number" && y > 0).sort((a, b) => a - b);
  const yoeMed = yo.length ? yo[Math.floor(yo.length / 2)] : null;
  // --- disciplines, studios, cities -----------------------------------------------------------
  const dc = {}; for (const j of jobs) if (j.discipline && j.discipline !== "Other") dc[j.discipline] = (dc[j.discipline] || 0) + 1;
  const discs = Object.entries(dc).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v, pct: pc(v) }));
  const sc = {}; for (const j of jobs){ const s = j.parent || j.studio; if (s) sc[s] = (sc[s] || 0) + 1; }
  const studios = Object.entries(sc).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ k, v }));
  const cc2 = {};
  for (const j of jobs){
    if (j.workType === "Remote") continue;
    const c = canonCity(jobCity(j.location));
    if (!c || NOT_A_CITY.test(c)) continue;
    cc2[c] = (cc2[c] || 0) + 1;
  }
  const cities = Object.entries(cc2).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => ({ k, v }));
  const remote = jobs.filter(j => j.workType === "Remote").length;
  const withSal = jobs.filter(j => j.salary).length;
  return { total: n, studioTotal: Object.keys(sc).length,
    countries, zero, usPct: us.n ? Math.round(100 * us.sal / us.n) : 0, usN: us.n,
    restPct: rest.n ? Math.round(100 * rest.s / rest.n) : 0, restN: rest.n,
    pay, midToSenior, entry, entryPct: pc(entry), mid,
    d90, d90Pct: dated ? Math.round(100 * d90 / dated) : 0, d60, d60Pct: dated ? Math.round(100 * d60 / dated) : 0,
    fresh7, fresh7Pct: dated ? Math.round(100 * fresh7 / dated) : 0,
    yoeMed, yoeN: yo.length, yoe10: yo.filter(y => y >= 10).length,
    discs, studios, cities, remote, remotePct: pc(remote),
    withSal, salPct: pc(withSal) };
}
const HIRING_REPORT_SLUG = "game-industry-hiring-report";
// A card is only rendered when its number still supports the sentence printed on it. The prose is
// written by hand and the data is live, so without these guards the page would eventually assert
// something false — "the industry is hiring experience, not training it" is a claim about a 5%
// entry-level share, not a permanent truth. If a stat drifts out of range its card disappears rather
// than lying, and the grid reflows.
function renderHiringReport(all){
  const d = hiringReportData(all);
  const url = "https://devquest.gg/" + HIRING_REPORT_SLUG;
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const nice = now.toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const mon = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const nf = x => Number(x).toLocaleString("en-US");
  const title = `Game Industry Hiring: ${nf(d.total)} Open Roles, ${mon} · DevQuest`;
  const desc = `${d.usPct}% of US game jobs publish a salary; outside the US, ${d.restPct}%. Only ${d.entryPct}% of roles are entry level. Live figures from ${nf(d.studioTotal)} studios' own careers pages, refreshed hourly.`;
  const cards = [];
  const card = (cls, html) => cards.push(`<div class="c ${cls}">${html}</div>`);
  const eb = t => `<div class="eyebrow">${escHtml(t)}</div>`;
  const bar2 = (a, colA) => `<div class="split"><div style="flex:${a};background:${colA}"></div><div style="flex:${100 - a};background:rgba(139,148,158,.22)"></div></div>`;

  // 1 — pay transparency. Only claims a legislative split while one actually exists.
  if (d.usN >= 200 && d.restN >= 200 && d.usPct - d.restPct >= 25){
    const ca = d.countries.find(c => c.cc === "CA");
    card("w6 hero-card", `<span class="share">↗ most shared</span>` + eb("Pay transparency")
      + `<div class="big"><span class="g">${d.usPct}%</span> <span class="vs">vs</span> <span class="o">${d.restPct}%</span></div>`
      + `<div class="cap">of US game jobs publish a salary. Outside the US, almost none do.</div>`
      + bar2(d.usPct, "var(--green)")
      + `<div class="note">This tracks legislation, not generosity. Colorado, California, New York and
         Washington require pay ranges in job ads, and US employers comply.${ca ? ` Canada sits at ${ca.pct}% as British Columbia and Ontario phase their rules in.` : ""}
         Based on ${nf(d.usN)} US roles and ${nf(d.restN)} elsewhere.</div>`);
  }
  // 2 — the junior problem. Only a story while entry level is genuinely scarce.
  if (d.entryPct <= 12 && d.entry > 0){
    const ratio = d.entry ? Math.round(d.mid / d.entry) : 0;
    const lit = Math.max(1, Math.round(d.entryPct / 5));
    card("w3", `<span class="share">↗</span>` + eb("The junior problem")
      + `<div class="big"><span class="pk">${d.entryPct}%</span></div>`
      + `<div class="cap">of open game jobs are entry level</div>`
      + `<div class="dots">${Array.from({length:20},(_,i)=>`<i${i<lit?' class="on"':''}></i>`).join("")}</div>`
      + `<div class="note">${nf(d.entry)} of ${nf(d.total)} roles. Mid-level alone is ${nf(d.mid)}${ratio>=3?` — about ${ratio}× as many`:""}.
         The industry is hiring experience, not training it.</div>`);
  }
  // 3 — ghost listings. Only interesting above roughly one in seven.
  if (d.d90Pct >= 14){
    const oneIn = Math.round(100 / d.d90Pct);
    card("w3", `<span class="share">↗</span>` + eb("Ghost listings")
      + `<div class="big"><span class="rd">1 in ${oneIn}</span></div>`
      + `<div class="cap">roles have been open 90+ days</div>`
      + bar2(d.d90Pct, "var(--red)")
      + `<div class="note">${nf(d.d90)} listings have sat on a careers page for over three months, and
         ${nf(d.d60)} are past sixty days. Some are real and slow. Some were never going to be filled.</div>`);
  }
  // 4 — the pay ladder
  if (d.pay.length >= 3){
    const top = Math.max(...d.pay.map(p => p.med));
    card("w4", eb("What the ladder actually pays")
      + `<div class="lad">` + d.pay.map(p =>
          `<div class="r"><span class="lb">${escHtml(p.sen)}</span><span class="tr"><span class="fl" style="width:${Math.round(100*p.med/top)}%"></span></span><span class="vv">$${p.med}K</span></div>`
        ).join("") + `</div>`
      + `<div class="note">Median advertised midpoint, from the ${nf(d.withSal)} roles that publish a range.${
          d.midToSenior ? ` The step from mid to senior is <b>+${d.midToSenior}%</b> — the largest jump on the ladder.` : ""}</div>`);
  }
  // 5 — countries at zero
  if (d.zero.length >= 3){
    card("w2", `<span class="share">↗</span>` + eb("Silence")
      + `<div class="big sm"><span class="o">${d.zero.length}</span></div>`
      + `<div class="cap">countries where not one game job lists pay</div>`
      + `<div class="note">${d.zero.slice(0,8).map(c=>escHtml(c.name)).join(", ")}${d.zero.length>8?" and more":""}.
         Zero out of ${nf(d.zero.reduce((a,c)=>a+c.n,0))} roles between them.</div>`);
  }
  // 6 — remote
  {
    const circ = 251.3, off = Math.round((circ * (1 - d.remotePct/100)) * 10) / 10;
    card("w2", eb("Remote")
      + `<div class="ring"><svg width="96" height="96" aria-hidden="true"><circle cx="48" cy="48" r="40" fill="none" stroke="rgba(139,148,158,.16)" stroke-width="11"/>`
      + `<circle cx="48" cy="48" r="40" fill="none" stroke="#58a6ff" stroke-width="11" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${off}"/></svg>`
      + `<div class="lbl a">${d.remotePct}%</div></div>`
      + `<div class="note center">${nf(d.remote)} fully remote roles. Studios label hybrid and on-site far more readily, so read this as a floor.</div>`);
  }
  // 7 — experience
  if (d.yoeMed && d.yoeN >= 200){
    card("w2", `<span class="share">↗</span>` + eb("Experience asked")
      + `<div class="big sm"><span class="pu">${d.yoeMed} yrs</span></div>`
      + `<div class="cap">median, where a number is stated</div>`
      + `<div class="note">Of ${nf(d.yoeN)} roles naming a figure. ${nf(d.yoe10)} of them ask for a decade or more.</div>`);
  }
  // 8 — discipline concentration
  if (d.discs.length >= 3){
    const t = d.discs[0], second = d.discs[1];
    const small = d.discs.filter(x => ["QA","Audio"].includes(x.k));
    card("w2", eb("Craft concentration")
      + `<div class="big sm"><span class="a">${t.pct}%</span></div>`
      + `<div class="cap">of every open role is ${escHtml(t.k)}</div>`
      + `<div class="note">${nf(t.v)} roles. ${escHtml(second.k)} is second at ${nf(second.v)}.${
          small.length ? ` ${small.map(s=>escHtml(s.k)+" is "+nf(s.v)).join(" and ")} — a rounding error by comparison.` : ""}</div>`);
  }
  // 9 — biggest hirer
  if (d.studios.length >= 3){
    card("w2", eb("Biggest hirer")
      + `<div class="big sm">${nf(d.studios[0].v)}</div>`
      + `<div class="cap">open roles at ${escHtml(d.studios[0].k)}</div>`
      + `<div class="note">Then ${d.studios.slice(1,5).map(s=>escHtml(s.k)+" "+nf(s.v)).join(", ")}.</div>`);
  }
  // 10 — top city
  if (d.cities.length >= 3){
    card("w2", `<span class="share">↗</span>` + eb("Where the jobs are")
      + `<div class="big sm">${escHtml(d.cities[0].k)}</div>`
      + `<div class="cap">${nf(d.cities[0].v)} open roles — the largest single city</div>`
      + `<div class="note">${d.cities.slice(1,4).map(c=>escHtml(c.k)+" "+nf(c.v)).join(", ")}. The centre of gravity is not where most job boards look.</div>`);
  }
  // 11 — churn
  if (d.fresh7 > 0){
    card("w3", eb("Churn")
      + `<div class="big sm"><span class="g">${nf(d.fresh7)}</span></div>`
      + `<div class="cap">roles opened in the last 7 days</div>`
      + `<div class="note">${d.fresh7Pct}% of the board turns over weekly. A job search that checks monthly misses most of what appears.</div>`);
  }
  // 12 — country table
  if (d.countries.length >= 5){
    const rows = d.countries.slice(0, 6).map(c =>
      `<div class="frow"><span>${escHtml(c.name)}</span><b class="${c.pct>=50?"g":c.pct===0?"mut":"o"}">${c.pct}%</b></div>`).join("");
    card("w3", eb("Transparency by country") + `<div class="ftab">${rows}</div>`
      + `<div class="note">Share of that country's open roles publishing a salary range.</div>`);
  }

  const ld = JSON.stringify({ "@context":"https://schema.org","@type":"Dataset",
    name:"Game Industry Hiring Report", description:desc, url, dateModified:iso, isAccessibleForFree:true,
    creator:{ "@type":"Organization", name:"DevQuest", url:"https://devquest.gg/" },
    temporalCoverage:iso, variableMeasured:["open roles","salary transparency rate","median advertised pay","remote share","entry-level share","listing age"] });
  const crumbs = JSON.stringify({ "@context":"https://schema.org","@type":"BreadcrumbList", itemListElement:[
    { "@type":"ListItem", position:1, name:"DevQuest", item:"https://devquest.gg/" },
    { "@type":"ListItem", position:2, name:"Hiring report", item:url } ] });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<meta name="description" content="${escHtml(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta property="og:type" content="article">
<meta property="og:site_name" content="DevQuest">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:image" content="https://devquest.gg/og-image-v4.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:image" content="https://devquest.gg/og-image-v4.png">
<script type="application/ld+json">${ld}</script>
<script type="application/ld+json">${crumbs}</script>
<style>
  :root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;
        --accent:#58a6ff;--green:#3fb950;--gold:#d29922;--purple:#a371f7;--pink:#f778ba;--red:#e06c5e}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
  a{color:var(--accent)}
  header{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;max-width:1080px;margin:0 auto}
  .logo{font-size:19px;font-weight:800;letter-spacing:-.3px;text-decoration:none;color:var(--text)}
  .logo span{color:var(--accent)}
  .backbtn{color:var(--accent);font-size:13px;font-weight:600;text-decoration:none;border:1px solid var(--border);padding:7px 13px;border-radius:8px;white-space:nowrap}
  .backbtn:hover{border-color:var(--accent)}
  .wrap{max-width:1080px;margin:0 auto;padding:0 20px 70px}
  .hero{padding:44px 0 8px;text-align:center}
  .kicker{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
  h1{font-size:42px;font-weight:800;letter-spacing:-1.1px;line-height:1.1;margin:12px 0 0}
  .hero .sub{color:var(--muted);font-size:16px;margin:14px auto 0;max-width:620px}
  .live{display:inline-flex;align-items:center;gap:7px;margin-top:18px;font-size:12.5px;color:var(--muted);background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:5px 14px}
  .pulse{width:7px;height:7px;border-radius:50%;background:var(--green)}
  .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-top:34px}
  .c{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px 22px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between}
  .c.hero-card{background:linear-gradient(135deg,rgba(63,185,80,.09),var(--panel) 55%)}
  .c.w6{grid-column:span 6}.c.w4{grid-column:span 4}.c.w3{grid-column:span 3}.c.w2{grid-column:span 2}
  @media(max-width:900px){.c.w4,.c.w3{grid-column:span 6}.c.w2{grid-column:span 3}}
  @media(max-width:560px){.c.w2{grid-column:span 6}h1{font-size:29px}}
  .eyebrow{font-size:11px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--muted)}
  .big{font-size:52px;font-weight:800;letter-spacing:-2px;line-height:1;margin:10px 0 2px;font-variant-numeric:tabular-nums}
  .big.sm{font-size:37px;letter-spacing:-1.2px}
  .big .vs{color:var(--muted);font-size:29px;letter-spacing:-1px;font-weight:700}
  .cap{font-size:14px;color:var(--text);font-weight:600;margin-top:6px}
  .note{font-size:12.5px;color:var(--muted);margin-top:8px;line-height:1.5}
  .note.center{text-align:center}
  .note b{color:var(--text)}
  .g{color:var(--green)}.o{color:var(--gold)}.a{color:var(--accent)}.pu{color:var(--purple)}
  .pk{color:var(--pink)}.rd{color:var(--red)}.mut{color:var(--muted)}
  .split{display:flex;gap:5px;margin-top:16px}
  .split div{display:block;height:9px;border-radius:999px}
  .dots{display:grid;grid-template-columns:repeat(20,1fr);gap:4px;margin-top:16px}
  .dots i{aspect-ratio:1;border-radius:2.5px;background:rgba(139,148,158,.18);display:block}
  .dots i.on{background:var(--pink)}
  .lad{margin-top:14px}
  .lad .r{display:flex;align-items:center;gap:10px;margin-bottom:7px}
  .lad .lb{width:66px;font-size:12.5px;color:var(--muted);flex:none}
  .lad .tr{display:block;flex:1;height:20px;background:rgba(139,148,158,.12);border-radius:5px;overflow:hidden}
  .lad .fl{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#1f6feb,#58a6ff)}
  .lad .vv{width:54px;text-align:right;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}
  .ftab{margin-top:12px}
  .frow{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:1px solid var(--border);font-size:13.5px}
  .frow:first-child{border-top:0}
  .frow b{font-variant-numeric:tabular-nums}
  .ring{width:96px;height:96px;margin:10px auto 0;position:relative}
  .ring svg{transform:rotate(-90deg)}
  .ring .lbl{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:23px;font-weight:800;letter-spacing:-.5px}
  .share{position:absolute;top:14px;right:16px;font-size:10.5px;color:var(--muted);opacity:.55;border:1px solid var(--border);border-radius:6px;padding:2px 7px}
  .method{margin-top:30px;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:20px 22px;font-size:13px;color:var(--muted)}
  .method b{color:var(--text)}.method p{margin:8px 0}
  .cta{margin-top:22px;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:24px;text-align:center}
  .cta h2{font-size:19px;margin-bottom:6px}
  .btn{display:inline-block;background:var(--accent);color:#0d1117;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:9px;margin-top:14px}
  footer{border-top:1px solid var(--border);padding:22px;color:var(--muted);font-size:12.5px;text-align:center}
</style>
</head>
<body>
<header>
  <a class="logo" href="/">DevQuest<span>.gg</span></a>
  <a class="backbtn" href="/">Browse ${nf(d.total)} open roles →</a>
</header>
<div class="wrap">
  <div class="hero">
    <div class="kicker">The state of game industry hiring</div>
    <h1>${nf(d.total)} open roles.<br>${nf(d.studioTotal)} studios. One honest look.</h1>
    <p class="sub">Counted hourly from studios' own careers pages — not aggregator feeds, not recruiter
    reposts. Every number below is live right now.</p>
    <div class="live"><span class="pulse"></span> Updated ${escHtml(nice)} · refreshes hourly</div>
  </div>
  <div class="grid">
${cards.join("\n")}
  </div>
  <div class="method">
    <p><b>Method.</b> Every figure is counted from live postings on ${nf(d.studioTotal)} studios' own
    applicant tracking systems — Greenhouse, Lever, Workday, Ashby and others — re-read hourly. No
    aggregator feeds, no recruiter reposts, no paid placements. "Lists pay" means a salary range
    published by the employer; a role is counted once, in the country its posting names.</p>
    <p><b>What this is not.</b> Coverage is the studios listed on DevQuest, which skews toward companies
    large enough to run a public careers page. The board-wide transparency figure has drifted down to
    ${d.salPct}% since June, but the <i>number</i> of roles publishing pay has stayed nearly flat — the
    denominator grew as non-US studios were added. The mix changed, not the behaviour, which is why the
    country split above is the honest view and a single blended percentage is not.</p>
    <p><b>Free to cite</b> and quote with a link to this page. Corrections welcome.</p>
  </div>
  <div class="cta">
    <h2>See the roles behind the numbers</h2>
    <p style="color:var(--muted)">Every role counted here is live and searchable — by craft, level, city and studio.</p>
    <a class="btn" href="/">Browse ${nf(d.total)} open game jobs →</a>
  </div>
</div>
<footer>DevQuest · game dev jobs, fresh and filtered · updated hourly</footer>
</body>
</html>`;
}

function renderLandingPage(cfg, all, allSpecs){
  const matches = landingMatches(cfg, all);
  const total = matches.length;
  const studios = new Set(matches.map(m => m.studio)).size;
  const rows = matches.slice(0, 25).map(landingRoleRow).join("\n") || `<div style="padding:16px;color:#8b949e">No open ${escHtml(cfg.noun)} roles right this minute — check back soon or set an alert.</div>`;
  const url = "https://devquest.gg/" + cfg.slug;
  const mon = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
  // Count + month in the <title> lifts search click-through (numbers + recency stand out in the SERP).
  const title = (total ? total + " " : "") + cfg.h1 + " (" + mon + ") · DevQuest";
  const desc = `${cfg.h1}, updated hourly. ${total} open ${cfg.noun} role${total===1?"":"s"} across ${studios} studios, pulled from studio career pages with salary shown when published and ghost-job filters. No ads.`;
  // Optional studio/skill intro blurb (unique per page — keeps these from being thin doorway pages).
  const blurbHtml = cfg.blurb ? `<p class="blurb">${escHtml(cfg.blurb)}</p>` : "";
  const stats = sliceStats(matches);
  const analysisHtml = sliceLede(cfg, stats);
  const marketHtml = renderMarketBlock(cfg, stats);
  // Internal "related searches" mesh + an FAQ block (with FAQPage structured data) for richer pages.
  const relatedHtml = (typeof relatedLinksHtml === "function" && allSpecs) ? relatedLinksHtml(cfg, allSpecs) : "";
  const faqPairs = faqFor(cfg, total, studios);
  const faqHtml = `<h2>FAQ</h2><div class="faq">` + faqPairs.map(([q,a])=>`<details><summary>${escHtml(q)}</summary><p>${escHtml(a)}</p></details>`).join("") + `</div>`;
  const faqLd = JSON.stringify({ "@context":"https://schema.org","@type":"FAQPage",
    mainEntity: faqPairs.map(([q,a])=>({ "@type":"Question", name:q, acceptedAnswer:{ "@type":"Answer", text:a } })) });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<meta name="description" content="${escHtml(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DevQuest">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:image" content="https://devquest.gg/og-image-v4.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:image" content="https://devquest.gg/og-image-v4.png">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"CollectionPage","name":"${escHtml(cfg.h1)}","url":"${url}","description":"Open ${escHtml(cfg.noun)} roles across the video-game industry, synced hourly from studio career pages.","isPartOf":{"@type":"WebSite","name":"DevQuest","url":"https://devquest.gg/"}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"DevQuest","item":"https://devquest.gg/"},{"@type":"ListItem","position":2,"name":"${escHtml(cfg.h1)}","item":"${url}"}]}
</script>
<script type="application/ld+json">
${faqLd}
</script>
<style>
  :root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--pink:#f778ba;--gold:#d29922}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6}
  a{color:var(--accent)}
  header{padding:16px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--bg);z-index:10}
  .logo{font-size:20px;font-weight:800;letter-spacing:-0.3px;display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--text)}
  .logo .wordmark span,.logo .logo-tld{color:var(--accent)}
  .logo svg{display:block;flex-shrink:0}
  .backbtn{color:var(--accent);font-size:13px;font-weight:600;text-decoration:none;border:1px solid var(--border);padding:7px 13px;border-radius:7px;white-space:nowrap}
  .backbtn:hover{border-color:var(--accent)}
  .wrap{max-width:820px;margin:0 auto;padding:0 24px 80px}
  nav.crumbs{font-size:12.5px;color:var(--muted);padding:16px 0 0}
  nav.crumbs a{color:var(--muted);text-decoration:none}nav.crumbs a:hover{color:var(--accent)}
  .lede{padding:22px 0 6px}
  .lede h1{font-size:30px;font-weight:800;letter-spacing:-0.6px;line-height:1.2}
  .lede .sub{color:var(--muted);font-size:16px;margin-top:12px;max-width:680px}
  .lede .meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
  .chip{background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:5px 13px;font-size:13px;color:var(--text)}
  .chip b{color:var(--accent)}.chip.fresh b{color:var(--green)}
  .cta-row{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0 8px}
  .btn{display:inline-block;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:9px}
  .btn.primary{background:var(--accent);color:#0d1117}
  .btn.ghost{border:1px solid var(--border);color:var(--text)}.btn.ghost:hover{border-color:var(--accent)}
  h2{font-size:18px;font-weight:800;margin:34px 0 6px;letter-spacing:-0.2px}
  .roles{margin-top:12px;border:1px solid var(--border);border-radius:12px;overflow:hidden}
  .role{display:block;padding:14px 16px;border-bottom:1px solid var(--border);text-decoration:none;color:var(--text)}
  .role:last-child{border-bottom:none}.role:hover{background:var(--panel)}
  .role .rt{font-weight:600;font-size:15px}
  .role .rs{color:var(--muted);font-size:13px;margin-top:2px}
  .role .tags{margin-top:7px;display:flex;gap:6px;flex-wrap:wrap}
  .tag{font-size:12px;border:1px solid var(--border);border-radius:6px;padding:2px 8px;color:var(--muted)}
  .tag.remote{color:var(--accent);border-color:rgba(88,166,255,.4)}
  .tag.sal{color:var(--green);border-color:rgba(63,185,80,.4)}
  .tag.age{color:var(--gold)}
  .prose{color:#c9d1d9}.prose p{margin:12px 0}.prose h2{margin-top:30px}.prose strong{color:var(--text)}
  .alertbox{margin-top:30px;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:22px 24px;text-align:center}
  .alertbox h2{margin:0 0 6px}.alertbox p{color:var(--muted);margin-bottom:16px}
  .blurb{color:#c9d1d9;font-size:15px;margin-top:14px;max-width:680px}
  .related{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .related .rel{font-size:13px;text-decoration:none;color:var(--text);background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:6px 13px}
  .related .rel:hover{border-color:var(--accent);color:var(--accent)}
  .faq{margin-top:12px;border:1px solid var(--border);border-radius:12px;overflow:hidden}
  .faq details{border-bottom:1px solid var(--border)}.faq details:last-child{border-bottom:none}
  .faq summary{cursor:pointer;padding:13px 16px;font-weight:600;font-size:14.5px;list-style:none}
  .analysis{color:#c9d1d9;font-size:15px;line-height:1.65;margin:10px 0 0;max-width:70ch}
  .market{margin:34px 0 10px}
  .market h2{margin:0 0 4px}
  .msub{color:#8b949e;font-size:13.5px;margin:0 0 16px}
  .mgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
  .mcard{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
  .mcard.wide{grid-column:1/-1}
  .mcard h3{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#8b949e;margin:0 0 10px}
  .mcard p{color:#c9d1d9;font-size:14px;line-height:1.6;margin:0 0 8px}
  .mlist{list-style:none;margin:0;padding:0}
  .mlist li{display:flex;justify-content:space-between;gap:10px;font-size:14px;color:#c9d1d9;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)}
  .mlist li:last-child{border-bottom:0}
  .mlist a{color:var(--accent)}
  .mv{color:#8b949e;font-variant-numeric:tabular-nums;font-size:13px}
  .mrow{display:flex;align-items:center;gap:9px;padding:3px 0;font-size:13.5px}
  .mk{flex:0 0 66px;color:#c9d1d9}
  .mbar{flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:5px;overflow:hidden}
  .mbar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),#7cc0ff)}
  .faq summary::-webkit-details-marker{display:none}
  .faq summary:hover{background:var(--panel)}
  .faq details[open] summary{color:var(--accent)}
  .faq p{color:#c9d1d9;padding:0 16px 14px;margin:0;font-size:14px}
  footer{border-top:1px solid var(--border);margin-top:50px;padding:22px 24px;text-align:center;color:var(--muted);font-size:13px}
  footer a{color:var(--muted)}footer a:hover{color:var(--accent)}
</style>
</head>
<body>
<header>
  <a class="logo" href="/"><svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="8" height="8" rx="2" fill="var(--accent)"/><rect x="12" y="1" width="8" height="8" rx="2" fill="#2d333b"/><rect x="23" y="1" width="8" height="8" rx="2" fill="#2d333b"/><rect x="1" y="12" width="8" height="8" rx="2" fill="#2d333b"/><rect x="12" y="12" width="8" height="8" rx="2" fill="var(--accent)"/><rect x="23" y="12" width="8" height="8" rx="2" fill="#2d333b"/><rect x="1" y="23" width="8" height="8" rx="2" fill="#2d333b"/><rect x="12" y="23" width="8" height="8" rx="2" fill="#2d333b"/><rect x="23" y="23" width="8" height="8" rx="2" fill="var(--accent)"/></svg><span class="wordmark">Dev<span>Quest</span><span class="logo-tld">.gg</span></span></a>
  <a class="backbtn" href="/">Browse all jobs →</a>
</header>
<div class="wrap">
  <nav class="crumbs"><a href="/">DevQuest</a> &nbsp;›&nbsp; ${escHtml(cfg.h1)}</nav>
  <div class="lede">
    <h1>${escHtml(cfg.h1)}</h1>
    <p class="sub">Every open <strong>${escHtml(cfg.noun)}</strong> role in the games industry, pulled straight from studios' own career pages and refreshed every hour. Salary shown when the studio publishes it, ghost-job listings flagged, and you apply on the studio's own site. No ads, no recruiters in the middle.</p>
    ${blurbHtml}
    ${analysisHtml}
    <div class="meta">
      <span class="chip"><b>${total}</b> open role${total===1?"":"s"}</span>
      <span class="chip"><b>${studios}</b> studio${studios===1?"":"s"}</span>
      <span class="chip fresh"><b>●</b> synced hourly · updated ${new Date().toISOString().slice(0,10)}</span>
    </div>
    <div class="cta-row">
      <a class="btn primary" href="/">See all ${total} on DevQuest →</a>
      <a class="btn ghost" href="/about">Why DevQuest is different</a>
    </div>
  </div>
  <h2>Open ${escHtml(cfg.noun)} roles right now</h2>
  <div class="roles">
${rows}
  </div>
  <p style="margin-top:14px"><a href="/" class="btn primary">Browse all ${total} role${total===1?"":"s"} →</a></p>
  ${marketHtml}
  <div class="prose">
    <h2>How DevQuest keeps this list honest</h2>
    <p>Game-dev hiring is full of stale and "ghost" postings. DevQuest shows <strong>how long each role has been live</strong> and flags listings that keep getting re-posted, so you don't waste an afternoon applying into the void. We show <strong>real salary only when the studio publishes it</strong>, never an invented "competitive" range, and we link you straight to the studio's own application page. No recruiters, no ads, and we never sell your data.</p>
    <h2>Don't see your fit yet?</h2>
    <p>${stats.fresh} new ${escHtml(cfg.noun)} role${stats.fresh===1?"":"s"} landed in the last seven days${stats.studios.length?`, most recently across studios like ${stats.studios.slice(0,3).map(x=>escHtml(x[0])).join(", ")}`:""}. Filter the full board by seniority, region, studio, and tech stack (search a skill like <em>C++</em> or <em>Unreal</em>), or set a free weekly email alert and let the new ones come to you.</p>
  </div>
  ${relatedHtml}
  ${faqHtml}
  <div class="alertbox">
    <h2>Get ${escHtml(cfg.noun)} roles emailed to you</h2>
    <p>A free weekly digest of new matching roles. One-click unsubscribe, no spam.</p>
    <a class="btn primary" href="/">Set up a free alert →</a>
  </div>
</div>
<footer>DevQuest.gg · Game dev jobs, fresh and honest · <a href="/">Browse all jobs</a> · <a href="/jobs">All categories</a> · <a href="/about">Our mission</a></footer>
</body>
</html>
`;
}

// ---- Spec generators: turn the live data into per-studio / per-skill / combo page specs --------
// Each spec is { slug, h1, noun, kind, breadcrumb, match(j), blurb? }. We gate on real inventory so
// we never publish thin/empty "doorway" pages (which search engines penalize).
function _uniqCount(all, match){
  const seen = new Set();
  for (const j of all){ if (isPool(j.title) || !match(j)) continue; seen.add((j.studio||"")+"|"+(j.title||"")); }
  return seen.size;
}

// One page per studio (grouped by parent company) with >=3 live roles — captures branded searches
// like "riot games careers". The blurb is built from live data, so every page is genuinely unique.
function studioPageSpecs(all){
  const by = {};
  for (const j of all){ if (isPool(j.title)) continue; const name = j.parent || j.studio; if (!name) continue; (by[name] || (by[name] = [])).push(j); }
  const specs = [];
  for (const name of Object.keys(by)){
    const jobs = by[name];
    const n = new Set(jobs.map(j=>(j.studio||"")+"|"+(j.title||""))).size;
    if (n < 3) continue;                                   // gate: skip thin studios
    // Rank disciplines & locations by frequency (and drop the "Other" catch-all + unmapped one-offs)
    // so the blurb leads with what the studio actually hires for, not arbitrary data order.
    const dcount = {}; jobs.forEach(j=>{ if (j.discipline) dcount[j.discipline] = (dcount[j.discipline]||0)+1; });
    const discs = Object.keys(dcount).filter(d => d && d !== "Other").sort((a,b)=> dcount[b]-dcount[a]);
    const lcount = {}; jobs.forEach(j=>{ const L = j.workType==="Remote" ? "Remote" : (j.location||"").split(",")[0].trim(); if (L) lcount[L] = (lcount[L]||0)+1; });
    const locs = Object.keys(lcount).sort((a,b)=> lcount[b]-lcount[a]).slice(0,4);
    const blurb = `${name} currently has ${n} open role${n===1?"":"s"} across ${discs.slice(0,4).join(", ")}${discs.length>4?" and more":""}${locs.length?` — ${locs.join(", ")}`:""}. Browse every live ${name} opening below, pulled straight from their own careers page and refreshed hourly. You apply on ${name}'s own site — no middlemen, no ads.`;
    specs.push({ slug: slugify(name) + "-jobs", h1: `${name} Jobs & Careers`, noun: name, kind: "studio",
      breadcrumb: name, blurb, match: (j)=> (j.parent || j.studio) === name });
  }
  return specs.sort((a,b)=> a.h1.localeCompare(b.h1));
}

// One page per city with real inventory. "<city> game jobs" is a durable, high-intent query, and the
// differentiating content writes itself from data already held: which studios are actually there and
// what they hire for. Remote roles are excluded — they have their own remote-* family, and a remote
// role is not "in" a city.
const CITY_PAGE_MIN = 15;          // unique roles. Below this the page is thin, and Google reads a
                                   // thin page built from a template as a doorway, which is worse
                                   // than not having it: it can drag the whole domain's rating down.
// Two pages for one place is duplicate content, which is actively worse than having no page at all.
// Every entry below came from auditing the real generated list, not from imagination: the first pass
// produced Bangalore AND Bengaluru, Montreal AND Montréal, Limassol AND "Limassol Cyprus",
// Leamington Spa AND Royal Leamington Spa, plus "Vancouver - Great Northern Way" (a street address).
const CITY_ALIAS = {
  "bengaluru": "Bangalore", "bangalore": "Bangalore",
  "montreal": "Montréal", "quebec": "Québec City", "quebec city": "Québec City",
  "royal leamington spa": "Leamington Spa",
  "manhattan": "New York", "new york city": "New York", "brooklyn": "New York",
  "ho chi minh": "Ho Chi Minh City", "saigon": "Ho Chi Minh City",
  "bengaluru urban": "Bangalore", "gurgaon": "Gurugram",
  // Districts that are not the name anyone searches for: nobody types "Sariyer game jobs".
  "sariyer": "Istanbul", "kadikoy": "Istanbul", "shibuya": "Tokyo", "shinjuku": "Tokyo",
};
// A trailing country name repeated inside the city segment ("Limassol Cyprus") — the country is
// already captured separately, so it is noise in a page title.
const CITY_TRAILING_COUNTRY = /\s+(cyprus|viet ?nam|india|canada|australia|japan|germany|deutschland|france|spain|espana|españa|portugal|poland|polska|sweden|finland|denmark|norway|iceland|ireland|england|scotland|wales|brazil|brasil|mexico|méxico|singapore|malaysia|indonesia|thailand|philippines|turkey|israel|greece|romania|serbia|croatia|hungary|austria|switzerland|netherlands|belgium|czechia|czech republic|slovakia|ukraine|armenia|azerbaijan|belarus|georgia|slovenia|jordan|pakistan|lithuania|latvia|estonia|malta|korea|south korea|china|taiwan|hong kong|new zealand|united states|usa|uk|united kingdom)$/i;
function canonCity(raw){
  let c = String(raw || "").trim();
  c = c.split(/\s+[-–—]\s+/)[0].trim();          // "Vancouver - Great Northern Way" -> "Vancouver"
  c = c.replace(CITY_TRAILING_COUNTRY, "").trim(); // "Limassol Cyprus" -> "Limassol"
  // Fold accents for the lookup only, so "Montreal" and "Montréal" collapse to one canonical spelling.
  const key = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return CITY_ALIAS[key] || c;
}
function cityPageSpecs(all, existingSlugs){
  const studioNames = new Set();
  for (const j of all){ if (j.studio) studioNames.add(String(j.studio).toLowerCase()); if (j.parent) studioNames.add(String(j.parent).toLowerCase()); }
  const by = {};
  for (const j of all){
    if (isPool(j.title)) continue;
    if (j.workType === "Remote") continue;
    const city = canonCity(jobCity(j.location));
    if (!city || NOT_A_CITY.test(city)) continue;
    // Some feeds put the company name in the location field ("NEOWIZ"), which sailed straight past a
    // static blocklist and produced a city page for a studio. Checking against the board's own studio
    // names catches that and anything like it in future, without needing to know the name in advance.
    if (studioNames.has(city.toLowerCase())) continue;
    // Keyed by city AND country: "San Jose" is two different places, and merging them would put
    // Costa Rican roles on a Silicon Valley page.
    // Separator is a TAB, not a space: city names contain spaces, so splitting
    // "Los Angeles\tUS" on a space would yield the city "Los".
    const key = city + "\t" + (resolveCountry(j.location) || "");
    (by[key] || (by[key] = [])).push(j);
  }
  const specs = [];
  for (const key of Object.keys(by)){
    const jobs = by[key];
    const city = key.split("\t")[0], cc = key.split("\t")[1] || "";
    const n = new Set(jobs.map(j => (j.studio || "") + "|" + (j.title || ""))).size;
    if (n < CITY_PAGE_MIN) continue;
    const slug = slugify(city + " game jobs");
    if (existingSlugs.has(slug)) continue;
    const scount = {}; jobs.forEach(j => { const s = j.parent || j.studio; if (s) scount[s] = (scount[s] || 0) + 1; });
    const studios = Object.keys(scount).sort((a, b) => scount[b] - scount[a]).slice(0, 5);
    const nStudios = Object.keys(scount).length;
    const dcount = {}; jobs.forEach(j => { if (j.discipline && j.discipline !== "Other") dcount[j.discipline] = (dcount[j.discipline] || 0) + 1; });
    const discs = Object.keys(dcount).sort((a, b) => dcount[b] - dcount[a]).slice(0, 4);
    const blurb = `${city} has ${n} open game industry role${n === 1 ? "" : "s"} right now across ${nStudios} studio${nStudios === 1 ? "" : "s"}`
      + (discs.length ? `, led by ${discs.join(", ")}` : "") + ". "
      + (studios.length ? `Studios hiring in ${city}: ${studios.join(", ")}${nStudios > studios.length ? " and more" : ""}. ` : "")
      + `Every listing is pulled straight from the studio's own careers page and refreshed hourly — you apply on their site, not ours.`;
    existingSlugs.add(slug);
    specs.push({ slug, h1: `Game Jobs in ${city}`, noun: `${city} game industry`, kind: "city",
      breadcrumb: city, blurb,
      match: (j) => j.workType !== "Remote" && canonCity(jobCity(j.location)) === city
                 && (resolveCountry(j.location) || "") === cc });
  }
  return specs.sort((a, b) => a.h1.localeCompare(b.h1));
}

// One page per curated skill/engine/tool with >=5 live roles carrying the tag.
function skillPageSpecs(all){
  const specs = [];
  for (const sp of SKILL_PAGES){
    const match = (j)=> Array.isArray(j.tech) && j.tech.includes(sp.tag);
    if (_uniqCount(all, match) < 5) continue;              // gate: enough inventory to be a real page
    specs.push({ slug: sp.slug, h1: sp.h1, noun: sp.noun, kind: "skill", breadcrumb: sp.h1, match });
  }
  return specs;
}

// Discipline × {remote / senior / entry-level} combos with >=8 live roles. High-intent long-tail,
// gated so we don't spawn near-empty duplicate pages (and skipping any slug already taken).
function comboPageSpecs(all, existingSlugs){
  const DISC = [
    ["Engineering","Programming","programming","programming"],
    ["Design","Design","game design","design"],
    ["Art","Art","game art","art"],
    ["Animation","Animation","animation","animation"],
    ["Audio","Audio","game audio","audio"],
    ["Production","Production","production","production"],
    ["QA","QA & Tester","QA and testing","qa"],
  ];
  const specs = [];
  const mk = (slug, h1, noun, match)=>{
    if (existingSlugs.has(slug)) return;
    if (_uniqCount(all, match) < 8) return;
    existingSlugs.add(slug);
    specs.push({ slug, h1, noun, kind:"combo", breadcrumb:h1, match });
  };
  for (const [d, label, base, tok] of DISC){
    mk(`remote-game-${tok}-jobs`,      `Remote Game ${label} Jobs`,      `remote ${base}`,      j=> j.discipline===d && j.workType==="Remote");
    mk(`senior-game-${tok}-jobs`,      `Senior Game ${label} Jobs`,      `senior ${base}`,      j=> j.discipline===d && j.seniority==="Senior");
    mk(`entry-level-game-${tok}-jobs`, `Entry-Level Game ${label} Jobs`, `entry-level ${base}`, j=> j.discipline===d && j.seniority==="Entry");
  }
  return specs;
}

// Internal "related searches" mesh: link each page to a handful of siblings so they're crawlable and
// share link equity. Prefer same kind, then fill from the rest. Caps at 8.
function relatedLinksHtml(cfg, allSpecs){
  const others = allSpecs.filter(s => s.slug !== cfg.slug);
  const same = others.filter(s => s.kind === cfg.kind);
  const rest = others.filter(s => s.kind !== cfg.kind);
  const pick = same.concat(rest).slice(0, 8);
  if (!pick.length) return "";
  return `<h2>Related searches</h2><div class="related">`
    + pick.map(s=>`<a class="rel" href="/${escHtml(s.slug)}">${escHtml(s.h1)}</a>`).join("")
    + `</div>`;
}

// FAQ (rendered with FAQPage structured data). Woven with the page's noun + live counts so it isn't
// boilerplate-identical across pages. Returns raw [question, answer] pairs (no HTML).
function faqFor(cfg, total, studios){
  return [
    ["Is DevQuest free to use?",
     "Yes — DevQuest is completely free, with no ads and no recruiters. You apply directly on each studio's own careers page."],
    [`How often are ${cfg.noun} roles updated?`,
     `Every hour. We pull ${cfg.noun} openings straight from studios' own career pages, so this list reflects what's live right now — currently ${total} role${total===1?"":"s"} across ${studios} studio${studios===1?"":"s"}.`],
    ["Does DevQuest show salary?",
     "When the studio publishes it, yes — we show the real figure and never invent a \"competitive\" range. Roles without published pay are shown without a salary tag."],
    ["How does DevQuest handle stale or ghost jobs?",
     "We show how long each role has been live, flag listings that keep getting re-posted, and drop links that go dead — so you don't waste time applying into the void."],
  ];
}

// Standalone /jobs hub — an internal index of every category/studio/skill page, reachable from search
// and giving crawlers one page that links to them all. Not part of the main app.
function renderHubPage(allSpecs, all){
  const group = (kind)=> allSpecs.filter(s=>s.kind===kind);
  const sect = (title, specs)=> specs.length ? `<h2>${escHtml(title)}</h2><div class="related">`
    + specs.map(s=>`<a class="rel" href="/${escHtml(s.slug)}">${escHtml(s.h1)}</a>`).join("") + `</div>` : "";
  const total = new Set(all.filter(j=>!isPool(j.title)).map(j=>(j.studio||"")+"|"+(j.title||""))).size;
  const url = "https://devquest.gg/jobs";
  const title = "Browse Game Dev Jobs by Category, City, Studio & Skill · DevQuest";
  const desc = `Every game-dev job category on DevQuest — by discipline, city, studio, game engine and skill. ${total} live roles, pulled from studio career pages and refreshed hourly. No ads.`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<meta name="description" content="${escHtml(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DevQuest">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:image" content="https://devquest.gg/og-image-v4.png">
<meta name="twitter:card" content="summary_large_image">
<style>
  :root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6}
  a{color:var(--accent)}
  header{padding:16px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
  .logo{font-size:20px;font-weight:800;text-decoration:none;color:var(--text)}.logo span{color:var(--accent)}
  .backbtn{color:var(--accent);font-size:13px;font-weight:600;text-decoration:none;border:1px solid var(--border);padding:7px 13px;border-radius:7px}
  .wrap{max-width:900px;margin:0 auto;padding:24px 24px 80px}
  h1{font-size:30px;font-weight:800;letter-spacing:-0.6px}
  .sub{color:var(--muted);font-size:16px;margin:12px 0 8px;max-width:680px}
  h2{font-size:18px;font-weight:800;margin:30px 0 4px}
  .related{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .related .rel{font-size:13px;text-decoration:none;color:var(--text);background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:6px 13px}
  .related .rel:hover{border-color:var(--accent);color:var(--accent)}
  footer{border-top:1px solid var(--border);margin-top:50px;padding:22px 24px;text-align:center;color:var(--muted);font-size:13px}
</style>
</head>
<body>
<header>
  <a class="logo" href="/">Dev<span>Quest</span><span>.gg</span></a>
  <a class="backbtn" href="/">Browse all jobs →</a>
</header>
<div class="wrap">
  <h1>Browse game-dev jobs by category</h1>
  <p class="sub">Every DevQuest category in one place — by discipline, studio, engine and skill. ${total} live roles, pulled straight from studios' own career pages and refreshed hourly.</p>
  <h2>Data</h2><div class="related"><a class="rel" href="/game-industry-hiring-report">Game Industry Hiring Report — pay, remote &amp; demand</a></div>
  ${sect("By discipline", group("discipline"))}
  ${sect("Remote & by seniority", group("combo"))}
  ${sect("By city", group("city"))}
  ${sect("By engine & skill", group("skill"))}
  ${sect("By studio", group("studio"))}
</div>
<footer>DevQuest.gg · Game dev jobs, fresh and honest · <a href="/">Browse all jobs</a> · <a href="/jobs">All categories</a> · <a href="/about">Our mission</a></footer>
</body>
</html>
`;
}

function writeLandingPages(all, dir){
  // Assemble every page spec: discipline (legacy configs) + skill + combo + studio.
  const discSpecs  = LANDING_PAGES.map(c => Object.assign({ kind: "discipline", breadcrumb: c.h1 }, c));
  const skillSpecs = skillPageSpecs(all);
  const taken = new Set([...discSpecs, ...skillSpecs].map(s => s.slug));   // combos skip already-taken slugs
  const comboSpecs  = comboPageSpecs(all, taken);
  const studioSpecs = studioPageSpecs(all);
  // City pages are generated LAST and are handed every slug already claimed, so a city can never
  // take a slug a studio or discipline page wanted. (A studio literally named after its city would
  // otherwise collide.)
  for (const sp of studioSpecs) taken.add(sp.slug);
  const citySpecs = cityPageSpecs(all, taken);
  // Dedupe by slug (first wins: discipline > skill > combo > studio).
  const bySlug = new Map();
  for (const s of [...discSpecs, ...skillSpecs, ...comboSpecs, ...studioSpecs, ...citySpecs]) if (!bySlug.has(s.slug)) bySlug.set(s.slug, s);
  const allSpecs = [...bySlug.values()];

  const slugs = [];
  for (const spec of allSpecs){
    try { fs.writeFileSync(path.join(dir, spec.slug + ".html"), renderLandingPage(spec, all, allSpecs)); slugs.push(spec.slug); }
    catch(e){ console.error(`landing ${spec.slug}: ${e.message}`); }
  }
  // Internal hub (/jobs) — one crawlable index that links to every category page above.
  try { fs.writeFileSync(path.join(dir, "jobs.html"), renderHubPage(allSpecs, all)); slugs.push("jobs"); }
  catch(e){ console.error(`hub: ${e.message}`); }
  // The hiring report. Regenerated with everything else so it is never stale — the whole point of a
  // living page over a dated post is that a citation earned months ago still resolves to true numbers.
  try { fs.writeFileSync(path.join(dir, HIRING_REPORT_SLUG + ".html"), renderHiringReport(all)); slugs.push(HIRING_REPORT_SLUG); }
  catch(e){ console.error(`hiring report: ${e.message}`); }

  // Regenerate sitemap.xml with <lastmod> (Google uses lastmod; it now ignores changefreq/priority).
  const today = new Date().toISOString().slice(0, 10);
  const urls = ["https://devquest.gg/", "https://devquest.gg/about"]
    .concat(slugs.map(s => "https://devquest.gg/" + s))
    .concat(JOB_PAGE_URLS);          // per-job pages (populated by writeJobPages, which runs first)
  const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + urls.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")
    + `\n</urlset>\n`;
  fs.writeFileSync(path.join(dir, "sitemap.xml"), sm);
  console.log(`Wrote ${slugs.length} SEO pages (${studioSpecs.length} studio, ${citySpecs.length} city, ${skillSpecs.length} skill, ${comboSpecs.length} combo, +hub) + sitemap.xml`);
}

// ---- Normalization helpers -------------------------------------------------

const DISCIPLINE_MAP = {
  art: "Art", animation: "Animation", audio: "Audio", design: "Design",
  engineering: "Engineering", "software engineering": "Engineering",
  production: "Production", "quality assurance": "QA", qa: "QA",
  marketing: "Marketing", communications: "Marketing", publishing: "Marketing",
  data: "Data & Analytics", analytics: "Data & Analytics", research: "Data & Analytics",
  "player support": "Player Support",
  hr: "People & Ops", "human resources": "People & Ops", people: "People & Ops", finance: "People & Ops",
  legal: "People & Ops", facilities: "People & Ops", security: "IT & Security",
  it: "IT & Security", "information technology": "IT & Security",
};

// Strong, role-defining title signals (EN + FR). When a title clearly names a craft, that beats
// whatever department the feed filed it under — many studios file e.g. a "Security Engineer" under
// a "Security" dept, which would otherwise land in the Business & Ops catch-all. Order matters:
// Audio/QA/Art/Animation/Design run before Engineering so "Audio Engineer" / "QA Engineer" /
// "Technical Artist" map to their craft; Engineering runs before Data so an "ML Engineer" is
// Engineering while an "ML Scientist/Researcher" stays Data. Returns a canonical discipline or null.
function strongTitleDiscipline(t) {
  if (/developer (relations|engagement|evangelis|advocat|marketing|outreach|experience rep|support|solutions?)|\bdev ?rel\b|community developer|content developer|video content|publisher developer relations/.test(t)) return "Marketing";
  if (/\baudio\b|sound design|\bcomposer\b|music design|\bsonore\b|conception sonore/.test(t)) return "Audio";
  if (/\bqa\b|quality assurance|\bqc\b|quality control|contr[ôo]le qualit|\btester\b|\bsdet\b|test (engineer|analyst|lead|automation|specialist)|quality (engineer|analyst|specialist)|assurance qualit/.test(t)) return "QA";
  if (/art director|\bartist\b|\bartiste\b|direct(eur|rice|ion) artistique|\bart lead\b|lead artist|concept art|\bvfx\b|\blighter\b|lighting (artist|lead)|environment artist|character artist|technical artist|technical art\b|(character|environment|prop|vehicle|weapon|texture) (artist|art|outsourc)/.test(t)) return "Art"; // \blighter\b = a lighting artist (film/game craft title, e.g. "Lighter - EA SPORTS FC")
  // Bare "art" as the role word: "AI Art Specialist", "Art Specialist/Lead/Manager/Outsourcing",
  // etc. The main Art rule keys on "artist"/specific combos and missed these. Word boundaries guard
  // out "smart", "part", "chart", "start", "state of the art".
  if (/\bai art\b|\bart (specialist|generalist|lead|director|manager|outsourc\w*|coordinator|supervisor|associate|intern|internship|trainee|apprentice|applications?)\b/.test(t)) return "Art";
  // Generative 3D-content roles (avatar / scene / model / character generation) read as Art, not the
  // Business & Ops catch-all, e.g. "3D Model, Scene, and Avatar Generation Algorithm Research Intern".
  // Guarded so "...generation engineer / pipeline / platform" roles stay Engineering.
  if (/\b(avatar|scene|character|texture|environment|3d (model|asset))s?\b[^.]*\bgenerati(on|ve)\b/.test(t)
      && !/\b(engineer|programmer|developer|pipeline|backend|infrastructure|sdk|platform)\b/.test(t)) return "Art";
  // "Generalist" in games almost always means a 3D/art generalist (e.g. "3D Unreal Generalist") —
  // EXCEPT corporate generalists (HR/People/Talent/etc.), which we guard out so they don't become Art.
  if (/\bgeneralist\b/.test(t) && !/\b(hr|human resources|people|talent|recruit|payroll|benefits|office|business|marketing|finance|legal|it|sales|community|player support)\b/.test(t)) return "Art";
  if (/\banimator\b|animation (director|lead|manager|supervisor)|\brigging\b|cinematics? (director|lead|supervisor|manager|animator|designer|editor|artist|coordinator)|\bcinematic editor\b|\bmocap\b|motion[ -]?capture/.test(t)) return "Animation";
  if (/game design|level design|systems? design|technical design|narrative design|\bwriter\b|\bscénariste\b|encounter design|combat design|content design|economy design|quality design|gameplay design|ux design|ui design|concepteur|conceptrice|conception de jeu|world build|world design|environment design|game (direct(or|ion)|lead)|creative direct(or|ion)|directeur (créatif|creatif)|directrice (créative|creative)/.test(t)) return "Design";
  // "Feature Lead / Feature Designer" at a game studio is design leadership (owns a game feature).
  // Adjacent "feature lead" only, so "Feature Engineering Lead" still falls to Engineering below.
  if (/\bfeature (team )?(lead|owner)\b|\bfeature design(er)?\b/.test(t)) return "Design";
  if ((/(engineers?|engineering|programmers?|programming|developers?|architects?)\b|architecte|ingénieur|programmeur|développeur|tech(nical)? (director|lead|manager)|\bback[ -]?end\b|\bfront[ -]?end\b|\bfull[ -]?stack\b|\bcoder\b|\bcoding\b|\b(gameplay|engine|tools?|graphics|rendering|networking?|systems?|game|gpu|simulation) code\b/.test(t)) && !/\bsales\b|customer success|account exec|solutions? consultant|product developer|developer (program|programme|community|ecosystem|partnership)|business develop(er|ment)|analytics developer/.test(t)) return "Engineering";
  // Game-engine programming roles where the title says "development" (noun), not "developer" —
  // e.g. "Lead Unity Game Development". Engine + a dev/programming signal, excluding art/design/audio
  // so "Unity Technical Artist" / "Unity UI Designer" stay in their crafts.
  if (/\b(unity|unreal|godot|cryengine|cocos)\b/.test(t) && /\b(develop|programm|gameplay|engine|tool|code|coder|coding|technical)/.test(t)
      && !/\bartist\b|\bart\b|designer|\bdesign\b|animator|\baudio\b/.test(t)) return "Engineering";
  // IT / infrastructure / network / security / systems roles read as Engineering (tech), e.g.
  // "Network and Security Technician", "Networking and Security Lead", "IT Support", "SysAdmin",
  // "DevOps". Guard out physical security / trust & safety / marketing-y "network" uses.
  if (/\b(network(ing)?|cyber ?security|info ?sec|information security|sys ?admin|systems? admin(istrator)?|site reliability|\bsre\b|dev ?ops|infrastructure|\bit\b[ -](support|technician|engineer|administrator|operations|ops|specialist|manager|lead|director)|help ?desk|security (engineer|analyst|architect|technician|specialist|lead|manager|administrator|operations|ops|director))\b/.test(t)
      && !/\bguard\b|physical security|trust (and|&) safety|loss prevention|social network|network marketing|developer network|partner network|ad network/.test(t)) return "Engineering";
  // Technical R&D leadership (e.g. "Director, Technology Research", "R&D Manager") → Engineering.
  // Scoped to technology/technical research so it won't grab user/market/player research.
  if (/\b(technology|technical) research\b|research (and|&) development|\br ?& ?d\b/.test(t)) return "Engineering";
  if (/machine learning|\bml\b ?(scientist|researcher|ops)|data scien|data analy(st|tics|sis)|business intelligence|\bbi analyst\b|insights? analyst|product analyst|\beconomist\b|analytics developer|deep learning|\bnlp\b|artificial intelligence|\bai (scientist|researcher|research)|\bof ai\b/.test(t)) return "Data & Analytics"; // product analysts & (game) economists are analytics, not product/finance
  // 3D/character/environment modelers are artists (FR "modeleur/modeleuse", "modéliste"). Title beats
  // the department. Guard the non-art "modeler" roles (data / financial / threat / risk modeler).
  if (/\bmodel(l)?er\b|\bmodeleu(r|se)\b|mod[ée]liste/.test(t) && !/\bdata\b|threat|financial|business|risk|econom|pricing|3d print/.test(t)) return "Art";
  // Technical AI roles (transformation/enablement/platform/automation/etc.) → Engineering.
  // Runs after the Data check so "AI Scientist/Researcher" still maps to Data & Analytics.
  if (/\bai\b[ -](transformation|enablement|adoption|integration|automation|platform|infrastructure|tooling|engineer|developer|architect|ops|operations|solutions?|strategy|program|programme)\b/.test(t)) return "Engineering";
  // "Development Director/Manager/Lead" = game-production leadership — but NOT HR "Learning & Development"
  // or "Business Development" (sales). Guarded so those stay out of Production.
  if ((/\bdevelopment (director|manager|lead)\b/.test(t) || /\bdirector of (core|game|studio|title|content|product|live) development\b/.test(t)) && !/business|learning|talent|\bl&d\b|\bpeople\b|organi[sz]ation/.test(t)) return "Production"; // also catches reversed order "Director of Core Development" (e.g. Kabam)
  // Reversed-order product leadership ("Senior Manager, Product"), but not product MARKETING.
  if (/\b(manager|director|lead|owner|vp),?\s+product\b/.test(t) && !/marketing/.test(t)) return "Production";
  if (/\b(project|programme?|delivery|release|portfolio)\s+(manager|management|coordinator|lead|director|assistant)\b|technical (program|project) manager|scrum master|agile coach|\bpmo\b|\bproducer\b|production (coordinator|manager|director|assistant)|product (manager|owner|management|director|lead)|director,? of product|director,?\s+product|(vp|head) of product|game manager|producteur|productrice|réalisat(eur|rice)|gestionnaire de (projet|programme)|chef de (projet|produit)|coordonnateur de projet/.test(t)) return "Production";
  return null;
}

function mapDiscipline(raw, title) {
  const t = (title || "").toLowerCase();
  // 1) Strong, role-defining title wins over the department (fixes the Business & Ops catch-all).
  const strong = strongTitleDiscipline(t);
  if (strong) return strong;
  // 2) Department mapping.
  const key = (raw || "").toLowerCase().trim();
  if (DISCIPLINE_MAP[key]) return DISCIPLINE_MAP[key];
  // Whole-word match only — a raw substring includes() wrongly mapped "partner"→art, "security"/
  // "digital"→it, "department"→art, etc. Word boundaries keep multi-word departments working
  // ("Software Engineering", "Data Science") without the false hits.
  for (const [k, v] of Object.entries(DISCIPLINE_MAP)) if (new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(key)) return v;
  // 3) Broader, less-specific title fallback (bare "designer", "ux", "analytics"…).
  // "Developer" shows up in many NON-engineering titles — developer relations / advocacy /
  // evangelism, community & content developers, developer marketing. Catch those first so they
  // don't fall into the Engineering bucket below (they're really Marketing / DevRel roles).
  if (/developer (relations|engagement|evangelis|advocat|marketing|outreach|experience rep|support|solutions?)|\bdev ?rel\b|community developer|content developer|video content|publisher developer relations/.test(t)) return "Marketing";
  if (/engineer|programmer|\bdeveloper|software|\bsre\b|devops|\bsdet\b/.test(t) && !/\bsales\b|customer success|account exec|solutions? consultant|product developer|developer (program|programme|community|ecosystem|partnership)|business develop(er|ment)|analytics developer/.test(t)) return "Engineering";
  if (/product (manager|owner|management)|head of product/.test(t)) return "Production"; // PMs grouped with Production
  if (/\blive ?ops\b|liveops/.test(t)) return "Production"; // live operations — a Production discipline in games
  if (/\bprogram manager\b/.test(t) && !/developer|marketing|\bbrand\b|communit|trust|compliance/.test(t)) return "Production"; // technical/dev program management (not DevRel/marketing/T&S/compliance PMs)
  if (/artist|concept|\bvfx\b|lighting|illustrat|sculpt/.test(t)) return "Art";
  // "rigging" was already here but "rigger" was not, so every "Senior Character Rigger" fell past
  // every rule below, hit the department fallback and landed in Business & Ops. Those riggers are
  // the bulk of the genuinely misfiled craft roles on the board (Ubisoft Montreal, Ubisoft
  // Reflections, Asobo). "animable" catches the French posting of the same job
  // ("Créateur.rice de systèmes animables (Rigger Sénior)").
  if (/animator|animation|rigger|rigging|riggeur|animable|animateur|animatrice/.test(t)) return "Animation"; // incl. FR animateur/animatrice/animable
  if (/\bux\b|\bui\b|user experience|user research/.test(t)) return "Design";
  if (/designer|design/.test(t)) return "Design";
  if (/producer|production/.test(t)) return "Production";
  if (/audio|sound|composer|\bmusic\b/.test(t)) return "Audio";
  if (/\bqa\b|quality|tester|\btest\b/.test(t)) return "QA";
  if (/locali[sz]ation\b/.test(t)) return "Production"; // localization folds into Production (LQA already caught by QA above)
  if (/writer|narrative/.test(t)) return "Design";
  // data: only clear data signals (NOT bare "analyst", which catches finance/business analysts)
  if (/\bdata\b|data scien|\banalytics\b|business intelligence|\bbi\b|insights/.test(t)) return "Data & Analytics";
  if (/player support|customer support|community support/.test(t)) return "Player Support";
  if (/human resources|\bhr\b|people (?:&|and) culture|people ops|people operations|talent acquisition|\brecruit(?:er|ing|ment)?\b|compensation|\bpayroll\b|\bbenefits\b|learning (?:&|and) development|\bl&d\b|relocation|mobility specialist/.test(t)) return "People & Ops"; // HR/People titles (esp. under generic "General"/"Corporate" departments)
  if (/market|\bbrand\b|public relations|\bpr\b|social media|communit|influencer|communication|esports|e-sports|tournament|organized play|broadcast|\bgrowth\b|user acquisition|\bua\b/.test(t)) return "Marketing"; // incl. esports / organized-play / broadcast / growth / UA community roles
  // Final fallback: a recognized department was already mapped above, so anything left is unknown.
  // Return the canonical catch-all — never the raw ATS string (that leaked junk like a studio or
  // status label into the discipline field, e.g. "Ubisoft" / "Currently Hiring").
  return "Other";
}

function inferSeniority(title) {
  const t = title.toLowerCase();
  // An assistant TO a leader (e.g. "Executive Assistant – General Manager") is not the leader.
  const assistant = /\bassistant\b/.test(t);
  if (!assistant && /\b(director|head of|vp|chief|executive producer|general manager|studio head|distinguished)\b/.test(t)) return "Director+"; // "distinguished" = top IC rung (Distinguished Engineer), director/exec-tier, not Mid
  if (/\b(lead|principal|staff)\b/.test(t)) return "Lead";
  if (/\b(senior|sr\.?)\b/.test(t)) return "Senior";
  if (/\b(junior|jr\.?|associate|intern|entry|apprentice)\b/.test(t)) return "Entry";
  return "Mid";
}

// Some ATS feeds (e.g. Greenhouse for Epic) emit "BLANK" as a placeholder for an unknown city or
// state, producing locations like "BLANK, BLANK, Multiple Locations". Strip those placeholder tokens
// while preserving structure: "; " separates distinct locations, "," separates city/state/country.
function cleanLocation(loc) {
  if (!loc) return loc;
  // Workday remote format e.g. "US-Remote(WA-Seattle Area)" -> "Seattle Area, US" (drops the state prefix).
  loc = String(loc).replace(/^([A-Za-z]{2})-Remote\(([^)]+)\)\s*$/, (m, cc, inner) => `${inner.replace(/^[A-Za-z]{2}-/, "").trim()}, ${cc.toUpperCase()}`);
  const isJunk = p => !p || /^(blank|n\/?a|null|undefined|unlisted|tbd|various)$/i.test(p);
  const cleanOne = one => {
    const parts = one.split(",").map(p => p.trim()).filter(p => !isJunk(p));
    const out = [];
    for (const p of parts) if (!out.length || out[out.length - 1].toLowerCase() !== p.toLowerCase()) out.push(p);
    return out.join(", ");
  };
  const locs = String(loc).split(";").map(s => cleanOne(s.trim())).filter(Boolean);
  const dedup = [];
  for (const p of locs) if (!dedup.some(x => x.toLowerCase() === p.toLowerCase())) dedup.push(p);
  return dedup.length ? dedup.join("; ") : "Unlisted";
}

function inferRegion(location) {
  const l = location.toLowerCase();
  // Leading ISO country-code prefix like "IL - Tel Aviv" / "ES - Spain" / "US - ...".
  // Must run before the US-state check, else "IL"(Israel) matches Illinois, "IN"(India) Indiana, etc.
  const pm = l.match(/^([a-z]{2})\s*[-–]\s+/);
  if (pm) {
    const CC = { us: "North America", ca: "North America", mx: "Latin America", br: "Latin America", ar: "Latin America", cl: "Latin America", co: "Latin America",
      gb: "Europe", uk: "Europe", ie: "Europe", fr: "Europe", de: "Europe", es: "Europe", pt: "Europe", pl: "Europe", ro: "Europe", nl: "Europe", be: "Europe", fi: "Europe", se: "Europe", cz: "Europe", cy: "Europe", ua: "Europe", rs: "Europe", it: "Europe", ch: "Europe", at: "Europe", dk: "Europe", no: "Europe", tr: "Europe",
      il: "Middle East & Africa", ae: "Middle East & Africa", sa: "Middle East & Africa", za: "Middle East & Africa", ma: "Middle East & Africa", eg: "Middle East & Africa",
      in: "Asia-Pacific", jp: "Asia-Pacific", cn: "Asia-Pacific", kr: "Asia-Pacific", sg: "Asia-Pacific", au: "Asia-Pacific", nz: "Asia-Pacific", vn: "Asia-Pacific", th: "Asia-Pacific", my: "Asia-Pacific", ph: "Asia-Pacific", id: "Asia-Pacific", tw: "Asia-Pacific", hk: "Asia-Pacific", bd: "Asia-Pacific" };
    if (CC[pm[1]]) return CC[pm[1]];
  }
  if (/(united states|usa|\b(ca|wa|tx|ny|md|fl|il|ma|nc|ga)\b|los angeles|seattle|austin|new york|san (francisco|mateo|diego)|bellevue|irvine|burbank|santa monica|redmond|mercer island|atlanta|chicago|boston|novato)/.test(l)) return "North America";
  if (/(canada|montreal|montréal|toronto|vancouver|quebec)/.test(l)) return "North America";
  if (/(mexico|brazil|são paulo|sao paulo|argentina|chile|colombia)/.test(l)) return "Latin America";
  if (/(uk|united kingdom|london|oxford|horsham|brighton|derby|sheffield|leamington|ireland|dublin|france|paris|lyon|germany|berlin|poland|warsaw|romania|bucharest|spain|barcelona|madrid|portugal|lisbon|porto|belgium|ghent|netherlands|amsterdam|zoetermeer|finland|espoo|helsinki|sweden|stockholm|turkey|türkiye|istanbul|czech|prague|cyprus|nicosia|limassol|ukraine|kyiv|kiev|kharkiv|lviv|serbia|belgrade|beograd|novi sad|warrington|cheshire|\beurope\b)/.test(l)) return "Europe";
  if (/(japan|tokyo|china|shanghai|guangzhou|beijing|hong kong|korea|seoul|singapore|taiwan|taipei|australia|sydney|melbourne|new zealand|auckland|wellington|india|bangalore|mumbai|vietnam|hanoi|ho chi minh|thailand|bangkok|malaysia|philippines|manila|indonesia|jakarta|bangladesh|dhaka)/.test(l)) return "Asia-Pacific";
  if (/(dubai|uae|saudi|riyadh|israel|tel aviv|herzliya|south africa|morocco|casablanca)/.test(l)) return "Middle East & Africa";
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
    // 3a) STRONG NEGATION first — postings that explicitly say remote is NOT offered. Must run
    // before the positive remote check, or phrases like "remote positions are not available"
    // (Aspyr) false-match the "remote position" pattern and wrongly read as Remote.
    if (/remote\s*(?:positions?|work|roles?|options?)?\s*(?:are|is)\s*not\s*(?:available|offered|possible|permitted|an option)|no\s+remote\b|not\s+(?:a\s+)?remote\s+(?:position|role|option|opportunit)|in[- ]?(?:person|office)\s+only|on-?site\s+only|fully\s+(?:on-?site|in-?office)|must\s+(?:be\s+)?(?:able\s+to\s+)?(?:work\s+)?(?:on-?site|in[- ]?office)/.test(body))
      return "Onsite";
    if (/\bhybrid\b|\d+\s*days?\s*(?:per week|a week|\/wk|\/week|in[- ]?office|on-?site)|split between (?:home|the office)/.test(body))
      return "Hybrid";
    if (/fully remote|100% remote|remote[- ]first|work[- ]from[- ]home|\bwfh\b|telecommut|fully distributed|this (?:role|position) is remote|(?:role|position) (?:is|can be) (?:fully )?remote|remote(?:[- ]eligible| position| role| opportunity)|open to (?:fully )?remote|work(?:ing)? remotely|remotely\s+(?:within|from|in|across|anywhere)|remote\s+within/.test(body))
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
    .replace(/&amp;/g, "&")   // collapse double-encoded entities first (e.g. "&amp;mdash;" -> "&mdash;")
    // Preserve dash entities as REAL dashes before the generic entity->space passes below. Otherwise a
    // salary range written "$120,000 &mdash; $150,000" loses its separator (becomes a space), the range
    // parser misses it, and only the first number survives as a misleading single salary.
    .replace(/&mdash;|&#8212;|&#x2014;/gi, "—").replace(/&ndash;|&#8211;|&#x2013;/gi, "–")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ").replace(/&\w+;/g, " ")
    .replace(/<[^>]*>/g, " ");
}

function extractSalary(text) {
  if (!text) return null;
  // Defensive: normalize entity dashes to real dashes so a range separator is never lost, even if the
  // caller passes text that didn't go through stripHtml (e.g. a verbatim source pay string).
  text = String(text).replace(/&amp;/g, "&").replace(/&mdash;|&#8212;|&#x2014;/gi, "—").replace(/&ndash;|&#8211;|&#x2013;/gi, "–");
  let lo = null, hi = null;
  // Pattern 3 below already matched EUR/GBP/CAD amounts, but the formatter hard-coded "$", so
  // "60,000 - 80,000 GBP" was published as "$60K-$80K" — pounds relabelled as dollars. Track the
  // currency and format with it. CAD renders as "CAD 60K", not "CA$60K", because anything
  // containing "$NNK-$NNK" is matched by the board's display regexes and would be swept back
  // into the USD averages.
  let curSym = "$";
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
    const m3 = text.match(/([\d]{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(?:-|–|—|to)\s*([\d]{1,3}(?:,\d{3})+(?:\.\d+)?)\s*(USD|CAD|EUR|GBP)\b/i);
    if (m3) { lo = parseFloat(m3[1].replace(/,/g, "")); hi = parseFloat(m3[2].replace(/,/g, ""));
      const cc = (m3[3] || "USD").toUpperCase();
      curSym = cc === "GBP" ? "\u00a3" : cc === "EUR" ? "\u20ac" : cc === "CAD" ? "CAD " : "$"; }
  }
  if (lo == null || hi == null) {
    // 3b) non-USD range (GBP/EUR). Tried before the single-figure USD fallback so a European
    // listing yields a real range instead of falling through to null.
    const nu = extractNonUsdSalary(text);
    if (nu) return nu;
    // 4) single annual figure, anchored to a salary keyword so we never grab stray $ amounts
    // (sign-on bonuses, budgets, etc.). e.g. careers-page bodies: "Salary: $156,000 USD".
    const m4 = text.match(/(?:salary|compensation|base\s*pay|base\s*salary|total\s*comp(?:ensation)?)\b[^$]{0,40}\$\s?([\d][\d,.]*)\s*([kK])?/i);
    if (m4) {
      let n = parseFloat(m4[1].replace(/,/g, "")); if (m4[2]) n *= 1000;
      if (n >= 10000 && n <= 2000000) return "$" + Math.round(n / 1000) + "K";
    }
    return null;
  }
  // sanity: annual USD salaries only (skip hourly rates and nonsense)
  if (!(lo >= 10000 && hi > lo && hi <= 2000000)) return null;
  const f = n => curSym + Math.round(n / 1000) + "K";
  return f(lo) + "–" + f(hi);
}

// Parse a number written in either convention: "45,000" / "45.000" / "45 000" -> 45000,
// while "45.5" / "45,5" stay 45.5. Rule: a separator followed by exactly three digits is a
// thousands separator; when BOTH . and , appear, the last one is the decimal point.
function _parseAmount(raw) {
  let s = String(raw).replace(/[  \s]/g, "");
  const d = s.lastIndexOf("."), c = s.lastIndexOf(",");
  if (d >= 0 && c >= 0) s = (d > c) ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  else if (c >= 0)      s = /,\d{3}(?!\d)/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (d >= 0)      s = /\.\d{3}(?!\d)/.test(s) ? s.replace(/\./g, "") : s;
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

// Non-USD salary ranges (GBP + EUR). extractSalary above is anchored on "$" in three of its four
// patterns and the fourth needs comma-grouped thousands plus a currency word, so "£45,000 – £60,000"
// and "45.000 - 60.000 €" were invisible: Europe read as 0-for-700 roles listing pay, which is a
// parser gap, not a market truth.
//
// Two deliberate limits:
//  1. An explicit currency marker MUST sit beside one of the numbers. Without that anchor a bare
//     "45 000 - 60 000" would cheerfully match years, headcounts or ticket ranges.
//  2. GBP and EUR only. Sweden, Poland and Japan commonly quote salaries MONTHLY, and silently
//     republishing a monthly figure as an annual salary is worse than publishing nothing at all.
//     Those need per-market handling before they can be trusted.
// The currency is preserved in the output ("£45K–£60K"), never rewritten as dollars.
function extractNonUsdSalary(text) {
  if (!text) return null;
  const t = String(text);
  if (!/[£€]|\bGBP\b|\bEUR\b/i.test(t)) return null;          // fast reject: no currency anchor
  const SYM = "(?:£|€|GBP|EUR)";
  const N   = "\\d[\\d.,\\u00A0\\u202F ]{0,13}\\d|\\d";
  const SEP = "\\s*(?:-|–|—|to|up to)\\s*";
  const pats = [
    new RegExp("(" + SYM + ")\\s*(" + N + ")\\s*([kK])?" + SEP + "(?:" + SYM + ")?\\s*(" + N + ")\\s*([kK])?", "i"), // £45,000 - £60,000
    new RegExp("(" + N + ")\\s*([kK])?" + SEP + "(" + N + ")\\s*([kK])?\\s*(" + SYM + ")", "i")                      // 45.000 - 60.000 €
  ];
  for (let i = 0; i < pats.length; i++) {
    const m = t.match(pats[i]);
    if (!m) continue;
    const sym = (i === 0 ? m[1] : m[5]);
    let lo, hi;
    if (i === 0) { lo = _parseAmount(m[2]); hi = _parseAmount(m[4]); if (m[3]) lo *= 1000; if (m[5]) hi *= 1000; }
    else         { lo = _parseAmount(m[1]); hi = _parseAmount(m[3]); if (m[2]) lo *= 1000; if (m[4]) hi *= 1000; }
    if (lo == null || hi == null) continue;
    if (!(lo >= 10000 && hi > lo && hi <= 2000000)) continue;   // same annual sanity window as USD
    const s = /£|GBP/i.test(sym) ? "£" : "€";
    return s + Math.round(lo / 1000) + "K–" + s + Math.round(hi / 1000) + "K";
  }
  return null;
}

// Collapse any salary string we display to one compact shape ("$120K–$150K" or "$120K").
// Most fetchers already emit this via extractSalary, but a few pass through a verbatim pay
// string from the source ("From $123,000 to $145,000 per year"); this re-parses those so the
// board stays visually consistent. Hourly / non-USD / unparseable strings are left untouched.
function prettySalary(s) {
  if (!s) return s;
  const range = extractSalary(s);
  if (range) return range;
  const m = String(s).match(/\$\s?([\d][\d,]*)\s*([kK])?\s*\/?\s*(?:yr|year|annually|annum|per\s*year|\/yr)/i);
  if (m) { let n = parseFloat(m[1].replace(/,/g, "")); if (m[2]) n *= 1000;
    if (n >= 10000 && n <= 2000000) return "$" + Math.round(n / 1000) + "K"; }
  return s;
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

// Transient failures (throttling, brief 5xx, network blips, timeouts) make a healthy source return 0
// for a single run and get flagged "likely broken". Retry those a couple of times with backoff + jitter;
// real 4xx (404/401/403/410) still fail fast so genuine breaks surface immediately.
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchRetry(url, { headers = {}, ms = 15000, attempts = 3, method = "GET", body, retryStatus = RETRY_STATUS } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    let res;
    try {
      res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    } catch (e) {                       // network error / timeout (abort) — transient
      clearTimeout(timer); lastErr = e;
      if (i === attempts - 1) throw e;
      await sleep(600 * 2 ** i + Math.random() * 300); continue;
    }
    clearTimeout(timer);
    if (res.ok) return res;
    lastErr = new Error(`HTTP ${res.status}`);
    if (!retryStatus.has(res.status) || i === attempts - 1) throw lastErr;   // real 4xx fail fast (unless caller opts a status in)
    await sleep(600 * 2 ** i + Math.random() * 300);                          // ~0.6s, then ~1.2s
  }
  throw lastErr;
}

async function fetchJson(url) {
  const res = await fetchRetry(url, { headers: { "User-Agent": "DevQuest/0.1 (game-dev job aggregator)" } });
  return res.json();
}

async function fetchGreenhouse(studio) {
  const data = SAMPLE_FILE ? loadSample(studio)
    : await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${studio.token}/jobs?content=true`);
  if (!data) return [];
  let jobs = data.jobs || [];
  // Optional per-studio title filters. A shared Greenhouse board (e.g. Nintendo) can host
  // several sub-studios tagged in the title, e.g. "... (Retro Studios)". titleInclude carves
  // out one studio's roles; titleExclude drops them from the parent so they aren't duplicated;
  // titleStrip removes the now-redundant tag from the displayed title.
  if (studio.titleInclude) { const re = new RegExp(studio.titleInclude, "i"); jobs = jobs.filter(j => re.test(j.title || "")); }
  if (studio.titleExclude) { const re = new RegExp(studio.titleExclude, "i"); jobs = jobs.filter(j => !re.test(j.title || "")); }
  // Multi-brand corporate boards (e.g. Hasbro hosts toys + corporate + all game brands on one board).
  // deptInclude keeps only the departments belonging to the studio we actually want (regex on dept name).
  if (studio.deptInclude) { const re = new RegExp(studio.deptInclude, "i"); jobs = jobs.filter(j => (j.departments || []).some(d => re.test(d.name || ""))); }
  return jobs.map(j => {
    const location = j.location?.name || "Unlisted";
    const craft = ["Craft", "Career Page - Sub Department", "Job Family", "Job Family Group"]
      .map(f => metaValue(j.metadata, f)).find(v => v) || null;
    const desc = stripHtml(j.content);
    const dept = studio.deptAsStudio ? metaValue(j.metadata, "Career Page - Department") : null;
    const isStudioDept = dept && STUDIO_DEPT.test(dept);
    const title = studio.titleStrip ? String(j.title || "").replace(new RegExp(studio.titleStrip, "ig"), "").replace(/\s+/g, " ").trim() : j.title;
    return {
      id: `gh-${studio.token}-${j.id}`,
      title,
      tech: extractTech(j.title + " " + desc),
      desc,
      studio: isStudioDept ? dept : studio.name,
      discipline: mapDiscipline(craft, j.title),
      workType: inferWorkType(j.title, location, j.metadata, desc.slice(0, 1200)),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(j.title),
      salary: extractSalary(desc),
      yoe: extractYoe(desc),
      postedAt: j.first_published || j.updated_at,
      deadline: j.application_deadline || null,          // -> validThrough on the job page, when the studio sets one
      // Some studios route applicants through their own careers site using the Greenhouse job id
      // (e.g. Unity: unity.com/careers/positions?gh_jid=<id>) and let the old boards.greenhouse.io
      // URL 404. An optional per-studio applyTemplate ("...{id}...") rebuilds a working apply link.
      url: studio.applyTemplate ? studio.applyTemplate.replace("{id}", j.id) : j.absolute_url,
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
      tech: extractTech(o.title + " " + desc),
      desc,
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

// ---- Personio (Com2uS, KING Art, Travian + many EU/KR studios) ---------------
// Public JSON feed: https://<token>.jobs.personio.com/search.json?language=en -> [ {id,name,office,
// department,category,description,...} ]. No posted date in the feed, so postedAt stays null (honest
// "date n/a", like EA). We skip Personio's evergreen "initiative/spontaneous application" pools.
const PERSONIO_SKIP = /\b(initiativ|spontaneous|speculative|unsolicited|general application|application pool|talent (pool|community)|career (registration|pool)|open application)/i;
async function fetchPersonio(studio) {
  const data = SAMPLE_FILE ? loadSample(studio)
    : await fetchJson(`https://${studio.token}.jobs.personio.com/search.json?language=en`);
  if (!Array.isArray(data)) return [];
  return data
    .filter(o => o && o.name && !PERSONIO_SKIP.test(o.name + " " + (o.category || "")))
    .map(o => {
      const location = o.office || (Array.isArray(o.offices) && o.offices[0]) || "Unlisted";
      const desc = stripHtml(o.description || "");
      return {
        id: `personio-${studio.token}-${o.id}`,
        title: o.name,
        tech: extractTech(o.name + " " + desc),
      desc,
        studio: studio.name,
        discipline: mapDiscipline(o.department || o.category || "", o.name || ""),
        workType: inferWorkType(o.name || "", location, [], desc.slice(0, 1200)),
        location,
        region: inferRegion(location),
        seniority: inferSeniority(o.name || ""),
        salary: extractSalary(desc),
        yoe: extractYoe(desc),
        postedAt: null,
        url: `https://${studio.token}.jobs.personio.com/job/${o.id}?language=en`,
      };
    });
}

async function fetchRippling(studio) {
  // Rippling ATS public board feed (JSON). Minimal fields (no job description), so salary / yoe /
  // posted-date stay honestly Unknown. Endpoint: api.rippling.com/platform/api/ats/v1/board/<token>/jobs
  const data = SAMPLE_FILE ? loadSample(studio)
    : await fetchJson(`https://api.rippling.com/platform/api/ats/v1/board/${studio.token}/jobs`);
  if (!Array.isArray(data)) return [];
  return data.map(o => {
    const raw = (o.workLocation && o.workLocation.label) || "Unlisted";
    const m = raw.match(/^Hybrid\s*\((.+)\)\s*$/i);   // "Hybrid (Southampton, England, GB)" -> city only
    const location = (m ? m[1] : raw).trim();
    const dept = (o.department && o.department.label) || "";
    const title = (o.name || "").trim();
    return {
      id: `rip-${studio.token}-${o.uuid}`,
      title,
      tech: extractTech(title),
      studio: studio.name,
      discipline: mapDiscipline(dept, title),
      workType: inferWorkType(title, raw, [], ""),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: "",
      yoe: null,
      postedAt: null,
      url: o.url || `https://ats.rippling.com/${studio.token}/jobs/${o.uuid}`,
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
      // Lever states the currency outright; honour it instead of stamping every range "$".
      const _lc = String(j.salaryRange.currency || "USD").toUpperCase();
      const _ls = _lc === "GBP" ? "\u00a3" : _lc === "EUR" ? "\u20ac" : _lc === "USD" ? "$" : (_lc + " ");
      const f = n => _ls + Math.round(n / 1000) + "K";
      salary = f(j.salaryRange.min) + "–" + f(j.salaryRange.max);
    } else salary = extractSalary(desc);
    return {
      id: `lever-${studio.token}-${j.id}`,
      title: j.text,
      empType: j.categories?.commitment || null,          // Lever states this outright ("Full-time", "Contract")
      tech: extractTech(j.text + " " + desc),
      desc,
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
      // Workday's bot mitigation 422s non-browser User-Agents (this is what disabled the fetcher
      // in June 2026 — the body variants were never the problem). Present as a real browser.
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
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
    // Prefer the studio's own "department" (e.g. "Level Design") over SmartRecruiters' generic
    // "function" taxonomy, which studios sometimes mis-set — People Can Fly tagged a Level Design
    // role's function as "Production". Department is the real team; mapDiscipline's title fallback
    // still covers cases where a department is non-disciplinary.
    const dept = j.department?.label || j.function?.label;
    const exp = (j.experienceLevel?.label || "").toLowerCase();
    // An explicit level in the TITLE (Senior/Lead/Junior…) is more reliable than SmartRecruiters'
    // experienceLevel, which studios mis-set (CDPR tagged a "Senior Gameplay Animator" as entry-level).
    // Use the title when it's explicit; defer to experienceLevel only when the title is ambiguous.
    const titleSen = inferSeniority(j.name || "");
    const seniority = titleSen !== "Mid" ? titleSen
      : /director|executive/.test(exp) ? "Director+"
      : /senior/.test(exp) ? "Senior" : /entry|junior|intern|apprentice/.test(exp) ? "Entry"
      : /mid/.test(exp) ? "Mid" : "Mid";
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
  // Optional per-studio title filters — same contract as fetchGreenhouse. One Workable account
  // can host several sub-studios tagged in the title (e.g. Keywords Studios' international board
  // carries "Principal Level Designer - d3t"). titleInclude carves out one sub-studio's roles;
  // titleExclude drops them from the parent board so they aren't listed twice; titleStrip removes
  // the now-redundant tag from the displayed title.
  if (studio.titleInclude) { const re = new RegExp(studio.titleInclude, "i"); jobs = jobs.filter(j => re.test(j.title || "")); }
  if (studio.titleExclude) { const re = new RegExp(studio.titleExclude, "i"); jobs = jobs.filter(j => !re.test(j.title || "")); }
  return jobs.map(j => {
    const location = [j.city, j.state, j.country].filter(Boolean).join(", ") || "Unlisted";
    const remote = j.remote || j.telecommuting;
    const title = studio.titleStrip
      ? String(j.title || "").replace(new RegExp(studio.titleStrip, "ig"), " ").replace(/\s+/g, " ").replace(/[\s\-–—|,]+$/, "").trim()
      : j.title;
    return {
      id: `wk-${studio.token}-${j.shortcode || j.id}`,
      title,
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
      tech: extractTech((j.title || "") + " " + stripHtml(j.description || j.descriptionTeaser || "")),
      desc: stripHtml(j.description || j.descriptionTeaser || ""),
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
// Newer Teamtailor "cards" theme (e.g. Yodo1): the title <a> and the
// "<div class='mt-1'>Dept · Team · Location</div>" meta are SIBLINGS inside an <li>,
// so the meta lives just AFTER the </a> (not inside it, as the classic theme does).
// This theme also injects the company/team name (studio.team, e.g. "Yodo1") as a meta
// token, which we strip. Gated by studio.theme === "cards" so the classic path is
// untouched for the ~30 studios on the older layout.
function cardsDiscipline(dept, title) {
  const base = mapDiscipline(dept, title);
  if (base !== "Other") return base;
  const d = (dept || "").toLowerCase(), t = title.toLowerCase();
  if (/operations|commercial|business|admin|people|\bhr\b|talent|finance|legal|licens/.test(d)) return "Business & Ops";
  if (/publish/.test(d)) return "Production";
  if (/technical|engineering|\bit\b/.test(d)) return "Engineering";
  if (/creative/.test(d)) return "Art";
  if (/\bcreative\b/.test(t)) return "Art";
  if (/live ?ops/.test(t)) return "Production";
  if (/recruit|sourcer|talent|people|assistant|office manager|administrative|\bhr\b/.test(t)) return "Business & Ops";
  if (/\bpublishing\b|\bpublisher\b/.test(t)) return "Production";
  if (/\bsales\b|account manager|business development|\bbd\b/.test(t)) return "Business & Ops";
  return "Business & Ops"; // publisher back-office remainder — better than a bare "Other"
}
function parseTeamtailorCards(html, studio) {
  const anchors = [...html.matchAll(/<a[^>]*href="(https?:\/\/[^"]*\/jobs\/(\d+)-[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
  const out = [], seen = new Set();
  for (let i = 0; i < anchors.length; i++) {
    const m = anchors[i], url = m[1], id = m[2], inner = m[3];
    if (seen.has(id)) continue;
    const title = decodeEnt(inner.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
    if (!title || title.length < 3 || title.length > 120) continue;
    seen.add(id);
    // meta div sits between this anchor and the next job anchor (or end of scope)
    const from = m.index + m[0].length;
    const to = anchors[i + 1] ? anchors[i + 1].index : from + 800;
    let dept = null, location = "Remote", metaWorkType = null;
    const meta = html.slice(from, to).match(/<div class="mt-1[^"]*">([\s\S]*?)<\/div>/);
    if (meta) {
      const parts = decodeEnt(meta[1].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim()
        .split("·").map(s => s.trim()).filter(Boolean);
      // Meta reads "Dept? · Location(s) · Work-type?". The company/team name (studio.team)
      // is either a bare label to drop (Yodo1: "Yodo1") or a prefix on office names
      // (Madbox: "Madbox Paris" -> "Paris"). A remote/hybrid/on-site token sets work type.
      const team = (studio.team || "").toLowerCase();
      const WT = /^(fully remote|remote|hybrid|on[-\s]?site|onsite|in office)$/i;
      const cities = [], rest = [];
      for (const p of parts) {
        if (WT.test(p)) { const pl = p.toLowerCase(); metaWorkType = /hybrid/.test(pl) ? "Hybrid" : /remote/.test(pl) ? "Remote" : "Onsite"; continue; }
        if (team && p.toLowerCase() === team) continue;                    // bare company label
        if (team && p.toLowerCase().includes(team)) {                       // office e.g. "Madbox Paris"
          const city = p.replace(new RegExp(studio.team, "ig"), "").replace(/\s+/g, " ").trim();
          if (city) cities.push(city);
          continue;
        }
        rest.push(p);                                                       // department candidate
      }
      if (rest.length) dept = rest[0];
      if (cities.length) location = cities.join(", ");
      else if (rest.length >= 2) location = rest.slice(1).join(", "); // "Dept · Location" with no team-name token (e.g. Steel City)
      else if (metaWorkType === "Remote") location = "Remote";
      else if (metaWorkType && studio.city) location = studio.city; // Hybrid/Onsite with no city -> studio HQ
      else if (metaWorkType) location = metaWorkType;
    }
    if (/^fully remote$/i.test(location) || /^remote$/i.test(location)) location = "Remote";
    out.push({
      id: `tt-${studio.token}-${id}`,
      title,
      studio: studio.name,
      discipline: cardsDiscipline(dept, title),
      workType: metaWorkType || inferWorkType(title, location, []),
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
function parseTeamtailor(html, studio) {
  if (studio.theme === "cards") return parseTeamtailorCards(html, studio);
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
    let dept = null, location = "Unlisted", metaWorkType = null;
    const meta = inner.match(/<div class="mt-1[^"]*">([\s\S]*?)<\/div>/);
    if (meta) {
      // decode entities first (so · separators are real), strip tags, split on the bullet
      const text = decodeEnt(meta[1].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
      let parts = text.split("·").map(s => s.trim()).filter(Boolean);
      // Opt-in cleaning (studios with a team token, e.g. Snowprint whose meta reads
      // "Code · Snowprint Stockholm · Hybrid"): pull the work-type out of the parts and
      // strip the company/team prefix from office names ("Snowprint Stockholm" -> "Stockholm").
      // Gated on studio.team so the many classic-theme studios are completely unaffected.
      if (studio.team) {
        const WT = /^(fully remote|remote|hybrid|on[-\s]?site|onsite|in office)$/i;
        const tr = new RegExp("^" + studio.team.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+", "i");
        const kept = [];
        for (const p of parts) {
          if (WT.test(p)) { const pl = p.toLowerCase(); metaWorkType = /hybrid/.test(pl) ? "Hybrid" : /remote/.test(pl) ? "Remote" : "Onsite"; continue; }
          const c = p.replace(tr, "").trim();
          if (c) kept.push(c);
        }
        parts = kept.length ? kept : (metaWorkType ? [metaWorkType] : []);
      }
      if (parts.length >= 2) { dept = parts[0]; location = parts.slice(1).join(", "); }
      else if (parts.length === 1) location = parts[0];
    }
    out.push({
      id: `tt-${studio.token}-${id}`,
      title,
      studio: studio.name,
      discipline: mapDiscipline(dept, title),
      workType: metaWorkType || inferWorkType(title, location, []),
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
      tech: extractTech((j.name || "") + " " + stripHtml(j.job_description || "")),
      desc: stripHtml(j.job_description || ""),
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
      tech: extractTech((j.title || "") + " " + stripHtml((j.description_short || "") + " " + (j.basic_qualifications || ""))),
      desc: stripHtml((j.description_short || "") + " " + (j.basic_qualifications || "")),
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
// Some Ashby customers disable the public jobs.ashbyhq.com board and host postings on their own
// site (the Ashby API still serves the data, but its jobUrl 404s). For those we build the on-site
// deep link from the title slug — an exact slug opens the role; a near-miss degrades gracefully to
// the studio's own careers list (a working page), never the dead Ashby URL.
const ASHBY_SITE = {
  supercell: { base: "https://supercell.com/en/careers/", suffix: "/?source=Supercell.com" }, // public Ashby board disabled
};
function _ashbySlug(s){ return String(s||"").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }
function ashbyJobUrl(studio, j){
  const cfg = ASHBY_SITE[studio.token];
  if (cfg) return cfg.base + _ashbySlug(j.title) + "/" + j.id + (cfg.suffix || "");
  return j.jobUrl || j.applyUrl || `https://jobs.ashbyhq.com/${studio.token}/${j.id}`;
}
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
      tech: extractTech(j.title + " " + desc),
      desc,
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
      url: ashbyJobUrl(studio, j),
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
  // drop evergreen "speculative / open / general application" placeholders (not real openings)
  result = result.filter(j => !/speculative|spontaneous|open application|general application|talent pool|future opportunit/i.test(j.jobOpeningName || ""));
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

// ---- Sumo Digital (bespoke: custom WordPress careers table) ------------------
// They moved off Lever to a self-hosted board; the "vacancy" CPT's REST endpoint returns 0,
// so we parse the server-rendered <table>. Each row:
//   <tr data-item-id="…"><td><a href="…">Title</a></td><td>Location</td><td>Dept</td><td>Type</td></tr>
// No salary or posted date on the board (firstSeen is stamped by applyListingHistory).
function parseSumoDigital(html, studio) {
  const re = /<tr[^>]*data-item-id="([^"]*)"[^>]*>\s*<td>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/g;
  const strip = s => decodeEnt(String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
  const out = []; let m;
  while ((m = re.exec(html))) {
    const id = m[1], url = m[2], title = strip(m[3]); if (!title) continue;
    const location = strip(m[4]) || "Unlisted";
    const deptRaw = strip(m[5]);                                  // Sumo uses Art / Code / Design
    const typeStr = strip(m[6]);                                  // e.g. "Permanent / Remote"
    const dept = /^code$/i.test(deptRaw) ? "Engineering" : deptRaw;
    const workType = /remote/i.test(typeStr) ? "Remote" : (/hybrid/i.test(typeStr) ? "Hybrid" : (/on-?site|in-?studio/i.test(typeStr) ? "On-site" : inferWorkType(title, location, [])));
    out.push({
      id: `sumo-${id || url.slice(-10)}`,
      title, studio: studio.name,
      discipline: mapDiscipline(dept, title),
      workType,
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null, yoe: null, postedAt: null, url,
    });
  }
  return out;
}
async function fetchSumoDigital(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(studio.url || "https://www.sumo-digital.com/careers/"); }
  return parseSumoDigital(html, studio);
}


// ---- Breezy HR ({company}.breezy.hr/json) -----------------------------------
// Public JSON of published positions; array of { name, department, location, url, published_date }.
async function fetchBreezy(studio) {
  const data = SAMPLE_FILE ? loadSample(studio) : await fetchJson(`https://${studio.token}.breezy.hr/json`);
  if (!Array.isArray(data)) return [];
  return data.map(j => {
    const loc = (j.location && (j.location.name || [j.location.city, j.location.country && j.location.country.name].filter(Boolean).join(", "))) || "Unlisted";
    return {
      id: `breezy-${studio.token}-${j._id || j.friendly_id || (j.url || "").split("/").pop()}`,
      title: j.name || "",
      studio: studio.name,
      discipline: mapDiscipline(j.department || null, j.name || ""),
      workType: inferWorkType(j.name || "", loc, []),
      location: loc,
      region: inferRegion(loc),
      seniority: inferSeniority(j.name || ""),
      salary: null,
      yoe: null,
      postedAt: j.published_date || j.creation_date || null,
      url: j.url || `https://${studio.token}.breezy.hr/`,
    };
  });
}

// ---- Manatal / careers-page.com (api/v1.0/c/{slug}/jobs/) --------------------
// Public Django-REST feed behind careers-page.com career portals. Paginated
// ({count,next,results}); each result has position_name, hash (slug) and location
// fields. No posted date in the feed, but the full description is included, so we
// mine salary / years-of-experience / tech from it (some studios put pay in the body).
async function fetchManatal(studio) {
  const mapJob = j => {
    const text = stripHtml(j.description || "");
    let loc = j.location_display || [j.city, j.state, j.country].filter(Boolean).join(", ") || "Remote";
    loc = loc.split(", ").filter((p, i, a) => p && p !== a[i - 1]).join(", ") || "Remote";
    return {
      id: `manatal-${studio.token}-${j.hash || j.id}`,
      title: j.position_name || "",
      tech: extractTech((j.position_name || "") + " " + text),
      desc: text,
      studio: studio.name,
      discipline: mapDiscipline(null, j.position_name || ""),
      workType: inferWorkType(j.position_name || "", loc, [], text.slice(0, 1500)),
      location: loc,
      region: inferRegion(loc),
      seniority: inferSeniority(j.position_name || ""),
      salary: extractSalary(text),
      yoe: extractYoe(text),
      postedAt: null,
      url: `https://www.careers-page.com/${studio.token}/job/${j.hash}`,
    };
  };
  if (SAMPLE_FILE) { const d = loadSample(studio); return ((d && d.results) || []).map(mapJob); }
  const out = [];
  let url = `https://www.careers-page.com/api/v1.0/c/${studio.token}/jobs/?page_size=100`;
  for (let i = 0; i < 20 && url; i++) {
    const data = await fetchJson(url);
    if (!data) break;
    out.push(...((data.results) || []).map(mapJob));
    url = data.next || null;
  }
  return out;
}

// ---- Pinpoint (pinpointhq.com) ----------------------------------------------
// Public, no-auth JSON feed: GET https://<token>.pinpointhq.com/postings.json
// → { data: [ { id, title, url, employment_type, workplace_type, compensation_*,
//   job:{ department:{ name } }, location:{ city, province, name } } ] }.
// No posted date is provided, so first-seen tracking (seen.json) handles freshness.
async function fetchPinpoint(studio) {
  let rows = [];
  if (SAMPLE_FILE) {
    const data = loadSample(studio);
    if (!data) return [];
    rows = data.data || data.jobs || [];
  } else {
    const data = await fetchJson(`https://${studio.host || studio.token + ".pinpointhq.com"}/postings.json`);
    rows = (data && data.data) || [];
  }
  return rows.map(p => {
    const loc = p.location || {};
    const location = loc.city
      ? (loc.province && loc.province !== loc.city ? `${loc.city}, ${loc.province}` : loc.city)
      : (loc.name || "Unlisted");
    const dept = (p.department && p.department.name)
      || (p.job && p.job.department && p.job.department.name) || "";
    const wt = String(p.workplace_type || "").toLowerCase();
    const workType = wt.includes("remote") ? "Remote" : wt.includes("hybrid") ? "Hybrid"
      : wt ? "Onsite" : inferWorkType(p.title || "", location, []);
    let salary = null;
    if (p.compensation_visible) {
      if (p.compensation_currency === "USD" && p.compensation_frequency === "year"
          && p.compensation_minimum && p.compensation_maximum)
        salary = `$${Math.round(p.compensation_minimum/1000)}K–$${Math.round(p.compensation_maximum/1000)}K`;
      else if (p.compensation) salary = p.compensation;
    }
    return {
      id: `pp-${studio.token}-${p.id}`,
      title: p.title,
      studio: studio.name,
      discipline: mapDiscipline(dept, p.title || ""),
      workType,
      location,
      region: inferRegion(location),
      seniority: inferSeniority(p.title || ""),
      salary,
      yoe: null,
      postedAt: null,
      url: p.url || (p.path ? `https://${studio.token}.pinpointhq.com${p.path}` : ""),
    };
  });
}

// ---- Playground Games (Fable, Forza Horizon) — own SSR careers site --------
// Xbox first-party studios run independent careers boards, NOT Microsoft's central
// Eightfold board (which exposes no studio attribution — location is contaminated by
// MS Cloud/Research/Windows roles and there is no company/studio facet, so it can't be
// cleanly scraped per-studio). Playground's Next.js page server-renders each opening as
// a <a aria-label="Navigate to vacancy: TITLE" href="/vacancy/ID"> row with discipline +
// game columns. The studio is in Leamington Spa, UK.
async function fetchPlayground(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText("https://www.playground-games.com/careers"); }
  const re = /aria-label="Navigate to vacancy: ([^"]+)"\s+href="(\/vacancy\/(\d+))"([\s\S]*?)<\/a>/g;
  const out = []; let m;
  while ((m = re.exec(html))) {
    const title = decodeEnt(m[1].trim());
    const disc = (m[4].match(/VacancyRow_col--type__\w+">([^<]+)</) || [])[1] || "";
    const location = studio.city || "Leamington Spa, UK";
    if (!title) continue;
    out.push({
      id: `pg-${studio.token}-${m[3]}`,
      title, studio: studio.name,
      discipline: mapDiscipline(disc, title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null, yoe: null, postedAt: null,
      url: "https://www.playground-games.com" + m[2],
    });
  }
  return out;
}

// ---- Obsidian Entertainment (Avowed, Pillars of Eternity) — own SSR careers site ----
// Xbox first-party studio with an independent server-rendered board. Each opening is an
// <a href=".../careers/open-positions/<dept>/<slug>"> whose visible text leads with the title.
async function fetchObsidian(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText("https://www.obsidian.net/careers"); }
  const re = /<a[^>]+href="(https:\/\/www\.obsidian\.net\/careers\/open-positions\/([^\/"]+)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const out = []; const seen = new Set(); let m;
  while ((m = re.exec(html))) {
    const url = m[1], dept = m[2];
    const parts = m[3].replace(/<[^>]+>/g, "|").split("|").map(x => decodeEnt(x).trim()).filter(Boolean);
    const title = parts[0] || "";
    const slug = url.split("/").pop() || title;
    if (!title || seen.has(slug)) continue;
    seen.add(slug);
    const location = studio.city || "Irvine, CA";
    out.push({
      id: `ob-${studio.token}-${slug}`,
      title, studio: studio.name,
      discipline: mapDiscipline(dept, title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null, yoe: null, postedAt: null, url,
    });
  }
  return out;
}

// ---- Techland (Dying Light) — own SSR careers site -------------------------
// The /job-offers page server-renders every opening as an <a href=".../job-offers/<slug>">Title</a>
// grouped by category. No dates/locations on the list page, so those stay Unknown; the studio is in
// Wrocław, Poland. Discipline is inferred from the title (the title-rules classifier is strong).
// Promoted from the Island 2026-06-18.
// AGE-GATE: techland.net serves an age-verification page with NO job links to ordinary BROWSER
// User-Agents, but the full job list to search crawlers (the page is SEO-indexed). With our default
// Chrome UA the scraper silently got 0 roles; fetching as Googlebot returns the real list. (Verified
// 2026-06-28: a browser-UA fetch returns the age gate; a crawler-UA fetch returns ~30 openings.)
const TECHLAND_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
async function fetchTechland(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText("https://techland.net/job-offers", 15000, TECHLAND_UA); }
  // Techland's markup uses RELATIVE hrefs resolved by a <base> tag: href="job-offers/<slug>" with
  // NO leading slash. The old pattern required one, so it matched nothing and the studio silently
  // reported 0 roles from the day it was added (28 live offers went unseen). The leading slash and
  // the host prefix are both optional now, and either quote style is accepted.
  const re = /<a\b[^>]*href=['"](?:https?:\/\/techland\.net)?\/?job-offers\/([a-z0-9][a-z0-9-]*)['"][^>]*>([\s\S]*?)<\/a>/gi;
  const out = []; const seen = new Set(); let m;
  while ((m = re.exec(html))) {
    const slug = m[1];
    const title = decodeEnt(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!title || seen.has(slug)) continue;
    seen.add(slug);
    const location = studio.city || "Wrocław, Poland";
    out.push({
      id: `tl-${slug}`,
      title,
      tech: extractTech(title),
      studio: studio.name,
      discipline: mapDiscipline(null, title),
      workType: inferWorkType(title, location, []),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: "",
      yoe: null,
      postedAt: null,
      url: `https://techland.net/job-offers/${slug}`,
    });
  }
  return out;
}

// ---- Critical Path Games — custom static careers site (no ATS) -------------
// The homepage links each opening at /careers/<slug>; each job page has a clean <title> and a
// "Full-time - <city>" line. We read the slug list, then each page for title/location/salary.
// Fragile by nature (no API) — if the site restructures, this returns 0 and the Health tab flags it.
async function fetchCritpath(studio) {
  const home = SAMPLE_FILE ? (loadSample(studio) || "") : await fetchText("https://critpath.com/");
  const slugs = [...new Set([...String(home).matchAll(/\/careers\/([a-z0-9][a-z0-9-]*)/gi)].map(m => m[1].toLowerCase()))]
    .filter(s => s !== "general-applications");
  const out = [];
  for (const slug of slugs) {
    const html = await fetchText(`https://critpath.com/careers/${slug}`);
    if (!html) continue;
    const title = decodeEnt(((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "")
      .replace(/\s*[-–]\s*Critical Path Games\s*$/i, "").trim()) || slug;
    if (!title) continue;
    const desc = stripHtml(html);
    const locM = html.replace(/<[^>]+>/g, " ").match(/Full-?time\s*[-–]\s*([A-Za-z][A-Za-z .,'-]{2,30})/i);
    const location = locM ? locM[1].trim() : (studio.city || "Vancouver");
    out.push({
      id: `critpath-${slug}`,
      title,
      tech: extractTech(title + " " + desc),
      desc,
      studio: studio.name,
      discipline: mapDiscipline(null, title),
      workType: inferWorkType(title, location, [], desc.slice(0, 1200)),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: extractSalary(desc),
      yoe: extractYoe(desc),
      postedAt: null,
      url: `https://critpath.com/careers/${slug}`,
    });
  }
  return out;
}

// ---- Oracle Recruiting Cloud (ORC) — e.g. Virtuos --------------------------
// Oracle's hosted candidate experience exposes a public REST feed:
//   https://<pod>.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions
//     ?finder=findReqs;siteNumber=<site>  ->  { items:[ { requisitionList:[ {Id,Title,…} ] } ] }
// studio.token = pod (e.g. "fa-exhj-saasfaprod1"), studio.site = site number (e.g. "CX_1").
// Reusable for any studio on Oracle ORC. Promoted from the Island 2026-06-18.
async function fetchOracle(studio) {
  const host = `https://${studio.token}.fa.ocs.oraclecloud.com`;
  const site = studio.site || "CX_1";
  const url = `${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions`
    + `?onlyData=true&expand=requisitionList.secondaryLocations`
    + `&finder=findReqs;siteNumber=${site},limit=200,sortBy=POSTING_DATES_DESC`;
  const data = SAMPLE_FILE ? loadSample(studio) : await fetchJson(url);
  const list = (data && data.items && data.items[0] && data.items[0].requisitionList) || [];
  return list.map(r => {
    const sec = (r.secondaryLocations || []).map(s => s && (s.Name || s.name)).filter(Boolean);
    const location = r.PrimaryLocation || sec[0] || "Unlisted";
    const title = (r.Title || "").trim();
    const fam = r.JobFunction || r.JobFamily || "";
    return {
      id: `ora-${site}-${r.Id}`,
      title,
      tech: extractTech(title),
      studio: studio.name,
      discipline: mapDiscipline(fam, title),
      workType: inferWorkType(title, location, []),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: "",
      yoe: null,
      postedAt: r.PostedDate || null,
      url: `${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${r.Id}`,
    };
  });
}

// ---- Cloud Imperium Games (Star Citizen, Squadron 42) — self-hosted GraphQL --
// CIG left Workday for a Strapi-style GraphQL API at cloudimperiumgames.com/graphql. One POST
// returns every job (with studio + discipline + full description, so salary & engine tags too).
// Query captured from the live site's GetJobs operation. Promoted from Workday 2026-06-18.
const CIG_QUERY = "query GetJobs($limit: Int, $start: Int, $sort: String, $where: JSON) { jobs(limit: $limit, start: $start, sort: $sort, where: $where) { createdAt updatedAt _id title description slug publishedAt seoTitle seoDescription studio { _id name location slug __typename } discipline { _id name slug __typename } subdiscipline { _id name slug __typename } __typename } studios { _id name location slug __typename } disciplines { _id name slug title description asset { _id url width height __typename } subdisciplines { _id name slug __typename } __typename } }";
async function fetchCig(studio) {
  let jobs = [];
  if (SAMPLE_FILE) { const d = loadSample(studio); jobs = (d && ((d.data && d.data.jobs) || d.jobs)) || []; }
  else {
    // CIG's /graphql sits behind Cloudflare bot-management, which 403s the CI runner *intermittently*
    // (works fine from a real browser). Send browser-like headers and retry on 403 a few times to ride
    // out the flaky blocks — turns "rarely shows" into "usually shows". Not 100%: Cloudflare also
    // fingerprints the TLS handshake, which a plain fetch can't spoof. If it stays flaky, next step is a
    // headless-browser fetch or demoting CIG to a link-out.
    const res = await fetchRetry("https://cloudimperiumgames.com/graphql", {
      method: "POST",
      attempts: 5,
      retryStatus: new Set([...RETRY_STATUS, 403]),
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://cloudimperiumgames.com",
        "Referer": "https://cloudimperiumgames.com/jobs",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ operationName: "GetJobs", query: CIG_QUERY, variables: { where: {}, limit: 200, sort: "title" } }),
    });
    const data = await res.json();
    jobs = (data && data.data && data.data.jobs) || [];
  }
  return jobs.map(j => {
    const st = j.studio || {};
    const location = st.location || st.name || "Unlisted";
    const desc = stripHtml(j.description || "");
    const url = st.slug ? `https://cloudimperiumgames.com/jobs/${st.slug}/${j.slug}` : `https://cloudimperiumgames.com/jobs/${j.slug}`;
    return {
      id: `cig-${j._id || j.slug}`,
      title: j.title,
      tech: extractTech((j.title || "") + " " + desc),
      studio: studio.name,
      discipline: mapDiscipline(j.discipline && j.discipline.name, j.title || ""),
      workType: inferWorkType(j.title || "", location, [], desc.slice(0, 1200)),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(j.title || ""),
      salary: extractSalary(desc),
      yoe: extractYoe(desc),
      postedAt: j.publishedAt || j.createdAt || null,
      url,
    };
  });
}

// ---- KRAFTON (PUBG, Subnautica, The Callisto Protocol, Hi-Fi Rush, inZOI) — own SSR careers site ----
// krafton.com is a custom WordPress board (no ATS), so it can't use a standard API fetcher. Each opening
// is server-rendered as <li class="RecruitList-item"> with a RecruitItemTitle-link (href ...?job=ID),
// the title in RecruitItemTitle-title, the Corp./Studio in RecruitItemMeta-studio, and a small list of
// RecruitItemMetaCategory-item cells ([Job Family, Employment Type, Location]). The board paginates via
// ?var_page=N&search_list_cnt=50 (~5 pages for ~208 roles). No posted date on the list, so postedAt
// stays null ("date n/a", like EA). Sub-studios we already scrape via a dedicated ATS are skipped here
// to avoid duplicates. Fragile by nature (no API) — if the markup changes this returns 0 and the Health
// tab flags it. parentCompany on the studio entry rolls every sub-studio up under KRAFTON.
const KRAFTON_BASE = "https://www.krafton.com";
// already covered by their own Greenhouse boards — don't double-list them
const KRAFTON_SKIP_STUDIOS = /^(5minlab|tango gameworks|unknown worlds|eleventh hour games)$/i;
const KRAFTON_EMP = /^(regular|contractor|professional contractor|internship|part[\s-]?time|contingent worker|dispatch)\b/i;
function kraftonStudioName(raw){
  const s = decodeEnt(raw || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!s || /^krafton$/i.test(s)) return "KRAFTON";
  if (/^pubg studios?$/i.test(s)) return "PUBG Studios";
  if (/montreal/i.test(s)) return "KRAFTON Montréal Studio";
  // Title-case ALL-CAPS values (e.g. "OVERDARE" -> "Overdare"); otherwise keep as the site presents it.
  return s === s.toUpperCase() ? s.replace(/\S+/g, w => w[0] + w.slice(1).toLowerCase()) : s;
}
async function fetchKrafton(studio){
  const out = [], seen = new Set();
  const MAX_PAGES = 25;   // ~5 pages at 50/page; cap guards runaway. Loop also stops when a page adds nothing.
  for (let p = 1; p <= MAX_PAGES; p++){
    let html;
    if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) break; html = typeof d === "string" ? d : (d.html || ""); }
    else { html = await fetchText(`${KRAFTON_BASE}/en/careers/jobs/?var_page=${p}&search_list_cnt=50`); }
    // KRAFTON's theme emits SINGLE-quoted attributes: <li class='RecruitList-item'>. This split
    // hard-coded a double quote, so it matched nothing, returned [], and — because returning an
    // empty array is not an error — the studio was recorded as "fetched OK, 0 roles" every run
    // since it was added. 219 live roles were invisible. Match either quote style here and below.
    const chunks = String(html).split(/class=['"]RecruitList-item/).slice(1);
    if (!chunks.length) break;
    let added = 0;
    for (const c of chunks){
      const href = (c.match(/href=['"]([^'"]*recruit-detail[^'"]*)['"]/i) || [])[1];
      const jid  = href && (href.match(/job=(\d+)/) || [])[1];
      if (!jid || seen.has(jid)) continue;
      const title = decodeEnt((c.match(/RecruitItemTitle-title[^>]*>([\s\S]*?)<\/[a-z0-9]+>/i) || [,""])[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      if (!title) continue;
      const studioName = kraftonStudioName((c.match(/RecruitItemMeta-studio[^>]*>([\s\S]*?)<\/span>/i) || [,""])[1]);
      if (KRAFTON_SKIP_STUDIOS.test(studioName)) continue;
      const cats = [...c.matchAll(/RecruitItemMetaCategory-item[^>]*>([\s\S]*?)<\/li>/gi)]
        .map(m => decodeEnt(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()).filter(Boolean);
      const family = cats[0] || "";
      let location = cats.length ? cats[cats.length - 1] : "";
      if (!location || KRAFTON_EMP.test(location)) location = studio.city || "Seoul, South Korea";
      seen.add(jid); added++;
      out.push({
        id: `krafton-${jid}`,
        title,
        tech: extractTech(title),
        studio: studioName,
        discipline: mapDiscipline(family, title),
        workType: inferWorkType(title, location, []),
        location,
        region: inferRegion(location),
        seniority: inferSeniority(title),
        salary: "",
        yoe: null,
        postedAt: null,
        url: KRAFTON_BASE + (href.startsWith("/") ? href.replace(/&amp;/g, "&") : "/" + href.replace(/&amp;/g, "&")),
      });
    }
    if (SAMPLE_FILE || !added) break;   // sample is one page; live stops when a page yields nothing new
  }
  return out;
}

// ---- Eidos-Montréal (Deus Ex, Tomb Raider) — WordPress careers page, Dayforce-backed -------
// jobs.dayforcehcm.com is a JS SPA (no server HTML to scrape), but eidosmontreal.com/careers server-
// renders every opening as <a href="https://jobs.dayforcehcm.com/.../jobs/<id>">
//   <span class="jobs-listing__job-title">Title</span>
//   <span class="jobs-listing__job-location">Montréal, QC, CAN</span>
//   [<span class="jobs-listing__job-tag">New</span>]</a>
// We parse that page. Apply links go straight to Dayforce. No dates/salary on the list, so those stay
// Unknown; all roles are Montréal. Promoted from the Island 2026-06-28.
async function fetchEidos(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText("https://www.eidosmontreal.com/careers/"); }
  const re = /<a\b[^>]*href="(https:\/\/jobs\.dayforcehcm\.com\/[^"]*\/jobs\/(\d+))"[^>]*>([\s\S]*?)<\/a>/gi;
  const out = []; const seen = new Set(); let m;
  while ((m = re.exec(html))) {
    const url = m[1], jid = m[2], inner = m[3];
    if (seen.has(jid)) continue; seen.add(jid);
    const tM = inner.match(/job-title[^>]*>([\s\S]*?)<\/span>/i);
    const lM = inner.match(/job-location[^>]*>([\s\S]*?)<\/span>/i);
    const title = decodeEnt((tM ? tM[1] : inner).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title) continue;
    let location = lM ? decodeEnt(lM[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : (studio.city || "Montréal, QC, Canada");
    location = location.replace(/,\s*CAN$/i, ", Canada");   // dayforce uses 3-letter country codes
    out.push({
      id: `eidos-${jid}`,
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

// ---- HiringThing (Snail Games + others) — SSR careers page ---------------------------------
// <subdomain>.hiringthing.com server-renders each posting inside <div class="job-headline">:
//   <div class="job-title-and-category"><a href="/job/<id>/<slug>"><h2>Title</h2></a></div>
//   <div class="job-location">City, ST</div>  [<div>$NN,NNN ‒ $NN,NNN Annually</div>]  ...
// We split on the card class and parse each one. Salary (when shown) is recovered by extractSalary;
// figure/EN dashes are normalized first. No posted date on the list, so that stays Unknown.
async function fetchHiringThing(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(`https://${studio.token}.hiringthing.com/`); }
  const out = []; const seen = new Set();
  // decodeEnt doesn't cover numeric refs (&#8211; dash, &#8203; zero-width prefix on some titles), so
  // decode those generically and strip zero-width chars before trimming.
  const norm = t => decodeEnt(String(t).replace(/<[^>]+>/g, " "))
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch (e) { return " "; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return " "; } })
    .replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
  for (const card of html.split(/class="job-headline"/i).slice(1)) {
    const head = card.slice(0, 1200);
    const idm = head.match(/\/job\/(\d+)\//);
    if (!idm) continue;
    const id = idm[1];
    if (seen.has(id)) continue; seen.add(id);
    const tm = head.match(/<a\b[^>]*\/job\/\d+\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const title = tm ? norm(tm[1]) : "";
    if (!title || /^learn more$/i.test(title)) continue;
    const lm = head.match(/class="job-location"[^>]*>([\s\S]*?)<\/div>/i);
    const location = lm ? norm(lm[1]) : (studio.city || "");
    const cardText = decodeEnt(head.replace(/<[^>]+>/g, " ")).replace(/[‒–—]/g, "-").replace(/\s+/g, " ");
    out.push({
      id: `ht-${studio.token}-${id}`,
      title, studio: studio.name,
      discipline: mapDiscipline(null, title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: extractSalary(cardText) || null,
      yoe: null, postedAt: null,
      url: `https://${studio.token}.hiringthing.com/job/${id}`,
    });
  }
  return out;
}

// ---- SEGA Europe careers (careers.sega.co.uk) — Drupal Views, studio-scoped -----------------
// One SSR site covers several SEGA Europe studios (SEGA Europe, Sports Interactive, Two Point, and
// Creative Assembly — but CA is already on Jobvite, so we scope each studio via the ?f[0]=studio:
// facet to avoid duplicates). Each result is <div class="... views-row"> with .views-field-field-*
// divs: title (+slug link), date-updated ("Last updated: 29 May 2026"), department, studio, country.
// This is separate from the "Sega" Workday tenant (corporate/America), which doesn't list these.
const SEGA_MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
function parseSegaDate(s){ const m=String(s).match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/); if(!m) return null; const mo=SEGA_MONTHS[m[2].slice(0,3).toLowerCase()]; if(mo==null) return null; const d=new Date(Date.UTC(+m[3],mo,+m[1])); return isNaN(d.getTime())?null:d.toISOString(); }
async function fetchSegaCareers(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(`https://careers.sega.co.uk/vacancies?f%5B0%5D=studio%3A${encodeURIComponent(studio.studioFacet || studio.name)}`); }
  const out = []; const seen = new Set();
  const fieldOf = (chunk, name) => { const m = chunk.match(new RegExp('views-field-field-' + name + '[^>]*>([\\s\\S]*?)</div>', 'i')); return m ? decodeEnt(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/^[^:]*:\s*/, '').trim() : ''; };
  for (const chunk of html.split(/class="[^"]*views-row[^"]*"/i).slice(1)) {
    const tm = chunk.match(/views-field-title[\s\S]*?<a\b[^>]*href="([^"]*\/vacancies\/([a-z0-9][a-z0-9-]*))"[^>]*>([\s\S]*?)<\/a>/i);
    if (!tm) continue;
    const slug = tm[2];
    if (seen.has(slug)) continue; seen.add(slug);
    const title = decodeEnt(tm[3].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const dept = fieldOf(chunk, 'department');
    const country = fieldOf(chunk, 'country');
    const location = studio.city || country || "United Kingdom";
    out.push({
      id: `segac-${studio.token}-${slug}`,
      title, studio: studio.name,
      discipline: mapDiscipline(dept, title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null, yoe: null,
      postedAt: parseSegaDate(fieldOf(chunk, 'date-updated')),
      url: `https://careers.sega.co.uk/vacancies/${slug}`,
    });
  }
  return out;
}

// ---- Turn 10 Studios (Forza) — Strapi careers page, deep-links to Microsoft Careers ----------
// Xbox first-party, so applications live on apply.careers.microsoft.com (not cleanly scrapeable per
// studio), but turn10studios.com/careers SSR-lists each opening as
//   <a href="https://apply.careers.microsoft.com/careers?...&pid=<id>...">Title</a> under a discipline
// heading. We parse the studio page; apply URLs deep-link into MS Careers. All roles are Redmond, WA;
// no salary/date on the list. Promoted from the Island 2026-06-28.
async function fetchTurn10(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText("https://www.turn10studios.com/careers"); }
  const re = /<a\b[^>]*href="(https:\/\/apply\.careers\.microsoft\.com\/[^"]*?pid=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const out = []; const seen = new Set(); let m;
  while ((m = re.exec(html))) {
    const pid = m[2];
    if (seen.has(pid)) continue; seen.add(pid);
    const title = decodeEnt(m[3].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title) continue;
    const location = studio.city || "Redmond, WA";
    out.push({
      id: `turn10-${pid}`,
      title, studio: studio.name,
      discipline: mapDiscipline(null, title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null, yoe: null, postedAt: null,
      url: decodeEnt(m[1].replace(/&amp;/g, "&")),
    });
  }
  return out;
}

// ---- Microsoft Careers (Xbox first-party studios on MS's central board) ----------------------
// Mojang and other Xbox-owned studios that don't run their own ATS post on Microsoft's central
// careers portal, apply.careers.microsoft.com — an Eightfold "pcsx" board (same platform as our
// Hasbro feed). The central board can't tag a job by studio, but a keyword search (studio.query,
// e.g. "Mojang") returns exactly that studio's roles: each title carries the franchise ("…,
// Minecraft") and the JD opens with the studio's own overview. Optional studio.titleInclude is a
// safety net that keeps only matching titles. Microsoft publishes real, legally-required pay ranges
// on each detail page, so we backfill salary/yoe/tech from position_details (bounded by detailMax).
//   list:   /api/pcsx/search?query=<kw>&domain=microsoft.com&hl=en&pgSz=&start=   -> data.positions[]
//   detail: /api/pcsx/position_details?position_id=<id>&domain=microsoft.com&hl=en -> data.jobDescription
// The list is 200-with-0-results when a studio has no open roles (valid, returns []); only a real
// transport failure (non-200) throws, so an empty board never false-flags as "failing".
async function msCareersJson(url) {
  const res = await fetchRetry(url, { headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://apply.careers.microsoft.com/careers",
  } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function fetchMicrosoftCareers(studio) {
  const domain = studio.domain || "microsoft.com";
  const q = encodeURIComponent(studio.query || studio.name);
  const data = SAMPLE_FILE ? loadSample(studio)
    : await msCareersJson(`https://apply.careers.microsoft.com/api/pcsx/search?query=${q}&domain=${domain}&hl=en&pgSz=50&start=0`);
  if (!data) return [];
  const positions = (data.data && data.data.positions) || [];
  const filt = studio.titleInclude ? new RegExp(studio.titleInclude, "i") : null;
  const picked = positions.filter(p => p && p.name && (!filt || filt.test(p.name)));
  const detailMax = studio.detailMax ?? 40;         // cap per-run detail fetches (salary backfill)
  const details = (data && data.details) || {};     // sample-mode: descriptions keyed by position id
  const out = [];
  for (let i = 0; i < picked.length; i++) {
    const p = picked[i];
    const location = cleanLocation(
      (Array.isArray(p.standardizedLocations) && p.standardizedLocations.join("; ")) ||
      (Array.isArray(p.locations) && p.locations.join("; ")) || "Unlisted");
    // High-trust work-site signal straight from the API; inference only as a fallback.
    const wlo = ((p.workLocationOption || "") + " " + (p.locationFlexibility || "")).toLowerCase();
    let workType = wlo.includes("hybrid") ? "Hybrid" : wlo.includes("remote") ? "Remote"
      : (wlo.includes("onsite") || /on-?site|in office/.test(wlo)) ? "Onsite" : null;
    // Detail page carries the real pay band + full description (for salary / yoe / tech).
    let desc = "";
    if (SAMPLE_FILE) {
      desc = stripHtml(details[p.id] || details[String(p.id)] || "");
    } else if (i < detailMax) {
      try {
        const dj = await msCareersJson(`https://apply.careers.microsoft.com/api/pcsx/position_details?position_id=${p.id}&domain=${domain}&hl=en`);
        desc = stripHtml((dj.data && dj.data.jobDescription) || "");
      } catch { /* detail is best-effort; the list fields still stand */ }
      await sleep(200);   // polite throttle between detail fetches
    }
    if (!workType) workType = inferWorkType(p.name, location, [], desc.slice(0, 1200));
    out.push({
      id: `mscareers-${p.id}`,
      title: p.name,
      tech: extractTech(p.name + " " + desc),
      studio: studio.name,
      discipline: mapDiscipline(p.department, p.name),
      workType,
      location,
      region: inferRegion(location),
      seniority: inferSeniority(p.name),
      salary: extractSalary(desc),
      yoe: extractYoe(desc),
      postedAt: p.postedTs ? new Date(p.postedTs * 1000).toISOString()
        : (p.creationTs ? new Date(p.creationTs * 1000).toISOString() : null),
      url: p.publicUrl || `https://apply.careers.microsoft.com/careers/job/${p.id}`,
    });
  }
  return out;
}

// ---- Lightfox Games (Seattle/Vancouver mobile studio) — self-hosted roles.json --------------
// The careers page (lightfoxgames.com) renders from a static JSON file at /roles.json: an array of
// { id, title, department, location, type, workModel, applyUrl, datePosted, description, visible,
// status, ... }. We keep only live roles (visible !== false AND status === "active"); "icebox"/
// hidden entries are pipeline placeholders, not real openings. Reusable for any studio that ships a
// roles.json in this shape via studio.feedUrl.
async function fetchLightfox(studio) {
  const feed = studio.feedUrl || "https://www.lightfoxgames.com/roles.json";
  const base = studio.base || feed.replace(/\/[^/]*$/, "/");   // site root for relative applyUrls
  const data = SAMPLE_FILE ? loadSample(studio) : await fetchJson(feed);
  const roles = Array.isArray(data) ? data : (data && data.roles) || [];
  return roles
    .filter(r => r && r.title && r.visible !== false && (r.status || "active") === "active")
    .map(r => {
      const location = cleanLocation(r.location || "Unlisted");
      const desc = stripHtml(r.description || "");
      const wm = (r.workModel || r.workType || "").toLowerCase();
      const workType = wm.includes("hybrid") ? "Hybrid" : wm.includes("remote") ? "Remote"
        : (wm.includes("onsite") || wm.includes("on-site") || wm.includes("in office")) ? "Onsite"
        : inferWorkType(r.title, location, [], desc.slice(0, 1200));
      const apply = r.applyUrl || r.url || "";
      const url = /^https?:/i.test(apply) ? apply : base + String(apply).replace(/^\//, "");
      return {
        id: `lightfox-${studio.token}-${r.id}`,
        title: r.title,
        tech: extractTech(r.title + " " + desc),
        studio: studio.name,
        discipline: mapDiscipline(r.department, r.title),
        workType,
        location,
        region: inferRegion(location),
        seniority: inferSeniority(r.title),
        salary: extractSalary(desc),
        yoe: extractYoe(desc),
        postedAt: r.datePosted || r.postedAt || null,
        url: url || base,
      };
    });
}

// ---- HRworks (Kalypso Media + other German employers) — SSR careers portal ------------------
// HRworks job portals (custom domain, e.g. jobs.kalypsomedia.com/en) server-render each posting in a
// full-width Bootstrap wrapper (class "col-xs-12 col-sm-12 col-md-12 col-lg-12", one per job, never
// nested). Inside: <a href="...?id=<hex>" title="Role">…</a>, a "Scope - Employment - Time" line, and
// a Google-Maps link whose text is "City, …, Country". No salary/date on the list. Keyed by feedUrl so
// it's reusable for other HRworks studios.
async function fetchHRworks(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(studio.feedUrl || `https://jobs.${studio.token}.com/en`); }
  const base = (studio.feedUrl || "").replace(/\/en\/?$/, "") || `https://jobs.${studio.token}.com`;
  const out = []; const seen = new Set();
  const GENDER = /\s*\((?:m\/f\/d|m\/w\/d|w\/m\/d|d\/f\/m|d\/m\/w|f\/m\/d|a\/m\/w|m\/w\/x|all genders?)\)\s*$/i;
  for (const chunk of html.split(/col-xs-12 col-sm-12 col-md-12 col-lg-12/i).slice(1)) {
    const im = chunk.match(/[?&]id=([a-f0-9]{4,})"[^>]*title="([^"]*)"/i);
    if (!im) continue;
    const id = im[1];
    if (seen.has(id)) continue; seen.add(id);
    let title = decodeEnt(im[2]).replace(/\s+/g, " ").trim().replace(GENDER, "").trim();
    if (!title) continue;
    let location = studio.city || "Germany";
    const lm = chunk.match(/maps[^>]*>([^<]+)</i);
    if (lm) { const p = decodeEnt(lm[1]).split(",").map(s => s.trim()).filter(Boolean); if (p.length >= 2) location = p[0] + ", " + p[p.length - 1]; }
    const cm = chunk.match(/>([^<>]*\s-\s(?:Permanent employment|Internship)[^<>]*)</i);
    const category = cm ? decodeEnt(cm[1]).replace(/\s+/g, " ").trim() : "";
    out.push({
      id: `hrw-${studio.token}-${id}`,
      title, studio: studio.name,
      discipline: mapDiscipline(category, title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null, yoe: null, postedAt: null,
      url: `${base}/en?id=${id}`,
    });
  }
  return out;
}

// ---- Smilegate (Lost Ark, CrossFire) — Korean careers SPA, POST JSON API -------------------
// careers.smilegate.com is a client-rendered SPA; its list comes from POST /api/apply/announce/guest
// returning { announce: [{ announceSeq, title, jobMainCd, jobMainNm, jobDtlNm, displayYn, ... }] }.
// We keep only the game-production category (jobMainCd "JOB1001" = 게임제작) and map the Korean detail
// category to a discipline (titles are Korean, but jobDtlNm classifies them reliably). All roles are in
// Korea (Seongnam); no location/salary/posted date in the feed. Promoted from the Island 2026-06-28.
const SG_DISC = {
  "게임기획": "Design", "그래픽": "Art", "게임개발": "Engineering", "QA": "QA", "사운드": "Audio",
  "매니지먼트": "Production", "운영서비스": "Business & Ops", "애니메이션": "Animation",
};
async function fetchSmilegate(studio) {
  let announce = [];
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; announce = d.announce || (Array.isArray(d) ? d : []); }
  else {
    const res = await fetchRetry("https://careers.smilegate.com/api/apply/announce/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Origin": "https://careers.smilegate.com", "Referer": "https://careers.smilegate.com/apply/announce" },
      body: JSON.stringify({ pageSize: 300 }),
    });
    const data = await res.json();
    announce = data.announce || [];
  }
  const out = [];
  for (const a of announce) {
    if (a.jobMainCd !== "JOB1001") continue;          // 게임제작 (game production) only — skip corporate / infra / CSR / biz
    if (a.displayYn === "N") continue;
    const title = decodeEnt(String(a.title || "")).replace(/\s+/g, " ").trim();
    if (!title) continue;
    const location = studio.city || "Seongnam, South Korea";
    out.push({
      id: `sg-${a.announceSeq}`,
      title, studio: studio.name,
      discipline: SG_DISC[a.jobDtlNm] || mapDiscipline(a.jobDtlNm || "", title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null, yoe: null, postedAt: null,
      url: `https://careers.smilegate.com/apply/announce/view?seq=${a.announceSeq}`,
    });
  }
  return out;
}

// ---- Cygames (Uma Musume, Granblue Fantasy, Shadowverse) — custom recruit site ----------
// recruit.cygames.co.jp/career server-renders every opening as an <a> straight to its HRMOS
// posting (hrmos.co/pages/cygames/jobs/<id>). HRMOS itself is a JS-only board with no feed
// (why GAME FREAK / Spike Chunsoft stay link-outs), but Cygames' own page gives us title +
// link for all ~170 roles. Titles are Japanese and end in the office (…／東京・大阪・佐賀);
// the list carries no salary or posted date, so those show Unknown / date-n/a (like EA).
// Promoted from the Island 2026-07-04.
const CYGAMES_LOC = { "東京": "Tokyo, Japan", "大阪": "Osaka, Japan", "佐賀": "Saga, Japan" };
const CYGAMES_DISC = [   // JP-title → discipline; first match wins, order matters
  [/サウンド|音楽|ミュージック|コンポーザ/, "Audio"],                                     // before Engineering: サウンドエンジニア is Audio
  [/エンジニア|プログラマ|インフラ|サーバ|クライアントサイド|フロントエンド|セキュリティ|システム|ヘルプデスク/, "Engineering"],
  [/アニメーター|アニメーションデザイナー/, "Animation"],
  [/3DCG|イラスト|アーティスト|漫画|作画|着彩|彩色|原画|背景|デフォルメ|モーションキャプチャ|フォトグラメトリ|映像/, "Art"],
  [/デバッグ|テスト|校正・校閲|QA/, "QA"],
  [/アナリスト|分析|データ/, "Data & Analytics"],
  [/ローカライ|コーディネーター|翻訳/, "Production"],                                     // localization folds into Production (matches mapDiscipline)
  [/プロジェクトマネージャ|プロデューサ|進行管理|制作進行|プロダクションマネージャ/, "Production"],
  [/プランナー|ディレクター|ディレクション|シナリオ|ゲームデザイナー|Webデザイナー|UIデザイナー|プロダクトデザイナー|企画/, "Design"],
  [/カスタマーサポート|ゲームマスター/, "Player Support"],
  [/プロモーション|広報|宣伝|マーケ|ブランディング|メディア|デザイナー/, "Marketing"],     // 広報デザイナー etc.
  [/営業|経理|法務|労務|人事|総合職|ビジネス|事業|ライセンス|渉外|業務管理|経営|採用/, "Business & Ops"],
];
async function fetchCygames(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText("https://recruit.cygames.co.jp/career"); }
  const out = [], seen = new Set();
  for (const m of String(html).matchAll(/<a[^>]+href="https?:\/\/hrmos\.co\/pages\/cygames\/jobs\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const jid = m[1];
    const title = decodeEnt(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!jid || !title || seen.has(jid)) continue;
    seen.add(jid);
    const segs = title.split("／").map(s => s.trim());
    const location = CYGAMES_LOC[segs[segs.length - 1]] || studio.city || "Tokyo, Japan";
    let discipline = "Other";
    for (const [re, d] of CYGAMES_DISC) if (re.test(title)) { discipline = d; break; }
    out.push({
      id: `cygames-${jid}`,
      title, tech: extractTech(title), studio: studio.name,
      discipline,
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null, yoe: null, postedAt: null,
      url: `https://hrmos.co/pages/cygames/jobs/${jid}`,
    });
  }
  return out;
}

// ---- HRMOS (BizReach's ATS) — GAME FREAK, reusable for other JP studios --------------------
// hrmos.co/pages/<token>/jobs SERVER-renders every opening (our earlier note that HRMOS was
// "JS-only with no feed" was wrong — the list is in the initial HTML, confirmed via a no-JS fetch).
// Each posting is an <a href=".../jobs/<id>"> wrapping an <h2> title and a <ul class="sg-tags cf">
// of three <li>: 求人カテゴリー (category), 雇用形態 (employment type), and a .sg-tag-location
// address. Titles/locations are Japanese; the list carries no salary or posted date, so those show
// Unknown / date-n/a (like Cygames / EA). We drop the evergreen "キャリア登録" (talent-pool
// registration) and "新卒" (new-grad info) entries — they aren't real single openings. GAME FREAK's
// roles are all at its Tokyo HQ (addresses begin 東京都). Promoted from the Island 2026-07-04.
// 求人カテゴリー (JP) → discipline, as ordered keyword rules so one map serves every HRMOS studio
// (GAME FREAK's プログラマ/グラフィックデザイナー/… and Square Enix's ゲームデザイナー/サウンド/編集/…).
// Matched against the category first, then the title; order matters (Art before Design so
// グラフィックデザイナー→Art not Design; BI before Engineering so a BI engineer→Data).
const HRMOS_DISC_RULES = [
  [/サウンド|オーディオ|音響|作曲|効果音/, "Audio"],
  [/\bQA\b|品質|デバッグ|テスター|テスト/i, "QA"],
  [/\bBI\b|データ分析|データサイエン|アナリスト|analytics/i, "Data & Analytics"],
  [/アニメーター|モーション/, "Animation"],
  [/アーティスト|グラフィック|\bCG\b|映像|モデル|背景|エフェクト|キャラクター|原画|イラスト|コンセプト|ライティング|リガー|テクニカルアート/i, "Art"],
  [/エンジニア|プログラマ|インフラ|サーバ|アプリケーション|セキュリティ|\bSRE\b|クラウド|ネットワーク|システム|社内SE|R&D|開発者/i, "Engineering"],
  [/ゲームデザイナー|ゲームデザイン|プランナー|レベルデザイン|シナリオ|ソーシャルゲーム/, "Design"],
  [/ローカライズ|翻訳|localization/i, "Production"],
  [/プロデューサー|ディレクター|プロジェクトマネージャ|制作進行|プロダクションマネージャ|プロデュース|運営/, "Production"],
  [/マーケティング|宣伝|プロモーション|広報|\bPR\b|イベント企画|販促/i, "Marketing"],
  [/カスタマーサポート|カスタマー|サポート窓口/, "Player Support"],
  [/営業|編集|出版|経理|財務|法務|人事|総務|バックオフィス|EC|受発注|入金|契約|ライセンス|売上|原価|事業管理|\bDX\b|採用|労務|貿易|管理/i, "Business & Ops"],
];
function hrmosDiscipline(cat, title) {
  for (const [re, d] of HRMOS_DISC_RULES) if (re.test(cat)) return d;      // category is the reliable field
  for (const [re, d] of HRMOS_DISC_RULES) if (re.test(title)) return d;    // fall back to the title (e.g. GAME FREAK's "その他")
  return "Business & Ops";
}
function hrmosSeniority(title) {
  if (/ディレクター|部長/.test(title)) return "Director+";
  if (/リーダー|リード|責任者|マネージャ/.test(title)) return "Lead";
  if (/ジュニア|新卒|未経験|アシスタント/.test(title)) return "Entry";
  return inferSeniority(title);
}
async function fetchHrmos(studio) {
  const token = studio.token;
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(`https://hrmos.co/pages/${token}/jobs`); }
  const out = [], seen = new Set();
  const tk = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRe = new RegExp(`<a\\s+href="https?:\\/\\/hrmos\\.co\\/pages\\/${tk}\\/jobs\\/([\\w-]+)"[^>]*>([\\s\\S]*?)<\\/a>`, "gi");
  for (const m of String(html).matchAll(blockRe)) {
    const id = m[1], block = m[2];
    if (seen.has(id)) continue;
    const h2 = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (!h2) continue;
    const title = decodeEnt(h2[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title) continue;
    // sg-tags <li>s: [category, employment type, location(.sg-tag-location)]
    let cat = "", loc = "";
    const ul = block.match(/<ul[^>]*class="[^"]*sg-tags[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
    if (ul) {
      const lis = [...ul[1].matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/gi)].map(x => ({
        cls: x[1] || "",
        txt: decodeEnt(x[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(),
      }));
      cat = lis[0] ? lis[0].txt : "";
      const locLi = lis.find(x => /sg-tag-location/.test(x.cls));
      loc = locLi ? locLi.txt : "";
    }
    if (cat === "キャリア登録" || cat === "新卒") continue;   // evergreen registration / new-grad info — not real openings
    seen.add(id);
    const location = /大阪|Osaka/i.test(loc) ? "Osaka, Japan" : /東京|Tokyo/i.test(loc) ? "Tokyo, Japan" : (studio.city || "Tokyo, Japan");
    const remote = /フルリモート|リモートワーク可|完全リモート/.test(title);
    out.push({
      id: `hrmos-${token}-${id}`,
      title, tech: extractTech(title), studio: studio.name,
      discipline: hrmosDiscipline(cat, title),
      workType: remote ? "Remote" : inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: hrmosSeniority(title),
      salary: null, yoe: null, postedAt: null,
      url: `https://hrmos.co/pages/${token}/jobs/${id}`,
    });
  }
  return out;
}

// ---- Garena (Free Fire, Arena of Valor — Sea Ltd) — custom Nuxt careers site + JSON API ----------
// careers.garena.com is a Nuxt SPA whose global board is served by a single call:
//   POST https://careers.garena.com/api/job/list   (empty JSON body) -> { filters, jobs:[...] }
// (GET returns ERROR__BAD_REQUEST — it must be POST; the underlying ATS is ats.workatsea.com, but the
// public site proxies it.) Each job: { id, title, tags:{ location[], job_category[], job_type[] },
// description(HTML) }. Titles are English; there's no salary or posted date, so those show
// Unknown / date-n/a. ~96 roles across APAC (Singapore, Jakarta, Hanoi/HCMC, Bangkok, Taipei, Seoul,
// Bangalore/Mumbai, Manila, Dhaka), Casablanca, Mexico City, São Paulo, and 2 Remote. Promoted from
// the Island 2026-07-04.
const GARENA_DISC = {                      // job_category -> discipline (Garena's own classification)
  "Engineering and Technology": "Engineering",
  "Product Management": "Production",
  "Design": "Design",
  "Game Design": "Design",
  "Game Operations": "Production",
  "Esports": "Marketing",
  "Business Intelligence and Data Analytics": "Data & Analytics",
  "Marketing": "Marketing",
  "Business Development and Partnerships": "Business & Ops",
  "Strategy": "Business & Ops",
  "People": "Business & Ops",
  "Finance": "Business & Ops",
  "Legal": "Business & Ops",
  "Management Associate Program": "Business & Ops",
};
const GARENA_LOC = {                       // office city -> "City, Country" (so inferRegion resolves it)
  "Jakarta": "Jakarta, Indonesia", "Singapore": "Singapore", "Mexico City": "Mexico City, Mexico",
  "Hanoi": "Hanoi, Vietnam", "Ho Chi Minh City": "Ho Chi Minh City, Vietnam",
  "Bangalore": "Bangalore, India", "Mumbai": "Mumbai, India", "Casablanca": "Casablanca, Morocco",
  "Bangkok": "Bangkok, Thailand", "Dhaka": "Dhaka, Bangladesh", "Manila": "Manila, Philippines",
  "Taipei": "Taipei, Taiwan", "Seoul": "Seoul, South Korea", "São Paulo": "São Paulo, Brazil",
  "Remote": "Remote",
};
const GARENA_SEN_RANK = { Entry: 1, Mid: 2, Senior: 3, Lead: 4, "Director+": 5 };
const GARENA_TYPE_SEN = {
  "Entry Level": "Entry", "Internship": "Entry",
  "Experienced (Individual Contributor)": "Mid", "Experienced (Team Lead)": "Lead",
};
async function fetchGarena(studio) {
  let jobs = [];
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; jobs = d.jobs || (Array.isArray(d) ? d : []); }
  else {
    const res = await fetchRetry("https://careers.garena.com/api/job/list", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Origin": "https://careers.garena.com", "Referer": "https://careers.garena.com/global/careers" },
      body: "{}",
    });
    const data = await res.json();
    jobs = data.jobs || [];
  }
  const out = [];
  for (const x of jobs) {
    const tg = x.tags || {};
    const title = decodeEnt(String(x.title || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!x.id || !title) continue;
    const cat = (tg.job_category || [])[0] || "";
    const jt = (tg.job_type || [])[0] || "";
    const rawLoc = (tg.location || [])[0] || "";
    const location = GARENA_LOC[rawLoc] || rawLoc || studio.city || "Singapore";
    const descText = decodeEnt(String(x.description || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    // seniority: start from the job_type tag; let an explicit title signal only RAISE it.
    // inferSeniority's default "Mid" is a fallback, not a signal, so it never overrides the tag
    // (e.g. an "Entry Level" role with an unmarked title stays Entry, not Mid).
    const byTitle = inferSeniority(title), byType = GARENA_TYPE_SEN[jt] || "Mid";
    const titleRank = byTitle === "Mid" ? 0 : (GARENA_SEN_RANK[byTitle] || 0);
    const seniority = titleRank > (GARENA_SEN_RANK[byType] || 2) ? byTitle : byType;
    const remote = /remote/i.test(rawLoc);
    out.push({
      id: `garena-${x.id}`,
      title, tech: extractTech(`${title} ${descText}`), studio: studio.name,
      discipline: GARENA_DISC[cat] || mapDiscipline(cat, title),
      workType: remote ? "Remote" : inferWorkType(title, location, [], descText),
      location, region: inferRegion(location),
      seniority,
      salary: null, yoe: null, postedAt: null,
      url: `https://careers.garena.com/global/careers/${x.id}`,
    });
  }
  return out;
}

// ---- Shift Up (Stellar Blade, Goddess of Victory: NIKKE) — self-hosted PHP careers page --------
// shiftup.co.kr/recruit/recruit.php server-renders every posting as a <div class="recruit_list">:
// a <span class="status …">진행중/마감</span> (open/closed), an <h4> title, and a <ul> whose <li>s are
// [title, experience, employment type]. Titles are Korean; the page carries no salary or posted date.
// We keep only 진행중 (open) roles and drop evergreen campus-hiring / 산업기능요원 pools. Shift Up's
// apply flow runs on a Greeting ATS (career.shiftup.co.kr/o/<id>) that hides the per-job IDs from any
// server-side feed, so — with the owner's sign-off (2026-07-04) — every role links to the main recruit
// page rather than a per-job deep link. All roles are at the Seoul HQ. Promoted from the Island 2026-07-04.
const SHIFTUP_URL = "https://shiftup.co.kr/recruit/recruit.php?category=0";
const SHIFTUP_APPLY = "https://shiftup.co.kr/recruit/";
const SHIFTUP_SKIP = /캠퍼스\s?리크루팅|OFF-CAMPUS|산업기능요원\(보충역\)$/;   // evergreen campus / alt-service pools, not real single openings
const SHIFTUP_DISC = [                     // Korean title → discipline; first match wins, order matters
  [/오디오|사운드|작곡|음악|음향/, "Audio"],
  [/QA|품질|테스터|테스트/i, "QA"],
  [/원화|아티스트|일러스트|컨셉|스토리보드|크리에이티브|2D\s?디자이너/, "Art"],   // before Animation/Engineering: 테크니컬 아티스트 is Art
  [/애니메이터|애니메이션/, "Animation"],
  [/\bPM\b|프로듀서|프로덕션|프로젝트\s?매니저|\bPD\b/, "Production"],            // before Engineering: 개발 PM is Production
  [/프로그래머|엔지니어|서버|클라이언트|엔진|개발자|인프라|보안|최적화/, "Engineering"],
  [/기획|디자이너|레벨|시나리오|라이터|내러티브|밸런스/, "Design"],              // before Marketing: 커뮤니케이션 디자이너 is Design
  [/마케팅|마케터|브랜드|홍보|커뮤니티/, "Marketing"],
  [/데이터|분석|애널리/, "Data & Analytics"],
  [/IR|공시|투자|전략|경영지원|인사|총무|재무|회계|경리|법무|담당자|매니저/, "Business & Ops"],
];
function shiftupDiscipline(title) {
  for (const [re, d] of SHIFTUP_DISC) if (re.test(title)) return d;
  return "Other";
}
function shiftupSeniority(title, exp, type) {
  if (/인턴/.test(type) || /산업기능요원|보충역|캠퍼스|OFF-CAMPUS|인턴/i.test(title)) return "Entry";
  if (/리드|리더|총괄|책임|수석|디렉터/.test(title)) return "Lead";
  const m = String(exp).match(/(\d+)/);   // first number = minimum years of experience
  if (m) return (+m[1] >= 5) ? "Senior" : "Mid";
  return "Mid";                            // 무관 (any) / unspecified
}
function shiftupId(title) {                // stable per-title id (their ATS gives us no numeric id)
  let h = 5381; for (let i = 0; i < title.length; i++) h = ((h << 5) + h + title.charCodeAt(i)) >>> 0;
  return "shiftup-" + h.toString(36);
}
async function fetchShiftUp(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(SHIFTUP_URL); }
  const out = [], seen = new Set();
  const location = studio.city || "Seoul, South Korea";
  for (const chunk of String(html).split(/<div class="recruit_list"/).slice(1)) {
    const head = chunk.split("recruit_desc")[0];   // metadata block only (before the description)
    const status = decodeEnt((head.match(/<span class=['"]status[^'"]*['"]>([\s\S]*?)<\/span>/) || [])[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (status !== "진행중") continue;              // open roles only (skip 마감 = closed)
    const title = decodeEnt((head.match(/<h4>([\s\S]*?)<\/h4>/) || [])[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!title || seen.has(title)) continue;
    if (SHIFTUP_SKIP.test(title)) continue;
    seen.add(title);
    const ul = (head.match(/<ul>([\s\S]*?)<\/ul>/) || [])[1] || "";
    const lis = [...ul.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => decodeEnt(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());
    const exp = lis[1] || "", type = lis[2] || "";
    out.push({
      id: shiftupId(title),
      title, tech: extractTech(title), studio: studio.name,
      discipline: shiftupDiscipline(title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: shiftupSeniority(title, exp, type),
      salary: null, yoe: null, postedAt: null,
      url: SHIFTUP_APPLY,
    });
  }
  return out;
}

// ---- Miniclip (8 Ball Pool, Agar.io) — own Nuxt careers site (SSR) -----------------------------
// miniclip.com/careers/vacancies server-renders every opening grouped by department: an
// <h3 class="…text-2xl">Department</h3> heading, then <li class="flex justify-between …"> rows, each
// with an <a href="/careers/vacancies/<slug>/<id>"> (title + Miniclip's own detail page) and a
// trailing <span> location ("City, Country"). Titles are English; the list carries no salary or posted
// date, so those show Unknown / date-n/a. Applications ultimately run on SuccessFactors
// (careers.miniclip.com), but Miniclip's page is the clean, complete feed. Promoted from the Island 2026-07-04.
async function fetchMiniclip(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText("https://www.miniclip.com/careers/vacancies"); }
  const out = [], seen = new Set();
  const sections = String(html).split(/<h3 class="[^"]*text-2xl[^"]*">/);   // [preamble, dept1seg, dept2seg, …]
  for (let k = 1; k < sections.length; k++) {
    const seg = sections[k];
    const dept = decodeEnt((seg.match(/^\s*([\s\S]*?)<\/h3>/) || [])[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    for (const li of seg.matchAll(/<li class="flex justify-between[\s\S]*?<\/li>/g)) {
      const b = li[0];
      const dm = b.match(/href="\/careers\/vacancies\/([^"\/]+)\/(\d+)"/);
      if (!dm) continue;
      const id = dm[2];
      if (seen.has(id)) continue; seen.add(id);
      const title = decodeEnt((b.match(/href="\/careers\/vacancies\/[^"]+"[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (!title) continue;
      const spans = [...b.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map(m => decodeEnt(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()).filter(Boolean);
      const location = spans.length ? spans[spans.length - 1] : (studio.city || "Lisbon, Portugal");
      out.push({
        id: `miniclip-${id}`,
        title, tech: extractTech(title), studio: studio.name,
        discipline: mapDiscipline(dept, title),
        workType: inferWorkType(title, location, []),
        location, region: inferRegion(location),
        seniority: inferSeniority(title),
        salary: null, yoe: null, postedAt: null,
        url: `https://www.miniclip.com/careers/vacancies/${dm[1]}/${id}`,
      });
    }
  }
  return out;
}

// ---- Playrix (Gardenscapes, Township, Fishdom) — custom careers API -----------------------------
// playrix.com is a React SPA backed by a simple JSON API: POST /api/v1/index.php?action=job/getList
// (no body) -> { success, items:[…] }. Each item: { id, name (title), code (slug), sectionId, dateUpdate,
// isHidden, workFormat, … }. Titles are English; there's no salary. Playrix is fully remote ("work from
// anywhere in the world"), so every role is Remote. dateUpdate gives an honest posted date. Section
// English labels are mostly blank, so discipline is mapped from the (clear) title. Job detail pages live
// at playrix.com/job/<code>/. We drop isHidden rows. Promoted from the Island 2026-07-04.
const PLAYRIX_DISC = [                      // title → discipline; first match wins, order matters
  [/\bqa\b|quality assurance|\btester\b|testing/i, "QA"],
  [/artist|\bvfx\b|\b2d\b|\b3d\b|concept|illustrat|art director|lighting|texture/i, "Art"],   // catch "Art Director" before Production
  [/animator|animation/i, "Animation"],
  [/analyst|analytics|\bdata\b|\bbi\b/i, "Data & Analytics"],                                  // "Product Analyst" -> Data, before Production
  [/engineer|developer|programmer|software|golang|back[- ]?end|front[- ]?end|\bsre\b|devops|platform|technical lead/i, "Engineering"],
  [/game design|designer|narrative|writer|scriptwriter|level design/i, "Design"],
  [/producer|production|project manager|program manager|delivery manager|development director|game director|\bpmo\b/i, "Production"],
  [/product (manager|owner)/i, "Production"],
  [/marketing|user acquisition|\bua\b|creative|\bbrand\b|community/i, "Marketing"],
  [/recruit|\bhr\b|people|talent|finance|legal|accountant|office manager|business/i, "Business & Ops"],
];
function playrixDiscipline(title) {
  for (const [re, d] of PLAYRIX_DISC) if (re.test(title)) return d;
  return "Other";
}
async function fetchPlayrix(studio) {
  let items = [];
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; items = d.items || (Array.isArray(d) ? d : []); }
  else {
    const res = await fetchRetry("https://playrix.com/api/v1/index.php?action=job%2FgetList", {
      method: "POST",
      headers: { "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Origin": "https://playrix.com", "Referer": "https://playrix.com/job/open/" },
    });
    const data = await res.json();
    items = data.items || [];
  }
  const out = [];
  for (const x of items) {
    if (!x || x.isHidden) continue;
    const title = decodeEnt(String(x.name || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title || !x.code) continue;
    const postedAt = x.dateUpdate ? String(x.dateUpdate).trim().replace(" ", "T") : null;
    out.push({
      id: `playrix-${x.id}`,
      title, tech: extractTech(title), studio: studio.name,
      discipline: playrixDiscipline(title),
      workType: "Remote",
      location: "Remote", region: "Remote",
      seniority: inferSeniority(title),
      salary: null, yoe: null, postedAt,
      url: `https://playrix.com/job/${x.code}/`,
    });
  }
  return out;
}

// ---- SuperPlay (Dice Dreams, Domino Dreams — Playtika) — WordPress careers page (SSR) ------------
// superplay.co/careers server-renders every opening as a card carrying data-department + data-location,
// an <a class="careers-position__link" href=".../careers-position/<id>">, an <h3 class="…__title">, and
// detail spans: __location, __employment-type, __experience-level (Entry-level / Intermediate / Senior;
// sometimes absent). Titles are English; there's no salary or posted date. Discipline is mapped from the
// (clear) title; seniority from the experience-level label, falling back to the title. Roles are onsite in
// Tel-Aviv, Bucharest, or Poland. Promoted from the Island 2026-07-04.
const SUPERPLAY_DISC = [                    // title → discipline; first match wins, order matters
  [/\bqa\b|quality|tester|testing/i, "QA"],
  [/\bbi\b|analyst|analytics|\bdata\b/i, "Data & Analytics"],
  [/animator|animation/i, "Animation"],                                       // before Art: "2D Animator" is Animation
  [/artist|\bvfx\b|\b2d\b|\b3d\b|concept|illustrat|texture|technical artist|motion graphic/i, "Art"],
  [/developer|engineer|programmer|software|unity|\bit\b|devops|\bsre\b|server/i, "Engineering"],
  [/designer|\bui\b|\bux\b|game design/i, "Design"],
  [/community|user acquisition|\bua\b|\baso\b|marketing|\bbrand\b|\bpr\b|social/i, "Marketing"],
  [/customer support|player support|support manager/i, "Player Support"],
  [/product manager|product owner|producer|production/i, "Production"],
  [/monetization|monetisation|\bhr\b|hrbp|recruit|people|finance|legal|operations/i, "Business & Ops"],
];
function superplayDiscipline(title) {
  for (const [re, d] of SUPERPLAY_DISC) if (re.test(title)) return d;
  return "Other";
}
function superplaySeniority(label, title) {
  const l = (label || "").toLowerCase();
  if (/entry/.test(l)) return "Entry";
  if (/senior/.test(l)) return "Senior";
  if (/intermediate|\bmid\b/.test(l)) return "Mid";
  return inferSeniority(title);            // unlabeled roles: infer from the title (catches Lead / Senior)
}
async function fetchSuperPlay(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText("https://www.superplay.co/careers/"); }
  const s = String(html);
  const out = [], seen = new Set();
  const linkRe = /<a href="https:\/\/www\.superplay\.co\/careers-position\/([^"?]+)" class="careers-position__link">/g;
  let m;
  while ((m = linkRe.exec(s))) {
    const id = m[1];
    if (seen.has(id)) continue; seen.add(id);
    const before = s.slice(Math.max(0, m.index - 500), m.index);   // outer card div (holds data-location)
    const after = s.slice(m.index, m.index + 1200);
    const title = decodeEnt(((after.match(/careers-position__title[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title) continue;
    const location = decodeEnt((before.match(/data-location="([^"]*)"/) || [])[1] || "") || studio.city || "Tel-Aviv, Israel";
    const expLabel = decodeEnt(((after.match(/careers-position__experience-level[^>]*>\s*([^<]*?)\s*</) || [])[1] || "")).replace(/\s+/g, " ").trim();
    out.push({
      id: `superplay-${id}`,
      title, tech: extractTech(title), studio: studio.name,
      discipline: superplayDiscipline(title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: superplaySeniority(expLabel, title),
      salary: null, yoe: null, postedAt: null,
      url: `https://www.superplay.co/careers-position/${id}`,
    });
  }
  return out;
}

// ---- Atlus / SEGA of America (Persona, Shin Megami Tensei — Western publishing) — Paycom ATS -----
// atlus.com/careers redirects to a Paycom career portal (clientkey in studio.token). The React portal's
// data lives behind a bearer-auth API, but the token is public: GET the portal's career-page JSON to read
// its `sessionJWT`, then GET /api/ats/job-map with that bearer to receive every opening grouped by office
// ({ locations:[{ locationDisplay, jobs:[{ jobCode, jobTitle }] }] }). Titles are English (mostly Western
// publishing / marketing roles at Irvine + Burbank); no salary or posted date. Job detail/apply pages live
// at paycomonline.net/v4/ats/web.php/portal/<clientkey>/jobs/<jobCode>. Promoted from the Island 2026-07-04.
const ATLUS_DISC = [                       // title → discipline; first match wins, order matters
  [/\bqa\b|quality assurance|\btester\b|\btesting\b/i, "QA"],
  [/business development|business strategy|\bsales\b|partnership|licensing|financ|legal|\baccount(ing|ant)?\b|\bhr\b|people ops|talent acquisition|recruit|\boperations\b|administrat|office manager|payroll/i, "Business & Ops"],   // before Marketing/Production: "Financial Analyst", "Consumer Product Licensing"
  [/animator|animation/i, "Animation"],
  [/artist|graphic design|\bvideo\b|multimedia|\bvfx\b|illustrat|art director/i, "Art"],
  [/\bdata\b|\banalytics\b|\bbi\b|business intelligence/i, "Data & Analytics"],
  [/brand|marketing|community|\bsocial\b|\bpr\b|public relations|advertis|influencer|\beditor\b|\bcontent\b|transmedia|gaas/i, "Marketing"],   // before Production so "Product Marketing" is Marketing
  [/product (manager|planning|management|owner)|\bproducer\b|localization|project manager|program manager/i, "Production"],
  [/designer|\bui\b|\bux\b|game design/i, "Design"],
  [/engineer|developer|programmer|software|\bit\b|network|systems admin|devops/i, "Engineering"],
  [/customer support|player support|support specialist/i, "Player Support"],
];
function atlusDiscipline(title) {
  for (const [re, d] of ATLUS_DISC) if (re.test(title)) return d;
  return "Other";
}
function cleanPaycomLoc(l) {              // "Progress - Irvine, CA 92618" -> "Irvine, CA"
  return String(l || "").split(" - ").pop().replace(/\s+\d{5}(-\d{4})?\s*$/, "").trim();
}
async function fetchAtlus(studio) {
  const ck = studio.token;
  let locations = [];
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; locations = d.locations || (Array.isArray(d) ? d : []); }
  else {
    const cpRes = await fetchRetry(`https://www.paycomonline.net/v4/ats/web.php/portal/${ck}/career-page`, {
      headers: { "Accept": "application/json", "User-Agent": "DevQuest/0.1 (game-dev job aggregator)" },
    });
    const cp = await cpRes.json();
    const jwt = cp && cp.sessionJWT;
    if (!jwt) return [];
    const res = await fetchRetry("https://portal-applicant-tracking.us-cent.paycomonline.net/api/ats/job-map", {
      headers: { "Authorization": "Bearer " + jwt, "Accept": "application/json", "User-Agent": "DevQuest/0.1 (game-dev job aggregator)" },
    });
    const jm = await res.json();
    locations = (jm && jm.locations) || [];
  }
  const out = [], seen = new Set();
  for (const L of locations) {
    const location = cleanPaycomLoc(L.locationDisplay) || studio.city || "Irvine, CA";
    for (const j of (L.jobs || [])) {
      const code = j.jobCode;
      const title = decodeEnt(String(j.jobTitle || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      if (!code || !title || seen.has(code)) continue;
      seen.add(code);
      out.push({
        id: `atlus-${code}`,
        title, tech: extractTech(title), studio: studio.name,
        discipline: atlusDiscipline(title),
        workType: inferWorkType(title, location, []),
        location, region: inferRegion(location),
        seniority: inferSeniority(title),
        salary: null, yoe: null, postedAt: null,
        url: `https://www.paycomonline.net/v4/ats/web.php/portal/${ck}/jobs/${code}`,
      });
    }
  }
  return out;
}

// ---- Kojima Productions (Death Stranding, OD) — Drupal careers, custom view-loader endpoint --------
// kojimaproductions.jp is a Drupal 11 site; the careers view is hydrated via POST /kjpviewloader/load
// (JSON body naming the view) which returns the rendered job-listing HTML. Each row is
// <a href="/en/<slug>"><div class="title">…</div><div class="discipline">…</div><div class="location">…</div></a>.
// Titles/categories are English, all roles are at the Tokyo studio; no salary or posted date. Discipline is
// mapped from the category (with "Animator" → Animation). Promoted from the Island 2026-07-04.
const KOJIMA_DISC = {                      // category (Drupal "discipline") → our discipline
  "Programming": "Engineering", "Art Department": "Art", "Marketing": "Marketing",
  "Production": "Production", "Game Design": "Design", "Administrative": "Business & Ops",
  "Localization": "Production", "Sound Department": "Audio", "Writing": "Design",
};
function kojimaDiscipline(category, title) {
  if (/\banimator\b|animation artist/i.test(title)) return "Animation";   // Animator sits under "Art Department"
  return KOJIMA_DISC[category] || mapDiscipline(category, title);
}
async function fetchKojima(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else {
    const res = await fetchRetry("https://www.kojimaproductions.jp/kjpviewloader/load", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/html, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Origin": "https://www.kojimaproductions.jp", "Referer": "https://www.kojimaproductions.jp/en/careers" },
      body: JSON.stringify({ viewName: "kjp_view_job_listing", viewDisplayBase: "kjp_view_job_listing__", langCode: "en",
        inputs: [{ name: "jobDiscipline", value: "All" }, { name: "jobLocation", value: "All" }], page: 0, writeDate: Date.now() }),
    });
    html = await res.text();
  }
  const out = [], seen = new Set();
  const rowRe = /<a href="(\/en\/[^"]+)">\s*<div class="title">([\s\S]*?)<\/div>\s*<div class="discipline">([\s\S]*?)<\/div>\s*<div class="location">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = rowRe.exec(String(html)))) {
    const href = m[1];
    const title = decodeEnt(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const category = decodeEnt(m[3].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const location = decodeEnt(m[4].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() || studio.city || "Tokyo, Japan";
    const slug = href.replace(/^\/en\//, "").replace(/\/+$/, "");
    if (!title || !slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      id: `kojima-${slug.replace(/\//g, "-")}`,
      title, tech: extractTech(title), studio: studio.name,
      discipline: kojimaDiscipline(category, title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null, yoe: null, postedAt: null,
      url: `https://www.kojimaproductions.jp${href}`,
    });
  }
  return out;
}

// ---- Owlcat Games (Pathfinder, Rogue Trader — cRPG studio) — Next.js careers, __NEXT_DATA__ --------
// owlcat.games/careers is a Next.js app whose openings are embedded in the SSR JSON blob
// (<script id="__NEXT_DATA__">). props.pageProps.initialState.contentStore.jobs.data is an array of
// category buckets; the "All" bucket holds every opening as { id, title, subtitle, published, category }.
// Titles are English; there's a real posted date, no salary. category → discipline. Job detail/apply pages
// live at owlcat.games/careers/<id>. Roles are at the Cyprus studio. Promoted from the Island 2026-07-04.
const OWLCAT_DISC = {                       // Owlcat "category" → discipline
  "Art": "Art", "Design": "Design", "Programming": "Engineering",
  "Management": "Production", "Publishing": "Marketing", "Hr": "Business & Ops", "HR": "Business & Ops",
};
async function fetchOwlcat(studio) {
  let jobs = [];
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; jobs = d.jobs || (Array.isArray(d) ? d : []); }
  else {
    const html = await fetchText("https://owlcat.games/careers");
    const m = String(html).match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return [];
    let nd; try { nd = JSON.parse(m[1]); } catch (e) { return []; }
    const data = (nd && nd.props && nd.props.pageProps && nd.props.pageProps.initialState
      && nd.props.pageProps.initialState.contentStore && nd.props.pageProps.initialState.contentStore.jobs
      && nd.props.pageProps.initialState.contentStore.jobs.data) || [];
    const all = data.find(c => String(c.title || "").toLowerCase() === "all") || data[0];
    jobs = (all && all.jobs) || [];
  }
  const out = [], seen = new Set();
  const location = studio.city || "Nicosia, Cyprus";
  for (const j of jobs) {
    const id = j.id;
    const title = decodeEnt(String(j.title || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    let postedAt = null;
    if (j.published) { const t = Date.parse(j.published); if (!isNaN(t)) postedAt = new Date(t).toISOString(); }
    out.push({
      id: `owlcat-${id}`,
      title, tech: extractTech(title), studio: studio.name,
      discipline: OWLCAT_DISC[j.category] || mapDiscipline(j.category || "", title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null, yoe: null, postedAt,
      url: `https://owlcat.games/careers/${id}`,
    });
  }
  return out;
}

// ---- Comeet ATS (Moon Active — reusable for any Comeet studio, e.g. Overwolf) -------------------
// Comeet exposes a public positions API keyed by the company UID (studio.token) + public embed token
// (studio.comeetToken): GET www.comeet.co/careers-api/2.0/company/<uid>/positions?token=<token> returns a
// JSON array of { name, department, location:{name,…}, workplace_type, experience_level, time_updated (ISO),
// uid, url_comeet_hosted_page, is_internal, … }. Titles/departments are English. We drop internal postings.
function comeetSeniority(exp, title) {
  const byTitle = inferSeniority(title);
  if (byTitle !== "Mid") return byTitle;             // Lead/Director/Senior/Entry from the title wins
  const e = String(exp || "").toLowerCase();
  if (/senior|lead|principal/.test(e)) return "Senior";
  if (/mid|intermediate/.test(e)) return "Mid";
  if (/junior|entry|associate|intern/.test(e)) return "Entry";
  return "Mid";
}
// Comeet's location.name is sometimes a nickname ("Overwolf's lair"), so resolve region from the ISO
// country code first (reliable), falling back to the display name.
const COMEET_CC_REGION = {
  US: "North America", CA: "North America", MX: "Latin America", BR: "Latin America", AR: "Latin America",
  GB: "Europe", IE: "Europe", DE: "Europe", FR: "Europe", ES: "Europe", PT: "Europe", NL: "Europe",
  PL: "Europe", RO: "Europe", SE: "Europe", FI: "Europe", CZ: "Europe", UA: "Europe", CY: "Europe",
  TR: "Europe", IT: "Europe", BE: "Europe", CH: "Europe", AT: "Europe", DK: "Europe", NO: "Europe",
  IL: "Middle East & Africa", AE: "Middle East & Africa", SA: "Middle East & Africa", ZA: "Middle East & Africa", MA: "Middle East & Africa",
  JP: "Asia-Pacific", KR: "Asia-Pacific", CN: "Asia-Pacific", SG: "Asia-Pacific", IN: "Asia-Pacific",
  AU: "Asia-Pacific", TW: "Asia-Pacific", PH: "Asia-Pacific", VN: "Asia-Pacific", TH: "Asia-Pacific", MY: "Asia-Pacific", ID: "Asia-Pacific",
};
function comeetRegion(loc) {
  const cc = String((loc && loc.country) || "").toUpperCase();
  if (COMEET_CC_REGION[cc]) return COMEET_CC_REGION[cc];
  return inferRegion((loc && loc.name) || "");
}
async function fetchComeet(studio) {
  let arr = [];
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; arr = Array.isArray(d) ? d : (d.positions || d.jobs || []); }
  else { arr = await fetchJson(`https://www.comeet.co/careers-api/2.0/company/${studio.token}/positions?token=${studio.comeetToken}`); }
  if (!Array.isArray(arr)) return [];
  const out = [], seen = new Set();
  for (const p of arr) {
    if (p.is_internal) continue;
    const uid = p.uid;
    const title = decodeEnt(String(p.name || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!uid || !title || seen.has(uid)) continue;
    seen.add(uid);
    const dept = String(p.department || "").trim();
    const location = (p.location && p.location.name) || studio.city || "Unlisted";
    const wt = String(p.workplace_type || "").toLowerCase();
    const workType = wt.includes("remote") ? "Remote" : wt.includes("hybrid") ? "Hybrid" : wt.includes("site") ? "Onsite" : inferWorkType(title, location, []);
    let postedAt = null;
    if (p.time_updated) { const t = Date.parse(p.time_updated); if (!isNaN(t)) postedAt = new Date(t).toISOString(); }
    out.push({
      id: `comeet-${studio.token}-${uid}`,
      title, tech: extractTech(title), studio: studio.name,
      discipline: mapDiscipline(dept, title),
      workType,
      location, region: comeetRegion(p.location),
      seniority: comeetSeniority(p.experience_level, title),
      salary: null, yoe: null, postedAt,
      url: p.url_comeet_hosted_page || p.url_active_page || p.position_url || "",
    });
  }
  return out;
}

// ---- Huntflow ATS (SayGames — reusable for any Huntflow careers board) --------------------------
// Huntflow public boards (<subdomain>.global.huntflow.io) are Nuxt sites, but expose a clean JSON API:
// GET https://<subdomain>.global.huntflow.io/api/vacancy?page=N -> { total (page COUNT), page, items:[...] }.
// Each item: { id, slug, position (title), money, division (internal studio/label, not a discipline),
// city, archived_at }. Titles are English; city/money are often null. Discipline is mapped from the title
// (with a small fallback for ASO / analyst / accounting / generalist that mapDiscipline leaves as Other).
function huntflowDiscipline(division, title) {
  const d = mapDiscipline(division || "", title);
  if (d !== "Other") return d;
  const t = title.toLowerCase();
  if (/\baso\b|user acquisition|\bua\b|growth market/.test(t)) return "Marketing";
  if (/analyst|analytics/.test(t)) return "Data & Analytics";
  if (/account|payroll|finance|bookkeep|legal|\bhr\b|people ops|recruit/.test(t)) return "People & Ops";
  if (/localization|localisation/.test(t)) return "Production";
  if (/generalist|\b3d\b|\b2d\b|motion/.test(t)) return "Art";
  return "Other";
}
async function fetchHuntflow(studio) {
  const token = studio.token;
  let items = [];
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; items = d.items || (Array.isArray(d) ? d : []); }
  else {
    const base = `https://${token}.global.huntflow.io/api/vacancy`;
    const first = await fetchJson(`${base}?page=1`);
    items = (first && first.items) || [];
    const totalPages = (first && first.total) || 1;
    for (let p = 2; p <= totalPages && p <= 20; p++) {          // cap pages for safety
      try { const d = await fetchJson(`${base}?page=${p}`); if (d && d.items) items = items.concat(d.items); } catch (e) {}
    }
  }
  const out = [], seen = new Set();
  for (const v of items) {
    if (!v || v.archived_at) continue;                          // skip archived/closed roles
    const id = v.id, slug = v.slug;
    const title = decodeEnt(String(v.position || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!id || !slug || !title || seen.has(id)) continue;
    seen.add(id);
    const location = (v.city && String(v.city).trim()) || studio.city || "Unlisted";
    out.push({
      id: `huntflow-${token}-${id}`,
      title, tech: extractTech(title), studio: studio.name,
      discipline: huntflowDiscipline(v.division, title),
      workType: inferWorkType(title, location, []),
      location, region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: (typeof v.money === "string" && v.money.trim()) ? v.money.trim() : null,
      yoe: null, postedAt: null,
      url: `https://${token}.global.huntflow.io/vacancy/${slug}`,
    });
  }
  return out;
}

// ---- Keka (LightFury Games) — careers portal JSON API -----------------------
// <token>.keka.com/careers is a jQuery shell that loads jobs from a clean JSON API:
//   GET /careers/api/jobs/default/active
//   -> [ { id, title, departmentName, jobLocations:[{city,countryName,name,...}],
//         experience ("4-7"/"1+"/null), jobType, publishedOn (ISO), skillNames[], ... } ]
// No salary amounts (salaryRangeFormat is empty), so pay shows Unknown. Real per-job
// detail pages at /careers/jobdetails/<id>. Works no-cookie with a plain User-Agent.
function kekaYoe(exp) {
  if (!exp || typeof exp !== "string") return null;
  const m = exp.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}
async function fetchKeka(studio) {
  const token = studio.token;
  let arr;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; arr = Array.isArray(d) ? d : (d.jobs || d.items || []); }
  else { arr = await fetchJson(`https://${token}.keka.com/careers/api/jobs/default/active`); }
  if (!Array.isArray(arr)) arr = (arr && (arr.jobs || arr.data || arr.items)) || [];
  const out = [], seen = new Set();
  for (const j of arr) {
    if (!j || !j.id || seen.has(j.id)) continue;
    seen.add(j.id);
    const title = decodeEnt(String(j.title || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title) continue;
    const l = (j.jobLocations || [])[0] || {};
    const city = (l.city || "").trim(), country = (l.countryName || "").trim();
    const location = city && country ? `${city}, ${country}` : (city || country || l.name || studio.city || "Unlisted");
    const skills = Array.isArray(j.skillNames) ? j.skillNames.filter(Boolean) : [];
    out.push({
      id: `keka-${token}-${j.id}`,
      title,
      tech: extractTech(title + " " + skills.join(" ")),
      studio: studio.name,
      discipline: mapDiscipline(j.departmentName, title),
      workType: inferWorkType(title, location, []),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null,
      yoe: kekaYoe(j.experience),
      postedAt: j.publishedOn || null,
      url: `https://${token}.keka.com/careers/jobdetails/${j.id}`,
    });
  }
  return out;
}
// ---- Traffit (Anshar Studios) — studio careers page linking to a Traffit board -----
// Anshar's WordPress careers page (studio.careersUrl) server-renders each opening as a
// pair of <a> links to the Traffit offer (ansharstudios.traffit.com/public/an/<hash>):
// the first is the full job title, the second a short category ("Artist"/"Programmer"/…)
// used as the discipline hint. No per-job location on the page, so roles default to the
// studio HQ. Real per-job apply URLs. (Traffit's own API needs a key; the public page
// is the reliable, honest source.)
async function fetchTraffit(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(studio.careersUrl); }
  const byHash = {};
  const re = /<a[^>]*href="(https?:\/\/[^"]*traffit\.com\/public\/[a-z]+\/([a-f0-9]{16,}))"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of String(html).matchAll(re)) {
    const url = m[1], hash = m[2];
    const text = decodeEnt(m[3].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (!byHash[hash]) byHash[hash] = { url, hash, title: text, category: null };
    else if (!byHash[hash].category && text.toLowerCase() !== byHash[hash].title.toLowerCase()) byHash[hash].category = text;
  }
  const out = [];
  for (const j of Object.values(byHash)) {
    const location = studio.city || "Unlisted";
    out.push({
      id: `traffit-${studio.token}-${j.hash.slice(0, 12)}`,
      title: j.title,
      tech: extractTech(j.title),
      studio: studio.name,
      discipline: mapDiscipline(j.category, j.title),
      workType: inferWorkType(j.title, location, []),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(j.title),
      salary: null,
      yoe: null,
      postedAt: null,
      url: j.url,
    });
  }
  return out;
}
// ---- Nekki — self-hosted WordPress careers page --------------------------------
// nekki.com/vacancy server-renders each opening as a "vacations-tab__item" whose <a>
// links to /vacancy/<slug>/ with the title in <span class="link__text">Title, Location</span>.
// Items are duplicated across an "All" panel + per-category panels, so we dedupe by slug.
// The location is appended after the final comma (all currently "Remote"). Discipline
// comes from the title (Nekki's own category tabs aren't tagged on the items).
async function fetchNekki(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(studio.careersUrl || "https://nekki.com/vacancy"); }
  const byS = {};
  const re = /<a[^>]+href="([^"]*\/vacancy\/([a-z0-9-]+)\/)"[^>]*>\s*<span class="link__text">([\s\S]*?)<\/span>/gi;
  for (const m of String(html).matchAll(re)) {
    const rawUrl = m[1], slug = m[2];
    const full = decodeEnt(m[3].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!full || byS[slug]) continue;
    let title = full, location = studio.city || "Remote";
    const mm = full.match(/^(.*),\s*([^,]+)$/);
    if (mm && /remote|hybrid|on-?site|office|cyprus|limassol/i.test(mm[2])) {
      title = mm[1].trim();
      location = /remote/i.test(mm[2]) ? "Remote" : mm[2].trim();
    }
    byS[slug] = { slug, title, location, url: rawUrl.startsWith("http") ? rawUrl : "https://nekki.com" + rawUrl };
  }
  return Object.values(byS).map(j => ({
    id: `nekki-${j.slug}`,
    title: j.title,
    tech: extractTech(j.title),
    studio: studio.name,
    discipline: mapDiscipline("", j.title),
    workType: inferWorkType(j.title, j.location, []),
    location: j.location,
    region: inferRegion(j.location),
    seniority: inferSeniority(j.title),
    salary: null,
    yoe: null,
    postedAt: null,
    url: j.url,
  }));
}
// ---- Plarium — Next.js (App Router) careers site --------------------------------
// company.plarium.com/en/career renders vacancies into the RSC flight payload
// (self.__next_f.push([1,"...json..."])). We reassemble the flight text, then extract
// the "vacancies" object: direction-name -> [ { slug, link.as, title, department,
// location[](offices), direction.name, remoteLocation[](countries), hybrid } ]. No salary.
function plariumSliceBalanced(s, oi) {
  let d = 0, q = false, e = false;
  for (let i = oi; i < s.length; i++) {
    const c = s[i];
    if (q) { if (e) e = false; else if (c === "\\") e = true; else if (c === '"') q = false; }
    else { if (c === '"') q = true; else if (c === "{") d++; else if (c === "}") { d--; if (d === 0) return s.slice(oi, i + 1); } }
  }
  return null;
}
async function fetchPlarium(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(studio.careersUrl || "https://company.plarium.com/en/career/"); }
  let flight = "";
  for (const m of String(html).matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { flight += JSON.parse(m[1]); } catch (e) {}
  }
  const ki = flight.indexOf('"vacancies":');
  if (ki < 0) throw new Error("Plarium: vacancies payload not found");
  const obj = JSON.parse(plariumSliceBalanced(flight, flight.indexOf("{", ki)));
  const out = [], seen = new Set();
  for (const dir of Object.keys(obj)) {
    for (const v of (obj[dir] || [])) {
      if (!v || !v.slug || seen.has(v.slug)) continue;
      seen.add(v.slug);
      const title = decodeEnt(String(v.title || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      if (!title) continue;
      const offices = Array.isArray(v.location) ? v.location.filter(Boolean) : [];
      const remotes = Array.isArray(v.remoteLocation) ? v.remoteLocation.filter(Boolean) : [];
      const location = offices.length ? offices.join(", ") : (remotes.length ? remotes.join(", ") : (studio.city || "Unlisted"));
      const path = (v.link && v.link.as) || `/career/${v.slug}/`;
      out.push({
        id: `plarium-${v.slug}`,
        title,
        tech: extractTech(title),
        studio: studio.name,
        discipline: mapDiscipline((v.direction && v.direction.name) || dir || "", title),
        workType: v.hybrid ? "Hybrid" : (remotes.length ? "Remote" : "Onsite"),
        location,
        region: inferRegion(remotes[0] || offices[0] || location),
        seniority: inferSeniority(title),
        salary: null,
        yoe: null,
        postedAt: null,
        url: `https://company.plarium.com/en${path}`,
      });
    }
  }
  return out;
}
// ---- Hello Games — self-hosted static careers page -----------------------------
// hellogames.org/join-us server-renders each opening as <a href="/jobs/<slug>/">Title</a>.
// No per-job location (all roles at the Guildford, UK studio); discipline from title.
async function fetchHelloGames(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(studio.careersUrl || "https://hellogames.org/join-us/"); }
  const byS = {};
  for (const m of String(html).matchAll(/<a[^>]*href="([^"]*\/jobs\/([a-z0-9-]+)\/?)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const slug = m[2];
    const title = decodeEnt(m[3].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title || title.length > 120 || byS[slug]) continue;
    byS[slug] = { slug, title, url: m[1].startsWith("http") ? m[1] : "https://hellogames.org" + m[1] };
  }
  const location = studio.city || "Guildford, UK";
  return Object.values(byS).map(j => ({
    id: `hellogames-${j.slug}`,
    title: j.title,
    tech: extractTech(j.title),
    studio: studio.name,
    discipline: mapDiscipline("", j.title),
    workType: inferWorkType(j.title, location, []),
    location,
    region: inferRegion(location),
    seniority: inferSeniority(j.title),
    salary: null,
    yoe: null,
    postedAt: null,
    url: j.url,
  }));
}
// ---- HiBob / Bob (Torpor Games) — careers "job-ad" JSON API ---------------------
// <token>.careers.hibob.com is an Angular SPA; jobs come from a clean JSON API:
//   GET /api/job-ad -> { jobAdDetails:[ { id, title, department, site, country,
//   workspaceType (Hybrid/Remote/On-site), employmentType, publishedAt (ISO),
//   payTransparencyMin/MaxSalary, ... } ] }. Skips speculative/spontaneous
//   applications. Detail pages at /jobs/<id>.
function hibobWorkType(ws) {
  const s = String(ws || "").toLowerCase();
  return /remote/.test(s) ? "Remote" : /hybrid/.test(s) ? "Hybrid" : /on-?site|office/.test(s) ? "Onsite" : null;
}
async function fetchHibob(studio) {
  const token = studio.token;
  let arr;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; arr = d.jobAdDetails || (Array.isArray(d) ? d : []); }
  else {
    // HiBob 401s the plain fetchJson request (bare "DevQuest/0.1" UA, no Accept). The identical URL
    // answers 200 with the full feed from a browser, so the gate is header-based, not auth. Which
    // header exactly can't be isolated from outside — CORS blocks reading a cross-origin response —
    // so send all three a real browser sends: browser UA, JSON Accept, and a same-site Referer.
    const base = `https://${token}.careers.hibob.com`;
    const res = await fetchRetry(`${base}/api/job-ad`, { headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Referer": base + "/",
    } });
    const d = await res.json();
    arr = (d && d.jobAdDetails) || [];
  }
  const out = [], seen = new Set();
  for (const j of arr) {
    if (!j || !j.id || seen.has(j.id)) continue;
    const title = decodeEnt(String(j.title || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title || /speculative|spontaneous|open application|unsolicited|talent pool/i.test(title)) continue;
    seen.add(j.id);
    const site = String(j.site || "").replace(/\s*\((?:HQ|hq)\)\s*/i, " ").replace(/\s+/g, " ").trim();
    const country = String(j.country || "").trim();
    const location = site && country ? `${site}, ${country}` : (site || country || studio.city || "Unlisted");
    const mn = j.payTransparencyMinSalary, mx = j.payTransparencyMaxSalary, cur = j.payTransparencySalaryCurrency;
    const salary = (mn && mx) ? `${cur ? cur + " " : ""}${mn}–${mx}` : null;
    out.push({
      id: `hibob-${token}-${j.id}`,
      title,
      tech: extractTech(title),
      studio: studio.name,
      discipline: mapDiscipline(j.department, title),
      workType: hibobWorkType(j.workspaceType) || inferWorkType(title, location, []),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary,
      yoe: null,
      postedAt: j.publishedAt || null,
      url: `https://${token}.careers.hibob.com/jobs/${j.id}`,
    });
  }
  return out;
}
// ---- Flix Interactive — self-hosted WordPress careers page ----------------------
// flixinteractive.com renders each opening as a .vacancy-card <a href="/vacancies/<slug>/">
// with <h3>Title</h3> and <p class="vacancy-meta">Location</p>. Applications are by
// email, but each role has a real detail page. Skips speculative applications.
async function fetchFlix(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(studio.careersUrl || "https://www.flixinteractive.com/"); }
  const out = [], seen = new Set();
  const re = /<a[^>]*href="([^"]*\/vacancies\/([a-z0-9-]+)\/?)"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*<p class="vacancy-meta">([\s\S]*?)<\/p>/gi;
  for (const m of String(html).matchAll(re)) {
    const url = m[1], slug = m[2];
    const title = decodeEnt(m[3].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title || seen.has(slug) || /speculative/i.test(slug + " " + title)) continue;
    seen.add(slug);
    const location = decodeEnt(m[4].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() || studio.city || "Unlisted";
    const wl = location.toLowerCase();
    const workType = /hybrid/.test(wl) ? "Hybrid"
      : (/remote/.test(wl) && wl.includes("/")) ? "Hybrid"   // "UK Remote / West Midlands" = remote or office
      : /remote/.test(wl) ? "Remote" : inferWorkType(title, location, []);
    out.push({
      id: `flix-${slug}`,
      title,
      tech: extractTech(title),
      studio: studio.name,
      discipline: mapDiscipline("", title),
      workType,
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null,
      yoe: null,
      postedAt: null,
      url: url.startsWith("http") ? url : "https://www.flixinteractive.com" + url,
    });
  }
  return out;
}
// ---- FromSoftware — self-hosted recruiting site ---------------------------------
// careers.fromsoftware.jp/en/openpositions.html server-renders roles as
// <a class="bluebox" href="<slug>.html">Title</a> grouped under <h3> discipline
// headers (Art, Programming, ...), used as the discipline hint. All roles require
// working in Tokyo, so they are Onsite. (Its English board lists the roles open to
// non-Japanese speakers; the studio hires selectively.)
async function fetchFromSoftware(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(studio.careersUrl || "https://careers.fromsoftware.jp/en/openpositions.html"); }
  const out = [], seen = new Set();
  let cat = null;
  for (const m of String(html).matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>|<a\b([^>]*\bbluebox\b[^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (m[1] !== undefined) { cat = decodeEnt(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); continue; }
    const attrs = m[2] || "";
    const href = (attrs.match(/href="([^"]+)"/) || [])[1] || "";
    const title = decodeEnt(m[3].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);
    const slug = href.replace(/^.*\//, "").replace(/\.html?$/i, "");
    const location = studio.city || "Tokyo, Japan";
    out.push({
      id: `fromsoft-${slug}`,
      title,
      tech: extractTech(title),
      studio: studio.name,
      discipline: mapDiscipline(cat, title),
      workType: "Onsite",
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null,
      yoe: null,
      postedAt: null,
      url: /^https?:/i.test(href) ? href : "https://careers.fromsoftware.jp/en/" + href.replace(/^\//, ""),
    });
  }
  return out;
}
// ---- Grinding Gear Games — self-hosted careers page (email apply) ---------------
// grindinggear.com/?page=careers lists open roles as <h2> titles after a "the
// following positions" marker (the two intro <h2> sentences are excluded by length /
// punctuation / keyword). Email-apply, no per-job pages, so each role links to the
// careers page. All roles are Auckland, New Zealand, on-site (relocation offered).
async function fetchGrindingGear(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(studio.careersUrl || "https://www.grindinggear.com/?page=careers"); }
  const start = String(html).search(/following positions/i);
  const region = start > -1 ? String(html).slice(start) : String(html);
  const out = [], seen = new Set();
  const location = studio.city || "Auckland, New Zealand";
  const careersUrl = studio.careersUrl || "https://www.grindinggear.com/?page=careers";
  for (const m of region.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)) {
    const title = decodeEnt(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title || title.length > 60 || /\.$/.test(title) || /hiring|interested|contact|apply|currently|following/i.test(title)) continue;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      id: `ggg-${slug}`,
      title,
      tech: extractTech(title),
      studio: studio.name,
      discipline: mapDiscipline("", title),
      workType: "Onsite",
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null,
      yoe: null,
      postedAt: null,
      url: careersUrl,
    });
  }
  return out;
}
// ---- Konami (US card-business / Yu-Gi-Oh! TCG) — self-hosted careers page --------
// konami.com/games/us/en/jobs server-renders roles as <h3> titles grouped under <h2>
// company/location headers ("Konami Digital Entertainment, Inc. Hawthorne, CA"). Work
// type is a "(Hybrid/Full-time)" suffix; a CALIFORNIA NOTICE <h3> is skipped. No per-job
// pages, so each role links to the careers page. (This board is the US TCG/organized-play
// side; Konami's Japan game-dev roles live on a separate site.)
async function fetchKonami(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(studio.careersUrl || "https://www.konami.com/games/us/en/jobs/"); }
  const out = [], seen = new Set();
  let loc = studio.city || "Unlisted";
  const careersUrl = studio.careersUrl || "https://www.konami.com/games/us/en/jobs/";
  for (const m of String(html).matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>|<h3[^>]*>([\s\S]*?)<\/h3>/gi)) {
    if (m[1] !== undefined) {
      const txt = decodeEnt(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      const cm = txt.match(/([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*),\s([A-Z]{2})\s*$/);
      if (cm) loc = `${cm[1]}, ${cm[2]}`;
      continue;
    }
    const t = decodeEnt(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!t || /notice|privacy|policy|applicant/i.test(t)) continue;
    const wl = (t.match(/\((?:Hybrid|Remote|On-?site|Full-time|Part-time)[^)]*\)/i) || [""])[0].toLowerCase();
    const workType = /hybrid/.test(wl) ? "Hybrid" : /remote/.test(wl) ? "Remote" : /on-?site/.test(wl) ? "Onsite" : null;
    const title = t.replace(/\s*\((?:[^()]*(?:Hybrid|Remote|On-?site|Full-time|Part-time)[^()]*)\)\s*$/i, "").trim();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      id: `konami-${slug}`,
      title,
      tech: extractTech(title),
      studio: studio.name,
      discipline: mapDiscipline("", title),
      workType: workType || inferWorkType(title, loc, []),
      location: loc,
      region: inferRegion(loc),
      seniority: inferSeniority(title),
      salary: null,
      yoe: null,
      postedAt: null,
      url: careersUrl,
    });
  }
  return out;
}
// ---- Mad Head Games — self-hosted careers site (custom "JobList" widget) ---------
// careers.madheadgames.com is a jQuery site whose jobs load from an AJAX-only endpoint:
//   GET /JobList?...&subdomain=madheadgames&page=1&pageSize=50  (needs the X-Requested-With
//   header; omit the "d" filter param to get all roles). Returns an HTML fragment of
//   <a class="jobs__box" href=".../jobs/<slug>"><h3>Title</h3><p>City (WorkType)</p></a>.
//   Skips the evergreen "Open application".
async function fetchMadHead(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else {
    const url = studio.jobsUrl || "https://careers.madheadgames.com/JobList?layoutId=Jobs-2&websiteUrl=https://careers.madheadgames.com&themeId=2&language=en&subdomain=madheadgames&page=1&pageSize=50&contains=";
    const res = await fetchRetry(url, { headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "X-Requested-With": "XMLHttpRequest", "Accept": "text/html" } });
    html = await res.text();
  }
  const out = [], seen = new Set();
  for (const m of String(html).matchAll(/<a\b([^>]*\bjobs__box\b[^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = m[1], inner = m[2];
    const href = (attrs.match(/href="([^"]+)"/) || [])[1] || "";
    const slug = (href.match(/\/jobs\/([a-z0-9-]+)/i) || [])[1] || "";
    const title = decodeEnt((inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) || [, ""])[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title || !slug || seen.has(slug)) continue;
    if (/open application|spontaneous|speculative/i.test(title)) continue;
    seen.add(slug);
    const metaText = decodeEnt((inner.match(/<p[^>]*jobs__box__text[^>]*>([\s\S]*?)<\/p>/i) || [, ""])[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const wtM = metaText.match(/\((hybrid|remote|on-?site|onsite)\)/i);
    const workType = wtM ? (/hybrid/i.test(wtM[1]) ? "Hybrid" : /remote/i.test(wtM[1]) ? "Remote" : "Onsite") : null;
    const location = (metaText.replace(/\s*\([^)]*\)\s*$/, "").trim().replace(/\bBeograd\b/i, "Belgrade")) || studio.city || "Unlisted";
    out.push({
      id: `madhead-${slug}`,
      title,
      tech: extractTech(title),
      studio: studio.name,
      discipline: mapDiscipline("", title),
      workType: workType || inferWorkType(title, location, []),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null,
      yoe: null,
      postedAt: null,
      url: href.startsWith("http") ? href : "https://careers.madheadgames.com" + href,
    });
  }
  return out;
}
// ---- Kenjo (Deck13 + others) — career-site public positions API -----------------
// <token>.kenjo.io is an Angular careers site backed by a clean JSON API:
//   GET /api/controller/career-site/public/<token>/positions
//   -> { activePositions:[ { _id, jobTitle, customUrl, departmentName, officeName,
//        positionType } ] }. Detail pages at /<customUrl>. officeName like
//   "Frankfurt am Main / Remote in Germany" -> Hybrid. Skips "General Application".
async function fetchKenjo(studio) {
  const token = studio.token;
  let arr;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; arr = d.activePositions || (Array.isArray(d) ? d : []); }
  else { const d = await fetchJson(`https://${token}.kenjo.io/api/controller/career-site/public/${token}/positions`); arr = (d && d.activePositions) || []; }
  const out = [], seen = new Set();
  for (const j of arr) {
    if (!j || !j._id || seen.has(j._id)) continue;
    const title = decodeEnt(String(j.jobTitle || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title || /general application|speculative|spontaneous|open application|unsolicited/i.test(title)) continue;
    seen.add(j._id);
    const office = String(j.officeName || "").trim();
    const remote = /remote/i.test(office);
    const country = (office.match(/\bin\s+([A-Za-z][A-Za-z .-]+?)\s*$/) || [])[1] || "";
    const city = office.split("/")[0].replace(/\bremote\b[\s\S]*/i, "").trim();
    const location = city ? (country ? `${city}, ${country}` : city)
      : (country ? `Remote, ${country}` : (remote ? "Remote" : (studio.city || "Unlisted")));
    const workType = remote ? (city ? "Hybrid" : "Remote") : inferWorkType(title, location, []);
    out.push({
      id: `kenjo-${token}-${j._id}`,
      title,
      tech: extractTech(title),
      studio: studio.name,
      discipline: mapDiscipline(j.departmentName, title),
      workType,
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null,
      yoe: null,
      postedAt: null,
      url: `https://${token}.kenjo.io/${j.customUrl || j._id}`,
    });
  }
  return out;
}
// ---- Trailmix Games — self-hosted Webflow careers page --------------------------
// trailmixgames.com/careers server-renders each opening as an <a class="open-position...">
// to /jobs/<slug>. Only the title is on the listing (apply is by form on the detail page),
// so location defaults to the London HQ unless the title ends with a "(City)" that resolves
// to a real region (e.g. "... (Berlin)"), which is then used as the location and stripped
// from the title.
async function fetchTrailmix(studio) {
  let html;
  if (SAMPLE_FILE) { const d = loadSample(studio); if (!d) return []; html = typeof d === "string" ? d : (d.html || ""); }
  else { html = await fetchText(studio.careersUrl || "https://www.trailmixgames.com/careers"); }
  const out = [], seen = new Set();
  for (const m of String(html).matchAll(/<a[^>]*href="([^"]*\/jobs\/([a-z0-9-]+))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const slug = m[2];
    let title = decodeEnt(m[3].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!title || title.length > 120 || /find out more|apply|learn more|read more/i.test(title) || seen.has(slug)) continue;
    seen.add(slug);
    let location = studio.city || "London, UK";
    const pm = title.match(/\s*\(([^)]+)\)\s*$/);
    if (pm) { const reg = inferRegion(pm[1]); if (reg && reg !== "Other") { location = pm[1].trim(); title = title.slice(0, pm.index).trim(); } }
    out.push({
      id: `trailmix-${slug}`,
      title,
      tech: extractTech(title),
      studio: studio.name,
      discipline: mapDiscipline("", title),
      workType: inferWorkType(title, location, []),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(title),
      salary: null,
      yoe: null,
      postedAt: null,
      url: m[1].startsWith("http") ? m[1] : "https://www.trailmixgames.com" + m[1],
    });
  }
  return out;
}
const FETCHERS = { greenhouse: fetchGreenhouse, lever: fetchLever, workday: fetchWorkday, avature: fetchAvature, smartrecruiters: fetchSmartRecruiters, workable: fetchWorkable, phenom: fetchPhenom, teamtailor: fetchTeamtailor, eightfold: fetchEightfold, amazonjobs: fetchAmazonJobs, ashby: fetchAshby, zenimax: fetchZenimax, bamboohr: fetchBambooHr, jobscore: fetchJobScore, jazzhr: fetchJazzHr, jobvite: fetchJobvite, recruitee: fetchRecruitee, personio: fetchPersonio, rippling: fetchRippling, breezy: fetchBreezy, manatal: fetchManatal, sumodigital: fetchSumoDigital, pinpoint: fetchPinpoint, playground: fetchPlayground, obsidian: fetchObsidian, techland: fetchTechland, oracle: fetchOracle, cig: fetchCig, critpath: fetchCritpath, krafton: fetchKrafton, eidos: fetchEidos, hiringthing: fetchHiringThing, segacareers: fetchSegaCareers, turn10: fetchTurn10, mscareers: fetchMicrosoftCareers, lightfox: fetchLightfox, hrworks: fetchHRworks, smilegate: fetchSmilegate, cygames: fetchCygames, hrmos: fetchHrmos, garena: fetchGarena, shiftup: fetchShiftUp, miniclip: fetchMiniclip, playrix: fetchPlayrix, superplay: fetchSuperPlay, atlus: fetchAtlus, kojima: fetchKojima, owlcat: fetchOwlcat, comeet: fetchComeet, huntflow: fetchHuntflow, keka: fetchKeka, traffit: fetchTraffit, nekki: fetchNekki, plarium: fetchPlarium, hellogames: fetchHelloGames, hibob: fetchHibob, flix: fetchFlix, fromsoftware: fetchFromSoftware, grindinggear: fetchGrindingGear, konami: fetchKonami, madhead: fetchMadHead, kenjo: fetchKenjo, trailmix: fetchTrailmix };

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
    // True first-sighting date — never seeded from the studio's posted date. Preserved once set;
    // pre-existing seen.json entries get stamped on the first run after this shipped (a one-time
    // backlog stamp in that month, which then slides out of any 12-month window). Unlike firstSeen
    // (bootstrapped from postedAt for realistic day-one ages), this is a genuine "when DevQuest first
    // observed this role", so a real "new roles tracked per month" chart can build going forward.
    if (!h.discoveredAt) h.discoveredAt = now;
    h.lastSeen = now;
    hist[j.id] = h;

    j.firstSeen = new Date(h.firstSeen).toISOString();
    j.discoveredAt = new Date(h.discoveredAt).toISOString();
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
const SALARY_CACHE_VERSION = 3;   // bump to re-check previously-empty results after parser/fetcher upgrades (v3: single-value salaries)

async function fetchDetailJson(url, ms = 15000) {
  const res = await fetchRetry(url, { ms, headers: { "User-Agent": "DevQuest/0.1 (game-dev job aggregator)", "Accept": "application/json" } });
  return res.json();
}

async function fetchText(url, ms = 15000, ua) {
  const res = await fetchRetry(url, { ms, headers: {
    // Default to a real-browser UA. Pass `ua` to override — e.g. a crawler UA for sites that serve an
    // age-gate (no content) to browsers but full content to search crawlers.
    "User-Agent": ua || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
  } });
  return res.text();
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

  let fetched = 0, found = 0, descBackfilled = 0;
  for (const j of toFetch) {
    if (fetched >= SALARY_MAX_FETCH) break;
    fetched++;
    try {
      const desc = await jobDescriptionText(j);
      // We already paid for this page — keep the description instead of discarding it. This is the
      // whole fix for the sources whose LISTING carries no description (SmartRecruiters, EA/Avature
      // and the HTML-scraped boards); it costs no extra requests, and it feeds both the job pages
      // and the description shards further down the run.
      if (desc && desc.trim().length >= JOB_MIN_DESC && !(typeof j.desc === "string" && j.desc.trim().length >= JOB_MIN_DESC)) {
        j.desc = desc.trim();
        descBackfilled++;
      }
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

  if (descBackfilled) console.log(`Descriptions recovered from detail fetches: ${descBackfilled}`);
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

function buildTrends(runCounts, okSet, discCounts, healthy, salInfo, skillCounts, workCounts, yoeInfo, salSen, discSal, cityCounts) {
  let store = { days: [] };
  try { store = JSON.parse(fs.readFileSync(TRENDS_FILE, "utf8")); } catch (e) { store = { days: [] }; }
  const days = store.days || [];
  const today = new Date().toISOString().slice(0, 10);

  const prev = days.length ? days[days.length - 1].counts : {};
  const counts = { ...prev };       // carry forward, then overwrite the OK ones
  for (const name of okSet) counts[name] = runCounts[name] || 0;
  // Per-discipline snapshot: disciplines span many studios, so they're robust to a single
  // studio failing — but on a badly-degraded run we carry the previous day's disc forward
  // rather than record an artificially low set.
  const prevDisc = days.length ? (days[days.length - 1].disc || {}) : {};
  const disc = (healthy || !days.length) ? (discCounts || {}) : prevDisc;
  // Salary transparency (pct of live roles publishing pay, plus raw count/total) and the
  // skill/tech-tag demand map — board-wide, so likewise carried forward on a degraded run.
  const prevSal = days.length ? (days[days.length - 1].sal || null) : null;
  const sal = (healthy || !days.length) ? (salInfo || prevSal || null) : (prevSal || salInfo || null);
  const prevSkills = days.length ? (days[days.length - 1].skills || {}) : {};
  const skills = (healthy || !days.length) ? (skillCounts || {}) : prevSkills;
  // Phase-0 banked fields (carry forward on a degraded run, same as the others above).
  const prevWork = days.length ? (days[days.length - 1].work || {}) : {};
  const work = (healthy || !days.length) ? (workCounts || {}) : prevWork;
  const prevYoe = days.length ? (days[days.length - 1].yoe || null) : null;
  const yoe = (healthy || !days.length) ? (yoeInfo || prevYoe || null) : (prevYoe || yoeInfo || null);
  const prevSalSen = days.length ? (days[days.length - 1].salSen || {}) : {};
  const salSenSnap = (healthy || !days.length) ? (salSen || {}) : prevSalSen;
  const prevDiscSal = days.length ? (days[days.length - 1].discSal || {}) : {};
  const discSalSnap = (healthy || !days.length) ? (discSal || {}) : prevDiscSal;
  const prevCities = days.length ? (days[days.length - 1].cities || {}) : {};
  const citiesSnap = (healthy || !days.length) ? (cityCounts || {}) : prevCities;

  if (days.length && days[days.length - 1].date === today) days[days.length - 1] = { date: today, counts, disc, sal, skills, work, yoe, salSen: salSenSnap, discSal: discSalSnap, cities: citiesSnap };
  else days.push({ date: today, counts, disc, sal, skills, work, yoe, salSen: salSenSnap, discSal: discSalSnap, cities: citiesSnap });
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
  const curDisc = days[days.length - 1].disc || {};
  const curSal = days[days.length - 1].sal || null;
  const curSkills = days[days.length - 1].skills || {};
  const d7 = snapNearest(7), d30 = snapNearest(30);
  const out = { asOf: today, span: days.length, studios: {}, disc: {}, salary: null, skills: {} };
  for (const name of Object.keys(cur)) {
    // `ever` / `obs` exist to catch scrapers that NEVER worked. A studio that has been configured
    // for weeks and has not produced a single role on any recorded day is almost certainly a broken
    // parser, not a quiet studio — you don't add a studio to the board unless it had roles at the
    // time. Without this, a never-worked source is indistinguishable from a genuinely empty one
    // (both are just zeros), which is how KRAFTON and Techland sat broken and unnoticed.
    // `series` only spans 30 days, so the look-back has to be computed over the full store.
    let ever = 0, obs = 0;
    for (const d of days) { const v = d.counts[name]; if (v == null) continue; obs++; if (v > ever) ever = v; }
    out.studios[name] = {
      now: cur[name],
      d7: d7 ? (d7.counts[name] ?? null) : null,
      d30: d30 ? (d30.counts[name] ?? null) : null,
      ever,                                            // most roles ever seen on any recorded day
      obs,                                             // days of history we actually have for it
      series: days.slice(-30).map(d => (d.counts[name] ?? null)),
    };
  }
  for (const name of Object.keys(curDisc)) {
    out.disc[name] = {
      now: curDisc[name],
      d7: d7 && d7.disc ? (d7.disc[name] ?? null) : null,
      d30: d30 && d30.disc ? (d30.disc[name] ?? null) : null,
      series: days.slice(-30).map(d => (d.disc ? (d.disc[name] ?? null) : null)),
    };
  }
  // Salary-transparency trend: pct of roles publishing pay, plus raw count, now vs 7/30d ago.
  if (curSal) {
    const pctOf = (x) => (x && x.total ? Math.round(100 * x.n / x.total) : (x ? (x.pct ?? null) : null));
    out.salary = {
      now: pctOf(curSal),
      nowN: curSal.n ?? null,
      d7: d7 && d7.sal ? pctOf(d7.sal) : null,
      d7N: d7 && d7.sal ? (d7.sal.n ?? null) : null,
      d30: d30 && d30.sal ? pctOf(d30.sal) : null,
      series: days.slice(-30).map(d => (d.sal ? pctOf(d.sal) : null)),
    };
  }
  // Skill/tech-tag demand trend: for each skill live today, count now vs 7/30d ago.
  for (const name of Object.keys(curSkills)) {
    out.skills[name] = {
      now: curSkills[name],
      d7: d7 && d7.skills ? (d7.skills[name] ?? null) : null,
      d30: d30 && d30.skills ? (d30.skills[name] ?? null) : null,
    };
  }
  return out;
}

// ---- Apply-link health probe ------------------------------------------------
// We scrape the API, but the *links* can rot independently — a studio restructures its careers URLs,
// or (like Supercell) disables its public ATS board while the API keeps serving jobs. This samples a
// few of each studio's live URLs (throttled to ~once/day per studio, hard-capped + time-bounded per
// run) and flags a studio ONLY when every sampled link is dead by a server-visible signal — so normal
// single-job staleness never trips it. Fully isolated: any failure here is swallowed and can never
// affect jobs.json. Blind spot: pure JS-rendered "page not found" SPAs (e.g. jobs.ashbyhq.com) return
// HTTP 200, so they can't be caught server-side — for that class we move the studio to on-site deep
// links instead (see ASHBY_SITE).
const LINKHEALTH_FILE = path.join(__dirname, "linkhealth.json");
const SOFT404_RE = /page not found|position not found|no longer (available|accepting|open|exists)|this (?:job|position|role|posting) (?:is |has been )?(?:closed|expired|filled|removed)|job (?:not found|has expired)|position_not_found/i;
async function probeUrl(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "text/html" } });
    if (res.status === 404 || res.status === 410) return "dead";
    if (res.status === 403 || res.status === 429 || res.status >= 500) return "blocked"; // bot-wall / outage, not a real break
    if (/not[-_]?found|position_not_found|job-not-found|expired/i.test(res.url || "")) return "dead"; // redirected to a not-found page
    if (res.status >= 200 && res.status < 300) {
      let body = ""; try { body = (await res.text()).slice(0, 60000); } catch (e) {}
      return SOFT404_RE.test(body) ? "dead" : "ok";
    }
    return "blocked";
  } catch (e) { return "error"; }   // timeout / network error — never treated as broken
  finally { clearTimeout(to); }
}
async function checkLinkHealth(all) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(LINKHEALTH_FILE, "utf8")); } catch (e) { state = {}; }
  const byStudio = {};
  for (const j of all) { if (j && j.url && /^https?:/i.test(j.url)) (byStudio[j.studio] = byStudio[j.studio] || []).push(j); }
  const COOLDOWN = 20 * 3600 * 1000, CAP = 12, DEADLINE = Date.now() + 90000;
  const eligible = Object.keys(byStudio)
    .filter(s => !(state[s] && state[s].ts && (Date.now() - state[s].ts) < COOLDOWN))
    .sort((a, b) => ((state[a] && state[a].ts) || 0) - ((state[b] && state[b].ts) || 0))
    .slice(0, CAP);
  for (const studio of eligible) {
    if (Date.now() > DEADLINE) break;
    const sorted = byStudio[studio].slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const picks = [...new Set([sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]].filter(Boolean).map(j => j.url))].slice(0, 3);
    const results = [];
    for (const u of picks) { if (Date.now() > DEADLINE) break; results.push(await probeUrl(u)); await new Promise(r => setTimeout(r, 150)); }
    const fetched = results.filter(r => r === "ok" || r === "dead");
    let verdict = "unknown";
    if (results.some(r => r === "ok")) verdict = "ok";
    else if (fetched.length >= 2 && fetched.every(r => r === "dead")) verdict = "broken";  // every sample dead = systemic, not staleness
    state[studio] = { ts: Date.now(), verdict, url: picks[0] || "" };
  }
  try { fs.writeFileSync(LINKHEALTH_FILE, JSON.stringify(state)); } catch (e) { console.error("Could not write linkhealth.json:", e.message); }
  const broken = Object.keys(state)
    .filter(s => state[s].verdict === "broken" && byStudio[s])
    .map(s => ({ studio: s, jobs: byStudio[s].length, sample: state[s].url }));
  if (broken.length) console.warn("Apply-link health: " + broken.length + " studio(s) with dead links — " + broken.map(b => b.studio).join(", "));
  return broken;
}

// ---- Main -------------------------------------------------------------------

// Expose the classifier for the test fixture (test-classify.js). When this file is `require()`d
// instead of run directly, skip the actual scrape and just export the pure functions.
module.exports = { mapDiscipline, strongTitleDiscipline, normDisc };
(async () => {
  if (require.main !== module) return;   // required for tests → don't run the scrape
  const all = [];
  const errors = [];
  const runCounts = {};      // studio name -> open roles this run (successful fetches only)
  const okSet = new Set();   // studios that fetched without error
  // ---- Carry-forward -----------------------------------------------------------------------
  // A source that fails used to take all of its roles off the board for that cycle. One rate-limited
  // run on 2026-08-01 dropped 37 Workable studios at once: the live count fell 6,006 -> 5,717, ~290
  // job pages were deleted, and the next run recreated them an hour later. That churn is invisible
  // to us, useless to visitors, and actively bad for Google, which had just crawled those URLs.
  // A transient 429 is not evidence that a studio stopped hiring, so keep the last known-good roles.
  //
  // Bounded two ways, because carrying forever would let a genuinely dead source haunt the board:
  // the previous file has to be recent, and any single role can only be carried CARRY_MAX_RUNS times
  // (tracked on the role itself via _carry, which persists in jobs.json between runs).
  const CARRY_MAX_RUNS = 6;                 // ~6 hourly runs, then a persistently dead source drops
  const CARRY_MAX_AGE  = 12 * 60 * 60e3;    // and never from a file older than half a day
  const prevBySrc = new Map();
  try {
    const prev = JSON.parse(fs.readFileSync(path.join(__dirname, "jobs.json"), "utf8"));
    const at = Date.parse(prev.scrapedAt || 0);
    if (isFinite(at) && Date.now() - at < CARRY_MAX_AGE) {
      for (const j of (prev.jobs || [])) {
        if (!j || !j._src) continue;        // absent on the first run after this shipped — fine, no carry
        if (!prevBySrc.has(j._src)) prevBySrc.set(j._src, []);
        prevBySrc.get(j._src).push(j);
      }
    }
  } catch (e) { /* no previous run, or unreadable — carry-forward simply doesn't apply */ }
  for (const studio of STUDIOS) {
    try {
      const jobs = await FETCHERS[studio.type](studio);
      // parent company tag: a studio's umbrella (e.g. Massive Entertainment -> Ubisoft);
      // for independent studios the parent is just itself.
      // _src records WHICH configured source produced the role, which studio/parent can't: one
      // source can emit many studio names (KRAFTON's sub-studios, deptAsStudio boards), so it is
      // the only key that can restore exactly the set a failed fetch would have returned.
      jobs.forEach(j => { j.parent = studio.parentCompany || j.studio; j._src = studio.name; });
      console.log(`OK ${studio.name}: ${jobs.length} jobs`);
      all.push(...jobs);
      runCounts[studio.name] = (runCounts[studio.name] || 0) + jobs.length;
      okSet.add(studio.name);
    } catch (e) {
      const carried = (prevBySrc.get(studio.name) || []).filter(j => (j._carry || 0) < CARRY_MAX_RUNS);
      if (carried.length) {
        for (const j of carried) j._carry = (j._carry || 0) + 1;
        all.push(...carried);
        // Deliberately NOT added to okSet or runCounts: the fetch did fail, and the health view and
        // the trend history should both say so. Only the visitor-facing list is protected.
        errors.push(`${studio.name}: ${e.message} — keeping ${carried.length} role${carried.length === 1 ? "" : "s"} from the last good run`);
        console.error(`FAIL ${studio.name}: ${e.message} — carried ${carried.length} forward`);
      } else {
        errors.push(`${studio.name}: ${e.message}`);
        console.error(`FAIL ${studio.name}: ${e.message}`);
      }
    }
  }
  // Drop clearly non-game-industry roles that some studios post on the same board — facility /
  // welfare / manual-service jobs (e.g. campus massage therapist, car care, cafeteria, janitor).
  // Title-based and deliberately conservative: matched ONLY on the role title (never the hiring
  // program), and tuned so it catches zero real game / business / IT roles (validated against live
  // data). NOTE: "chef" is intentionally EXCLUDED — it means "lead/head" in French ("Chef d'équipe")
  // at our many Québécois studios, so blocking it would wrongly drop real lead roles.
  // ("culinary" and bare "landscap" are deliberately omitted — they'd catch real roles like a
  // cooking-game "Culinary Designer" or a "Landscape Artist"; we use "landscaping" for grounds work.)
  const NON_GAME_TITLE = /\bmassage\b|masseu|car care|car wash|\bvalet\b|\bbarista\b|cafeteria|kitchen (porter|staff|assistant|hand|aide)|security guard|security officer|\bjanitor\b|custodian|housekeep|cleaning (staff|crew|attendant|service)|\bcleaner\b|\bgardener\b|landscaping|groundskeep|shuttle driver|delivery driver|\bchauffeur\b|\bnurse\b|\bcaregiver\b|physical therapist|occupational therapist|facilit(?:y|ies) (?:assistant|attendant|helper|worker|staff|aide)|\bblockchain\b|\bweb3\b|\bnfts?\b|crypto(?:currency)?\b|\begofold\b|\bscams?\b/i;
  let droppedNonGame = 0;
  for (let i = all.length - 1; i >= 0; i--) { if (NON_GAME_TITLE.test(all[i].title || "")) { all.splice(i, 1); droppedNonGame++; } }
  if (droppedNonGame) console.log(`Filtered out ${droppedNonGame} non-game facility/service role(s).`);
  // Junk titles: some feeds emit a button/placeholder label instead of a real title (e.g. "Apply
  // Here", "View job", an empty string). Drop anything whose WHOLE title is a generic CTA/placeholder.
  const JUNK_TITLE = /^(apply( (here|now|today|online|link))?|view (job|details|role|opening|posting)|learn more|click here|see (more|all|details|jobs?)|read more|submit( (application|cv|resume))?|join (us|our team)|open (roles|positions)|explore (roles|opportunities)|details|more info|n\/?a|tbd|untitled|.*\bscams?\b.*)\.?$/i;
  let droppedJunk = 0;
  for (let i = all.length - 1; i >= 0; i--) { const tt = (all[i].title || "").trim(); if (!tt || JUNK_TITLE.test(tt)) { all.splice(i, 1); droppedJunk++; } }
  if (droppedJunk) console.log(`Filtered out ${droppedJunk} junk/placeholder-title role(s).`);
  // Cross-board dedup for Teamtailor group boards: a parent/group careers site (e.g. Kepler
  // Interactive) re-lists the SAME Teamtailor postings that its member studios (e.g. Sloclap)
  // show on their own boards. Teamtailor job IDs are globally unique, so when the same
  // tt-<token>-<id> appears under both, drop the aggregator's copy so the role shows once,
  // attributed to the specific studio.
  const AGGREGATORS = new Set(STUDIOS.filter(s => s.aggregator).map(s => s.name));
  if (AGGREGATORS.size) {
    const ttNum = (j) => { const m = /^tt-.+-(\d+)$/.exec(j.id || ""); return m ? m[1] : null; };
    const onSpecificBoard = new Set();
    for (const j of all) { const t = ttNum(j); if (t && !AGGREGATORS.has(j.studio)) onSpecificBoard.add(t); }
    let droppedAgg = 0;
    for (let i = all.length - 1; i >= 0; i--) {
      const t = ttNum(all[i]);
      if (t && AGGREGATORS.has(all[i].studio) && onSpecificBoard.has(t)) { all.splice(i, 1); droppedAgg++; }
    }
    if (droppedAgg) console.log(`Deduped ${droppedAgg} aggregator role(s) already listed under a member studio.`);
  }
  // Tabletop fix: at card / board / physical-game publishers, "Developer" means game *design*, not
  // software — e.g. a "Principal Game Developer" at Exploding Kittens is a tabletop designer. Their
  // real software roles are titled Engineer / Software / Full-Stack and are left as Engineering; we
  // only move bare "developer" titles (no engineering signal) from Engineering to Design. Add a
  // studio name here to extend.
  const TABLETOP_STUDIOS = new Set(["Exploding Kittens"]);
  const TT_SW_SIGNAL = /engineer|ingénieur|programmer|programmeur|software|architect|architecte|full ?stack|back ?end|front ?end|dev ?ops|\bsre\b|technical|unity|unreal|\bc\+\+|\bc#|\.net/i;
  let ttMoved = 0;
  for (const j of all) {
    if (j.discipline === "Engineering" && TABLETOP_STUDIOS.has(j.studio)
        && /\bdeveloper\b|développeur/i.test(j.title || "") && !TT_SW_SIGNAL.test(j.title || "")) {
      j.discipline = "Design"; ttMoved++;
    }
  }
  if (ttMoved) console.log(`Reassigned ${ttMoved} tabletop "developer" role(s) to Design.`);
  // Tech tags: fetchers with full descriptions already set j.tech; for the rest (SmartRecruiters,
  // Workday, Teamtailor, Workable…) fall back to title-based tagging so every job has the field.
  for (const j of all) if (!j.tech) j.tech = extractTech(j.title || "");
  // Scrub placeholder location tokens (e.g. "BLANK") from any feed; re-infer region if it changed.
  for (const j of all) { if (j.location) { const c = cleanLocation(j.location); if (c !== j.location) { j.location = c; j.region = inferRegion(c); } } }
  applyListingHistory(all); // stamp first-seen dates + flag re-lists (writes seen.json)
  await backfillSalaries(all); // open detail pages for jobs missing salary; cache in seen.json
  for (const j of all) if (j.salary) j.salary = prettySalary(j.salary); // one consistent salary format
  const discCounts = {}; for (const j of all) { const d = j.discipline || "Other"; discCounts[d] = (discCounts[d] || 0) + 1; }
  // Salary transparency + skill demand snapshots, banked daily so the trend cards build over time.
  const salN = all.filter(j => j.salary).length;
  const salInfo = { n: salN, total: all.length, pct: all.length ? Math.round(100 * salN / all.length) : 0 };
  const skillCounts = {}; for (const j of all) for (const t of (j.tech || [])) if (t) skillCounts[t] = (skillCounts[t] || 0) + 1;
  // ---- Phase-0 snapshot fields: work-type mix, years-of-experience distribution, and salary by
  // seniority — banked daily so trend history accrues for future public cards (remote trend, pay
  // bands over time). Salaries are normalized to "$120K–$160K" form, so parse the K figures out. ----
  const salToK = (s) => { if (!s) return null; const ks = []; const re = /(\d[\d,]*(?:\.\d+)?)\s*[kK]/g; let m; while ((m = re.exec(String(s)))) ks.push(Math.round(parseFloat(m[1].replace(/,/g, "")))); if (!ks.length) { const re2 = /(\d[\d,]{4,})/g; let m2; while ((m2 = re2.exec(String(s)))) { const n = parseInt(m2[1].replace(/,/g, ""), 10); if (n >= 10000) ks.push(Math.round(n / 1000)); } } return ks.length ? [ks[0], ks[ks.length - 1]] : null; };
  const medOf = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const i = Math.floor(s.length / 2); return s.length % 2 ? s[i] : Math.round((s[i - 1] + s[i]) / 2); };
  const workCounts = {};
  for (const j of all) { const w = j.workType || "Unknown"; workCounts[w] = (workCounts[w] || 0) + 1; }
  const yoeInfo = { n: 0, sum: 0, b: { "1-2": 0, "3-5": 0, "6-9": 0, "10+": 0 } };
  for (const j of all) { const y = j.yoe; if (typeof y === "number" && y > 0) { yoeInfo.n++; yoeInfo.sum += y; const k = y <= 2 ? "1-2" : y <= 5 ? "3-5" : y <= 9 ? "6-9" : "10+"; yoeInfo.b[k]++; } }
  const _salSenAgg = {};
  for (const j of all) { const sen = j.seniority || "Unknown"; if (!_salSenAgg[sen]) _salSenAgg[sen] = { n: 0, total: 0, lo: [], hi: [] }; _salSenAgg[sen].total++; const ks = salToK(j.salary); if (ks) { _salSenAgg[sen].n++; _salSenAgg[sen].lo.push(ks[0]); _salSenAgg[sen].hi.push(ks[1]); } }
  const salSen = {};
  for (const k in _salSenAgg) { const o = _salSenAgg[k]; salSen[k] = { n: o.n, total: o.total, lo: medOf(o.lo), hi: medOf(o.hi) }; }
  // Forward-investment: bank per-discipline salary medians and per-city counts daily so that
  // "fastest-growing compensation" and city-momentum features can be built once history accrues.
  // (Banked only — not surfaced to the client yet; no jobs.json payload change.)
  const _discSalAgg = {};
  for (const j of all) { const d = j.discipline || "Other"; if (!_discSalAgg[d]) _discSalAgg[d] = { n: 0, total: 0, lo: [], hi: [] }; _discSalAgg[d].total++; const ks = salToK(j.salary); if (ks) { _discSalAgg[d].n++; _discSalAgg[d].lo.push(ks[0]); _discSalAgg[d].hi.push(ks[1]); } }
  const discSal = {};
  for (const k in _discSalAgg) { const o = _discSalAgg[k]; discSal[k] = { n: o.n, total: o.total, lo: medOf(o.lo), hi: medOf(o.hi) }; }
  const _cityAgg = {};
  for (const j of all) { const loc = j.location || ""; if (!loc || /remote/i.test(loc)) continue; const city = loc.split(",")[0].trim(); if (city) _cityAgg[city] = (_cityAgg[city] || 0) + 1; }
  const cityCounts = {};                          // keep the day's snapshot bounded: top 80 cities
  Object.entries(_cityAgg).sort((a, b) => b[1] - a[1]).slice(0, 80).forEach(([c, n]) => { cityCounts[c] = n; });
  const healthy = okSet.size >= STUDIOS.length * 0.8; // skip recording disc on a badly-degraded run
  const trends = buildTrends(runCounts, okSet, discCounts, healthy, salInfo, skillCounts, workCounts, yoeInfo, salSen, discSal, cityCounts); // per-studio + per-discipline + salary + skills momentum (writes trends.json)
  all.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
  // Apply-link health (isolated; never blocks or breaks the scrape).
  let linkHealth = [];
  try { linkHealth = await checkLinkHealth(all); } catch (e) { console.error("Link-health check skipped:", e.message); }

  const out = {
    scrapedAt: new Date().toISOString(),
    studios: STUDIOS.length,
    jobCount: all.length,
    errors,
    linkHealth,
    jobs: all,
    directory: DIRECTORY,
    moon: MOON,
    studioTags: STUDIO_KIND,
    studioList: STUDIOS.map(s => ({ name: s.name, type: s.type })),   // scraped ("mainland") registry, for the stats-page studio lookup
    trends,
  };
  const dir = __dirname;
  // Order matters: writeJobPages needs the FULL description, and writeDescriptionShards deletes
  // j.desc off every record. Job pages first, always.
  writeJobPages(all, dir);
  writeDescriptionShards(all, path.join(dir, "data", "jobs"));
  // jobs.json keeps _src / _carry: it is this run's memory, read back by the next run to decide what
  // can be carried forward. jobs.js is the visitor's bundle and has no use for either, so strip them
  // before writing it — the browser should not download ~5,700 copies of a source name.
  fs.writeFileSync(path.join(dir, "jobs.json"), JSON.stringify(out, null, 2));
  for (const j of all) { delete j._src; delete j._carry; }
  fs.writeFileSync(path.join(dir, "jobs.js"), "window.JOBS_DATA = " + JSON.stringify(out) + ";");
  console.log(`\nWrote ${all.length} jobs -> jobs.json + jobs.js`);
  writeLandingPages(all, dir); // SEO category pages + sitemap.xml, regenerated from the live data
})();
