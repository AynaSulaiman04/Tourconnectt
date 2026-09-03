# TT Connect Tourism Platform

TT Connect is a tourism discovery and inquiry platform for travelers, operators, and admins. Travelers browse listings and submit inquiries. Operators manage listings, customers, documents, and calendar connections. Admins review listings, monitor inquiries, and manage platform activity.

## Tech Stack

- Next.js 16
- React 19
- Supabase Auth
- Supabase Database
- Supabase Storage
- Supabase SSR helpers
- Nodemailer SMTP
- Google Calendar API
- PDF and Excel export libraries
- Material Symbols and the existing project design system

## Environment Setup

Create or update `.env.local` with placeholders like these:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
DIRECT_URL=

SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_APP_PASSWORD=
SMTP_FROM=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/calendar/callback

WIPAY_ACCOUNT_NUMBER=
WIPAY_API_KEY=
WIPAY_WEBHOOK_SECRET=
WIPAY_API_BASE_URL=https://tt.wipayfinancial.com/plugins/payments/request
WIPAY_ENVIRONMENT=sandbox
WIPAY_CURRENCY=TTD
WIPAY_COUNTRY_CODE=TT

NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=
ICAL_FEED_SECRET=
```

Notes:
- Keep all secrets in `.env.local`.
- Do not commit real credentials.
- Google Calendar works only after OAuth is configured in Google Cloud.

## Google Calendar OAuth Local Setup

1. In Google Cloud Console -> APIs & Services -> Credentials -> OAuth Client ID:

   Authorized JavaScript origins:

   - `http://localhost:3000`

   Authorized redirect URIs:

   - `http://localhost:3000/api/google/calendar/callback`

2. In `.env.local`:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/calendar/callback
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. For production:

   Authorized JavaScript origin:

   - `https://your-domain.com`

   Authorized redirect URI:

   - `https://your-domain.com/api/google/calendar/callback`

4. Warning:

   - The redirect URI must match exactly.
   - Do not add or remove a trailing slash.
   - Do not mix `localhost` and `127.0.0.1` unless you also update the Google Cloud Console values to match.

## Installation

1. Install dependencies:

```bash
npm install
```

2. Run the database migrations in order.

3. Start the app:

```bash
npm run dev
```

## Supabase Setup

- Run every migration in `supabase/migrations` in order.
- The platform uses `profiles` as the main role/profile table.
- Operator listings and inquiries are stored in Supabase tables, not hardcoded data.
- Operator documents are uploaded to the private bucket named `operator-documents`.
- Document views and downloads should use signed URLs.
- Keep RLS enabled and follow the existing policy style.

Important storage notes:
- Traveler avatar images are stored as Base64 in the database.
- Operator listing cover images are stored as Base64 in the database.
- Operator documents use Supabase Storage, not Base64.

## Demo Accounts

These are for testing and manual walkthroughs only. Do not hardcode them into application code.

### Demo Accounts

The repository includes a role-aware demo seeder at `scripts/seed-demo-accounts.mjs`.
It creates traveler, operator, and admin accounts using one password supplied at
runtime. Do not commit that password.

```bash
DEMO_ACCOUNT_PASSWORD="use-a-client-specific-password" npm run seed:demo
```

See `CLIENT_HANDOFF.md` for the demo emails, login routes, and protected portal routes.

## Role Workflow

- Logged-out users are redirected to login when they open protected pages.
- Logged-in users are redirected away from login/signup pages.
- Travelers land on the traveler profile area.
- Operators land on the operator dashboard.
- Admins land on the admin dashboard.
- Page access is role-protected throughout the app.

## Traveler Workflow

1. Browse featured listings on the landing page.
2. Open a listing and submit an inquiry.
3. View the traveler profile page.
4. Review inquiry activity in `Your Activity`.
5. Update the traveler profile image.

Traveler image behavior:
- Avatar/profile images are stored as Base64 in the database.
- The camera icon is the upload trigger.
- No bucket upload is used for traveler avatars.

## Operator Workflow

1. Open the operator dashboard to review listings, inquiries, and customers.
2. Manage listings in the operator listings area.
3. Create or edit a listing by ID.
4. Review customers and inquiry history.
5. Upload and manage documents for customers.
6. Use the private `operator-documents` bucket for document storage.
7. Connect Google Calendar from operator settings if OAuth is configured.
8. Copy the iCal feed link from operator settings if needed.

Operator image behavior:
- Listing cover images are stored as Base64 in the database.
- The listing upload preview stays consistent with the existing design.

## Admin Workflow

1. Use the admin dashboard to review platform activity.
2. Filter analytics by time range.
3. Approve or reject listings.
4. Review and act on inquiries and bookings.
5. Manage users and operator accounts.
6. Review analytics and growth data.
7. Export reports when needed.

## Email Workflow

The platform uses SMTP through Nodemailer.

Email types currently supported:
- Inquiry confirmation email to the traveler
- Inquiry notification email to the operator
- Booking confirmation email when a trip is confirmed
- Booking reminder email
- Pre-tour instructions email
- Post-tour review request email

Operational notes:
- Email sending happens server-side only.
- If SMTP config is missing or invalid, the inquiry/booking record still saves.
- Scheduled emails are triggered through the cron route.

## Calendar Workflow

### Google Calendar OAuth

- Operators can connect Google Calendar from operator settings.
- OAuth uses offline access so the app can store a refresh token server-side.
- The app stores the connection in Supabase.
- Logged-out users and travelers cannot connect an operator calendar.

### WiPay Checkout

WiPay payments are started from the traveler profile on confirmed inquiries and the same payment state is reflected in operator and admin dashboards.

Manual setup checklist:

1. Create or log in to your WiPay merchant account.
2. Enable sandbox testing first.
3. Copy your Payments API account number and API key into `WIPAY_ACCOUNT_NUMBER` and `WIPAY_API_KEY`.
4. Set `WIPAY_ENVIRONMENT=sandbox` while testing.
5. Keep `WIPAY_CURRENCY=TTD` and `WIPAY_COUNTRY_CODE=TT` unless your WiPay account is configured differently.
6. Set `WIPAY_API_BASE_URL=https://tt.wipayfinancial.com/plugins/payments/request` for the hosted checkout request endpoint.
7. Register `/api/wipay/webhook` as a Payments API webhook and store its endpoint signing secret in `WIPAY_WEBHOOK_SECRET`.
8. Run `npx supabase db push` after pulling the latest migration.
9. Make sure the app is reachable from the internet when WiPay sends callback redirects and webhooks. For local testing, use a tunnel such as ngrok or Cloudflare Tunnel and set `NEXT_PUBLIC_APP_URL` to that public HTTPS URL.
10. Restart `npm run dev` after changing environment variables.
11. Confirm a booking, start payment from the traveler profile, and verify the row in `public.wipay_payments`.

Legacy deployments may continue using `WIPAY_DEVELOPER_ID` as the account-number alias and `WIPAY_BUSINESS_KEY` as the API-key alias.

What the app handles automatically:

- Hosted checkout is requested from the server only.
- Hosted responses are reconciled from WiPay's query-string redirect and successful responses use the server-only API key for hash verification.
- Webhooks are verified against the raw request body with the separate endpoint signing secret and a five-minute replay window.
- Successful payments are written to Supabase and included in revenue totals.
- Return and cancel flows send the traveler back to `TravellerProfile` for the same inquiry.

### Event Sync

- Confirmed bookings can create or update Google Calendar events.
- The app stores the Google event ID on the booking/inquiry record.
- Sync is designed to be safe and will not silently double-book.
- External changes are pulled by the cron sync foundation.

### Conflict Prevention

- Before confirming a booking, the platform checks for conflicts in Supabase.
- If Google Calendar is connected, it also checks Google busy windows.
- If a conflict exists, confirmation is blocked with a user-friendly message.

### iCal Feed

- Operators can copy a secure iCal feed link from operator settings.
- The feed returns `text/calendar` output.
- It includes confirmed operator bookings for the connected operator.
- Feed access can be protected with a signed token when configured.
- The feed may be empty if the current operator does not yet have confirmed bookings assigned to their account.

### Manual Google Cloud Setup Required

Google Calendar still needs manual cloud configuration:
- Create a Google Cloud OAuth client
- Enable the Google Calendar API
- Follow the exact origin and redirect values in the `Google Calendar OAuth Local Setup` section above
- Add the Google client ID and secret to `.env.local`

## Concierge AI

The Concierge page is an AI travel assistant backed by Supabase and OpenAI.

### What It Uses

- Real tour listings from Supabase
- Concierge knowledge sources stored in Supabase
- Traveler profile and inquiry history when the user is signed in
- Chat history saved in Supabase when the concierge tables are migrated

### Environment Variables

Required:

- `OPENAI_API_KEY=`

Optional:

- `OPENAI_MODEL=gpt-4o-mini`

Fallback behavior:

- If `OPENAI_API_KEY` is missing, the Concierge page shows a clean configuration message and does not crash.
- If the concierge tables are not yet migrated, the chat can still fall back to session-only history until the migration is applied.

### Guest Access

Concierge AI works without an account. The landing page hero accepts a plain-English
trip description and carries it straight into the chat, which answers immediately.

- Guests are rate limited per IP: 10 messages an hour, 40 a day.
- Guest threads are not stored. Recent turns travel with each request, so closing
  the tab ends the thread.
- Signing in stores the conversation and unlocks `Request personalised quote`.
- Only `live` listings are ever recommended.
- Set `CONCIERGE_IP_SALT` in production to salt the rate-limit hashes.

### How It Works

- Users ask for trip ideas, beach experiences, family-friendly tours, cultural activities, or itinerary suggestions.
- The server retrieves relevant listings and knowledge sources from Supabase.
- The model responds with recommendations based only on the provided platform context.
- The assistant avoids inventing prices, availability, or listings that are not in the database.

### Testing

1. Add `OPENAI_API_KEY` to `.env.local`.
2. Run `npm run dev`.
3. Open the Concierge page.
4. Ask for a tour suggestion such as beach, culture, family, or budget travel.
5. Confirm the response uses real Supabase listings and knowledge sources.

## Home Page Media

Both are managed from `/AdminSettings` and need no code change.

### Hero background video

- Upload one MP4, WebM, or QuickTime file up to 50 MB.
- It plays muted, looping, and full-bleed behind the hero headline, with a scrim
  so the copy stays legible. A 15-30 second clip with no audio works best.
- Uploading replaces the previous video; the old file is deleted.
- `Remove video` returns the hero to its still cream design.
- Playback pauses for visitors with `prefers-reduced-motion: reduce`.
- Stored in the public `landing-hero-video` bucket, resolved newest-first.
- The 50 MB ceiling is the Supabase project's global upload limit. Raise that in
  the Supabase dashboard first, then `LANDING_HERO_VIDEO_MAX_BYTES`.

### Slideshow images

- Select up to 100 images at once. The browser uploads them in batches of 10
  automatically, with a progress count, and reports how many landed if a batch
  fails part way.
- JPG, PNG, WEBP, or AVIF, up to 25 MB each.
- Upload 4K originals. `images.deviceSizes` goes up to 3840 and the slideshow
  requests quality 92, so Next serves a sharp, right-sized image per screen.
- Supabase-hosted images go through the Next image optimiser. They used to
  bypass it, which shipped the raw multi-megabyte original at one fixed size.
- Every uploaded image is listed in Admin Settings with a remove button.

## Testing Workflow

### Traveler Test

1. Sign in as the traveler demo account.
2. Browse listings.
3. Open a listing and submit an inquiry.
4. Confirm the traveler profile loads correctly.
5. Confirm activity entries appear in `Your Activity`.

### Operator Test

1. Sign in as the operator demo account.
2. Open the operator dashboard.
3. Open operator listings and confirm the record pages work.
4. Upload a customer document.
5. Copy a document share link.
6. Open operator settings.
7. Confirm the Google Calendar connect button and iCal copy button are visible.

### Email Test

1. Submit a traveler inquiry.
2. Confirm the inquiry still saves if SMTP is unavailable.
3. Confirm the booking confirmation action still works.
4. Check cron-triggered scheduled email behavior when SMTP is configured.

### Calendar Test

1. Connect Google Calendar as an operator if OAuth is configured.
2. Confirm a booking without a conflict.
3. Try confirming an overlapping booking and confirm the conflict is blocked or warned.
4. Check that confirmed bookings create or update Google events when connected.
5. Open the iCal feed and confirm it returns calendar text.

### Admin Test

1. Sign in as admin.
2. Open admin dashboard filters.
3. Review and act on bookings.
4. Accept or reject a listing.
5. Suspend or reactivate a user if the UI supports it.

## Troubleshooting

### The dev server hangs and the log repeats "Compaction failed"

```
Compaction failed: Another write batch or compaction is already active
```

Two processes are writing to `.next` at once. The usual cause is running a
build (`npm run build` or `npm run build:next`) while `npm run dev` is still
up: they share the `.next` directory, and the build corrupts the dev server's
persistent cache. Requests then hang instead of erroring, so the app looks
broken while the process is still alive.

Recovery:

```bash
# stop every dev/build process for this project first, then
npm run dev:clean
```

`dev:clean` deletes `.next` and starts a fresh dev server. Do not run a build
and the dev server at the same time.

### The dev server "exited" but the port is still in use

`next dev` spawns a child that outlives its parent shell. Killing the wrapper
leaves the real server holding port 3000, so the next start fails with
`EADDRINUSE`. Find and stop the listener:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Stale `.pid` files

Older helper scripts wrote `.tmp-devserver.pid` and `.tmp-prodserver.pid`.
These are not cleaned up on a crash, so they can name a process that no longer
exists. They are gitignored and safe to delete; do not trust them as evidence
that a server is running.

### Other

- Production hosting is linked through `.openai/hosting.json`; runtime credentials stay in the hosting environment and must never be committed.
- Missing env variables: check `.env.local`.
- Supabase table not found: run migrations in order.
- Bucket missing: verify the `operator-documents` bucket exists and is private.
- RLS errors: confirm the migration policies were applied.
- SMTP auth issues: verify the Gmail app password and sender values.
- Google OAuth mismatch: confirm `GOOGLE_REDIRECT_URI` exactly matches the Google Cloud redirect URI, including the scheme, host, port, and path.
- If you are using `localhost`, do not switch to `127.0.0.1` without updating Google Cloud Console too.
- Route cache issues: restart `npm run dev` after schema or env changes.

## Important Project Rules

- Do not edit old migrations.
- Create a new migration file for every schema change.
- Do not hardcode credentials or demo data in code.
- Keep Base64 image handling for traveler avatars and operator listing covers.
- Keep operator documents on Supabase Storage.
- Preserve the existing design, spacing, color palette, and typography.

## Notes on Two-Way Calendar Sync

- The codebase includes a safe two-way sync foundation.
- Google-to-app updates are intentionally conservative.
- External deletions and changes are logged and marked for review when they cannot be applied safely.
- Full, automatic two-way sync still depends on Google Cloud/OAuth setup and live calendar data.

