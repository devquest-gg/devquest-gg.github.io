# DevQuest Credits - Full Specification

**Status:** concept, fully mocked, not yet built.
**Companion to:** the DevQuest jobs board (this same repo).
**Live target URL:** `devquest.gg/credits`

This document is the single source of truth for what DevQuest Credits is and how it works. If you are picking this up in a new chat or on a new machine, read `START_HERE_CREDITS.md` first for the quick brief, then this file for detail. The clickable mockups in `mockups/` show every screen described here.

---

## 1. The one-paragraph pitch

Games are the only major creative industry without a real, trustworthy credits record. Film has IMDb, music has liner notes, games have credit rolls that get people cut after layoffs, mislabelled, or left off entirely, plus a couple of third-party wikis (MobyGames, IGDB) that are edited *around* the people who did the work rather than *by* them. DevQuest Credits is an opt-in, dev-controlled credits database: the person who did the work owns and corrects their own record, and colleagues who shipped with them vouch for it. It lives alongside the DevQuest jobs board so a claimed credit profile doubles as a candidate profile.

## 2. Why it can work when others have not

The nuance in game credits lives only in the individual's head. A scraped credit roll cannot know that someone joined a studio after a game shipped and only worked on the PC port. IMDb-style single credits cannot express it. But an opt-in, self-claimed, peer-vouched system can, because the person sets the record and a colleague confirms it. That is the moat: DevQuest Credits captures situations existing systems structurally cannot.

## 3. Design principles (the non-negotiables)

1. **Frictionless.** No passwords, no account wall. Claiming is a one-time email magic link, matching the jobs board's low-friction ethos.
2. **Honesty brand (shared with the jobs board).** Imported facts are shown as fact and marked as imported. Self-added items are labelled. Vouches are shown as counts, never as verdicts the host adjudicates. We show "unknown" rather than guessing.
3. **Dev-controlled.** The person who did the work owns their page. Imported data seeds the catalogue; the individual corrects and extends it.
4. **Hands-off for the host.** Trust accrues socially (peer vouches, contested states, cheap signals) so the operator does not referee disputes in the common case.
5. **Portable and open.** Data is exportable per-user and publishable as open dataset dumps, so the record outlives any single company, including DevQuest.
6. **No live dependency on any third party.** Seed data is imported once and cached as our own records.

## 4. Data model

The core relationship: **Studio → Game → Release → Credit → Person**, with **Vouches** on credits and **Identities** on people. The critical design choice is that a credit attaches to a **Release** (a specific milestone of a game), not to the bare game title.

### Entities

**Studio** (already exists on the jobs board)
- id, name, canonical_source (Wikidata QID where available), location, parent_studio_id, careers_url
- Reused from the jobs board so studios are shared across both products.

**Game** (title-level)
- id, slug, canonical_title, primary_studio_id, first_release_year, genre, source (`wikidata` | `community`), wikidata_qid, verified (bool), created_by, created_at
- Core identity fields (title, studio, year) are locked when sourced from Wikidata. The structure hanging off a game (its releases and credits) is the open, editable layer.

**Release / Milestone** (the key new entity)
- id, game_id (FK), type (enum: `base_game` | `port` | `remaster` | `definitive_edition` | `dlc` | `expansion` | `season` | `update`), platforms (array), release_date OR date_range (for live-service eras), studio_id (may differ from the game's primary studio, e.g. a remaster by another studio), name (optional; auto-generated from fields when blank), canonical_key (generated, see 5.6), provenance (`imported` | `community`), verified (bool), created_by, created_at
- A credit attaches here. This is what makes "joined after launch, only did the PC port" and "live-service era 2019 to 2022" expressible.

**Person**
- id, slug, display_name, headline_role, location (optional), skills (array, controlled vocabulary), claimed (bool), created_at, source (`imported` | `self`)
- A person exists as an unclaimed, imported stub until the real individual claims it.

**Credit** (person's role on a specific release)
- id, person_id (FK), release_id (FK), role (controlled vocabulary), discipline (derived from role), contribution_note (free text, moderated), date_range (optional; important for live-service), official (bool: was it in the official credit roll?), source (`imported` | `self`), status (`active` | `contested`), vouch_count (denormalized), created_at
- `official = false` means an uncredited contribution (the layoff / port / patch case). It displays as peer-vouched, not official.

**Vouch**
- id, credit_id (FK), voucher_person_id (FK), created_at
- Constraint: unique(credit_id, voucher_person_id). Rule: the voucher must themselves hold a *claimed* credit on the *same release*. This is what keeps vouches meaningful and spam-resistant. A vouch only increments a public count; it is never an operator judgement.

**Identity / AuthKey** (how a person logs in; a person can have several)
- id, person_id (FK), type (`email` | `work_email` | `oauth_google` | `oauth_github` | `oauth_discord`), value_or_hash, verified (bool), is_primary (bool), created_at
- Login is a magic link to any verified email, or an OAuth sign-in. Multiple keys give durable recovery. Work-email domain match is a strong identity signal.

**ClaimRequest** (claim, re-claim, transfer, contest)
- id, person_id, requesting_identity_id, status (`pending` | `active` | `contested` | `transferred`), cooldown_until, evidence (vouches / work-domain), created_at
- The same machinery handles first claim, impostor contest, and lost-email recovery. Ownership is a rotatable key, not a permanent deed.

**EditHistory** (public audit log)
- id, entity_type, entity_id, actor_identity_id, diff (json), reversible (bool), created_at
- Every edit is logged and publicly reversible. This is what makes vandalism cheap to undo.

**MergeRequest** (dedup for releases, games, people)
- id, entity_type, from_id, to_id, status, evidence, created_at

**ModerationFlag**
- id, entity_type, entity_id, reason, reporter, status, created_at

### Cardinality summary
Studio 1..* Game 1..* Release 1..* Credit *..1 Person; Credit 1..* Vouch; Person 1..* Identity; Person 1..* ClaimRequest.

## 5. Key mechanics

### 5.1 Seeding (cold-start)
Import Games and Studios from **Wikidata** (CC0 public domain, safe for commercial reuse) and baseline Credits from public in-game credit rolls. Store everything as our own records in our own database. We never call a third-party API at runtime, so if a source dies or blocks us, the catalogue keeps working; we only lose the ability to pull *new* seed data. As people claim and correct, our dataset diverges from the source and becomes a more accurate, proprietary asset.

### 5.2 Claiming (no signup wall)
Find your name (already imported) → "This is me" → enter one email → receive a magic link → the link verifies you and opens your page for editing. No password, no account. Immediately prompt the user to link a second key (a recovery email or an OAuth sign-in) so a lost email never locks them out.

### 5.3 Editing a credit (controlled inputs)
- **Game**: locked (from catalogue).
- **Release / era**: chosen from the game's releases, or add one (see 5.6).
- **Role / title**: chosen from a curated role vocabulary. Fixes vague or wrong imported titles without allowing junk.
- **Skills**: autocomplete from a controlled skill vocabulary. No arbitrary strings enter the database.
- **Notes**: the only free-text field. Moderated on save (see 5.5).
- **Official vs uncredited**: a toggle. Uncredited contributions display as peer-vouched until a same-release teammate confirms.

### 5.4 Vouching
On a colleague's credit for a release you also shipped, a one-click "I worked with them" appears, but only if you hold a claimed credit on that same release. One tap records your vouch and increments the public count. If you have not yet claimed your own credit on that release, the button instead asks you to do so first. The host never adjudicates.

### 5.5 Moderation (hands-off by design)
- **Controlled vocabulary** for skills and roles shrinks the free-text surface to just Notes.
- **Email-gated writes**: every edit is tied to a verified identity, so anonymous bot spam cannot post.
- **Auto-moderation on Notes**: profanity/slur wordlist filter plus a spam-and-hate classifier before publish.
- **Rate limits** per identity stop flooding.
- **Report button** plus a small review queue for anything that slips through.
- **Public, reversible edit history** makes vandalism cheap to undo.

### 5.6 Adding a release or game without duplicate soup
The rule: users never type a new entity as free text. They assemble a structured record after the system forces a search.
1. **Match before create.** Typing surfaces existing releases first ("Did you mean Days Gone · PC (2020)?"). Most of the time the user picks one and nothing new is created. This single step prevents the bulk of duplicates.
2. **Structure, not strings.** If nothing fits, the new release is built from constrained fields: type (enum), platform (enum), date, optional name; parent game is locked. The system *generates* the canonical name and key from those fields (e.g. `days-gone / port / pc-windows / 2020`), so everyone who enters the same release lands on the same record regardless of spelling.
3. **Collision check.** Before create, the generated key is fuzzy-matched against existing releases and a near-duplicate warning is shown.
4. **Provenance and merge.** New entities start `community-added, unverified` and become established once a peer who worked on them vouches. Look-alikes are auto-flagged and mergeable with reversible history (the MusicBrainz / Wikidata pattern). Adding a whole new *game* uses the same flow at a higher bar.

### 5.7 Recovery, re-claim and contested ownership
Ownership is a rotatable key, not a permanent deed. Credits live with the record, not the email.
- **Best case:** the user linked a second key (recovery email or OAuth) at claim time, so losing one is a non-event.
- **Re-claim:** start from any new email on your own page. The system pings the old address and opens a short cool-down. If someone still controls the old address they can veto (this stops hijacking); a dead inbox never answers.
- **Re-prove:** peer vouches from people you shipped with, and/or a work-email domain match, resolve it. Same signals as a contested claim.
- **Transfer:** after the cool-down, ownership moves to the new key. Credits, vouches, skills and history stay attached.

### 5.8 The release model handles box products and live-service identically
A box product is a base release plus post-launch milestones (DLC, port, remaster). A live-service game is a base plus seasons/eras over time. Both render as one **timeline** of milestones. This makes the blurry line between the two disappear and future-proofs the model for games that start as box products and become live-service.

## 6. UI surfaces (all mocked in `mockups/`)

- **Portal landing** (`devquest.gg/credits`): hero + search, cover wall, cold-start-safe stats, most-credited games, how-it-works, manifesto, CTA. See `mockup-credits-portal.html`.
- **Studio page**: full page listing the studio's games, each linking to its credits. Mirrors the jobs board's studio snapshot drawer, which stays on the jobs board for quick glances. See prototype.
- **Game page**: milestone **timeline**; each release expands to its credits, grouped by discipline. Claim bar, search within. See prototype and `mockup-credits-releases.html`.
- **Person page**: public credit résumé, with an unclaimed state (imported credits only, "is this you?" claim CTA) and a claimed state (skills, corrected roles, notes, vouches, share/export). See `mockup-credits-pages.html`.
- **Find your name**: search with grouped people/games results. See prototype.
- **My Credits (owner hub)**: the primary surface for most users; manage your own credits, skills, and incoming vouch requests. A new top-nav tab alongside List / My Jobs / For You. See `mockup-credits.html`.
- **Edit a credit**: controlled inputs, release scope, uncredited toggle, moderation shield. See prototype and `mockup-credits-edit.html`.
- **Add a release**: the dedup flow. See prototype and `mockup-credits-releases.html`.
- **Account & recovery**: linked keys and the re-claim flow. See `mockup-credits-edit.html`.
- **Vouch flow**: same-release one-click vouch. See prototype.

Pages, not drawers: on the credits side, game and person views are full pages with real URLs, because their value is discovery (Google-indexable) and shareability (a link a dev pastes into a job application). The drawer pattern stays on the jobs board where views are quick and disposable.

## 7. Architecture

- **Front-end:** static HTML/CSS/JS, same stack as the jobs board, served on GitHub Pages under `/credits`. Game and person pages should be pre-generated as static HTML (nightly from the database) for SEO and speed; reads then mostly do not touch the database.
- **Backend (new):** a small **Cloudflare Worker** API plus **Cloudflare D1** (managed SQLite) for the writes (claim, edit, vouch, contest) and dynamic bits. This is the one genuine step up from the jobs board's pure-static setup.
- **Auth:** magic-link email plus optional OAuth (Google/GitHub/Discord). No passwords.
- **Seed import:** one-time Node scripts pulling Wikidata (CC0) and parsing public credit rolls into D1.
- **Moderation:** wordlist filter plus a lightweight classifier on Notes.
- **Cost:** Cloudflare free tier covers launch comfortably (Workers 100k requests/day; D1 5 million rows read/day, 100k rows written/day, 5 GB storage). The entire dataset (tens of thousands of people, a few million credit rows) fits inside the free 5 GB. The only step up is Workers Paid at about $5/month, reached only on real success. Check current numbers at the Cloudflare docs before building.

## 8. Licensing note (decide before building)

Do not depend on IGDB as a runtime feed: its free tier is non-commercial only, and post-2019 terms restrict caching. Seed the games catalogue from **Wikidata (CC0)** instead, which is free for commercial reuse. Build credits from user claims plus public credit rolls. This sidesteps the licensing question permanently rather than deferring it.

## 9. Longevity and open data (the trust commitment)

Because we ask people to invest time, the data must be able to outlive us. Offer public dataset dumps and per-user export, license the dataset openly (for example CC-BY), and pre-commit publicly to publishing the full dataset if DevQuest ever shuts down. This is both an ethical commitment and a trust pitch ("your credits are yours, exportable, and will not vanish if we do"), and it lowers the barrier to contributing. MobyGames only survives via ownership hand-offs (Atari bought it in 2022); open data is the durable version of that.

## 10. Relationship to the jobs board

The credits profile *is* a candidate profile. A vouched game-credit history is a stronger hiring signal than a self-reported LinkedIn list. The two products share studios and branding. On the jobs board, the studio drawer's game list can link out to credits game pages, and a claimed profile can back a job application. The credits side deliberately does **not** add contact/messaging in the catalogue-first scope; that "professional network" layer is a separate, later decision with its own moderation cost.
