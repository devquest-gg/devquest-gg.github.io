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
  { name: "Turn 10 Studios", url: "https://www.turn10studios.com/careers", note: "Forza — Xbox Game Studios", city: "Redmond, WA" },
  { name: "Ninja Theory", url: "https://www.ninjatheory.com/careers/opportunities", note: "Hellblade — Xbox Game Studios", city: "Cambridge, UK" },
  { name: "Valve", url: "https://www.valvesoftware.com/en/jobs", note: "Steam, Half-Life, Dota 2", city: "Bellevue, WA" },
  { name: "Remedy Entertainment", url: "https://www.remedygames.com/careers", note: "Control, Alan Wake — Finland", city: "Espoo, Finland" },
  { name: "Saber Interactive", url: "https://saber.games/careers/", note: "World War Z, Space Marine 2", city: "Fort Lauderdale, FL" },
  { name: "Supermassive Games", url: "https://www.supermassivegames.com/careers", note: "Until Dawn, The Quarry — UK", city: "Guildford, UK" },
  { name: "The Coalition", url: "https://www.thecoalitionstudio.com/careers", note: "Gears of War — Xbox", city: "Vancouver, BC" },
  { name: "Hello Games", url: "https://hellogames.org/join-us/", note: "No Man's Sky — Guildford, UK", city: "Guildford, UK" },
  { name: "Telltale Games", url: "https://telltale.com/careers/", note: "The Wolf Among Us — revived studio", city: "Malibu, CA" },
  // Notable studios we can't cleanly scrape yet (Xbox first-party / custom corporate portals) — link-outs for now.
  { name: "Square Enix", url: "https://www.square-enix-games.com/en_GB/careers", note: "Final Fantasy, Dragon Quest — JP publisher", city: "Tokyo, Japan" },
  // ---- June 2026: requested / community additions (link-outs; no clean scrapeable feed yet) ----
  // (PUBG Studios is now a live source — see the KRAFTON krafton.com scraper below, which covers PUBG
  //  Studios and the other KRAFTON sub-studios — so its link-out was removed.)
  // Can't cleanly scrape (Xbox first-party portals, custom sites, or a Pinpoint board) — link-outs.
  { name: "Retro Studios", url: "https://careers.nintendo.com/studios/retro-studios/", note: "Metroid Prime, Donkey Kong — Nintendo (Austin)", city: "Austin, TX" },
  { name: "Rare", url: "https://www.rare.co.uk/careers", note: "Sea of Thieves — Xbox Game Studios (UK)", city: "Twycross, UK" },
  { name: "Atlus", url: "https://atlus.com/careers", note: "Persona, Shin Megami Tensei — SEGA West", city: "Tokyo, Japan" },
  // Custom / first-party / unsupported-ATS boards — link-outs (June 2026 batch).
  { name: "Owlcat Games", url: "https://owlcat.games/careers", note: "Pathfinder, Rogue Trader — CRPG studio (Cyprus)", city: "Nicosia, Cyprus" },
  { name: "Sucker Punch Productions", url: "https://jobs.suckerpunch.com/", note: "Ghost of Tsushima/Yōtei — Sony first-party (Bellevue, WA)", city: "Bellevue, WA" },
  { name: "Grinding Gear Games", url: "https://www.grindinggear.com/?page=careers", note: "Path of Exile — Tencent (Auckland, NZ)", city: "Auckland, New Zealand" },
  // batch 3 (2026-06-08): self-hosted / no-API boards — browse directly
  { name: "Void Interactive", url: "https://voidinteractive.net/careers/", note: "Ready or Not (Dublin)", city: "Dublin, Ireland" },
  { name: "Grip Studios", url: "https://grip-studios.com/hiring.php", note: "Co-development on Indiana Jones and Civ VII (Prague)", city: "Prague, Czechia" },
  { name: "Mad Head Games", url: "https://careers.madheadgames.com/", note: "Scars Above, Pavilion (Serbia)", city: "Novi Sad, Serbia" },
  // 2026-06-19: Keka board (not a supported ATS) — link-out
  { name: "LightFury Games", url: "https://lightfury.keka.com/careers/", note: "AAA game-tech studio (India / UK)", city: "Bengaluru, India" },
  // 2026-06-19 batch: custom sites / unsupported ATS (Paylocity, HiringThing, Talentsoft, Webflow) — link-outs
  { name: "Trailmix Games", url: "https://www.trailmixgames.com/careers", note: "Love & Pies — mobile (London)", city: "London, UK" },
  { name: "Gunfire Games", url: "https://gunfiregames.com/careers", note: "Remnant, Darksiders — Paylocity board", city: "Austin, TX" },
  { name: "10:10 Games", url: "https://www.1010games.com/join-us", note: "ex-Playtonic / Crash devs (Warrington)", city: "Warrington, UK" },
  { name: "Snail Games", url: "https://snail-games-usa-inc.hiringthing.com", note: "ARK publisher — HiringThing board", city: "Culver City, CA" },  // batch 4 (2026-06-09): notable + mobile studios on custom / region-specific ATS — browse directly
  { name: "Kojima Productions", url: "https://www.kojimaproductions.jp/en/careers", note: "Death Stranding (Tokyo)", city: "Tokyo, Japan" },
  { name: "Cygames", url: "https://www.cygames.co.jp/en/recruit/", note: "Granblue Fantasy, Uma Musume (Tokyo)", city: "Tokyo, Japan" },
  { name: "Garena", url: "https://careers.garena.com/", note: "Free Fire — part of Sea Ltd (Singapore)", city: "Singapore" },
  { name: "Plarium", url: "https://company.plarium.com/en/career/", note: "RAID: Shadow Legends — mobile games (Israel)", city: "Herzliya, Israel" },
  { name: "SuperPlay", url: "https://www.superplay.co/careers", note: "Dice Dreams — casual mobile games (Israel)", city: "Tel Aviv, Israel" },
  { name: "Playrix", url: "https://playrix.com/job/open/", note: "Gardenscapes, Township (Dublin)", city: "Dublin, Ireland" },
  // batch 5 (2026-06-11): big names with custom / no-API careers sites (christran sweep holdouts) — browse directly.
  { name: "CCP Games", url: "https://careers.fenriscreations.com/", note: "EVE Online — now Fenris Creations (Reykjavík)", city: "Reykjavík, Iceland" },
  { name: "Miniclip", url: "https://www.miniclip.com/careers/vacancies", note: "8 Ball Pool, Agar.io (Switzerland)", city: "Neuchâtel, Switzerland" },
  { name: "Keen Software House", url: "https://www.keenswh.com/careers/", note: "Space Engineers (Prague)", city: "Prague, Czechia" },
  // From the Grackle HQ comparison (2026-06-11): notable studios on custom careers sites.
  { name: "FromSoftware", url: "https://careers.fromsoftware.jp/en/openpositions.html", note: "Elden Ring, Dark Souls (Japan)", city: "Tokyo, Japan" },
  { name: "Robot Entertainment", url: "https://robotentertainment.com/careers", note: "Orcs Must Die! — fully remote (US Central)", city: "Plano, TX" },
  // batch 6 (2026-06-13): Hitmarker gap analysis — notable independents + JP/KR studios on
  // boutique/custom ATS (Teamtailor, Pinpoint, JazzHR, regional). Link-outs for now; several
  // cluster onto the same ATS, so a single Teamtailor or Pinpoint fetcher could promote a batch.
  { name: "Konami", url: "https://www.konami.com/games/us/en/jobs/", note: "Metal Gear, Silent Hill, Castlevania", city: "Tokyo, Japan" },
  { name: "PlatinumGames", url: "https://www.platinumgames.com/recruit/mid-career/", note: "Bayonetta, NieR: Automata (Japan)", city: "Osaka, Japan" },
  { name: "Level-5", url: "https://www.level5.co.jp/", note: "Professor Layton, Ni no Kuni (Japan)", city: "Fukuoka, Japan" },
  { name: "Koei Tecmo", url: "https://www.koeitecmo.com.sg/index.php/careers/", note: "Dynasty Warriors, Nioh, Atelier (Japan)", city: "Yokohama, Japan" },
  { name: "Pearl Abyss", url: "https://www.pearlabyss.com/en-US/Company/Careers/List", note: "Black Desert, Crimson Desert (South Korea)", city: "Anyang, South Korea" },
  { name: "Smilegate", url: "https://careers.smilegate.com/en/", note: "Lost Ark, CrossFire (South Korea)", city: "Seongnam, South Korea" },
  { name: "Shift Up", url: "https://shiftup.co.kr/recruit/", note: "Stellar Blade, NIKKE (South Korea)", city: "Seoul, South Korea" },
  { name: "Moon Studios", url: "https://www.moongamestudios.com/", note: "Ori, No Rest for the Wicked — fully remote", city: "Vienna, Austria" },
  { name: "Iron Gate Studio", url: "https://irongate.se/", note: "Valheim — small Swedish studio", city: "Skövde, Sweden" },
  { name: "Devolver Digital", url: "https://www.devolverdigital.com/jobs", note: "Indie publisher — Cult of the Lamb, Cuphead", city: "Austin, TX" },
  { name: "Klei Entertainment", url: "https://www.klei.com/careers", note: "Don't Starve, Oxygen Not Included (Vancouver)", city: "Vancouver, BC" },
  { name: "Electric Square", url: "https://electricsquare.com/come-join-us/open-positions/", note: "Co-development (Lively, Hot Wheels Unleashed) — part of Keywords Studios", city: "Brighton, UK" },
  { name: "Sports Interactive", url: "https://careers.sega.co.uk/studios/sports-interactive", note: "Football Manager — part of SEGA", city: "London, UK" },
  { name: "Two Point Studios", url: "https://careers.sega.co.uk/studios/two-point-studios", note: "Two Point Hospital/Campus — SEGA", city: "Farnham, UK" },
  { name: "Archetype Entertainment", url: "https://www.archetype-entertainment.com/en-US", note: "AAA sci-fi RPG (ex-BioWare) — Wizards of the Coast / Hasbro", city: "Austin, TX" },
  // ---- 2026-06-26 batch: gap analysis vs alexanderrehm.com. Notable studios on UNsupported ATS
  // (HRMOS, Kenjo, Huntflow, or custom sites) — link-outs for now. NOTE: Com2uS, KING Art and Travian
  // were here too but moved to mainland once fetchPersonio was added (see STUDIOS). GAME FREAK +
  // Spike Chunsoft stay link-outs: HRMOS is JP-only HTML with no salary/date feed, like our other JP
  // studios. (Codemasters is EA-owned, already covered by the EA board.)
  { name: "GAME FREAK", url: "https://hrmos.co/pages/gamefreak/jobs", note: "Pokémon developer — HRMOS board (JP)", city: "Tokyo, Japan" },
  { name: "Kepler Interactive", url: "https://careers.kepler-interactive.com/", note: "Clair Obscur: Expedition 33, Sifu — publisher", city: "London, UK" },
  { name: "Sloclap", url: "https://careers.sloclap.com/", note: "Sifu, Absolver", city: "Paris, France" },
  { name: "Deck13 Interactive", url: "https://deck13jobs.kenjo.io/", note: "Lords of the Fallen, The Surge — Kenjo board", city: "Frankfurt, Germany" },
  { name: "Kalypso Media", url: "https://jobs.kalypsomedia.com/", note: "Tropico publisher", city: "Worms, Germany" },
  { name: "Gameforge", url: "https://corporate.gameforge.com/en/career/", note: "browser/MMO publisher (AION, Metin2)", city: "Karlsruhe, Germany" },
  { name: "DeNA", url: "https://herp.careers/v1/dena/", note: "mobile publisher (Pokémon Masters EX) — HERP board (JP)", city: "Tokyo, Japan" },
  { name: "Spike Chunsoft", url: "https://hrmos.co/pages/spchun/jobs", note: "Danganronpa, Zero Escape — HRMOS board (JP)", city: "Tokyo, Japan" },
  { name: "Moon Active", url: "https://www.moonactive.com/careers/", note: "Coin Master — mobile", city: "Tel Aviv, Israel" },
  { name: "Toca Boca", url: "https://www.tocaboca.com/careers", note: "Toca Boca World — kids", city: "Stockholm, Sweden" },
  { name: "Star Stable Entertainment", url: "https://jobs.starstableentertainment.com/", note: "Star Stable Online", city: "Stockholm, Sweden" },
  { name: "Snowprint Studios", url: "https://career.snowprintstudios.com/", note: "Warhammer 40K: Tacticus", city: "Stockholm, Sweden" },
  { name: "MAG Interactive", url: "https://career.maginteractive.com/", note: "WordBrain, Ruzzle — mobile", city: "Stockholm, Sweden" },
  { name: "Neon Giant", url: "https://jobs.neongiant.se/", note: "The Ascent", city: "Uppsala, Sweden" },
  { name: "Madbox", url: "https://careers.madbox.io/", note: "hypercasual/casual mobile", city: "Paris, France" },
  { name: "Manticore Games", url: "https://www.manticoregames.com/careers/", note: "Core — UGC platform", city: "San Mateo, CA" },
  { name: "Red Rover Interactive", url: "https://careers.redroverinteractive.com/", note: "Pioneers of Pagonia", city: "Oslo, Norway" },
  { name: "Steel City Interactive", url: "https://careers.steelcityinteractive.co.uk/", note: "Undisputed (boxing)", city: "Sheffield, UK" },
  { name: "Vivid Games", url: "https://jobs.vividgames.com/", note: "Real Boxing — mobile", city: "Bydgoszcz, Poland" },
  { name: "SayGames", url: "https://saygameshr.global.huntflow.io/", note: "hypercasual publisher — Huntflow board", city: "Limassol, Cyprus" },
  { name: "Yodo1 Games", url: "https://careers.yodo1.com/", note: "Crossy Road, Rodeo Stampede — publisher", city: "Remote / Beijing" },
  { name: "BKOM Studios", url: "https://jobs.bkom.com/", note: "co-dev / work-for-hire", city: "Québec City, Canada" },
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
  { name: "Unity", type: "greenhouse", token: "unity3d" }, // deep-links via Greenhouse absolute_url (unity.com/careers/positions/<id>?gh_jid=<id>); the "dead links" flag was just Unity's scheduled careers-site maintenance (back Tue) — self-resolves, no override needed
  { name: "Team17", type: "workable", token: "team-17-digital" },
  { name: "Kinetic Games", type: "rippling", token: "kinetic-games-careers", city: "Southampton, UK" }, // Phasmophobia · Rippling ATS (promoted from Island 2026-06-17)
  // batch 8 (2026-06-17): promoted from Island — confirmed on a supported ATS.
  { name: "Guerrilla Games", type: "greenhouse", token: "guerrilla-games", city: "Amsterdam, Netherlands" }, // Horizon
  { name: "Playdead", type: "breezy", token: "playdead", city: "Copenhagen, Denmark" },
  { name: "Warhorse Studios", type: "breezy", token: "warhorsestudios", city: "Prague, Czechia" }, // Kingdom Come: Deliverance
  { name: "Fool's Theory", type: "teamtailor", token: "foolstheory", host: "careers.foolstheory.com", city: "Bielsko-Biała, Poland" }, // The Witcher Remake
  { name: "Thunderful Games", type: "teamtailor", token: "thunderfulgames", host: "career.thunderfulgames.com", city: "Gothenburg, Sweden" }, // spot-check first scrape
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
  { name: "ProbablyMonsters", type: "jobvite", token: "probablymonsters" },   // family of studios (Bellevue/Dallas); careers UI wraps a Jobvite board
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
  { name: "HoYoverse", type: "smartrecruiters", token: "HoYoverse" },              // Genshin/Star Rail — migrated greenhouse→SmartRecruiters (gh board went empty), fixed Jun 2026
  { name: "Behaviour Interactive", type: "lever", token: "bhvr" },
  { name: "Jagex", type: "workable", token: "jagex-limited" },
  { name: "Climax Studios", type: "workable", token: "climax-studios" },
  { name: "Rebellion", type: "workable", token: "rebellion" },
  { name: "Keywords Studios", type: "smartrecruiters", token: "KeywordsStudios" },
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
  { name: "Scorewarrior", type: "recruitee", token: "scorewarrior" },              // Total Battle — MMO strategy (Limassol)

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
  // ---- Promoted from the Island 2026-06-13 (big-studio dig) — already-supported ATS ----
  { name: "tinyBuild", type: "manatal", token: "tinybuild" },                       // Hello Neighbor — careers-page.com/Manatal (verified 6 roles)
  { name: "Hi-Rez Studios", type: "jazzhr", token: "hirezstudios" },               // SMITE, Paladins — JazzHR
  // CIG left Workday for a self-hosted GraphQL board (2026-06-18); see fetchCig.
  { name: "Cloud Imperium Games", type: "cig", token: "cig" }, // Star Citizen, Squadron 42
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
  { name: "Creative Assembly", type: "jobvite", token: "creative-assembly", city: "Horsham, UK" },           // Total War, Alien (SEGA) — promoted from Island 2026-06-19, Jobvite
  // ---- 2026-06-19 studio batch ----
  { name: "Torn Banner Studios", type: "bamboohr", token: "tornbanner", city: "Toronto, Canada" },          // Chivalry, No More Room in Hell 2
  { name: "Devoted Studios", type: "workable", token: "devoted-studios-1", city: "Los Angeles, CA" },        // distributed co-dev / production management
  { name: "Triband", type: "teamtailor", token: "triband", host: "careers.triband.net", city: "Copenhagen, Denmark" }, // WHAT THE GOLF? comedy games
  { name: "Next Level Games", type: "jazzhr", token: "nextlevelgames", city: "Vancouver, Canada" },          // Luigi's Mansion, Mario Strikers — Nintendo subsidiary
  { name: "Critical Path Games", type: "critpath", token: "critpath", city: "Vancouver, BC" },               // custom static careers site — fetchCritpath (requested mainland)
  { name: "Eidos-Montréal", type: "eidos", token: "eidos", city: "Montréal, QC, Canada", parentCompany: "Embracer" }, // Deus Ex, Tomb Raider — careers page is Dayforce-backed SSR (promoted from Island 2026-06-28)
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
];
function extractTech(text) {
  if (!text) return [];
  const out = [];
  for (const [tag, re] of TECH_VOCAB) if (re.test(text)) out.push(tag);
  return out;
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
  return `    <a class="role" href="${escHtml(j.url||"https://devquest.gg")}" target="_blank" rel="noopener">
      <div class="rt">${escHtml((j.title||"").split("|")[0].trim())}</div>
      <div class="rs">${escHtml(j.studio)}${loc?" · "+loc:""}</div>
      <div class="tags">${rem}${sen}${sal}${age}</div>
    </a>`;
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
  <div class="prose">
    <h2>How DevQuest keeps this list honest</h2>
    <p>Game-dev hiring is full of stale and "ghost" postings. DevQuest shows <strong>how long each role has been live</strong> and flags listings that keep getting re-posted, so you don't waste an afternoon applying into the void. We show <strong>real salary only when the studio publishes it</strong>, never an invented "competitive" range, and we link you straight to the studio's own application page. No recruiters, no ads, and we never sell your data.</p>
    <h2>Don't see your fit yet?</h2>
    <p>New ${escHtml(cfg.noun)} roles land every hour. Filter the full board by seniority, region, studio, and tech stack (search a skill like <em>C++</em> or <em>Unreal</em>), or set a free weekly email alert and let the new ones come to you.</p>
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
  const title = "Browse Game Dev Jobs by Category, Studio & Skill · DevQuest";
  const desc = `Every game-dev job category on DevQuest — by discipline, studio, game engine and skill. ${total} live roles, pulled from studio career pages and refreshed hourly. No ads.`;
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
  ${sect("By discipline", group("discipline"))}
  ${sect("Remote & by seniority", group("combo"))}
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
  // Dedupe by slug (first wins: discipline > skill > combo > studio).
  const bySlug = new Map();
  for (const s of [...discSpecs, ...skillSpecs, ...comboSpecs, ...studioSpecs]) if (!bySlug.has(s.slug)) bySlug.set(s.slug, s);
  const allSpecs = [...bySlug.values()];

  const slugs = [];
  for (const spec of allSpecs){
    try { fs.writeFileSync(path.join(dir, spec.slug + ".html"), renderLandingPage(spec, all, allSpecs)); slugs.push(spec.slug); }
    catch(e){ console.error(`landing ${spec.slug}: ${e.message}`); }
  }
  // Internal hub (/jobs) — one crawlable index that links to every category page above.
  try { fs.writeFileSync(path.join(dir, "jobs.html"), renderHubPage(allSpecs, all)); slugs.push("jobs"); }
  catch(e){ console.error(`hub: ${e.message}`); }

  // Regenerate sitemap.xml with <lastmod> (Google uses lastmod; it now ignores changefreq/priority).
  const today = new Date().toISOString().slice(0, 10);
  const urls = ["https://devquest.gg/", "https://devquest.gg/about"].concat(slugs.map(s => "https://devquest.gg/" + s));
  const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + urls.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")
    + `\n</urlset>\n`;
  fs.writeFileSync(path.join(dir, "sitemap.xml"), sm);
  console.log(`Wrote ${slugs.length} SEO pages (${studioSpecs.length} studio, ${skillSpecs.length} skill, ${comboSpecs.length} combo, +hub) + sitemap.xml`);
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
  if (/\bqa\b|quality assurance|\btester\b|\bsdet\b|test (engineer|analyst|lead|automation|specialist)|quality (engineer|analyst|specialist)|assurance qualit/.test(t)) return "QA";
  if (/art director|\bartist\b|\bartiste\b|direct(eur|rice|ion) artistique|\bart lead\b|lead artist|concept art|\bvfx\b|lighting (artist|lead)|environment artist|character artist|technical artist|technical art\b|(character|environment|prop|vehicle|weapon|texture) (artist|art|outsourc)/.test(t)) return "Art";
  // Bare "art" as the role word: "AI Art Specialist", "Art Specialist/Lead/Manager/Outsourcing",
  // etc. The main Art rule keys on "artist"/specific combos and missed these. Word boundaries guard
  // out "smart", "part", "chart", "start", "state of the art".
  if (/\bai art\b|\bart (specialist|generalist|lead|director|manager|outsourc\w*|coordinator|supervisor|associate|intern|internship|trainee|apprentice)\b/.test(t)) return "Art";
  // Generative 3D-content roles (avatar / scene / model / character generation) read as Art, not the
  // Business & Ops catch-all, e.g. "3D Model, Scene, and Avatar Generation Algorithm Research Intern".
  // Guarded so "...generation engineer / pipeline / platform" roles stay Engineering.
  if (/\b(avatar|scene|character|texture|environment|3d (model|asset))s?\b[^.]*\bgenerati(on|ve)\b/.test(t)
      && !/\b(engineer|programmer|developer|pipeline|backend|infrastructure|sdk|platform)\b/.test(t)) return "Art";
  // "Generalist" in games almost always means a 3D/art generalist (e.g. "3D Unreal Generalist") —
  // EXCEPT corporate generalists (HR/People/Talent/etc.), which we guard out so they don't become Art.
  if (/\bgeneralist\b/.test(t) && !/\b(hr|human resources|people|talent|recruit|payroll|benefits|office|business|marketing|finance|legal|it|sales|community|player support)\b/.test(t)) return "Art";
  if (/\banimator\b|animation (director|lead|manager|supervisor)|\brigging\b|cinematics? (director|lead|supervisor|manager|animator|designer|editor|artist|coordinator)|\bcinematic editor\b|\bmocap\b|motion[ -]?capture/.test(t)) return "Animation";
  if (/game design|level design|systems? design|narrative design|\bwriter\b|\bscénariste\b|encounter design|combat design|content design|economy design|quality design|gameplay design|ux design|ui design|concepteur|conceptrice|conception de jeu|world build|world design|environment design|game (direct(or|ion)|lead)|creative direct(or|ion)|directeur (créatif|creatif)|directrice (créative|creative)/.test(t)) return "Design";
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
  if (/\bdevelopment (director|manager|lead)\b/.test(t) && !/business|learning|talent|\bl&d\b|\bpeople\b|organi[sz]ation/.test(t)) return "Production";
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
  if (/\bprogram manager\b/.test(t) && !/developer|marketing|\bbrand\b|communit|trust|compliance/.test(t)) return "Production"; // technical/dev program management (not DevRel/marketing/T&S/compliance PMs)
  if (/artist|concept|\bvfx\b|lighting|illustrat|sculpt/.test(t)) return "Art";
  if (/animator|animation|rigging/.test(t)) return "Animation";
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
  if (/market|\bbrand\b|public relations|\bpr\b|social media|communit|influencer|communication/.test(t)) return "Marketing";
  // Final fallback: a recognized department was already mapped above, so anything left is unknown.
  // Return the canonical catch-all — never the raw ATS string (that leaked junk like a studio or
  // status label into the discipline field, e.g. "Ubisoft" / "Currently Hiring").
  return "Other";
}

function inferSeniority(title) {
  const t = title.toLowerCase();
  // An assistant TO a leader (e.g. "Executive Assistant – General Manager") is not the leader.
  const assistant = /\bassistant\b/.test(t);
  if (!assistant && /\b(director|head of|vp|chief|executive producer|general manager|studio head)\b/.test(t)) return "Director+";
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
  if (lo == null || hi == null) {
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
  const f = n => "$" + Math.round(n / 1000) + "K";
  return f(lo) + "–" + f(hi);
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
      tech: extractTech(j.title + " " + desc),
      studio: isStudioDept ? dept : studio.name,
      discipline: mapDiscipline(craft, j.title),
      workType: inferWorkType(j.title, location, j.metadata, desc.slice(0, 1200)),
      location,
      region: inferRegion(location),
      seniority: inferSeniority(j.title),
      salary: extractSalary(desc),
      yoe: extractYoe(desc),
      postedAt: j.first_published || j.updated_at,
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
      const f = n => "$" + Math.round(n / 1000) + "K";
      salary = f(j.salaryRange.min) + "–" + f(j.salaryRange.max);
    } else salary = extractSalary(desc);
    return {
      id: `lever-${studio.token}-${j.id}`,
      title: j.text,
      tech: extractTech(j.text + " " + desc),
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
      tech: extractTech((j.title || "") + " " + stripHtml(j.description || j.descriptionTeaser || "")),
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
      tech: extractTech((j.name || "") + " " + stripHtml(j.job_description || "")),
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
    const data = await fetchJson(`https://${studio.token}.pinpointhq.com/postings.json`);
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
  const re = /<a\b[^>]*href="(?:https:\/\/techland\.net)?\/job-offers\/([a-z0-9][a-z0-9-]*)"[^>]*>([\s\S]*?)<\/a>/gi;
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
    const res = await fetch("https://cloudimperiumgames.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": "https://cloudimperiumgames.com",
        "Referer": "https://cloudimperiumgames.com/jobs",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      body: JSON.stringify({ operationName: "GetJobs", query: CIG_QUERY, variables: { where: {}, limit: 200, sort: "title" } }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    const chunks = String(html).split(/class="RecruitList-item/).slice(1);
    if (!chunks.length) break;
    let added = 0;
    for (const c of chunks){
      const href = (c.match(/href="([^"]*recruit-detail[^"]*)"/i) || [])[1];
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

const FETCHERS = { greenhouse: fetchGreenhouse, lever: fetchLever, workday: fetchWorkday, avature: fetchAvature, smartrecruiters: fetchSmartRecruiters, workable: fetchWorkable, phenom: fetchPhenom, teamtailor: fetchTeamtailor, eightfold: fetchEightfold, amazonjobs: fetchAmazonJobs, ashby: fetchAshby, zenimax: fetchZenimax, bamboohr: fetchBambooHr, jobscore: fetchJobScore, jazzhr: fetchJazzHr, jobvite: fetchJobvite, recruitee: fetchRecruitee, personio: fetchPersonio, rippling: fetchRippling, breezy: fetchBreezy, manatal: fetchManatal, sumodigital: fetchSumoDigital, pinpoint: fetchPinpoint, playground: fetchPlayground, obsidian: fetchObsidian, techland: fetchTechland, oracle: fetchOracle, cig: fetchCig, critpath: fetchCritpath, krafton: fetchKrafton, eidos: fetchEidos };

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
const SALARY_CACHE_VERSION = 3;   // bump to re-check previously-empty results after parser/fetcher upgrades (v3: single-value salaries)

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

async function fetchText(url, ms = 15000, ua) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: {
        // Default to a real-browser UA. Pass `ua` to override — e.g. a crawler UA for sites that
        // serve an age-gate (no content) to browsers but full content to search crawlers.
        "User-Agent": ua || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
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
    out.studios[name] = {
      now: cur[name],
      d7: d7 ? (d7.counts[name] ?? null) : null,
      d30: d30 ? (d30.counts[name] ?? null) : null,
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
  // Drop clearly non-game-industry roles that some studios post on the same board — facility /
  // welfare / manual-service jobs (e.g. campus massage therapist, car care, cafeteria, janitor).
  // Title-based and deliberately conservative: matched ONLY on the role title (never the hiring
  // program), and tuned so it catches zero real game / business / IT roles (validated against live
  // data). NOTE: "chef" is intentionally EXCLUDED — it means "lead/head" in French ("Chef d'équipe")
  // at our many Québécois studios, so blocking it would wrongly drop real lead roles.
  // ("culinary" and bare "landscap" are deliberately omitted — they'd catch real roles like a
  // cooking-game "Culinary Designer" or a "Landscape Artist"; we use "landscaping" for grounds work.)
  const NON_GAME_TITLE = /\bmassage\b|masseu|car care|car wash|\bvalet\b|\bbarista\b|cafeteria|kitchen (porter|staff|assistant|hand|aide)|security guard|security officer|\bjanitor\b|custodian|housekeep|cleaning (staff|crew|attendant|service)|\bcleaner\b|\bgardener\b|landscaping|groundskeep|shuttle driver|delivery driver|\bchauffeur\b|\bnurse\b|\bcaregiver\b|physical therapist|occupational therapist|facilit(?:y|ies) (?:assistant|attendant|helper|worker|staff|aide)/i;
  let droppedNonGame = 0;
  for (let i = all.length - 1; i >= 0; i--) { if (NON_GAME_TITLE.test(all[i].title || "")) { all.splice(i, 1); droppedNonGame++; } }
  if (droppedNonGame) console.log(`Filtered out ${droppedNonGame} non-game facility/service role(s).`);
  // Junk titles: some feeds emit a button/placeholder label instead of a real title (e.g. "Apply
  // Here", "View job", an empty string). Drop anything whose WHOLE title is a generic CTA/placeholder.
  const JUNK_TITLE = /^(apply( (here|now|today|online|link))?|view (job|details|role|opening|posting)|learn more|click here|see (more|all|details|jobs?)|read more|submit( (application|cv|resume))?|join (us|our team)|open (roles|positions)|explore (roles|opportunities)|details|more info|n\/?a|tbd|untitled|.*\bscams?\b.*)\.?$/i;
  let droppedJunk = 0;
  for (let i = all.length - 1; i >= 0; i--) { const tt = (all[i].title || "").trim(); if (!tt || JUNK_TITLE.test(tt)) { all.splice(i, 1); droppedJunk++; } }
  if (droppedJunk) console.log(`Filtered out ${droppedJunk} junk/placeholder-title role(s).`);
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
  fs.writeFileSync(path.join(dir, "jobs.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(dir, "jobs.js"), "window.JOBS_DATA = " + JSON.stringify(out) + ";");
  console.log(`\nWrote ${all.length} jobs -> jobs.json + jobs.js`);
  writeLandingPages(all, dir); // SEO category pages + sitemap.xml, regenerated from the live data
})();
