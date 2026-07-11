# DevQuest Credits: Trust, Verification, and Ownership Design

Status: design, not yet implemented (except where noted as "Shipped").
Last updated: 2026-07-11.
Owner: Destin Bales.
Related docs: CREDITS_SPEC.md, CREDITS_ROADMAP.md, credits-api/README.md.

This document collects the design work from several conversations about (1) how peer
verification works, (2) how it can be gamed and what we can do about it, and (3) the
controls a person needs to own or disown what the site says about them. It is meant to
survive across machines and sessions so we can implement it deliberately.

---

## 1. Why this matters

The core promise of the credits page is: **the source of truth is the person who did the
work, and everything is opt-in and owned by the person credited.**

Today that promise is only half true. A person owns what they *claim*. They do not yet own
what other people say *about* them before they claim it, and they have no self-serve way to
correct, hide, dispute, or delete their own presence. Closing that gap is the point of this
document.

---

## 2. How the trust model works today (Shipped)

Credits and confirmations:

- A person signs in (passwordless magic link) and claims a credit on a game. That credit is
  theirs.
- A claimed teammate on a game can attribute an **unclaimed** teammate: a name plus a role,
  stored in `pending_credits` with `added_by` pointing at the attributor. To attribute
  someone you must already hold a claimed credit on that same game.
- A claimed teammate can **confirm** (peer-vouch) another person's credit on a game they both
  shipped. Confirmations live in `vouches (credit_id, voucher_id)`.
- Confirmations can also accrue on an *unclaimed* attribution, in `pending_vouches
  (pending_id, voucher_id)`. When the named person finally claims, those confirmations
  transfer onto their real credit, and the original attributor counts as an implicit first
  confirmation. Transfer only keeps confirmers who still hold a credit on that game.

Display rules:

- On an unclaimed row, we show a green "Confirmed by N teammates" badge only when at least one
  peer *beyond the attributor* has confirmed. The attributor alone does not paint a badge,
  because that would just be the adder vouching for their own addition.
- Once claimed, the attributor's implicit confirmation becomes a real vouch, so a credit that
  was attributed by a colleague starts life "Verified by 1 teammate." A person does not need
  two people to be verified; being added by a real teammate gives a head start.

A useful built-in property:

- `vouches.voucher_id REFERENCES people(id) ON DELETE CASCADE`. Deleting a *person*
  cascade-deletes every vouch that person ever cast. So you cannot self-verify with a puppet
  account and then delete the puppet while keeping the badge. Removing the puppet removes its
  confirmations too.

Security posture already in place (Shipped): bearer-token auth in localStorage (not cookies,
because cross-domain), HMAC-signed stateless session tokens, magic-link email sign-in with
rate limiting, output/URL sanitization (`DQ.safeUrl`, blocks non-http(s)/mailto schemes),
and per-bucket rate limits on auth and attribution.

---

## 3. Threat model: how this gets gamed

### 3.1 Sybil / sock-puppet self-verification

The attack: create a throwaway account under a made-up name, self-attest credits for it on a
set of games, use it to attribute your *real* name on those games, then sign in as yourself
and claim. You now hold a "peer confirmation" that is really you.

Why it is weaker than it looks: the puppet must itself hold a credit on each game, and that
credit is self-attested and unverified. So the confirmation is coming from an unverified
stranger account. That is a signal we can surface rather than hide.

What we cannot do: fully prevent it. Every peer-trust system has a Sybil problem. We accept
that and design to make it costly, visible, and low-payoff.

Mitigations (deferred, see Section 6):

- Weight or label confirmations by whether the confirmer is itself peer-verified. "Confirmed
  by 1 unverified account" reads very differently from "Confirmed by 3 verified teammates."
- Detect clusters: many signups from the same IP, same email domain, or created in a tight
  time window, all vouching for each other.
- Lean on eventual studio-level verification as the real trust anchor. A confirmation from an
  account verified as belonging to the crediting studio is worth far more than a peer one.
- Keep the cascade property. Do not add a code path that preserves a vouch after its voucher
  is deleted.

### 3.2 Malicious or careless attribution about others

Someone attributes a real person on a game to embarrass them, to pad a games list, or simply
misspells the name or picks the wrong title. Today the named person has no recourse. This is
addressed in Section 4.

---

## 4. Person-side ownership: the missing controls

This is the priority. Four cases, each mapped to a concrete gap and a proposed fix.

### 4.1 Misspelled name (Partly handled today)

Scenario: a teammate adds you as "Destin Bailes" and you go to claim it.

Today: when you claim, you can edit your display name from your profile, so the misspelling is
a quick fix, not permanent.

Rough edge to fix: the rename-on-claim logic can adopt the attributor's spelling and clobber
an existing, correct profile name. Fix: only adopt the invitee name for a brand-new person who
has no display name yet. Never overwrite an established profile's name on claim. Let the person
edit their credited name explicitly if they want.

### 4.2 Named on a title you did not work on (Not handled: top priority)

Scenario: someone attributes you on a game you never touched. Your name sits publicly on that
game as "unclaimed, added by so-and-so," and you cannot remove it. Only the attributor can.

This is unacceptable for a credits product and is the most important gap to close.

The hard part: an unclaimed attribution is just a name string. The system does not know that
you are the person named until you prove identity, and names are ambiguous (many people share
a name). So a naive "not me" button is meaningless, and worse, could be used by an impostor to
scrub the real person's legitimate credits.

Proposed design ("Report / dispute an attribution"):

- Any signed-in user can **report** an unclaimed attribution with a reason: "This is me and I
  did not work on this title," "This is me and I do not want it shown," "Wrong details
  (name/role/game)," or "This is not a real person / spam."
- A report **soft-hides** the row from the public pending list immediately (pending review),
  and records who reported it and why in a `attribution_reports` table. Soft-hide, not hard
  delete, so nothing is silently destroyed and an impostor cannot permanently erase real work.
- The attributor is notified (in-app; email later) that their attribution was disputed.
- An admin (you, at launch scale) reviews the queue and resolves: remove, restore, or edit.
  As volume grows this becomes a light moderation surface, not a manual DB chore.
- Rate-limit reports per account to prevent report-spam.

This keeps the identity problem honest: we are not auto-verifying that the reporter is the
named person, we are giving people a fast way to suppress and flag, backed by human review,
without letting anyone hard-delete another person's credits on a claim of identity we cannot
verify.

### 4.3 Worked on it but want it private (Not handled)

Scenario: the credit is accurate, but you do not want the world to see it (between jobs, NDA
nervousness, personal reasons).

- If you have **claimed** it: add a per-credit `hidden` flag. The owner can hide a credit so it
  does not appear on the game page or their public profile, while still seeing it in their own
  "My credits" view. This is softer than the existing full delete and reversible.
- If it is still an **unclaimed** attribution: same path as 4.2. Report it with "I do not want
  it shown," which soft-hides it. You should not have to claim something (asserting you did the
  work) just to hide it.

### 4.4 Account deletion (Not handled)

Today there is no self-serve account deletion. Only a manual D1 delete can remove a person.

Proposed design ("Delete my account"):

- `DELETE /me`, gated behind re-authentication (fresh magic link) and an explicit typed
  confirmation. Consider a soft-delete with a grace period (deactivate now, purge after N days)
  so accidental or coerced deletions can be recovered.
- **Delete children explicitly, do not rely on D1 cascade.** Cloudflare D1 does not reliably
  run `ON DELETE CASCADE`, so the endpoint must delete each dependent row itself, in order,
  inside a batch, rather than trusting the foreign keys. The manual cleanup script
  `credits-api/cleanup-test-account.sql` (written for tearing down test accounts) is the
  reference for the exact order: pending_vouches (as voucher), vouches (as voucher), vouches on
  the person's own credits, pending_credits (added_by, see decision below), credits,
  person_emails, magic_tokens (by email), rate_limits (bucket LIKE email), then the people row.
- **Purge PII completely.** The account's email lives in three places: `people.email`,
  `person_emails.email`, and `magic_tokens.email` (plus rate_limits buckets that embed it).
  Deletion must clear all of them so no address is left behind. Verify with a SELECT across
  person_emails and magic_tokens after deleting.
- Cascade behavior needs a deliberate decision (whether or not D1 enforces it, the endpoint
  makes the same choice explicitly), because a naive full delete removes too much:
  - `credits.person_id` CASCADE: your own credits are removed. Correct.
  - `vouches.voucher_id` CASCADE: your outgoing confirmations vanish, which may un-verify other
    people's credits. This is correct for anti-gaming (puppet cleanup) but means a legitimate
    departing user removing their account also weakens teammates they vouched for. Acceptable,
    but note it.
  - `pending_credits.added_by` CASCADE: **this deletes attributions you made about other
    people.** That would erase legitimate teammate attributions just because the attributor
    left. We probably do **not** want a hard cascade here. Options: reassign `added_by` to a
    tombstone "former member" person, or null it out and keep the attribution, rather than
    delete it. Decide before shipping deletion.
  - `person_emails`, `pending_vouches.voucher_id` CASCADE: fine.
- Privacy note: deletion should actually purge PII (email addresses, tokens), not just hide the
  profile.

---

## 5. Proposed data model changes (summary)

Nothing here is built yet. Collected so implementation is mechanical later.

- `credits.hidden` INTEGER DEFAULT 0. Owner-toggled visibility. Public reads filter out hidden;
  owner reads include them with a "hidden" marker.
- `attribution_reports` table: `id, pending_id (or credit_id), reporter_id, reason, note,
  status (open/resolved/dismissed), created_at, resolved_at, resolved_by`. Drives the dispute
  queue. Soft-hide is derived from an open report (or an explicit `pending_credits.hidden`
  flag mirrored from it).
- `pending_credits.hidden` INTEGER DEFAULT 0 (or a `status = 'hidden'` value), set when a
  report soft-hides a row.
- Optional later: `people.verified_level` or a derived "is this account itself verified" signal
  used to weight/label confirmations (Section 6).

Endpoints to add:

- `DELETE /me` (account deletion, re-auth gated, soft-delete + grace period). Deletes all
  dependent rows explicitly in order (D1 cascade is unreliable) and purges the email from
  people, person_emails, magic_tokens, and rate_limits. See
  `credits-api/cleanup-test-account.sql` for the reference delete order.
- `POST /credits/:id/hide` and `POST /credits/:id/unhide` (owner visibility toggle).
- `POST /attribution/:id/report` (dispute an unclaimed attribution).
- Admin: `GET /admin/reports`, `POST /admin/reports/:id/resolve` (remove/restore/edit).
- Fix: rename-on-claim guard so claiming never overwrites an established profile name.

---

## 6. Anti-gaming, deferred but designed

Not for the first pass, but recorded so the trust model can harden over time:

- **Confirmation weighting/labeling by voucher trust.** Show whether each confirmer is itself
  peer-verified. Consider a computed trust score per credit that discounts confirmations from
  unverified or freshly created accounts.
- **Cluster detection.** Flag mutually vouching accounts sharing IP, email domain, or a tight
  creation window. Surface for review rather than auto-punish.
- **Studio-level verification.** The real trust anchor. A confirmation or credit backed by an
  account verified as belonging to the crediting studio outweighs peer confirmations. This is
  the long-term answer to "how do we know this is real."
- **Preserve the cascade property.** Deleting a person must continue to remove that person's
  outgoing vouches. Never cache or freeze a vouch such that it survives its voucher.

---

## 7. Honesty framing (keep this true in the UI and copy)

- Peer confirmations attest that colleagues agree a person participated. They do **not** prove
  the eventual claimant is truly that person. Identity rests on email verification and remains
  contestable.
- Do not overstate verification. Avoid language like "LinkedIn Verified" or "Verified" without
  qualification when the signal is a single peer or an unverified account. Prefer honest,
  specific phrasing: "Confirmed by N teammates," and later "N verified teammates."
- The system should make it easy to see *who* vouched and whether they are themselves trusted,
  rather than presenting a single opaque checkmark.

---

## 8. Suggested implementation order

1. **Fix rename-on-claim** so claiming never clobbers an established profile name (small, safe).
2. **Dispute/report an unclaimed attribution** with soft-hide plus an admin review queue
   (closes the top ownership gap in Section 4.2 and covers 4.3 for unclaimed rows).
3. **Hide a claimed credit** (`credits.hidden` + toggle) for the "worked on it but want it
   private" case.
4. **Account deletion** with re-auth, soft-delete grace period, and the deliberate
   `pending_credits.added_by` non-cascade decision.
5. **Anti-gaming weighting/labeling** once there is enough real data to tune against.

Each step is independent and shippable on its own. Steps 1–3 are the ones that make the
"owned by the person credited" promise actually true.
