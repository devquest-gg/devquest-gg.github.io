# DevQuest (devquest.gg) — Launch Notes

A running list of things to resolve before this site goes live. Updated as we build.

## 🚫 Launch blockers (must fix before going public)

- ~~**Blizzard Entertainment**~~ ✅ RESOLVED. Their public careers site runs on **Phenom
  People** (not the Workday backend, which bounces external requests). Built a Phenom
  fetcher (7th platform) that extracts job data embedded in each search-results page.
  Blizzard (86 jobs) + Activision (69 jobs) both added via Phenom.

- **Remaining big-publisher sources** to chase next:
  - **Turn 10, Mojang, Ninja Theory & other FIRST-PARTY Xbox studios** → INVESTIGATED, can't do
    cleanly (June 2026). They post on Microsoft's general careers portal
    (apply.careers.microsoft.com, Eightfold "pcsx" API). Findings:
    • There is NO studio field on jobs and NO gaming/studio facet — impossible to tell a
      Turn 10 job from a Mojang job from the data.
    • The portal is ALL of Microsoft, not gaming (top results: Azure Engineer, Data Center Ops,
      Logistics Technician). Keyword search is fuzzy ("Mojang" returned a marketing director).
    • Conclusion: adding it would dump ~1,400 non-gaming Microsoft jobs mislabeled "Xbox". NOT
      worth it. Revisit only if Microsoft exposes a studio/gaming filter.
    • Also checked turn10studios.com/careers directly (June 2026): it's a marketing page that
      lists ~2 hand-picked roles as static text, and its "apply" links just run a Microsoft
      careers keyword search for "turn 10" — which returns ~40 mostly-Azure/cloud jobs, not Turn
      10 roles. So even the studio's own site has no clean job feed. Dead end confirmed.
    • The acquired publishers ARE done: Activision + Blizzard via Phenom (careers.activision.com /
      careers.blizzard.com). Those apply-links point into the xboxgaming.wd1 Workday tenant.
  - **Bethesda / ZeniMax** → jobs.zenimax.com is a custom careers site (no standard ATS detected);
    would need a bespoke fetcher. Possible future win but not a quick add.
  - **Nintendo** → careers.nintendo.com (check platform).
  - **Take-Two labels / Square Enix / Sega** → mixed (some Phenom, some Workday).

## 📋 Studios requested but not yet added (need new fetchers or have no API)

- ~~**Team17** → Workable~~ ✅ DONE. Built a Workable fetcher (5th platform). Team17 added
  (subdomain "team-17-digital"). Adding more Workable studios is now one config line each.
- **Nexon** → uses **JobScore** (careers.jobscore.com/careers/nexonamericainc). Needs a
  JobScore fetcher. NOTE: the Greenhouse board "nex" is a DIFFERENT company (Nex Inc.), not Nexon.
- **Turn 10 Studios** & **Mojang** → Microsoft / Xbox Game Studios. No public job API (same
  launch-blocker tier as Blizzard/Workday-protected boards). Revisit with big-publisher batch.
- **Activision** → Workday under the SAME tenant as Blizzard (activision.wd1) — currently
  blocked (HTTP 422). Fixing Blizzard's Workday request should unlock Activision too.
- **Twitch** → part of Amazon; jobs live on amazon.jobs (no clean per-team public API).
  Hard / low priority.
- **Rovio** (Sega-owned) → ATS not confirmed from research; possibly Teamtailor (would need a
  new fetcher) or SmartRecruiters. Needs the careers page checked in a browser to confirm.
- **Amber** (Amber Studio) → Workable accounts "amber"/"amberstudio" are empty; real ATS
  unconfirmed. Needs careers-page check.
- **iam8bit** → no standard ATS found on their careers page; likely too small / custom. Skip
  unless they move to a known platform.
- **Ninja Theory** → Xbox Game Studios = Microsoft Workday (xboxgaming.wd1). Same tier as
  Turn 10/Mojang; revisit with the Xbox Workday batch.
- **Aspyr Media** (Embracer) → ATS not confirmed from research; check careers page in browser.
- **Techland** → Lever "techland" empty; real ATS unconfirmed (possibly own/eRecruiter). Check.
- **Starchild** → couldn't identify the studio/ATS; need a careers URL to proceed.
- **Beef Noodle Studios, TigerRoll Studios, AddClear** → couldn't identify a studio/careers
  page from research; need a URL to add (either as a scraped studio or a directory link).
- **Eidos-Montréal** → uses **Dayforce HCM** (jobs.dayforcehcm.com/en-CA/eic/CANDIDATEPORTAL,
  API: POST /api/geo/eic/jobposting/search). INVESTIGATED deeply (June 2026): the API returns
  HTTP 403 to any request that isn't the page's own — it's token/bot-protected. A scraper would
  need to harvest a per-session token and would likely be blocked from a cloud server anyway.
  Not a clean feed → stays on the directory. (Jobvite lead was stale; it's Dayforce now.)
- **Frontier** → uses Lever, but their PUBLIC Lever feed is disabled ("Document not found").
  Jobs only exist inside a ~14MB custom Nuxt site. One-off, not worth a bespoke scraper → directory.
- **Bandai Namco America** → custom Angular site on a private GraphQL CMS (api.bnea.io/hygraph).
  No standard ATS. One-off → directory.
- TAKEAWAY: the directory ("island") is the correct, sustainable home for studios on bespoke or
  deliberately-locked-down career systems. Chasing each yields fragile scrapers that break and
  may not run from a host. Shrink the island by building fetchers only for platforms that are
  (a) clean/public and (b) used by MANY studios — not for one-off custom sites.

Building a **Workable** fetcher would unlock Team17 and many other indie studios at once —
good candidate for the next "new platform" task.

## 🏝️ Directory ("misfit island")

For studios we can't scrape per-job (no clean ATS feed), we list them as cards that link
straight to their own careers page — honest, and still useful for discovery. Managed via the
`DIRECTORY` array in scrape.js (one line per studio: name, url, note); rendered as a "Browse
these studios directly" section at the bottom of the List view. Currently: Turn 10, Ninja
Theory, Bethesda/ZeniMax, Aspyr. Add more (Mojang, Techland, iam8bit, Starchild) once we
confirm their careers URLs resolve.

## ✅ ZeniMax / Bethesda — SCRAPED (June 7 2026)

~~Future bespoke fetcher.~~ DONE. The earlier "obfuscated custom Vue app" finding was STALE —
jobs.zenimax.com/jobs now embeds its full posting list as an HTML-entity-encoded JSON array
right in the page. The `zenimax` fetcher decodes the entities, bracket-matches the array, and
JSON.parses it. Each posting names its real studio in `location.name` (Bethesda Game Studios,
Bethesda Game Studios - Montreal, MachineGames, Arkane Studios - France, ZeniMax Media → "(HQ)"),
so jobs split into proper studios under the "ZeniMax / Bethesda" umbrella. The apply links are
iCIMS (careers-zenimax.icims.com), so salary backfill reads them via the generic path. ~32 jobs.
LESSON: island "dead end" notes have dates and go stale — sites change. Re-audit periodically.
(Valve = still custom; see the re-audit section below.)

## 🌍 Top-40 coverage push (June 2026)

Chased the scrapeable misses + islanded the rest:
- SCRAPED (new): Krafton (Greenhouse kraftonamericas — covers PUBG/Striking Distance/Unknown
  Worlds), Gearbox (Greenhouse gearbox), King (Phenom, careers.king.com /us/search-results).
- DIRECTORY (new, verified URLs): Nintendo, Sega, Supercell, HoYoverse, Remedy, Nexon (JobScore).
- STILL MISSING — couldn't verify a clean careers URL; add later if found: Square Enix
  (SmartRecruiters slug "SquareEnix" invalid), Capcom, Konami, NCSoft, FromSoftware (Japanese,
  custom), NetEase, Tencent (holding cos — no single dev careers page worth linking).
- Asian giants are the structural gap (custom/region-locked sites) — same wall GrackleHQ hits.

Batch 2 (June 2026):
- SCRAPED (new): ArenaNet (Greenhouse arenanet).
- DIRECTORY (new, verified): IO Interactive (apply.ioi.dk), Jagex, Warner Bros. Games
  (careers.wbd.com/games — Workday/Phenom, all-WBD so not studio-isolatable), Wizards of the
  Coast (Hasbro), Virtuos (Oracle HCM), Certain Affinity, Climax Studios.
- SKIPPED: Skydance — merged into "Paramount Games Studio" (per June 2026 news); careers URL in
  flux. Add once confirmed.

## ✅ Teamtailor fetcher — BUILT (platform #8)

Scrapes Teamtailor career pages (server-rendered /jobs, paginated ?page=N). Handles 2 different
Teamtailor themes: one exposes title via a title="" attr + dept/location spans (Arrowhead);
the minimal theme has title as plain anchor text + no location on the listing (Paradox →
location shows "Unlisted"). Paradox Interactive + Arrowhead Game Studios promoted from directory
to LIVE. Adding more Teamtailor studios = one config line { type:"teamtailor", host:"..." }.
No posted dates on Teamtailor listings (shows "date n/a"). Tested vs both real sites.
(Note: Avalanche Software = WB; Avalanche Studios = independent Just Cause one, scraped via Lever.)

## 🎬 Netflix Games — Eightfold fetcher with department allow-list (platform #9)

The "capture only gaming jobs from a giant company" pattern. Netflix runs on Eightfold
(explore.jobs.netflix.net, API: /api/apply/v2/jobs?domain=netflix.com&query=&start=N&num=10).
546 total Netflix jobs; we paginate ALL of them and keep ONLY those whose `department` is in
an allow-list: ["Games","Netflix Games Studio","Next Games","MoonLoot Games"] → ~23 real game
jobs, zero false positives. Deliberately EXCLUDED "Inkubator" (it's an animation incubator,
not games) and fuzzy keyword matching (caught finance roles like "Ads and Games FP&A").
COST: ~55 requests/run (page size capped at 10) to find 23 jobs — fine daily, heavier hourly.
This same fetcher+allow-list approach is reusable for other Eightfold giants (note: Microsoft's
Eightfold has NO usable gaming department field, so it stays unscrapeable).
No posted dates (Eightfold timestamps unreliable → "date n/a").

## 🏢 Big-tech giants — gaming-only capture (decisions)

Pattern: only works when the giant exposes a clean gaming signal.
- ✅ **Netflix** — Eightfold `department` field → allow-list (done).
- ✅ **Amazon Games** — keyword search + `team.label` allow-list (team-games, team-luna).
  Platform #10 (amazonjobs fetcher). ~15 jobs (Amazon Games Studio, Luna, Amazon MGM Games).
  Amazon gives real posted dates. Promoted from directory → LIVE.
- ❌ **Meta** — games = Oculus Studios buried in the huge Reality Labs org (mostly hardware/AI);
  no Games-only field to filter on → Microsoft-tier. Skipped.
- ❌ **Disney** — largely exited internal game dev (licenses IP, invested in Epic, closed studios);
  no clean gaming feed + minimal first-party hiring. Skipped.
- ❌ **Microsoft first-party** (Turn 10/Mojang/Ninja Theory) — no gaming dept field (earlier finding).

## 🏷️ Discipline classification overhaul (June 2026)

"Business & Ops" had become a 42% catch-all. Audited the real data and expanded
mapDiscipline's title-keyword fallback (scrape.js) to recognize: data/analytics, marketing/
PR/comms/community, product management, UX/UI, esports, player support. Result (simulated on
live data): B&O 42% → 27%; ~216 jobs moved to accurate disciplines (Marketing & Comms +63,
Production +60, Data & Analytics +42, Engineering +25, Design +13, etc.). What remains in B&O is
genuinely ops (finance, legal, sales, IT, facilities, HR/talent, admin).
JUDGMENT CALL: "Product Manager/Owner" → Production (per Destin). Easy to flip to its own
"Product" discipline or to Business & Ops if preferred. Avoided mapping bare "analyst" to Data
(would mis-catch financial/business analysts). Takes effect on next scrape run.

## ⚠️ Things to watch / decide later

- **EA (Avature) is the fragile one.** It's HTML-scraped, and jobs.ea.com intermittently
  serves our scraper 0 jobs (bot check / rate-limit on non-browser clients). Hardened it
  with a browser User-Agent + per-page retry + it now THROWS on 0 jobs so the data-health
  panel flags it instead of EA silently vanishing. If EA keeps failing after this, it likely
  needs heavier handling (or runs better from a residential IP than a cloud server — relevant
  for hosting). EA's site itself is fine (400 jobs incl. Maxis); the parser works.

- **Cloud hosting & datacenter IPs** — some sites (EA's Avature, Workday boards) may
  block requests coming from cloud servers even when they work from a home computer.
  We'll find out when we move the hourly scraper off this PC and into the cloud.

- **EA postings have no dates** — the site honestly shows "date n/a" for these. Fine for
  now; revisit if EA exposes dates later.

- **Salary data is partial** — pulled from job descriptions where studios publish it
  (mostly US roles, where disclosure is often required). Coverage grows with more studios.

## 💰 Hosting & running costs (researched June 2026)

The site is static files (index.html + jobs.js), which makes it extremely cheap to run.

- **Hosting (Cloudflare Pages):** $0. Static files have NO bandwidth limits or overage
  fees, even on the free tier — works the same at 10 visitors or 500,000.
- **Scraping:** $0. We call studios' free public job APIs (no per-request charge), and the
  hourly scraper runs on GitHub Actions (free on public repos; ~720 min/mo on private, well
  within the free quota). Each run takes ~1 minute.
- **Domain name:** ~$10–15/year (~$1/mo) — the only guaranteed expense.

Cost by size: launch ~$1/mo · 100k views/mo ~$1/mo · 500k+ views/mo ~$1–26/mo
(optional Cloudflare Pro $20–25 only if we want built-in analytics / fair-use buffer).

**Where money appears later (all post-launch, feature-driven, not traffic-driven):**
- **SMS alerts:** ~1–2¢ per text + one-time US carrier registration + small monthly number
  rental. ~1,000 subscribers × 30 texts/mo ≈ $300–600/mo — but that's what the $4.99
  subscription covers (1,000 subs ≈ $5,000/mo revenue). Needs a small backend + database
  ($0–20/mo) to store subscriptions.
- **Scale pressure point** is the studios' servers (rate-limiting/blocking), not our bill —
  handled with polite intervals + caching, which we've already designed for.

Bottom line: we can launch and grow to serious traffic for the price of a domain name.

## 🥊 Competitive landscape (researched June 2026)

Competitors exist, but none combine comprehensive scraping + good UX + a candidate-pays model.
Three camps:

**Aggregators (our closest competition):**
- **GrackleHQ** (gracklehq.com) — the one to study. Scrapes studio career pages exactly like
  us, 4,000+ listings, no ads, email alerts. BUT explicitly a free passion project, not a
  business — so weak on UX, salary data, premium features.
- **GameJobs.co** — similar at scale (5,000+ jobs), generic feel, monetizes EMPLOYERS (~$299/post).

**Curated marketplaces (employer-submitted, not scraped — so less complete):**
- **Hitmarker** (hitmarker.net) — "world's largest" gaming/esports board, ~4,900 listings,
  studios pay ~$99 to post. Polished and profitable.
- **Work With Indies** — owns the indie niche (~$49/post).
- **GamesJobsDirect** — has salary filter + CV alerts (close to our roadmap), UK/US/CA/AU.

**Niche/newer:** 8BitPlay (email alerts, artist-focused), GameDevTalents (candidates list
themselves for studios to find).

**Our differentiators none of them have:** SMS alerts (zero game boards offer texts — all
email), map view, honest data ("Unknown" not guessed), built-in application tracking.

**⚠ Strategic warning / open question:** the best aggregator (GrackleHQ) chose NOT to be a
business and stays free; the profitable players all charge EMPLOYERS, not job-seekers. Our
$4.99 candidate-pays model must answer: will cash-strapped, out-of-work devs pay for speed
when a free decent option exists? Plausible but untested. Possible hedge: free email tier +
paid SMS, and/or also charge employers.

## 🏷️ Studio attribution (how sub-studios are named)

- **EA & Sony**: their job data includes a real studio field, so we split them automatically —
  Maxis, DICE, BioWare, Motive, Criterion, Respawn, EA Sports / Naughty Dog, Santa Monica,
  San Diego all appear as their own studios. Corporate roles roll up to "(HQ)".
- **Ubisoft**: every job is tagged just "Ubisoft" in the data, so we attribute named studios by
  LOCATION using a curated, low-risk city map (Malmö→Massive Entertainment, Cary→Red Storm,
  Newcastle→Reflections, Annecy/Montpellier/Bordeaux/Montreal/Quebec/Toronto/Bucharest/Sofia/
  Belgrade/Milan/Barcelona/Da Nang/Osaka/Pune/Singapore/Kyiv→Ubisoft <City>). Paris/Saint-Mandé
  stay "Ubisoft" (HQ + studio share the city). Easy to extend: add a city to the `subStudios`
  map in scrape.js. The generic `subStudioName()` helper can do the same for any future
  publisher that lacks a studio field.
- **Parent-company tag**: every job carries a `parent` (its publisher umbrella). The studio
  filter shows an extra "<Publisher> — all studios" entry (e.g. "Ubisoft — all studios") for
  any publisher spanning >1 studio, so selecting it catches all sub-studios at once. Picking a
  specific sub-studio (e.g. Massive Entertainment) still narrows to just that one.
- NOTE: Red Storm Entertainment removed (studio closed) — its former Cary, NC roles now show
  as "Ubisoft".

## 🐦 GrackleHQ — competitor coverage reference (analyzed June 2026)

GrackleHQ (gracklehq.com/jobs) is the closest comparable aggregator: ~2,690 jobs, ~150
companies, free/non-profit, running since 2019.

**How they cover the hard studios** (from their FAQ + observed data):
- A **bespoke scraper per company careers page**, checked **DAILY** (not hourly).
- Links out via redirect (gracklehq.com/rd/<id>) — same "link to source" model as us.
- Human-in-the-loop: companies submit careers URLs; users report missing jobs; breakage fixed
  manually. ~6 years of accumulated per-site scrapers.

**The tell — job counts reveal the two tiers (same as ours):**
- Big counts = API-scrapeable (we already do these): Sony 187, Roblox 184, Unity 176,
  Ubisoft 170, Riot 164, Epic 148, 2K 115, Blizzard 88.
- Tiny counts = hand-built per-site scrapers: Eidos Montreal 3 (matches the Dayforce count
  we found), Frontier 14, Bandai Namco 7, Ninja Theory 1, Starchild 2, Beef Noodle 1,
  AddClear 1, TigerRoll 1.
- Even GrackleHQ is thin on Microsoft first-party: Turn 10 not listed, Ninja Theory 1,
  "Xbox Game Studios" only 5 — confirms the no-studio-field wall is real.

**Studios GrackleHQ scrapes that we DON'T yet (real future coverage targets, all scrapeable
with effort):** Amber (126!), Techland (57), Bethesda Game Studios (68), PUBG Corp (48),
Zenimax Online (23), Valve (22), Avalanche Studios (18), Rebellion (18), Outfit7 (18),
FunPlus (14), Take-Two (13), Nexon (11), plus many indies.

**Strategic takeaway:** matching GrackleHQ on raw coverage = an ongoing labor commitment
(steady stream of bespoke scrapers + daily monitoring). Don't try to out-scrape a 6-year head
start. Win instead on what they deliberately skip: polished UX, map, stats, application
tracking, salary surfacing, and SMS alerts.

## ✅ Working well

- ~25 studios across 5 platform types (Greenhouse, Lever, Workday, Avature, SmartRecruiters)
- List / Map / Stats views, job tracking, dismiss, filtering, dedupe
- Data health panel that flags broken sources automatically (it caught Blizzard immediately)

## 📰 Planned feature: industry news section

Idea: a News tab covering new studios, closures, layoffs, and fundings — high-value
"survival intel" for job seekers (layoffs flood the market; new studios = future jobs).
Example that prompted this: Paramount Games Studio formed June 5 2026 (merged Skydance
Interactive + New Media; owns Mortal Kombat/Batman IP).

**Key constraint:** news is NOT a clean API like jobs, and republishing article text is a
legal/ethical no-go. Use the same pattern as jobs — headline + source + link out, never
full text. Sourcing options, easiest first:
1. **RSS feeds (recommended):** GamesIndustry.biz, Game Developer, etc. publish free RSS.
   Scraper pulls headlines hourly, filters for layoff/closure/opens/funding keywords.
2. News API (NewsAPI, GDELT) — broader but noisier, some licensing/cost.
3. Manual curation — best quality, doesn't scale; fine for launch.

**Unique differentiator (do this):** our scraper already SEES layoffs/expansion in the data.
Auto-generate signals from our own job counts — "📉 Studio X openings down 40% this month",
"🆕 New studio tracked: Paramount Games", "⚠ Studio Y's board went dark". No journalism
needed, uniquely ours, and pairs with the job-history/trends feature. Needs the cloud
scraper running first (so we keep historical snapshots).

## 🔜 Possible next steps

- Set up free hosting + hourly auto-scrape (GitHub — to walk through together)
- SMS alert system (the original premium feature — needs a backend)
- More studios
- Job history / trends over time (needs the cloud scraper running first)

## 🏝️→🌍 Full Island re-audit (June 7 2026)

Prompted by ZeniMax turning out to be scrapeable after all, we re-tested EVERY remaining
directory studio's careers system from scratch (web_fetch + search + browser render). Many old
"can't scrape" notes were stale. Results sorted into three buckets.

### A. MAINLAND-READY — already on an ATS we support (one-line / near one-line add)

| Studio | ATS | Account/token | Notes |
|---|---|---|---|
| Nintendo | Greenhouse | `nintendo` | ~55 roles incl. Retro Studios, NST |
| Mojang Studios | Greenhouse | `mojangab` | low count now (Stockholm) |
| Bandai Namco | Greenhouse | `bandainamco` | ~7 jobs (was thought custom GraphQL — stale) |
| Firaxis Games | Greenhouse | `firaxis` | 2K studio |
| That's No Moon | Greenhouse | `thatsnomoonentertainment` | |
| NCSOFT (NC America) | Greenhouse | `ncamerica` | |
| HoYoverse | Greenhouse | `hoyoverse` | feed valid but 0 open now |
| Frontier Developments | Lever (EU) | `frontier` via api.eu.lever.co | needs EU-host support in Lever fetcher (public feed is back) |
| Behaviour Interactive | Lever | `bhvr` | Dead by Daylight |
| Sega | Workday | `sega.wd3.myworkdayjobs.com/SEGA_Careers` | |
| Cloud Imperium Games | Workday | `cloudimperiumgames.wd1 / CIG_Global_Careers` | |
| Jagex | Workable | `jagex-limited` | ~13 jobs |
| Climax Studios | Workable | `climax-studios` | ~25 jobs |
| Rebellion | Workable | `rebellion` | ~50 jobs |
| Keywords Studios | SmartRecruiters | `KeywordsStudios` | verify API call sends proper headers |
| IO Interactive | Teamtailor | `apply.ioi.dk` | |
| OtherSide Entertainment | Teamtailor | `careers.otherside-e.com` | 0 open now |
| Warner Bros. Games | Phenom | `careers.wbd.com` (Games filter) | all-WBD; filter to games |
| Wizards of the Coast | Eightfold | `careers.hasbro.com` (dept=WIZARDS) | Invoke roles sit on SuccessFactors — partial |
| Aspyr Media | Greenhouse | token TBD | confirmed via `gh_jid`; real board token must be pulled from the page embed (not "aspyr"/"aspyrmedia") |

### B. FEASIBLE — clean public feed, but a platform we don't support yet (build one fetcher)

Grouped by platform (build the platform once, it unlocks all studios on it):
- **Jobvite** → Capcom (`capcomusa`), Creative Assembly (Jobvite-sourced; some apply links may go to a SEGA Workday tenant — confirm). One fetcher, 2 studios.
- **JobScore** → Nexon (`nexonamericainc`; has an atom feed at hire.jobscore.com/jobs/nexonamericainc/feed.atom).
- **JazzHR** → Certain Affinity (`certainaffinityinc.applytojob.com`).
- **BambooHR** → Studio Wildcard (`studiowildcard.bamboohr.com`).
- **Custom embedded-HTML one-offs** (each its own small bespoke parser, ZeniMax-style): Valve, Playground Games (own Fable site, NOT the Xbox portal), Supermassive Games (Orchard CMS), Hello Games (Umbraco).

### C. GENUINELY BLOCKED — keep as directory link-outs

- **Microsoft / Xbox first-party portal, no studio field** (the one real structural wall):
  Turn 10 Studios, The Coalition, Undead Labs. Jobs live on apply.careers.microsoft.com with no
  way to isolate the studio. (Playground Games is Microsoft-owned but serves its own readable
  site, so it's in bucket B, not here.)
- **Ninja Theory** — no ATS at all; applications go to jobs@ninjatheory.com.
- **Eidos-Montréal** — Dayforce (jobs.dayforcehcm.com), bot/token-protected (403). The
  eidosmontreal.com/careers landing page does render a few current roles as a possible fallback.
- **Saber Interactive** — static stub page, 0 jobs, no ATS. Recheck when hiring resumes.
- **Telltale Games** — static stub, 0 jobs; old Breezy HR board retired. Recheck when hiring.

### D. Recheck later (couldn't confirm a feed; 0 open roles or SPA)
- **Remedy Entertainment** — Webflow site, 0 current openings, no detectable ATS embed. Recheck when hiring.
- **Virtuos** — Oracle Fusion Recruiting (ORC) SPA; a direct REST probe returned empty. Possible
  if the public recruitingCEJobRequisitions endpoint can be coaxed; needs a deeper look.
- **Fuse Games** — 0 openings, no ATS signature. Recheck when hiring.

### Takeaway
The island was mostly stale, not impossible: ~20 studios are immediate mainland adds, ~9 more are
feasible with a small number of new platform fetchers (Jobvite first — best ROI), and only ~7 are
genuinely blocked (3 of them the Microsoft first-party cluster). "Dead end" notes should always be
re-tested before being trusted.

## 📦 Re-audit deployment log (June 7 2026)

What actually shipped from the island re-audit (all live on the next hourly scrape):

- **ZeniMax / Bethesda** — new `zenimax` fetcher (iCIMS embedded JSON), studio-split.
- **Batch 1 (16 studios)** on existing ATS fetchers: Nintendo, Mojang, Bandai Namco, Firaxis,
  That's No Moon, NCSOFT, HoYoverse (Greenhouse); Behaviour Interactive (Lever); Jagex, Climax,
  Rebellion (Workable); Keywords Studios (SmartRecruiters); IO Interactive, OtherSide (Teamtailor);
  Sega, Cloud Imperium (Workday).
- **Wizards of the Coast** — Eightfold `pcsx` variant + `departments:["WIZARDS"]` games filter.
- **Warner Bros. Games** — Phenom + `categories:["Game Development"]` games filter (drops ~415
  non-game WBD roles; keeps Rocksteady, NetherRealm, Avalanche, TT Games, WB Games Montreal).
- **Niche platforms (4 new fetchers)**: Studio Wildcard (BambooHR JSON), Nexon (JobScore atom feed,
  incl. salary), Certain Affinity (JazzHR HTML), Capcom (Jobvite HTML).

New reusable fetcher types added this pass: `zenimax`, `bamboohr`, `jobscore`, `jazzhr`, `jobvite`,
plus an Eightfold `pcsx` mode and a Phenom category allow-list.

STILL on the directory (genuinely blocked or deferred):
- Microsoft first-party (Turn 10, The Coalition, Undead Labs), Ninja Theory, Eidos-Montréal (Dayforce).
- Bespoke client-rendered sites not yet built: Creative Assembly (Next.js, no clean feed found),
  Valve, Playground Games, Supermassive, Hello Games.
- Deferred quick wins: Frontier (Lever EU-host tweak), Aspyr (Greenhouse board token to extract).
- Recheck-when-hiring (0 roles / no ATS now): Remedy, Virtuos, Fuse Games, Saber, Telltale.
