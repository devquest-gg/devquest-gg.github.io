# DevQuest Credits: The Credit Model

Status: design, not yet implemented. Supersedes the colored release-pill approach in the live build.
Last updated: 2026-07-11.
Owner: Destin Bales.
Related: CREDITS_SPEC.md, CREDITS_TRUST_AND_OWNERSHIP.md, CREDITS_ROADMAP.md.

This document defines how a single credit is captured and displayed: roles, scope (the
asterisk), releases and expansions, and the page framing that makes the whole thing read as
legitimate rather than as a scraped list. It is the outcome of a long design conversation and
several rounds of mockups.

---

## 1. Philosophy

The goal is legitimacy. A DevQuest credit should feel like a real, defensible statement of
what you did, not a soft self-description. But legitimacy here does not come from imitating a
film credit's static authority. It comes from two things a scraped credits list can never
offer: the credit is owned by the person, and it is verified by the teammates who were
actually there.

Film credits are simple because film roles are simple: one title, you worked on it or you
didn't. Games are built over years by people whose roles change, across ports, expansions, and
live-service eras. So a video-game-native credit is more legitimate when it represents that
reality accurately than when it flattens a decade of work into a single title. The design
below is the balance: closer to a film credit than a résumé bullet (a clean, verified
statement of who worked on a game), but flexible where games genuinely need it.

## 2. Principles

These constraints drove every decision and should survive future changes.

Lightweight by default. The required claim is: your name, your email, check your roles. That
is the whole mandatory flow. Everything else is optional and hidden until asked for. If
claiming ever feels like filling out LinkedIn, engagement dies.

Honesty from framing plus one optional switch, never from mandatory metadata. The default
credit, with nothing extra filled in, must already be honest. We do not force anyone to enter
dates, scopes, or details to avoid misrepresenting themselves.

The base game is the unmarked default. Most people worked on "the game." Their credit shows no
qualifier at all. Only genuinely narrower work (a port only, an expansion only, live-service
only) gets a single mark. A page where most rows carry no tag is both cleaner and more
consistent, because the common case requires no decision and therefore can't be done
inconsistently.

Detail lives on the profile, not the shared page. The game page is a scannable list; the
person's profile is their résumé. The same credit shows compressed on the game page and
detailed on the profile.

Consistency from shared vocabularies, not free text. Roles and releases are picked from
canonical lists (seeded and, for releases, per-game and growing), not typed fresh every time.

No mandatory dates. We deliberately rejected per-credit date ranges. They add visual noise and
setup friction, and the honesty they buy is better achieved by the role set plus framing. See
Section 9 for what we dropped and why.

## 3. What a credit contains

Fields on a credit:

- Identity: the person (anchored by verified email) and their display name.
- Roles: a set of roles the person held on this title, with one marked as the headline. Stored
  today as `role` (headline) plus `roles_other` (the rest). Keep this shape.
- Scope: `base` or `partial`. `base` is the default and shows nothing. `partial` means the
  person did not work on the base game (only a port, an expansion, or the live-service era) and
  drives the asterisk. New field, see Section 6.
- Releases and expansions: an optional list of named parts the person worked on (ports,
  expansions, updates). Stored today as `release_tag`. Reframe as a picked list, see Section 7.
- Verification: peer vouches (existing). The green seal.
- Proof links: optional self-provided evidence (existing).

No date fields. No per-role dates.

## 4. The claim form

The form embodies the "lightweight by default" principle. Order:

1. Your name, as it should be credited.
2. Your email.
3. Roles you held on this title. A search field over a canonical role list (see Section 5),
   not a checklist, because the industry has hundreds of role titles. You add as many as apply
   as chips. A star on one chip marks the headline role (this replaces a separate "show first"
   dropdown). If your exact title isn't listed, you can add your own.
4. Add detail (collapsed by default, optional, most people skip it). When expanded it contains
   exactly two things:
   - What did you work on? A two-option choice:
     - "The base game (including if you also worked on expansions, ports, or live service)" —
       the default, no asterisk.
     - "Only a specific part, not the base game (a port, an expansion, or the live-service
       era)" — this sets `scope = partial` and adds the asterisk.
     The wording matters: "both" (base game plus a part) is unambiguously the first option. The
     asterisk exists only to stop someone who did *only* a part from appearing to have shipped
     the whole game.
   - Expansions or content you shipped. An optional picked list (see Section 7), shown on your
     profile as accomplishments. This is separate from scope on purpose: you can ship
     expansions and still have done the base game, so naming expansions must not force an
     asterisk.
5. Proof links (optional).
6. Save my credit.

## 5. Roles: the canonical list

The problem: the industry has hundreds of role titles, so a fixed checklist is impossible, but
pure free text produces thousands of near-duplicates ("Sr. Producer", "Senior Producer",
"Sr Producer").

The approach:

- A curated canonical role list, seeded by us, grouped by discipline (Production, Design,
  Engineering, Art, Audio, Narrative, QA, Production Management, Leadership, and so on). This is
  the typeahead source.
- The claim form searches this list. Selecting a canonical role is the happy path and keeps
  everyone consistent.
- Add-your-own is allowed but funnels through light moderation: the credit saves immediately
  with the typed role (never block the user), and the new role string enters a review queue. A
  moderator either promotes it into the canonical list or merges it into an existing role
  (normalizing the person's credit to the canonical spelling). This keeps the list from
  ballooning while never blocking a legitimate niche title.
- Light client-side normalization on entry (trim, collapse whitespace, common abbreviation
  expansion) catches the most obvious duplicates before they're even created.

Data: keep role strings on the credit (`role` + `roles_other`) as today. Add a `roles`
reference table for the canonical list and a small moderation queue for pending additions.

## 6. Scope and the asterisk

Semantics. `scope = partial` means: this person did not work on the base game; they worked only
on a specific part (a port, an expansion, or the live-service era). `scope = base` (default)
means they shipped the base game, with or without also doing expansions, ports, or live
service.

Why one flag and not dates. It is the minimum that prevents the real harm (someone who did only
the PC port appearing to have made the whole game) at the cost of a single optional radio
choice. It is coarse on purpose. Anyone who wants precision can name the specific part in the
releases list.

Display. The asterisk attaches to the credit's primary link, consistently:
- On a game page (a list of people), the asterisk sits on the person's name: "Colin Hicks *".
- On a profile (a list of games), it sits on the game's title: "Days Gone *".
Both anchor to "the credit" viewed from the two directions. Hover text is a short, generic
phrase drawn from the releases if present ("Worked on the PC port, not the base game") or a
default ("Worked on a specific part, not the base game").

The role-tenure case (important). A person who shipped the base game but grew into their
headline role later (Destin on Dark Age of Camelot: on the team from before release, but not
producer until years in) does NOT get an asterisk, because they did work on the base game. That
misrepresentation is handled instead by Section 8's rule that the full role set is shown and
the page is framed as roles held across the title's life, so "Producer" reads as a role held at
some point, not the launch title.

## 7. Releases and expansions

An optional list of named parts a person worked on. Sources, in order of reliability:

- Ports and platforms: the catalogue (Wikidata property P400) reliably lists every platform a
  game shipped on. This is the one dimension the catalogue does well, so the port/edition picker
  can be seeded from real data. (Verified 2026-07-11 against Fortnite and No Man's Sky: full
  platform lists present.)
- Expansions and content: the catalogue is unreliable here. Most expansions are not modeled
  (No Man's Sky's decade of named updates: zero entries; Dark Age of Camelot's expansions and
  City of Heroes' Going Rogue: absent). So expansions are a community-built, per-game shared
  list: the first person to add "Trials of Atlantis" to a game creates a token that everyone
  else on that game then picks from (typeahead plus dedupe). The catalogue seeds this list only
  where it happens to have data.
- Live-service / post-launch: the catalogue has nothing (confirmed). This is not a release
  token at all; it is covered by the scope asterisk ("only the live-service era") rather than by
  a named entry.

Expansions do not get their own game page. One game, one page. An expansion is a named
attribute on a person's credit, not a separate entity. Reasons: the catalogue rarely models
them, separate pages would scatter a game's team across many thin pages, and someone who worked
only on an expansion still wants to be found on the main game's page (asterisked, hover names
the expansion). A heavily-credited expansion could be promoted to its own page later, but that
is a rare exception, not the default.

Data: keep the per-credit `release_tag` list. Back the picker with the distinct release labels
already used on that game plus catalogue platform names. A dedicated `game_releases` table can
come later if the per-game vocabulary needs its own moderation.

## 7b. Capacity: outsourced and external contributors (Shipped)

Not everyone who worked on a game was core staff at the crediting studio. Outsourced artists,
external vendors, and co-development partners are exactly the people most often left off
official credits, so a developer-owned record is one of the few places they can be recognized.

The lightweight treatment (deliberately not LinkedIn): a single self-reported checkbox, "I
worked on this as an outsourced or external contributor," next to the live-service checkbox.
There is no employer or studio field; we do not ask people to enter where they worked. One flag
covers both the outsourcing-vendor case and the (announced) co-developer case.

Storage reuses the release mechanism, so no schema change: the checkbox stores an "External
contributor" token in `release_tag`, which the existing classifier maps to the `xdev` class
(the classifier already recognized outsource / co-dev / external / support-studio terms). On
display, the capacity is pulled out of the "worked on" list and instead reframes the sentence:
"Worked as an outsourcer on Mac Port, the live-service era," or just "Worked as an outsourcer"
when there are no named parts. Capacity describes the whole credit, not a single item, and it is
independent of scope: an outsourced artist who did a slice of the base game stays scope=base (no
asterisk) with the capacity carrying the nuance.

Verification caveat (open): peer vouching assumes the confirmer is on the game's credit list and
recognizes you. Outsourcers and uncredited support often worked alongside their vendor's team,
not the lead studio's staff, so they are the hardest to verify and the current model does not
solve that well. A future step is to surface the confirmer's own studio ("verified by 3
teammates at [vendor]") and weight confirmations by whether the confirmer is themselves verified
(see the anti-gaming note in CREDITS_TRUST_AND_OWNERSHIP.md).

## 7c. NDA and unannounced work (Shipped: a reminder; deferred: tooling)

Risk: someone claiming work on a title at a studio whose involvement was never announced could
breach an NDA or expose a confidential partnership, and a reporter scraping the site could treat
an un-announced co-dev name attached to a big title as a scoop. Rare, but asymmetric: if it
happens once it is a bad headline with DevQuest's name in it.

Proportionate response (shipped): one muted line of helper text on the claim and edit forms,
near submit: "Only add work you're free to disclose. Leave off anything under NDA or not
publicly announced." This puts the obligation where it legally already sits (on the person),
signals reasonable care, and costs one sentence. The dispute-and-remove path in
CREDITS_TRUST_AND_OWNERSHIP.md handles the rare takedown.

Deliberately deferred: a "claim it without naming the title or partner" flow. That is a lot of
complexity for a rare case; the reminder plus takedown covers the realistic risk for now.

## 8. Display rules by surface

Game page (a list of people who worked on the game):

- A framing line at the top (Section 9).
- Alphabetical by last name, signed-in user floated to top. No hierarchy implied.
- Each row shows the person's name, then their full role set: the headline role, then "· also
  X, Y, Z" for the rest, shown rather than collapsed behind "+N more". Showing the set is what
  makes "Producer" read as a career on the title instead of the launch producer.
- The asterisk, if any, sits on the name.
- The green verified seal, if any, sits after the name.
- Base-game contributors with a single role and no scope show just name and role. The list
  stays sparse.

Profile (a list of games the person worked on):

- Each row shows the game title (with asterisk and seal as applicable), then the role set the
  same way as the game page.
- Named expansions appear on their own quiet muted line ("Also shipped: Shrouded Isles, Trials
  of Atlantis, New Frontiers, Catacombs"), since this is the résumé and the detail belongs here.
- No dates anywhere.

Verification seal: a solid green check after the primary link (name on game page, title on
profile), hover shows "Verified by N teammate(s) who shipped this game". Already shipped.

## 9. Framing copy

The game-page framing line carries real weight now: it must read as a credential, not a
disclaimer. Proposed wording:

> A developer-owned, peer-verified record of who made this game. Roles reflect each person's
> full time on the title, not a single moment. Listed alphabetically.

The point is to state what makes this more trustworthy than a scraped list (owned, verified,
accurate to how games are actually made) rather than to weaken the credit. Exact wording is
still open for a pass.

## 10. What we deliberately did NOT do, and why

- Mandatory date ranges / timeframes on credits. Rejected: visual noise plus setup friction,
  the LinkedIn trap. The role set plus framing achieves the honesty more cheaply.
- Per-role dates ("Producer from 2005"). Rejected for v1 for the same reason; revisit only if
  users ask.
- Colored release pills (green live, blue port, purple expansion). Rejected: the rainbow was
  the main source of visual noise and clashed with the green verified seal.
- Plus / plus-plus markers for "base plus extras". Rejected: base game is already the unmarked
  default, so a "+" reintroduces a decision for the majority, and "++" quantification is
  arbitrary and cryptic.
- Expansions as separate game pages. Rejected: fragments the team, and the catalogue can't feed
  it anyway.

## 11. Schema changes (proposed)

- `credits.scope TEXT NOT NULL DEFAULT 'base'` with values `base` | `partial`. Drives the
  asterisk. Public reads return it; the map exposes a boolean like `partial: r.scope ===
  'partial'`.
- `roles` reference table (id, label, discipline, status) for the canonical role list, plus a
  small moderation queue for add-your-own submissions. Credits keep storing role strings.
- Optional later: `game_releases` (game_slug, label, source) if the per-game release vocabulary
  needs first-class moderation. Not required for v1; typeahead can read distinct existing
  `release_tag` values plus catalogue platforms.
- No new date columns.

Migration discipline reminder (from prior work): run any migration BEFORE redeploying the
worker, or reads hit missing columns and 500.

## 12. Build order

1. Display-only changes first, using data we already have: game-page framing line, show the
   full role set instead of "+N more", move the asterisk to the primary link, keep the green
   seal. Low risk, immediate readability win.
2. Add `scope` (migration + form radio with the reworded options + asterisk wiring end to end).
3. Role search field backed by a seeded canonical list, with add-your-own funneling to a
   moderation queue.
4. Release/expansion picker: per-game typeahead seeded by catalogue platforms and existing
   labels, with dedupe.
5. Revisit finer options (per-role dates, promoted expansion pages) only if real usage asks.

## 13. Open questions

- Exact wording of the framing line (Section 9).
- Whether the full role set should ever re-collapse for people with many roles (say more than
  four), or always show in full.
- The seed contents of the canonical role list (which disciplines and titles to ship with).
- Whether "partial" should optionally capture which kind of part (port vs expansion vs live)
  as structured data, or leave that entirely to the free releases list.
