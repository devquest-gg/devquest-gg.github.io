# DevQuest.gg — Owner's Handbook

A plain-language guide to your game-jobs site. You do **not** need to understand the code.
This explains what everything is, what you'd ever touch, and how to take it live.

If you only remember one thing: **there are two programs.** A *website* people look at,
and a *collector* that goes out and gathers the jobs. Everything below is just detail on
those two.

---

## 1. What DevQuest is, in one paragraph

DevQuest is a website that gathers game-industry job openings from studios' own careers
pages and puts them in one place, with good filtering, honest data, a map, stats, and a
"hiring pulse." It has no traditional server and no database — it's a single web page plus
a few data files. That's why it's nearly free to run.

---

## 2. The two halves (the whole mental model)

**The website** — the file `index.html`. This is the page visitors see. It reads a data
file and draws everything: the grid, the filters, the map, etc. It never goes out to the
internet to fetch jobs itself.

**The collector (a.k.a. "the scraper")** — the file `scrape.js`. This is a small program
that visits each studio's careers page, pulls the job listings, and writes them into the
data file the website reads. It runs on a schedule, gathers everything, and saves it.

So the flow is always: **collector runs → writes the data file → website shows it.**

---

## 3. The files in your folder (what each one is)

You will only ever *edit* two of these by hand (`scrape.js` to add studios, `moon.json`
for indie studios) — and even then it's one line at a time. The rest are automatic.

| File | What it is | Do you touch it? |
|---|---|---|
| `index.html` | The website itself — the page people see | Rarely (it's "done"); ask me for changes |
| `scrape.js` | The collector that gathers jobs | Yes — to add/fix a scraped studio |
| `moon.json` | The editable list of small/indie studios | Yes — to add an indie studio |
| `jobs.js` | The data the website reads (made by the collector) | No — auto-generated |
| `jobs.json` | A readable copy of the same data, for inspection | No — auto-generated |
| `seen.json` | Memory of when each job was first seen | No — auto-generated |
| `trends.json` | Daily counts per studio (powers the Pulse tab) | No — auto-generated |
| `favicon.svg` | The little logo in the browser tab | No |
| `run-scraper.bat` | Double-click to run the collector on your PC | You double-click it |
| `.github/workflows/scrape.yml` | The instructions for hosting to run it hourly | No — set once |
| `LAUNCH_NOTES.md`, `EMAIL_CAPTURE_PLAN.md` | Earlier planning notes | Reference only |

The four "auto-generated" files (`jobs.js`, `jobs.json`, `seen.json`, `trends.json`) are
rewritten every time the collector runs. Don't edit them by hand — your changes would be
overwritten on the next run.

---

## 4. The three tiers of studios

Not every studio can be scraped the same way, so studios live in one of three places:

**Mainland (scraped).** Studios whose careers pages we can read automatically. Their
actual jobs show up live on the site. This is the bulk of the value. They're listed in
`scrape.js`.

**Island (curated link-outs).** Well-known, "beefy" studios we *can't* scrape (custom
sites, locked-down systems). We don't show their individual jobs; we show a card that
links straight to their careers page. Kept deliberately small and prestigious. Listed in
`scrape.js` in a section called `DIRECTORY`. On the site this is the "Browse these studios
directly" section.

**The Moon (indie / community).** The long tail of smaller studios — often ones who email
asking to be listed. A lightweight, can-grow-large list of name + careers-link. Lives in
its own file, `moon.json`, so adding one is a one-line change. On the site this is the
"Indie & community studios" section.

---

## 5. What a studio actually runs on ("ATS") — why this matters

An **ATS** ("applicant tracking system") is the software a company uses to post jobs and
collect applications. Common ones: Greenhouse, Lever, Workday, SmartRecruiters, Workable,
Ashby, Teamtailor, Phenom, Eightfold. Our collector knows how to read each of these.

That's the whole game of adding a scraped studio: figure out *which* ATS they use and
their account name on it, then add one line. If a studio uses something we don't support
(or a fully custom site), it goes on the Island instead.

You don't need to memorize this — when you want to add a studio, just tell me the studio
and I'll find their ATS and add them.

---

## 6. How to run the collector (right now, on your PC)

Double-click **`run-scraper.bat`**. A black window opens, it fetches everything (takes a
minute or two), writes the data files, and tells you when it's done. Then open
`index.html` to see the fresh results.

You only need to do this manually until the site is hosted. Once hosted, it runs itself
hourly (see Section 11).

---

## 7. The features, in plain language

**The grid (home page).** The big table of disciplines (rows) by seniority (columns).
Each number is how many openings exist there. Brighter = more roles. Tap any square to
filter the jobs below to just that discipline + level. Tap more squares to add them.

**Quick filters.** Under the grid: "Remote only" and the three regions (North America,
Europe, Asia-Pacific). Click a region and a gold **Hubs** strip appears so you can narrow
to a city cluster (Los Angeles, London, Tokyo, etc.). When you've picked a discipline,
a green **Specialize** strip appears (e.g., Art → Concept, VFX, Environment…). All these
counts update to respect each other.

**The sidebar filters.** Search box, posting age, "my pipeline" (hide jobs you've applied
to / dismissed), ghost-job filters (see below), and searchable lists for studio,
discipline, work type, seniority, region, and country.

**Each job row** shows the title, studio, location(s), seniority, salary and years of
experience (when stated), how long it's been listed, a "track" dropdown (mark
applied/interviewing/rejected), a dismiss (✕) button, and a **🤝 Who do I know?** button
that opens LinkedIn to your connections at that studio.

**Ghost-job protections** (our anti–fake-listing features):
- *Talent pool* tag — flags "General Application"-type postings that aren't real openings.
- *Listed N days* — how long we've truly seen a listing live (turns amber/red when old).
- *Re-listed* — flags a listing whose date was refreshed to look new but has actually
  been up for ages.
- Filters to hide talent pools, hide re-listed posts, and hide anything live over 30/60/90 days.

**Map view.** Blue pins = cities with live (scraped) roles; gold pins = Island studios at
their HQ, linking out. Click a pin to see the studios/jobs there.

**Stats view.** Charts of roles by studio, discipline, seniority, country, and gaming hub;
an honest work-type breakdown (most studios don't say, so "Not stated" is shown plainly);
salary info; and a "data health" panel that flags any studio whose feed is failing.

**Pulse view.** "This week in hiring" numbers, plus which studios are *ramping up* vs.
*pulling back* over time, with little trend lines. This is built from our own history, so
it gets more meaningful the longer the site runs. It is a momentum *signal*, not official
layoff news (we deliberately never invent layoff numbers).

---

## 8. Our honesty rules (the brand)

These are deliberate and worth protecting:
- We say **"Unknown"** instead of guessing (e.g., work type when a studio doesn't state it).
- We never invent numbers (no made-up salary ranges, no "estimated layoffs").
- Ghost-job and Pulse signals are shown as **facts** ("listed 84 days"), never accusations.

When in doubt, we show less rather than something false. It's the trust angle that sets
us apart.

---

## 9. Common things you'll want to do (copy/paste recipes)

You can do these yourself, or just ask me. After any change to `scrape.js` or `moon.json`,
the change shows up the next time the collector runs.

**Add an indie studio to the Moon.** Open `moon.json`, add a line like this (mind the
commas — every entry but the last ends with a comma):
```json
{ "name": "Cool Studio", "url": "https://coolstudio.com/careers", "note": "Their Game — City" }
```

**Add a scraped or Island studio.** Easiest to just tell me "add Studio X" — I'll find
their ATS, add the right line to `scrape.js`, and tell you whether it landed on the
Mainland or the Island.

**Change the "Submit your studio" email.** In `index.html` there's one line:
`const SUBMIT_EMAIL = "studios@devquest.gg";` — change the address there.

**A studio's feed starts failing.** The Stats page "data health" panel names it. Tell me
which one and I'll investigate (usually the studio changed their careers software, which is
a quick fix on our end).

---

## 10. Jargon glossary (so the rest makes sense)

- **Static site** — a website that's just files (no live server doing work). Cheap, fast,
  hard to break.
- **Scraper / collector** — our program (`scrape.js`) that gathers the jobs.
- **ATS** — the job software a company uses (Greenhouse, Lever, Ashby, etc.).
- **Repo (repository)** — a folder of your project stored on GitHub.
- **GitHub** — a free website that stores code and can run small automated jobs for you.
- **GitHub Actions** — GitHub's feature that runs a task on a schedule (this is what will
  run our collector hourly).
- **Cron** — just a way of writing a schedule ("every hour"). You don't write it; it's in
  the workflow file already.
- **Pages (GitHub Pages / Cloudflare Pages)** — free services that turn your repo into a
  live website at a real URL.
- **JSON / .js files** — plain text files that hold data. Our data files are these.

---

## 11. Taking it live (hosting) — the big picture

Right now the collector only runs when *you* double-click it, and the site only exists on
your computer. To make it a real, always-updating website, two things happen:

1. **Hosting** puts `index.html` on the internet at a real address.
2. **Automation** runs the collector hourly on GitHub's computers (not yours), so the data
   stays fresh even when your PC is off.

We've already written the automation instructions — that's the
`.github/workflows/scrape.yml` file. It tells GitHub: "every hour, run the collector and
save the new data." You don't need to understand its contents; it's set up.

**The launch sequence (we'll do this together, step by step):**
1. Create a free GitHub account (if you don't have one).
2. Create a new **public** repository and upload this folder to it. (Public = the hourly
   automation is free.)
3. Turn on GitHub Pages (or connect Cloudflare Pages) to publish the site at a URL.
4. Point your domain (devquest.gg) at it once you buy the domain.
5. In the repo's "Actions" tab, click **Run workflow** once to confirm the hourly collector
   works. After that it runs on its own, every hour, forever.

**What "it runs itself" means:** GitHub spins up a temporary computer each hour, runs the
collector, saves the refreshed data back into your repo, and the live site updates. Your
laptop is never involved. It's free on a public repo.

**First-run notes:** the very first run stamps every listing's "first seen" date, so the
ghost-job ages start counting from launch day. The Pulse trend lines need a few days of
these hourly runs before they show meaningful movement. Both fill in automatically.

---

## 12. Still on the to-do list (when you're ready)

- **Buy the domain** (devquest.gg) and create a real inbox like `studios@devquest.gg`
  (the "Submit your studio" button points there).
- **Email list / job alerts** — capturing emails so people get alerts. The plan is written
  up in `EMAIL_CAPTURE_PLAN.md`. Needs the domain + an email service first.
- **Optional later:** more studios, the curated layoffs/closures tracker, "follow a studio"
  notifications, salary-coverage stats, a "Producer Mode" sub-tag.

---

## 13. If something breaks or you're unsure

You don't have to debug anything. Tell me what you saw (or send a screenshot) and I'll
diagnose and fix it. The most common things — a studio's feed failing, adding studios,
changing text — are all quick. You're not on your own with this.
