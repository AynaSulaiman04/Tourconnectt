# Google OAuth Setup

Two features in Tour ConnecTT use Google, and they behave differently:

| Feature | Who handles the OAuth | Where Google redirects |
| --- | --- | --- |
| **Sign up / Sign in with Google** | Supabase Auth | Supabase, which then forwards to `/auth/callback` |
| **Operator Google Calendar** | This app directly | `/api/google/calendar/callback` |

One Google client can serve both. That is what this guide sets up, because two
clients means two places to keep in sync.

The value people get wrong: **"Sign in with Google" does not redirect to your
site.** It redirects to *Supabase*, which forwards on. If Supabase's callback
is missing from the client, sign-in fails with `redirect_uri_mismatch`.

---

## What you need before you start

- Access to the Google Cloud project.
- The Supabase project ref: **`wwmymcndxgycezymrzfa`**
- The live domain: **`tourconnectt.com`**

---

## Step 1 — Enable the Google Calendar API

Google Cloud Console → **APIs & Services** → **Library** → search
**Google Calendar API** → **Enable**.

Sign-in needs no API enabled (email and profile are always available). The
Calendar API is only for the operator calendar connection, but enable it now so
you are not back here later.

## Step 2 — Configure the OAuth consent screen

**APIs & Services** → **OAuth consent screen**.

- User type: **External**
- App name: `Tour ConnecTT`
- User support email: `tourconnectt@gmail.com`
- App logo: optional
- Authorised domains: `tourconnectt.com`
- Developer contact: `tourconnectt@gmail.com`

**Scopes** — add these three:

```
.../auth/userinfo.email
.../auth/userinfo.profile
https://www.googleapis.com/auth/calendar.events
```

The first two are what Supabase requests for sign-in. The third is what
`/api/google/calendar/connect` requests so operators can sync bookings.

### Publishing status — read this part

At the bottom of the consent screen page:

- **Testing** — only Google accounts you list under **Test users** can sign in.
  Everyone else is blocked with "Access blocked: this app is not available".
  Add every address that needs to sign in, including your own.
- **In production** — anyone with a Google account can sign in.

**This is the single most common reason "Sign up with Google" appears broken.**
The handshake succeeds, Google accepts the client, and then the account gets
refused at the picker. Either add test users, or press **Publish app**.

Publishing with only the three scopes above does not require Google's
verification review: `userinfo.email`, `userinfo.profile` and
`calendar.events` are not restricted scopes. You may see an "unverified app"
interstitial until the app is verified, which users can click through.

## Step 3 — Create the OAuth client

**APIs & Services** → **Credentials** → **Create credentials** → **OAuth
client ID**.

- Application type: **Web application**
- Name: `Tour ConnecTT Web` (internal label only, users never see it)

### Authorised JavaScript origins

```
https://tourconnectt.com
https://www.tourconnectt.com
http://localhost:3000
```

Scheme and host only — no path, no trailing slash. `https://tourconnectt.com/`
is rejected.

Leave out the `www` entry until that DNS record exists.

### Authorised redirect URIs

```
https://wwmymcndxgycezymrzfa.supabase.co/auth/v1/callback
https://tourconnectt.com/api/google/calendar/callback
http://localhost:3000/api/google/calendar/callback
```

- Line 1 is for **Sign in with Google**. It is Supabase's callback, not yours.
- Lines 2 and 3 are for **Google Calendar**, live and local.

No trailing slashes. `lib/calendar/google.ts` rejects a `GOOGLE_REDIRECT_URI`
that ends in `/`, and Google matches these strings exactly.

Press **Create**, then copy the **Client ID** and **Client secret**.

Google's own note applies: changes can take 5 minutes to a few hours to take
effect. If you get `redirect_uri_mismatch` immediately after saving, wait
before assuming it is wrong.

## Step 4 — Give the credentials to Supabase (for sign-in)

Supabase dashboard → **Authentication** → **Providers** → **Google**:

- Enable the provider
- Client ID: the new client ID
- Client secret: the new secret
- Save

While you are in Supabase, **Authentication** → **URL Configuration**:

- Site URL: `https://tourconnectt.com`
- Redirect URLs: add `https://tourconnectt.com/**`

Without that second setting, Supabase ignores the app's requested return path
and sends people to the Site URL instead.

## Step 5 — Give the credentials to Vercel (for Calendar)

Vercel → project → **Settings** → **Environment Variables**, for Production:

```
GOOGLE_CLIENT_ID      = <the new client id>
GOOGLE_CLIENT_SECRET  = <the new secret>
GOOGLE_REDIRECT_URI   = https://tourconnectt.com/api/google/calendar/callback
```

Then **Redeploy**. Vercel does not apply environment changes to a deployment
that already exists.

`GOOGLE_REDIRECT_URI` must match the Google Cloud entry character for
character, and its origin must equal `NEXT_PUBLIC_APP_URL`. The app validates
both and refuses to start the flow otherwise, with the mismatch named in the
error.

For local development, keep `.env.local` pointing at localhost:

```
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/calendar/callback
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Step 6 — Test both flows

**Sign in with Google**

1. Open `https://tourconnectt.com/SignUp` in a private window.
2. Press **Sign up with Google** and pick an account.
3. You should land on `/TravellerProfile`, signed in.

A first-time Google user gets a `traveler` profile created automatically, so
nothing needs doing in the database first.

**Google Calendar**

1. Sign in as an operator and open `/OperatorSettings`.
2. Press **Connect Google Calendar** and grant access.
3. The panel should show the calendar as connected.

The app asks for offline access so it can store a refresh token and keep
syncing without the operator re-authorising.

---

## If it fails

The callback now translates provider errors into plain messages on the login
page. Match what you see:

| Message on screen | Fix |
| --- | --- |
| "Google has blocked sign-in for this app…" | Consent screen is in **Testing**. Add the account under Test users, or publish. |
| "…misconfigured for this site address…" | A redirect URI is missing or has a typo. Compare Step 3 character for character. |
| "Google sign-in is not enabled for this site yet." | The provider is off in Supabase, or the client ID/secret were not saved. Step 4. |
| "The Google sign-in credentials for this site are no longer valid." | The client was deleted in Google Cloud, or the secret was rotated without updating Supabase and Vercel. |
| "That Google sign-in attempt expired." | The attempt was left too long, or cookies are blocked. Retry in a normal window. |
| "Google sign-in was cancelled before it finished." | The consent screen was dismissed. Genuinely just a retry. |

The full provider text is written to the server log — Vercel → project →
**Logs** — under `OAuth provider returned an error`.

### Calendar-specific

- `GOOGLE_REDIRECT_URI must not end with a trailing slash` — remove it.
- `GOOGLE_REDIRECT_URI must point at a supported Google callback on <origin>` —
  the value's origin does not match `NEXT_PUBLIC_APP_URL`, or the path is not
  `/api/google/calendar/callback` or `/api/auth/callback/google`.
- Nothing happens on connect — the Calendar API is not enabled (Step 1), or
  `calendar.events` is missing from the consent screen scopes (Step 2).

---

## Reference

| Thing | Value |
| --- | --- |
| Supabase project ref | `wwmymcndxgycezymrzfa` |
| Supabase auth callback | `https://wwmymcndxgycezymrzfa.supabase.co/auth/v1/callback` |
| App sign-in callback | `https://tourconnectt.com/auth/callback` |
| App calendar callback | `https://tourconnectt.com/api/google/calendar/callback` |
| Calendar scope | `https://www.googleapis.com/auth/calendar.events` |
| Sign-in scopes | `userinfo.email`, `userinfo.profile` |

The app sign-in callback is listed for completeness. It does **not** go in the
Google client, because Supabase is what calls it, not Google.
