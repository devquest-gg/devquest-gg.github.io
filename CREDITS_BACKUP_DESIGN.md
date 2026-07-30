# DevQuest Credits — Database Backup & Recovery Design

Status: draft for review. Nothing here is built yet.

## 1. What we're protecting, and against what

The credits data lives in two Cloudflare D1 (SQLite) databases:

- **`devquest-credits`** (the credits-api Worker): `people`, `credits`, `vouches`, `games_added`, `pending_credits`, `pending_vouches`, `entity_reports`, `entity_overrides`, `studio_links`, `person_emails`, `published_credits`. This is the irreplaceable one, it's the developer-owned record itself.
- **`devquest`** (the alerts/analytics Worker): `alerts`, `events`, `credits_events`. Useful but reconstructible; lower priority.

The failures we want to survive, roughly in order of likelihood:

1. A bad write or a buggy migration corrupts or deletes rows (most common, and exactly the kind of thing that just bit us on the Worker source).
2. A person's data is deleted by mistake (admin action, a bad DELETE).
3. The D1 database itself is dropped, or the Cloudflare account is lost/suspended.
4. Cloudflare-side data loss (rare, but the whole point of off-site copies).

No single mechanism covers all four, so the design is layered.

## 2. Three layers

### Layer 1 — Time Travel (already there, zero setup)

Cloudflare D1 keeps a continuous 30-day history of every database automatically. Any point in the last 30 days can be restored with one command:

    wrangler d1 time-travel restore devquest-credits --timestamp=2026-07-16T18:00:00Z

This is the fast fix for cases 1 and 2 (a bad write an hour ago, an accidental delete yesterday). It needs nothing built. Its limits: it only reaches back 30 days, and it lives inside the same D1 instance, so it does nothing for case 3 or 4.

### Layer 2 — Scheduled off-site SQL exports (the real backup)

A GitHub Actions workflow, on a daily cron, runs a full logical dump of each database and stores it outside Cloudflare:

    wrangler d1 export devquest-credits --output=devquest-credits-YYYYMMDD.sql

Storage, both of:

- **Cloudflare R2** bucket (`devquest-backups`), private, object-versioned. Cheap, S3-compatible, already in your Cloudflare account.
- **A private GitHub repo** (`devquest-gg/devquest-backups`), as a second copy on entirely different infrastructure, so a Cloudflare account problem can't take out the backups too. This copy is GPG-encrypted (see §4) because it contains emails and tokens.

This directly covers cases 3 and 4: a complete, restorable SQL file sitting on two independent platforms.

### Layer 3 — Periodic local/cold copy (optional, belt-and-suspenders)

The same daily workflow can also be pulled down to your machine on a schedule, or you manually download the newest dump monthly and keep it somewhere offline. One offline copy defeats even a "both cloud accounts compromised" scenario. Optional; recommended for a monthly cadence only.

## 3. What each backup contains

A `wrangler d1 export` produces a single SQL file with `CREATE TABLE` + `INSERT` statements for every table, i.e. a complete, human-readable, restore-anywhere snapshot. We back up **both** databases each run. At current scale each dump is small (well under a few MB), so daily full dumps are trivial, no need for incremental logic yet.

## 4. Sensitive data (this matters)

`person_emails` holds email addresses, and the auth tables hold confirm/session tokens. A raw SQL dump is therefore PII and must never land anywhere public.

- R2 bucket: private by default, locked to your account. Fine as-is.
- GitHub copy: even a *private* repo is one misconfig away from exposure, so the file is **GPG-encrypted** before upload (`gpg --symmetric --cipher-algo AES256`), with the passphrase stored only as a GitHub Actions secret and in your password manager. The plaintext dump never touches the repo.

The existing public JSON export endpoints (`/export/people`, `/export/studio-links`, `/export/game-covers`) are deliberately partial, public-safe projections. They're handy but are **not** a backup, they omit tables and columns and can't restore the database.

## 5. Retention

Tiered, pruned automatically by the workflow (and by an R2 lifecycle rule):

- Daily snapshots: keep 30 days.
- Weekly snapshots (Sunday): keep 12 weeks.
- Monthly snapshots (1st): keep 12 months.

So roughly 50 files per database at steady state. Negligible storage cost.

## 6. Restore runbook (documented and tested)

- **Recent bad write, within 30 days:** Time Travel restore (Layer 1). Fastest, no files needed.
- **Full restore from a dump:** create/target a D1 instance and replay the SQL:

      wrangler d1 execute devquest-credits --file=devquest-credits-YYYYMMDD.sql

- **Single-record recovery:** open the dump locally in SQLite, extract the rows you need, and apply just those.

A restore is only real if it's been tested, so the rollout includes a one-time drill: restore the newest dump into a scratch D1 and diff row counts against production.

## 7. Monitoring & verification

Each run, before it's considered good, the workflow:

1. Confirms the dump is non-empty and parses.
2. Records row counts per table into a small `manifest.json` (timestamp, per-table counts, SHA-256 of the file).
3. Sanity-checks the counts didn't collapse (e.g. `people` and `credits` are >= 90% of the previous run); a sudden drop fails the job loudly.
4. On any failure, the GitHub Action reports failure (and can ping the alerts Worker so you get notified), because a silent backup failure is the worst outcome.

## 8. Auth & secrets for CI

The workflow authenticates to Cloudflare with a **scoped** API token (D1 read/export + R2 write only, nothing else), stored as GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `BACKUP_GPG_PASSPHRASE`. This mirrors how the hourly scrape workflow already runs, so it fits the existing setup rather than introducing a new pattern.

## 9. Cost

Effectively zero. R2 storage for a few dozen small dumps is fractions of a cent per month; GitHub Actions minutes for a daily 30-second job are within the free tier; Time Travel is included with D1.

## 10. Suggested rollout order

1. Turn on the mindset now: confirm Time Travel works with a test restore into a scratch DB (Layer 1 is already protecting you).
2. Create the private R2 bucket + the private backups repo, and the scoped API token.
3. Add the GitHub Actions workflow: export both DBs → verify → encrypt → push to R2 and the repo → prune.
4. Run the restore drill once end to end, and write the outcome into this doc.
5. (Optional) Set a monthly reminder to pull one cold copy offline.

Phase 1–3 is the meaningful protection; 4 is what makes it trustworthy; 5 is paranoia insurance. I can build phases 2–4 whenever you want to green-light it.
