# Go-live runbook — tourconnectt.com

Do these in order. Steps 1–5 are required; 6–8 can follow the launch.

---

## 1. Set the production environment variables

In **Vercel → Project → Settings → Environment Variables**, scope everything to
**Production**. `.env.local` is git-ignored and only drives local development —
changing it does nothing for the deployed site.

### These must be correct or things break silently

| Variable | Value | If it is wrong |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://tourconnectt.com` | Every email link and the WiPay return URL point at localhost |
| `GOOGLE_REDIRECT_URI` | `https://tourconnectt.com/api/google/calendar/callback` | Operator calendar connection fails |
| `WIPAY_ENVIRONMENT` | `live` to take real money, `sandbox` to rehearse | `sandbox` takes no real payments |

No trailing slash on `NEXT_PUBLIC_APP_URL`.

### Copy across from `.env.local` unchanged

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`,
`OPENAI_API_KEY`, `GROQ_API_KEY`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`WIPAY_DEVELOPER_ID`, `WIPAY_BUSINESS_KEY`, `WIPAY_CURRENCY`,
`WIPAY_COUNTRY_CODE`, `WIPAY_API_BASE_URL`.

### Not yet set anywhere — generate fresh values

`CRON_SECRET`, `ICAL_FEED_SECRET`, `GOOGLE_OAUTH_STATE_SECRET`,
`INQUIRY_RATE_LIMIT_SECRET`, `CONCIERGE_IP_SALT`, and
`ADMIN_NOTIFICATION_EMAIL` (an address you actually read).

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`CRON_SECRET` is the one that matters most: without it the scheduled-email and
calendar-sync endpoints return 401 and reminders never send.

---

## 2. Point Google OAuth at the live domain

**Google Cloud Console → APIs & Services → Credentials → your OAuth client.**

- Authorised JavaScript origin: `https://tourconnectt.com`
- Authorised redirect URI: `https://tourconnectt.com/api/google/calendar/callback`

This must match `GOOGLE_REDIRECT_URI` exactly. See `GOOGLE_OAUTH_SETUP.md`.

Also add `https://tourconnectt.com/**` to **Supabase → Authentication → URL
Configuration → Redirect URLs**, and set the Site URL to the live domain, or
email confirmation and password reset links will bounce.

---

## 3. Apply database migrations

```bash
npm run db:migrate:status   # what is applied, what is pending
npm run db:migrate          # apply anything pending
```

Safe to run on every deploy — applied migrations are skipped. Each file runs in
a transaction with its ledger row, so a failure rolls back rather than leaving
the schema half-migrated.

The production database is already baselined and current (36/36 applied), so
this is a no-op today. It exists so the next migration is one command, not a
manual paste into the SQL editor.

> `npm run db:baseline` records every file as applied **without running it**.
> Only for a database that predates this script and is already up to date.
> Several early migrations insert seed rows, so replaying them would duplicate
> data — `db:migrate` refuses to run against a populated database with an empty
> ledger for exactly that reason.

---

## 4. Categorise the live listings

`/Experiences` filters by category, and no listing has one yet, so every
category chip reads `0` and filters to nothing.

For each of the 4 live listings: **Operator portal → Listings → edit → set
Island and Primary Category**, then save. Both are dropdowns.

Island is already backfilled correctly (2 Trinidad, 2 Tobago) — only category
is blank.

---

## 5. Deploy and smoke test

Push the branch, merge, and let Vercel build. Then walk these as a real visitor,
on a phone as well as a laptop:

- [ ] `/` — headline reads "Trinidad and Tobago, planned the easy way", and the two buttons work
- [ ] `/Experiences` — island and category filters return the right counts
- [ ] Open one listing — operator is named, price shows **per person**
- [ ] "Enquire" as a **signed-out** visitor — completes with just an email, no signup wall
- [ ] The enquiry arrives by email, and appears in the operator portal
- [ ] Concierge → "Send this to an operator" — the plan carries into the form
- [ ] Admin and operator sidebars: correct labels, no duplicate buttons
- [ ] A card payment end to end, if `WIPAY_ENVIRONMENT=live`

---

## 6. Confirm the crons are running

`vercel.json` schedules two jobs:

| Path | Schedule |
|---|---|
| `/api/cron/send-scheduled-emails` | hourly |
| `/api/cron/google-calendar-sync` | every 30 minutes |

Vercel sends `Authorization: Bearer $CRON_SECRET`, which is what the routes
expect. After the first deploy check **Vercel → Project → Cron Jobs** for a
200. A 401 means `CRON_SECRET` is missing or differs.

Trigger one by hand:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://tourconnectt.com/api/cron/send-scheduled-emails
```

---

## 7. Known gaps, not blockers

- **Icon font is 725 KB.** Icons no longer flash as words, but it is still the
  heaviest asset. Fixing it properly means subsetting the font at build time or
  moving the remaining icons to inline SVG.
- **Hero video is low-resolution.** Nothing is downscaling it — the source file
  is soft, and it is stretched full-bleed. Re-upload at 1920px wide or greater.
  On phones and metered connections the video is skipped entirely.

---

## 8. Rollback

Vercel keeps every previous deployment: **Deployments → the last good one →
Promote to Production**.

The browse migration is additive — it adds columns and never drops data — so an
older build runs fine against the migrated database. Its reads fall back to the
pre-migration column set.
