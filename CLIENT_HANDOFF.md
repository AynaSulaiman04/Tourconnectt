# Tour ConnecTT Client Handoff

## Production

- Website: `https://tourconnectt.rabbanirihab.chatgpt.site`
- Repository: `https://github.com/AynaSulaiman04/Tourconnectt`

The hosted website currently uses owner-only Sites access. Visitors must pass the
Sites access screen before reaching the application.

## Demo Setup

Two seeders, run in this order:

```bash
# 1. Accounts. Choose the password that will be shared with the client.
DEMO_ACCOUNT_PASSWORD="use-a-client-specific-password" npm run seed:demo

# 2. Demo dataset: Trinidad and Tobago listings, bookings in every status,
#    WiPay payments, an operator conversation, a review, concierge knowledge,
#    and notifications for all three portals.
npm run seed:demo-data
```

Both seeders are idempotent, so re-running them refreshes the walkthrough state
rather than duplicating rows.

`seed:demo-data` also demotes pre-existing `live`/`under_review` listings it did
not create to `draft`, so the storefront shows only the curated demo set. Set
`DEMO_DEMOTE_LEGACY_LISTINGS=0` to leave every existing listing untouched.

## Demo Accounts

| Role | Email | Login route | Home route |
| --- | --- | --- | --- |
| Traveller | `traveler.demo@tourconnectt.test` | `/LoginPage` | `/TravellerProfile` |
| Operator | `operator.demo@tourconnectt.test` | `/OperatorLogin` | `/OperatorDashboard` |
| Admin | `admin.demo@tourconnectt.test` | `/AdminLogin` | `/AdminDashboard` |

`/OperatorLogin` and `/AdminLogin` redirect to `/LoginPage?mode=operator` and
`/LoginPage?mode=admin`. One login form serves all three roles and routes each
account to its own portal.

The application supports `traveler`, `operator`, and `admin`. It does not
contain an `employee` role or employee portal.

## What the demo dataset contains

- 4 live listings, 1 awaiting moderation, 1 draft — all Trinidad and Tobago.
- 5 bookings covering `submitted`, `reviewed`, `confirmed`, and `closed`.
- 2 settled WiPay payments plus 1 confirmed booking ready for live checkout.
- A 5-message traveller/operator thread on the paid booking.
- A 5-star review on the completed trip.
- 5 concierge knowledge sources so the AI assistant answers from real content.
- Notifications in all three portal bells.

## Public Routes

- `/` and `/LandingPage`
- `/AboutUs`
- `/Careers`
- `/ContactUs`
- `/HelpCenter`
- `/HowItWorks`
- `/Enquiry` (`/Inquiry` permanently redirects here)
- `/Partners`
- `/PrivacyPolicy`
- `/TermsOfService`
- `/SignUp`
- `/OperatorSignUp` and `/AdminSignUp` (both redirect to `/LoginPage`; operator
  and admin accounts are invite-only and created by a seeder or an admin)
- `/ConciergeChat`
- `/ConfirmationPage`

## Traveller Routes

- `/LoginPage`
- `/TravellerProfile` — profile, bookings, and WiPay actions
- `/TravellerProfile?tab=payments` — the payments view used in the demo
- `/Messages`
- `/ConciergeChat`
- `/ConfirmationPage`
- `/AccountSetting` redirects to `/TravellerProfile`; account settings live on
  that page rather than on a separate screen.

## Operator Routes

- `/OperatorLogin`
- `/OperatorDashboard`
- `/OperatorBookings`
- `/OperatorDocuments`
- `/OperatorListings`
- `/OperatorListings/[id]` and `/OperatorListings/[id]/edit`
- `/OperatorMessages`
- `/OperatorSettings`
- `/OperatorUserManage`
- `/CreateListing`

## Admin Routes

- `/AdminLogin`
- `/AdminDashboard`
- `/AdminBookings`
- `/AdminListings`
- `/AdminUsers`
- `/AdminAnalytics` — analytics and referral campaigns
- `/AdminContent`
- `/AdminSettings`
- `/AdminPromotions` redirects to `/AdminAnalytics`; promotions and referral
  campaigns are managed there.

## Role Protection

Signed-out visitors to a protected route are redirected to the matching login
page. Signed-in users who open a portal that is not theirs are redirected to
their own dashboard. This is enforced in `proxy.ts` for the signed-out case and
by a role guard inside every protected page for the signed-in case.

## WiPay Checkout

WiPay hosted checkout is live and wired end to end: the traveller opens
`/TravellerProfile?tab=payments`, presses **Pay with WiPay** on a confirmed
booking, and the server requests a hosted checkout session and redirects to
WiPay's card page. The resulting payment status is reflected in the traveller,
operator, and admin views, and successful payments feed revenue totals with a
20% platform commission and 80% operator payout.

Before the client demo, confirm these are set in the hosting environment:

| Variable | Purpose |
| --- | --- |
| `WIPAY_ACCOUNT_NUMBER` | Payments API account number (legacy alias: `WIPAY_DEVELOPER_ID`) |
| `WIPAY_API_KEY` | Payments API key (legacy alias: `WIPAY_BUSINESS_KEY`) |
| `WIPAY_WEBHOOK_SECRET` | Endpoint signing secret for `/api/wipay/webhook` |
| `WIPAY_ENVIRONMENT` | `sandbox` for testing, `live` for production |
| `NEXT_PUBLIC_APP_URL` | Must be a public HTTPS URL WiPay can reach |

Notes:

- Without `WIPAY_WEBHOOK_SECRET` the webhook fails closed with HTTP 503 by
  design. Checkout and the redirect-based reconciliation still work, so the
  demo runs, but asynchronous status updates from WiPay do not arrive.
- With `NEXT_PUBLIC_APP_URL` set to `http://localhost:3000`, WiPay cannot reach
  the return URL or the webhook. For a remote demo, use a public HTTPS tunnel
  and set `NEXT_PUBLIC_APP_URL` to it.
- The repository's sandbox credentials are WiPay's public test values. Swap in
  the client's merchant credentials before any live payment.

## Known Gaps

- The landing page newsletter field has no mailing-list backend. It validates
  the address and tells the visitor the list is not open yet.
- Google Calendar sync needs a Google Cloud OAuth client before the connect
  button in `/OperatorSettings` will complete. See `README.md`.

## Credential Safety

- Never send `.env.local` to the client.
- Never share Supabase service-role or secret keys.
- Never share database passwords, SMTP app passwords, Google client secrets, or AI API keys.
- Rotate the client demo password after acceptance testing.
