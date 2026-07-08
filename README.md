# DevQuest - project index

This repository holds two related products:

1. **The jobs board** (live at `devquest.gg`): a game-industry job board. A static site plus an hourly scraper, hosted free on GitHub Pages. This is built and running.
2. **The credits system** (planned, in `credits/`): an opt-in, dev-controlled game-credits database to live at `devquest.gg/credits`. Fully designed and mocked, not yet built.

## Where to start

**For the jobs board:** read `START_HERE.md`, then `DEVQUEST_HANDBOOK.md`. Those explain the whole thing in plain language: the two programs (the website and the scraper), how to deploy changes, and the golden rule about the data files.

**For the credits system:** read `credits/START_HERE_CREDITS.md`, then `credits/CREDITS_SPEC.md` (full design) and `credits/CREDITS_ROADMAP.md` (build order). Open `credits/mockups/prototype-credits.html` in a browser to click through the concept.

## To resume in a fresh chat or on a new machine

Open a Cowork project on this folder and say:

> "Read START_HERE.md and DEVQUEST_HANDBOOK.md for the jobs board, then credits/START_HERE_CREDITS.md, credits/CREDITS_SPEC.md, and credits/CREDITS_ROADMAP.md for the credits system."

That restores full context from these files. The chat does not remember past conversations, but this folder does, and so does the GitHub repository it is pushed to.

## Folder map

```
GameDevPostings/
  README.md                  <- this file (master index)
  START_HERE.md              <- jobs board catch-up
  DEVQUEST_HANDBOOK.md       <- jobs board owner's guide
  index.html                 <- the jobs board website
  scrape.js                  <- the jobs board scraper
  jobs.js / jobs.json / seen.json / trends.json   <- DATA (owned by the hourly Action; never re-upload)
  moon.json                  <- editable indie studio list
  ... other jobs board files and mockups ...
  credits/
    START_HERE_CREDITS.md    <- credits catch-up
    CREDITS_SPEC.md          <- full credits specification
    CREDITS_ROADMAP.md       <- phased build plan
    mockups/                 <- clickable prototype + detail mockups
```

## Why the credits system is its own folder

The credits system is a different kind of app from the jobs board. The jobs board is pure static files. The credits system needs a small backend (a Cloudflare Worker plus a D1 database) for claims, edits, and vouches. Keeping it in `credits/` inside this same repo means one domain (`devquest.gg/credits`), one repository to manage, and shared branding, while its backend deploys separately to Cloudflare. When you build it, the credits front-end lives in `credits/` and serves under `/credits`; the Worker source can live in a sibling folder (for example `credits-api/`) because it deploys to Cloudflare rather than GitHub Pages.

## Continuity and independence (important)

You are far less locked-in than it can feel. Read this if you ever worry about depending on any one tool.

**Everything here is plain, portable files in Git.** HTML, JavaScript, JSON, and Markdown. There is no proprietary format and nothing that only one assistant can read. Any web developer, or any AI coding tool, can open this repository and continue.

**The live products do not need Claude, Cowork, or any assistant to keep running.** The jobs board runs itself on GitHub's servers (GitHub Pages serves the site; a GitHub Action runs the scraper hourly). The credits backend, once built, would run itself on Cloudflare. An assistant is an accelerator for *making changes*, not a dependency for *staying alive*. If you never touched it again, the site would keep serving and updating.

**The source of truth is GitHub, not this machine.** As long as changes are committed and pushed to the GitHub repository, losing or changing computers costs you nothing. To get back to work on any machine: install the tools, download or clone the repo from GitHub, point a Cowork project (or any editor) at the folder, and re-read the docs above. The disaster-recovery checklist in `START_HERE.md` covers this step by step.

**If a specific assistant ever becomes unavailable or too expensive:** the work is portable. Options include other AI coding tools, or hiring a freelance web developer, since this is standard web technology (static HTML/JS on GitHub Pages, and for credits a common Cloudflare Worker + SQLite stack). These documents are written to onboard a human or a different tool cold, not just to remind one assistant. Keeping these docs current and pushing to GitHub regularly is the single best insurance.

**Practical habit:** after any working session, push changed files to GitHub (only the files you changed; never the four data files, per the golden rule in the handbook). That keeps the cloud copy current so nothing important lives only on your computer.
