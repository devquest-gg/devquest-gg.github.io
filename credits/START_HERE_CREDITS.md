# DevQuest Credits - START HERE (catch-up brief)

**Read this first.** It is the quick brief so a new chat, or you on a new machine, can pick up exactly where we left off. Then read `CREDITS_SPEC.md` for the full design and `CREDITS_ROADMAP.md` for the build order.

## What this is
A planned second product for DevQuest: an opt-in, dev-controlled **game credits database**, to live at `devquest.gg/credits` alongside the jobs board. Think "the credits record games actually deserve," where the person who did the work owns and corrects their own page and colleagues vouch for it. See `../START_HERE.md` and `../DEVQUEST_HANDBOOK.md` for the jobs board it sits next to.

## Status (as of the last working session)
- **Concept:** complete and fully mocked. Not yet built.
- **Design decisions:** all made and documented in `CREDITS_SPEC.md`.
- **Mockups:** in `mockups/`. The main one is `prototype-credits.html`, a single clickable prototype with real navigation across every screen (home, studio, game timeline, find your name, claim, profile, edit, vouch, add-a-release, account recovery). The other five files are higher-detail single-topic mockups.
- **Next real step:** Phase 0 validation thin-slice (see roadmap). Nothing is built yet.

## The idea in five bullets
- A **credit attaches to a specific release/milestone** of a game (base game, PC port, remaster, DLC, live-service season), not the bare title. This captures situations existing systems cannot, like joining after launch and only working a port.
- **Claiming is frictionless:** find your imported name, verify one email (magic link), edit forever. No passwords, no account wall.
- **Peer vouches** provide trust: only a claimed credit-holder on the same release can vouch for a colleague, one click, no operator refereeing.
- **Adding releases/games is dedup-guarded:** match-before-create, structured fields, generated canonical key, community-added-until-vouched. Avoids the "seventeen spellings of one tag" problem.
- **Honesty brand, shared with the jobs board:** imported facts marked as imported, self-added items labelled, vouches shown as counts not verdicts, open/exportable data.

## Key decisions already locked
- **Catalogue first, network later.** Build the credits catalogue; the contact/messaging "professional network" layer is a separate, later, higher-moderation decision. Out of current scope. Note: "network later" means the *contact/messaging* layer only. The identity/reputation value layer (profiles, vouches, gameography, completion bar, alumni pages, share cards) is built **early** because it drives retention. Three layers: catalogue, identity, contact (spec Section 14).
- **Attribution is three-way, not binary:** Credited / Special Thanks / Uncredited (how the game credits you), kept separate from role (what you did). Handles gray areas like a late joiner in Special Thanks (spec Section 4, 5.3).
- **North-star metric: credits claimed per user.** One-and-done claiming = weak product; 8 to 20 claims per user = a lasting one. Prioritise the value-back features (spec Section 13) that move it.
- **Launch all-in as a private beta.** Come out of the gate with the full v1 (comprehensive Wikidata-seeded catalogue + claiming + core value-back, including the shareable credit card). Release it privately first: BETA tag on the page, noindex, unlinked from the jobs board, seeded via the founder's personal network (invite clusters who shipped the same games together, so vouching works). Go public after roughly one to two weeks. See the roadmap "Launch plan" section.
- **Full pages, not drawers,** for game and person views (SEO + shareability). The studio *drawer* stays on the jobs board.
- **Seed from Wikidata (CC0),** not IGDB (whose free tier is non-commercial and restricts caching). Import once and cache; never live-depend on a third party.
- **Backend is Cloudflare Worker + D1 (SQLite).** Free tier covers launch; about $5/month only if it takes off.
- **One unified timeline visual** for both box-product milestones and live-service eras.
- **Ownership is a rotatable key, not a permanent deed:** re-claim and recovery work via peer vouches plus work-email domain match, with a cool-down and old-email veto.

## How to resume in a new chat
1. Open a Cowork project on this folder (`...\Desktop\Claude\GameDevPostings`).
2. Say: "Read START_HERE.md and DEVQUEST_HANDBOOK.md for the jobs board, then credits/START_HERE_CREDITS.md, credits/CREDITS_SPEC.md, and credits/CREDITS_ROADMAP.md for the credits system."
3. Open `credits/mockups/prototype-credits.html` in a browser to see the concept.

## Files in this folder
- `START_HERE_CREDITS.md` - this file.
- `CREDITS_SPEC.md` - full specification (data model, mechanics, architecture, UI, cost, licensing, longevity).
- `CREDITS_ROADMAP.md` - phased build plan with go/no-go gates.
- `mockups/prototype-credits.html` - the main clickable prototype.
- `mockups/mockup-credits-portal.html` - the portal landing page concept.
- `mockups/mockup-credits-pages.html` - game page and person page (find-your-name, before/after claim).
- `mockups/mockup-credits-edit.html` - edit view and account/recovery.
- `mockups/mockup-credits-releases.html` - release model and the add-without-duplicates flow.
- `mockups/mockup-credits.html` - the My Credits hub, editor, vouch, and studio-drawer integration (earlier catalogue-first pass).
