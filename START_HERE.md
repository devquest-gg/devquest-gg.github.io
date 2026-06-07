# DevQuest.gg — START HERE (project catch-up)

**Read this first, then `DEVQUEST_HANDBOOK.md` for full detail.** This file is the quick
brief so a new chat can pick up exactly where we left off. The chat doesn't remember
past conversations — this folder does.

## What this is
A job board just for the video-game industry. **Live at https://devquest.gg** (secure / HTTPS on).
Static site + a Node scraper, hosted free on GitHub Pages.

## How to resume in a new chat
1. Start a new Cowork project connected to this folder (`...\Desktop\Claude\GameDevPostings`).
2. Say: "Read START_HERE.md and DEVQUEST_HANDBOOK.md to catch up on DevQuest."
3. That's it — the assistant will be fully oriented.

## Current status (as of June 8, 2026)
- **Hosting:** GitHub Pages, repo `devquest-gg/devquest-gg.github.io`. Live at devquest.gg + www.
- **HTTPS:** on (Enforce HTTPS enabled). Site shows the padlock.
- **Scraper:** runs automatically every hour via GitHub Actions (cron at :23 past the hour),
  commits refreshed data back to the repo. ~2,800 roles across ~47 studios.
- **Salaries:** backfilled from each job's detail page and cached in seen.json —
  Workday/Phenom (Blizzard, Activision, King), generic page-read (EA), Amazon (no-`$`
  format), and SmartRecruiters via its API. ~590+ roles show real pay and climbing.
  Non-US studios (Ubisoft FR, CDPR PL, etc.) often don't publish salary, so they
  honestly show "Unknown."
- **Email:** `studios@devquest.gg` on Spaceship's Spacemail (Pro trial), set up on iPhone.
- **Analytics:** Cloudflare Web Analytics beacon is in index.html (cookieless, no banner).

## Key files
- `index.html` — the website (everything: layout, filters, map, stats, Pulse).
- `scrape.js` — the scraper (studios list + fetchers + salary backfill).
- `jobs.js`, `jobs.json`, `seen.json`, `trends.json` — **DATA. Owned by the hourly Action.
  NEVER manually re-upload these.** (The golden rule.)
- `DEVQUEST_HANDBOOK.md` — the full plain-language owner's guide.
- `LAUNCH_NOTES.md`, `EMAIL_CAPTURE_PLAN.md` — launch + future email/alerts plan.

## How we deploy a change (code files only)
Edit the file locally → upload it on GitHub's web "Add file ▸ Upload files" page → Commit.
Only ever upload files you actually changed; never the 4 data files above.

## Ideas / what's next
- Finish salary fill for Amazon + US SmartRecruiters roles (was running when we stopped).
- Stage 1: email capture + automatic weekly job digest (see EMAIL_CAPTURE_PLAN.md).
- Stage 2: paid SMS alerts (Twilio + Stripe); form an LLC before charging.
- More studios; a curated layoffs/closures tracker; "follow a studio."

## Disaster recovery — getting back to business on a new computer
If this PC is lost/wiped, here's the full checklist. Everything needed is on GitHub or in
Google Drive — nothing important lives only on the old machine.

1. **Install the Claude desktop app** and turn on Cowork mode (sign in with the same account).
2. **Get the repo back.** On GitHub, open `devquest-gg/devquest-gg.github.io` → green **Code**
   button → **Download ZIP** (or clone it). Unzip to a folder like `Desktop\Claude\GameDevPostings`.
   - The live site itself is unaffected — it keeps running on GitHub the whole time; this is
     just getting *your local working copy* back.
3. **Reconnect the folder in Cowork** (point a new project at that folder).
4. **Re-orient the assistant:** say "Read START_HERE.md and DEVQUEST_HANDBOOK.md to catch up
   on DevQuest." That restores all project context (this file + the handbook + LAUNCH_NOTES +
   EMAIL_CAPTURE_PLAN are all in the repo).
5. **Re-add the skills** (these are NOT in the repo — they're backed up in Google Drive under
   `_skill-backups`: `tla-project-SKILL.md` and `cfw-writer-SKILL.md`). A backed-up .md is the
   skill's *content*; to make it a live, auto-triggering skill again, re-create it once via
   **Settings → Capabilities** on the new machine, pasting in the saved content.
6. **Nothing to restore for the scraper/data** — the hourly GitHub Action and the four data
   files (`jobs.js`, `jobs.json`, `seen.json`, `trends.json`) live in the cloud and kept
   running. Don't re-upload your old local copies of those (the golden rule, see the Handbook).

Keep this current: if we add new skills or new must-read docs, add them to step 4/5 above.
