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
