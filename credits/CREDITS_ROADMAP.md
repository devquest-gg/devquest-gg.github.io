# DevQuest Credits - Phased Development Plan

Read `CREDITS_SPEC.md` for the full design. This file is the build order: what to do, in what sequence, and when to stop and check before spending more.

The guiding principle: **validate cheaply before the big build.** DevQuest already has features that go unused, and credits is the biggest feature yet. Each phase ends with a go/no-go so you never pour months into something the audience did not want.

---

## Phase 0 - Validation thin-slice
**Goal:** find out if devs will actually claim, and if game pages pull search traffic, before building any backend.
**Effort:** days, not weeks. Mostly static.

Do:
- Seed a handful of well-known studios' games with imported credits, as **static pages** under `/credits` (no database yet).
- Add one working "claim your credit" button that just captures an email (reuse the jobs board's existing email-capture plumbing).
- Make a few game pages genuinely good so they can rank in search.
- Add basic analytics (the existing Cloudflare Web Analytics beacon).

Measure over 4 to 8 weeks:
- Do the game/person pages get organic search traffic ("who made X")?
- Do any devs click "claim" and leave an email?

**Go/no-go:** meaningful search traffic and a trickle of real claim intent → proceed to Phase 1. Crickets → stop, you have spent days not months, and you have learned the audience is not there yet.

---

## Phase 1 - Read-only catalogue (still static)
**Goal:** become a useful reference and an SEO surface, with no writes yet.
**Effort:** a few weeks.

Do:
- Full seed from **Wikidata (CC0)** for games and studios, plus public credit rolls for baseline credits.
- Generate static **game pages, person pages, studio pages** under `/credits`.
- Search across games, studios, people (a prebuilt JSON index, same technique as the jobs board's `jobs.js`).
- Cold-start-safe stats: show catalogue scale ("credits waiting to be claimed"), hide engagement counters.
- Portal landing page live.

**Value even if you stop here:** a browsable "who made what" reference that pulls search traffic and makes the jobs board's studio pages richer.

**Go/no-go:** traffic and usage justify adding a backend → Phase 2.

---

## Phase 2 - Claiming (the backend arrives)
**Goal:** let the real person own and correct their page. This is the first non-static work.
**Effort:** the largest single step, because it introduces the database and API.

Do:
- Stand up **Cloudflare D1** (database) and a **Cloudflare Worker** (API).
- Magic-link email claim flow. No passwords.
- **My Credits** owner hub.
- Edit a credit: controlled role and skill vocabularies, moderated Notes.
- Prompt to link a second key (recovery email or OAuth) right after first claim.
- Public, reversible edit history.

**Go/no-go:** people claim and maintain pages → Phase 3.

---

## Phase 3 - Vouching
**Goal:** turn claims into trust.
Do:
- One-click peer vouch, restricted to claimed credit-holders on the same release.
- Vouch counts on credits and profiles.
- Incoming vouch requests in My Credits.

---

## Phase 4 - Releases and uncredited contributions
**Goal:** capture the situations no other system can.
Do:
- Add the **Release / Milestone** entity; migrate credits to attach to releases.
- Release-aware **timeline** game page (handles box-product milestones and live-service eras with one visual).
- The **add-a-release** dedup flow (match-before-create, structured fields, canonical key, collision check, community-added-until-vouched).
- Uncredited-contribution toggle (peer-vouched, not official).

---

## Phase 5 - Trust, recovery and scale
**Goal:** make it durable and self-policing.
Do:
- Contested claims, re-claim and ownership transfer, account recovery.
- Merge tooling for duplicate releases/games/people.
- Moderation queue and report handling.
- Per-user export and public open-data dumps; publish the open-data commitment.
- Live-service era handling at scale.

---

## Phase 6 - Integration and polish
**Goal:** fuse the two products.
Do:
- Wire the jobs board's studio drawer game list to credits game pages.
- Let a claimed profile back a job application.
- "My Credits" as a top-nav tab on the jobs board.
- Portal polish, mobile passes.

---

## Sequencing notes
- Phases 0 and 1 are static and cheap; they de-risk the whole thing.
- Phase 2 is the real commitment (database + API). Do not start it until Phase 0/1 signal is positive.
- Everything from Phase 2 on runs on Cloudflare's free tier for a long time; the only likely cost is Workers Paid at about $5/month once you outgrow the free limits, which means success.
- Keep the honesty rules and the no-live-dependency rule in every phase.
