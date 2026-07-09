# DevQuest Credits - Phased Development Plan

Read `CREDITS_SPEC.md` for the full design. This file is the build order: what to do, in what sequence, and when to stop and check before spending more.

The strategy (decided): **come out of the gate comprehensive, not with a thin slice.** For this product the core value is "search your name and find your games," which only works if the catalogue is broad from day one. So we seed the whole catalogue from Wikidata up front rather than sampling a few studios. We still stage the build to keep one cheap checkpoint before the expensive backend: ship the comprehensive *read-only* catalogue first, then add claiming and the value-back features close behind (or bundled). Each stage still ends with a go/no-go so we do not pour months into something the audience did not want.

**North-star metric: credits claimed per user.** Not page views, not total profiles claimed. If users claim one credit and vanish, the product is weak; if they claim 8, 15, 20, you have built something people genuinely maintain. Watch this above all other numbers (it becomes measurable once claiming exists in Phase 2), and prioritise the value-back features (spec Section 13) that move it.

## Launch plan (decided): all-in private beta

Go all-in rather than staging public launches. Build the full v1 (comprehensive catalogue + claiming + core value-back, including the shareable credit card) and release it as a **private beta** first:

- **BETA tag** on the page sets expectations (data incomplete, bugs expected). Already on the homepage.
- **Hidden from SEO** (noindex) and **unlinked from the jobs board** for the first week or two.
- **Seed via personal network:** invite testers in clusters who shipped the same games together, so vouching fires immediately and the graph is not all zeros.
- Note: unlinked + noindex is private-ish, not locked; anyone with the URL can load it. Fine for a friendly beta.

**Then go public** (after roughly one to two weeks, once it feels alive): remove noindex, link it from the jobs board, and announce. The private beta is what solves cold-start, so the public sees a populated, vouched product rather than an empty shell.

Trade-off accepted: this front-loads the whole backend before any external eyes. The private beta circle mitigates the risk with real feedback and seed data before public exposure. The phases below still describe the *build order*; the launch just bundles Phase 0-1 and Phase 2 into one private beta release.

---

## Phase 0-1 - Comprehensive read-only catalogue (the launch)
**Goal:** launch a broad, genuinely useful "who made what" reference from day one, so "find yourself" works immediately. No writes yet, so it stays relatively cheap (pre-generated static pages).
**Effort:** a few weeks. The seed pipeline and page generation are the work, not a backend.

Do:
- **Full seed from Wikidata (CC0)** for games, releases and studios, plus baseline credits from public credit rolls. Comprehensive, not a sample. Cache as our own records and refresh on a schedule (spec 5.1). Never live-depend at runtime.
- Generate **game pages, person pages, studio pages** under `/credits`, pre-rendered as static HTML for SEO and speed.
- **Search** across games, studios and people (a prebuilt JSON index, same technique as the jobs board's `jobs.js`), so "find yourself" works on launch day.
- **Cold-start-safe stats:** show catalogue scale ("N credits waiting to be claimed"); hide engagement counters until they are real.
- **Claim-intent capture:** every unclaimed profile has a "this is you? claim it" button that, until the backend exists, captures an email / waitlist (reuse the jobs board's email plumbing). This is the cheap validation signal that previews the north-star.
- Portal landing page live; analytics beacon on.

Measure:
- Organic search traffic ("who made X") and how deep people browse.
- Claim-intent rate: of people who find themselves, how many click claim / join the waitlist?

**Go/no-go:** healthy search traffic and real claim intent → build the backend (Phase 2). Weak signal → you still have a valuable reference and SEO asset, and you learned it before spending on the expensive part.

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
- **Email consent done right:** keep transactional email (magic link, vouch notices) separate from marketing; add a separate unticked opt-in for product updates; include unsubscribe and a privacy policy; store a marketing-consent flag plus timestamp. See `CREDITS_SPEC.md` section 11 for the full guidance.
- **First value-back features (do not defer as polish):** the claim-completion bar, the gameography aggregate, and the missing-credits nudge. These are what move credits-claimed-per-user, so they belong here, not "later." See spec Section 13.

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
- Remaining value-back features: studio alumni pages, the shareable credit card, subtle milestones, and the "who worked together" aggregate (including the jobs-board "N currently hiring" count). See spec Section 13.
- Portal polish, mobile passes.

---

## Sequencing notes
- Phase 0-1 (the comprehensive read-only catalogue) is static and relatively cheap; it launches as a useful reference and de-risks the expensive backend.
- Phase 2 is the real commitment (database + API) that enables claiming. Ship it close behind the catalogue launch, informed by the claim-intent signal.
- Everything from Phase 2 on runs on Cloudflare's free tier for a long time; the only likely cost is Workers Paid at about $5/month once you outgrow the free limits, which means success.
- Keep the honesty rules and the no-live-dependency rule in every phase.

---

## Will build / Won't build

**Will build** (these are the product):
- The catalogue (games, releases, credits, people), seeded and kept current.
- Dev-controlled claiming, the three-way attribution, and same-release peer vouching.
- The value-back / identity layer: completion bar, gameography, missing-credits nudge, shareable credit card, studio alumni pages, subtle milestones, the "who worked together" aggregate.
- Open data and export.

**Won't build** (at least not now, and deliberately):
- **Messaging / DMs.** Huge moderation burden, little value. This is the deferred contact layer (spec Section 14).
- **Per-person "open to networking / contact me."** Same contact-layer concern; the aggregate "N currently hiring" is fine, the per-person outreach is not.
- **Skill endorsements (LinkedIn-style).** Nobody trusts them. Our trust signal is per-credit peer vouches from people who shipped the same release, which is meaningfully different.
- **Hosted resumes.** Everyone already has one; the gameography and share card cover the real need.
- **A generic social feed.** Every startup adds one; nobody wants another feed.

## Decisions made

1. **Launch comprehensive, not thin-slice, and be aggressive on the value-back layer.** Come out of the gate with the full Wikidata-seeded catalogue so "find yourself" works from day one, and ship the shareable credit card and other viral pieces early rather than deferring them. This reshaped the phasing above (Phase 0-1 is now a comprehensive read-only launch, not a sample).
2. **Homepage headline: blend.** Keep a punchy headline and make the subhead hammer ownership and legacy harder, rather than replacing the current line. A/B once public. Applied to the homepage lede.
