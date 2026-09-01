# Tour ConnecTT — Navigation Flows

How each of the three roles moves through the product, screen by screen. Every
step below has been exercised in a real browser.

---

## 1. Traveller — no account needed to start

The whole planning journey works signed out. An account is only required to keep
a chat thread and to pay.

```
/  (or /LandingPage)
│
├── Hero: type a trip in plain English → "PLAN MY TRIP"
│     └── /ConciergeChat?prompt=...        AI answers immediately, no sign-in
│           ├── Multi-turn refinement ("make it cheaper", "add a rainforest day")
│           ├── "Your evolving itinerary" panel builds Day 1 / Day 2 / ...
│           ├── Suggested listings appear (live listings only)
│           │     ├── "OPEN ENQUIRY"      → /Enquiry?listing=<id>
│           │     └── "CHAT WITH OPERATOR" → /Messages (prompts sign-in)
│           └── "Sign in to send this to an operator" → /LoginPage?redirect=/ConciergeChat
│                 or "Or send an enquiry without an account" → /Enquiry
│
├── Navbar: ENQUIRY → /Enquiry
│     └── Pick an experience, fill dates + details → submit
│           └── /Enquiry shows confirmation. Works fully as a guest.
│               Traveller and operator both get an email.
│
├── Navbar: CONCIERGE → /ConciergeChat  (same as above)
│
├── Showcase strip + "Featured listings" cards → /Enquiry?listing=<id>
│
└── LOG IN → /LoginPage
      └── Traveller signs in → /TravellerProfile
```

### Signed-in traveller

```
/TravellerProfile
├── OVERVIEW tab
│     ├── Profile photo + name + preferred areas → "SAVE PROFILE"
│     ├── Private operational details (pickup, allergies, mobility, medical)
│     └── Live activity feed of enquiry status changes
│
├── PAYMENTS tab  (/TravellerProfile?tab=payments)
│     └── One card per confirmed booking, with the right action for its state:
│           • NOT STARTED  → "PAY WITH WIPAY"  → WiPay hosted card page
│           • PENDING      → "CONTINUE WIPAY"  → resumes the same checkout
│           • PAID         → "PAYMENT RECEIVED" (no action)
│           └── "BOOKING DETAILS" → /ConfirmationPage?inquiryId=<id>
│
├── OPEN MESSAGES → /Messages
│     └── Thread per booking with the assigned operator. Send / receive live.
│
├── NEW ENQUIRY → /Enquiry
├── Notification bell → items deep-link to the relevant booking
└── SIGN OUT → /LandingPage
```

**Payment journey in full:** operator or admin confirms the booking → admin sets
a payment amount → the booking appears under PAYMENTS as *WIPAY READY* →
traveller presses **PAY WITH WIPAY** → WiPay hosted checkout → on return the
status shows *PAID* in the traveller, operator and admin views, and the amount
lands in revenue totals (20% platform / 80% operator).

---

## 2. Operator

```
/OperatorLogin  → (redirects to /LoginPage?mode=operator)
└── Sign in → /OperatorDashboard
```

Operator accounts are invite-only: `/OperatorSignUp` redirects to the login page.
Create them with `npm run seed:demo`, or an admin promotes an existing user in
`/AdminUsers`.

```
/OperatorDashboard
│  Enquiry counts, upcoming bookings, payment status, revenue share, live refresh
│
├── LISTINGS → /OperatorListings
│     ├── Listing card → /OperatorListings/<id>              (read-only detail)
│     │     └── "EDIT" → /OperatorListings/<id>/edit         (3-step wizard,
│     │                                                       titled "Edit Listing")
│     └── "CREATE LISTING" → /CreateListing
│           └── Step 1 Core narrative → Step 2 Visual gallery → Step 3 Details
│               "SAVE DRAFT" keeps it private; submitting sends it to admin
│               moderation as `under_review`.
│
├── BOOKINGS → /OperatorBookings
│     ├── Filter tabs: All / Pending / Confirmed / Completed + search + paging
│     └── Per booking: traveller details, dates, payment state, message link
│
├── CUSTOMERS → /OperatorUserManage
│     ├── Search + filter the travellers who have enquired
│     └── "BOOKING DETAILS" → /OperatorBookings?q=<traveller>
│
├── MORE ▾
│     ├── Documents → /OperatorDocuments
│     │     ├── Upload a document for a customer (private bucket)
│     │     ├── Change document status
│     │     └── "SHARE LINK" → time-limited signed URL
│     └── Messages → /OperatorMessages
│           └── Threads with travellers, same live inbox as the traveller side
│
├── Settings (gear) → /OperatorSettings
│     ├── Response cadence, booking workflow, customer records, comms mode
│     ├── Notification toggles
│     ├── "CONNECT GOOGLE CALENDAR"  (needs Google Cloud OAuth — see README)
│     ├── "COPY ICAL LINK" → secure read-only feed of confirmed bookings
│     └── Revoke other sessions
│
└── SIGN OUT → /LandingPage
```

**Listing lifecycle:** `draft` → (submit) `under_review` → admin approves →
`live` (visible on the storefront and to Concierge) or `rejected`. Only `live`
listings are ever shown publicly or recommended by the AI.

---

## 3. Admin

```
/AdminLogin  → (redirects to /LoginPage?mode=admin)
└── Sign in → /AdminDashboard
```

```
/AdminDashboard
│  Platform activity, pending approvals, payment and revenue snapshot,
│  time-range filter, recent notifications
│
├── /AdminListings          Moderation queue
│     └── Per listing: APPROVE (→ live) / REJECT / FEATURE / UNFEATURE
│
├── /AdminBookings          Every enquiry across the platform
│     ├── Status: mark reviewed / confirm / close
│     ├── Set the payment amount — this is what unlocks WiPay for the traveller
│     └── Override payment status (mark paid / refunded) when reconciling
│
├── /AdminUsers             All accounts
│     ├── Suspend / reactivate, change role
│     └── Edit a traveller's care profile (accessibility, dietary, medical)
│
├── /AdminAnalytics         Growth, funnel, revenue, referral campaigns
│     ├── Create / toggle referral campaigns
│     └── Export reports
│     └── /AdminPromotions redirects here
│
├── /AdminContent           Public copy + home page
│     ├── Edit About / Careers / Partners / Help / Contact / How it works
│     ├── Hero eyebrow, prefix, rotating phrases, description, timings
│     └── Choose which live listings are featured on the home page
│
├── /AdminSettings          Workspace + media
│     ├── Administrator identity
│     ├── Moderation policy and alert routing
│     ├── Landing slideshow images — select up to 100 at once; they upload in
│     │   batches of 10 automatically with a progress count. Each image is
│     │   listed with a REMOVE IMAGE button.
│     ├── Hero background video — upload one MP4/WebM (≤50 MB) that plays
│     │   muted and looping behind the home page hero. Replace or remove at
│     │   any time. Travellers see the still hero design until one is uploaded.
│     └── WiPay checkout status (shows whether credentials are configured)
│
└── SIGN OUT → /LandingPage
```

---

## Role protection

- Signed out + protected route → redirected to that portal's login page
  (`proxy.ts`).
- Signed in + wrong portal → redirected to your own dashboard (a role guard in
  every protected page). A traveller opening `/AdminUsers` lands on
  `/TravellerProfile`.
- `/AccountSetting` → `/TravellerProfile`, `/AdminPromotions` → `/AdminAnalytics`,
  `/Inquiry` → `/Enquiry` (permanent).

## Guest limits

Concierge AI is open to visitors with no account, rate limited per IP at
**10 messages/hour and 40/day**. Beyond that the visitor is asked to sign in or
come back later. Guest threads are never stored: recent turns travel with each
request, so closing the tab ends the thread. Signing in stores the conversation
and unlocks "Request personalised quote".
