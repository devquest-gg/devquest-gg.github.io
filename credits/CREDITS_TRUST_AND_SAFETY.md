# DevQuest Credits: Trust, as Evidence

*How we handle credibility, in one idea: we don't claim a credit is true, we show the evidence behind it and let the reader decide. This replaces the earlier "verification / weighted trust graph" thinking, which was solving for a threat the industry's own transparency already handles, and which users would never understand.*

## The stance in one sentence

DevQuest never says a credit is "verified." It shows **how much evidence stands behind each credit, and exactly who provided it**, so a recruiter can judge it the way they already judge a résumé: by looking at the receipts.

## Why "evidence," not "verification"

The moment you stamp a credit "verified," you've promised omniscience, and invited everyone to try to disprove you. That's an unwinnable game, and it's the wrong game. No purely social system can be made un-gameable; that's a mathematical fact, not a gap in our design. So we stop playing it. We don't assert truth; we present evidence and grade it. "Confirmed by four teammates" is a claim we can always defend. "Verified" is not.

This also happens to be the honest description of what we actually are. MobyGames is legitimate because it's centralized: "trust us, we have the official credits." Our opportunity is the opposite strength: **credits backed by peers, not just publishers.** We're the answer to the question MobyGames can't answer, "what happens when the official credits are wrong, or missing?" That's the entire moat, and leaning into transparency rather than certainty is how we defend it.

We also stopped leading with the word "trust." The public-facing page is "How credit evidence works," not "How credits earn trust." Trust implies we're the ones deciding what's true. We're not. We're the place the supporting evidence lives.

## The evidence ladder

Every credit sits at one of three levels, computed from things we already track:

- **Awaiting confirmation** — the developer entered it; no teammate has confirmed it yet. Every credit starts here, and it's shown plainly, not hidden. (We deliberately renamed this from "self-reported," which read as faintly accusatory. "Awaiting confirmation" describes a step that hasn't happened yet, not a claim nobody believes.)
- **Peer-confirmed** — one teammate who shipped the same game confirmed it.
- **Team-confirmed** — several teammates confirmed it.

No score, no percentage, no reputation number. A level, and the count behind it. Higher on the ladder means more people put their name to it, nothing more; it does not decide whether a credit is "true."

## Officially corroborated is a separate badge, not the top rung

An earlier draft made "Officially corroborated" the top of the ladder. That was a mistake: it accidentally re-elevated the exact official systems we exist to correct, and implied team-confirmed credits were second-class. So corroboration by an authoritative source (the game's published credits, etc.) becomes a **separate badge that can sit beside any level**, not a rung above them. It says "the official record agrees too," not "this finally counts." Peer and team confirmation stand on their own. This is a future signal, and it's the growth story, not a launch requirement.

## The one interaction that carries the weight

The badge is a summary; the substance is one click away. Clicking any credit's evidence badge shows **the actual people who confirmed it**, each with their name, role, and how many credited titles they hold:

> Confirmed by teammates who shipped this game:
> • Sarah Chen — Senior Producer · 12 credited titles
> • Mike Jones — Gameplay Engineer · 8 credited titles
> • Ashley Smith — Technical Artist · 15 credited titles

That list is the whole anti-fraud mechanism, because it makes gaming *visible* instead of trying to make it *impossible*. "Confirmed by 6" from six veterans with deep histories looks nothing like "confirmed by 6" from six blank week-old accounts, and the difference is right there on the page. A fake can only ever reach the weak, thin-looking end of the ladder; real work visibly earns the strong end. We don't have to weight anything, the reader weights it in a glance.

## Why a confirmation isn't just an anonymous like (the recursion answer)

The obvious skeptic's question is: "how do you know *they* actually shipped the game?" The answer is that a confirmer is not an anonymous vote. **Every confirmer appears on this same public credits graph, with their own work history you can open and inspect.** The recursion doesn't have to bottom out in a single certificate of truth; it bottoms out the way references on a résumé do, in named people whose own record is right there to check. That's the sentence to reach for whenever someone raises the "someone would notice / but what if nobody notices" objection: not "the industry is small," but "the confirmers are real, named, and inspectable."

## What about the official credits (the MobyGames question)

Everyone asks it, so we answer it before they do. Official credits are valuable, and we show them. But they aren't complete: people get left off for reasons that have nothing to do with their work (layoffs, contractor policies, studio rules, credit-cutoff dates, plain mistakes), and a centralized database inherits every one of those gaps. DevQuest records **both** the official credits and the peer-confirmed contributions, so a developer's work doesn't vanish when an official system omits it. And that's precisely why corroboration is a side-badge, not a higher truth: when Riot, Ubisoft, or Insomniac leaves someone off, the peer record is the one that's right.

## Why this is enough (the threat model, honestly)

We are not trying to make fraud impossible; no social system can. We are making it **visible and costly**. A confirmation is public, named, and staked on the confirmer's own reputation, and only someone who also shipped the game can give one. So a fabricated "Lead Designer, God of War" isn't beating an algorithm, it's asking hundreds of named people who were actually there, plus every recruiter who knows them, to not notice, in public, on the record. The fakes that survive tend to be on obscure, tiny, or old projects, which are exactly the places official credits are already missing, so even a survived fake is low-stakes and we're still adding value versus the alternative (nothing). Building heavy anti-fraud machinery for a coordinated attack that transparency already deters would be over-engineering a credits website into a trust-and-safety company.

## What we deliberately do NOT build

- No "verified" checkmark or any single binary badge that claims truth.
- No trust scores, reputation numbers, or weighted graphs.
- No field-by-field challenge system ("you worked on it but not as Lead").
- No reputation penalties or appeal workflows.
- No four-tier ladder that ranks "official" above "peer" — corroboration is a side-badge, not a summit.
- No explainer page full of flowcharts — the confirmer list explains itself; the one-page "how evidence works" is all that's needed.

## The one control we keep, because we already have it

A **report** button. Anyone can flag a credit; a reported credit shows **"under review"** until a moderator rules, and nothing is silently removed. That existing flow is our entire dispute mechanism. It covers the rare bad actor without a new subsystem.

## How the levels are computed

- Awaiting confirmation: zero confirmations.
- Peer-confirmed: one confirmation from someone who holds a credit on the same game.
- Team-confirmed: two or more such confirmations.
- Under review: the credit has an open report.
- Officially corroborated *(future, separate badge)*: matches an authoritative external credits source. It accompanies whatever level a credit already has; it does not replace or outrank it.

## The line for the skeptics

*We don't verify credits, we show the evidence behind them: who confirmed you worked on a game, and who they are. It's peer-backed, not publisher-backed, and every confirmation is a real named person whose own record you can check. Judge it like you'd judge a résumé, except here the references are already attached.*
