# DevQuest — Passive Email Capture & Alerts

**Goal:** Collect emails without forcing accounts, and send job alerts automatically — so that once it's set up, it runs with **zero ongoing work** from you. The scraper updates the jobs, and emails go out on their own.

---

## The core idea

Your site is **static** (no backend, near-zero hosting cost). That's good — we keep it. But a static site can't store emails or send mail by itself. So the system is split into three jobs, each handled by a piece that runs on its own:

1. **Capture** — a form on the site hands the email to an email service.
2. **Storage + compliance** — the email service (ESP) holds the list, confirms addresses, and handles unsubscribes.
3. **Sending** — new jobs flow to the ESP automatically, and it emails subscribers on a schedule.

The "passive" magic is in step 3: we connect your job data to the ESP so neither of us ever hits "send" manually.

---

## What you need (one-time setup)

### 1. Pick an email service provider (ESP)
This is the engine. It stores addresses, sends mail, and handles legal compliance for you. Pick one with: a **free tier**, **double opt-in**, **unsubscribe built in**, and **RSS-to-email** (this is what makes sending automatic).

Good fits: **MailerLite**, **Beehiiv**, **Buttondown**, or **Mailchimp**. (I can do a side-by-side when you're ready to choose.)

### 2. Create the account + a list
Sign up, create one "audience"/list for DevQuest. Turn on **double opt-in** (subscriber clicks a confirmation link — keeps your list clean and is legally required in many regions).

### 3. Verify your sending domain
So alerts land in inboxes, not spam. In the ESP you'll add a few DNS records (SPF/DKIM) to **devquest.gg** once you own it. One-time, ~10 minutes. *(This is the only step that touches DNS.)*

### 4. Add the capture UI to the site
This is the part I build. Two non-blocking asks:
- **A weekly-digest bar** — "New game-dev jobs, every week" → email field. No filter needed.
- **A filter-aware button** — appears once someone selects squares/sub-tags: "🔔 Email me new [Senior · Concept Art · Remote] roles." The chosen filters get saved as **tags** on that subscriber so alerts can be targeted later.

The form sends the email (+ tags) straight to the ESP via its embed code or API. The ESP auto-sends the confirmation email.

### 5. Make the jobs available as a feed
This is what lets the ESP send on its own. The scraper already produces `jobs.js`/`jobs.json`; I add one more output — an **RSS (or JSON) feed of recent jobs** — saved next to the site as a static file. No new infrastructure.

### 6. Wire up automatic sending
Two levels — start simple, upgrade later:

- **Level 1 — Weekly digest (easy, fully passive):** Point the ESP's **RSS-to-email** at your feed. It polls the feed on a schedule and emails everyone the new jobs. You build this once and never touch it.

- **Level 2 — Personalized filtered alerts (advanced):** When you set up the hourly/daily scraper on **GitHub Actions**, that same job can diff "new jobs since last run," match them against subscriber tags (e.g. everyone tagged `Concept Art`), and call the ESP's API to send a targeted campaign. Reuses automation you're already planning.

### 7. Compliance housekeeping (mostly automatic)
- A short **privacy note** + a consent checkbox on the form.
- **Unsubscribe link** in every email — the ESP adds this by default.
- Double opt-in (from step 2) covers GDPR/CAN-SPAM consent for your global audience.

---

## After setup: what runs on its own

| Piece | Runs how | Your effort |
|---|---|---|
| Job scraping | hourly/daily cron | none |
| Jobs feed | regenerated each scrape | none |
| Email capture | live on the site 24/7 | none |
| Confirmation + unsubscribe | ESP automatic | none |
| Sending alerts | ESP RSS schedule / GitHub Action | none |

**Ongoing work = essentially zero.** That's the payoff.

---

## Rough cost

- ESP free tier: typically covers your first ~500–1,000 subscribers / limited monthly sends. **$0 to start.**
- Paid tier kicks in only once the list grows (a good problem) — usually ~$10–30/mo at a few thousand subscribers.
- No added hosting cost; the feed is just another static file.

---

## Sensible build order

1. **Build now (no ESP needed):** the capture UI + the jobs feed. The form can sit behind a placeholder until you pick a provider.
2. **You do:** choose an ESP, create the list, grab the embed/API key.
3. **Connect:** drop the key into the form; turn on Level 1 weekly digest.
4. **Later:** add Level 2 personalized alerts when GitHub Actions hosting is live.

---

## Open decisions for you

- Which ESP? (I can compare MailerLite / Beehiiv / Buttondown / Mailchimp.)
- Start with **weekly digest only**, or build the **filter-aware button** in from the start?
- Launch email capture **before or after** the site goes live / domain is registered?
