# Deploying Tour ConnecTT to tourconnectt.com

## Where things stand

| Thing | Status |
| --- | --- |
| `tourconnectt.com` | Serving a **GoDaddy Website Builder** page, not this app. DNS resolves to `76.223.105.230` / `13.248.243.5` (AWS Global Accelerator, GoDaddy's builder). |
| `www.tourconnectt.com` | Not resolving. |
| `tourconnectt.rabbanirihab.chatgpt.site` | Dead (the URL in the old handoff doc). |
| Vercel | Not linked. `vercel.json` exists but there is no project. |
| Cloudflare Workers | Not deployed. `wrangler.jsonc` and OpenNext are configured but unused. |

**The app is not live anywhere.** Target platform: **Vercel**.

GoDaddy Website Builder and GoDaddy shared hosting cannot run this app — it
needs a Node server for server components, server actions, API routes and the
image optimiser. GoDaddy stays as the **domain registrar / DNS**; Vercel runs
the app.

---

## Step 1 — Create the Vercel project

Easiest path, and it gives you automatic deploys on every push:

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Import `AynaSulaiman04/Tourconnectt`.
3. Framework preset: **Next.js** (detected automatically).
4. Build command: leave as is — `vercel.json` already sets `npm run build:next`.
   **Do not use `npm run build`**; that one also runs the Cloudflare OpenNext
   build and is not needed on Vercel.
5. Do **not** deploy yet — add the environment variables first (Step 2),
   because `NEXT_PUBLIC_SUPABASE_URL` is read at build time to allow Supabase
   image URLs.

## Step 2 — Environment variables

In Vercel → Project → Settings → Environment Variables, add these for
**Production** (and Preview if you want previews to work). Values come from
your local `.env.local` — never commit them.

**Required for the app to run:**

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
DIRECT_URL
```

**Required for Concierge AI:**

```
OPENAI_API_KEY          (or GROQ_API_KEY)
OPENAI_MODEL            optional, defaults to gpt-4o-mini
CONCIERGE_IP_SALT       recommended: any long random string, salts guest rate-limit hashes
```

**Required for WiPay:**

```
WIPAY_ACCOUNT_NUMBER    (legacy alias: WIPAY_DEVELOPER_ID)
WIPAY_API_KEY           (legacy alias: WIPAY_BUSINESS_KEY)
WIPAY_WEBHOOK_SECRET    ← currently MISSING locally. Without it the webhook
                          returns 503 by design and async payment updates
                          never arrive. Get it from the WiPay dashboard when
                          you register the webhook.
WIPAY_ENVIRONMENT       sandbox now, live when you go live
WIPAY_CURRENCY          TTD
WIPAY_COUNTRY_CODE      TT
WIPAY_API_BASE_URL      https://tt.wipayfinancial.com/plugins/payments/request
```

**Required for email:**

```
SMTP_HOST  SMTP_PORT  SMTP_SECURE  SMTP_USER  SMTP_PASS  SMTP_FROM
```

**Set to the live domain (not localhost):**

```
NEXT_PUBLIC_APP_URL=https://tourconnectt.com
GOOGLE_REDIRECT_URI=https://tourconnectt.com/api/google/calendar/callback
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

**Optional:**

```
CRON_SECRET             protects /api/cron/* routes
ICAL_FEED_SECRET        signs the operator iCal feed
```

Then click **Deploy**. You get a `*.vercel.app` URL — check the site works there
before touching DNS.

## Step 3 — Add the domain in Vercel

Vercel → Project → Settings → Domains → Add.

Add **both**:

- `tourconnectt.com`
- `www.tourconnectt.com`

Vercel will show you the exact DNS records. They are normally:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

Use the values **Vercel shows you**, not these, if they differ.

## Step 4 — Point GoDaddy DNS at Vercel

1. GoDaddy → **My Products** → find `tourconnectt.com` → **DNS**.
2. **Turn off the Website Builder site first**, or GoDaddy will keep resetting
   the records. In My Products, find the Website Builder / Websites + Marketing
   entry for this domain and either delete the site or disconnect the domain
   from it.
3. In DNS → Records:
   - **Delete or edit** the existing `A` record for `@` that points at
     `76.223.105.230` — change its value to Vercel's `76.76.21.21`.
   - **Add or edit** the `CNAME` for `www` → `cname.vercel-dns.com`.
   - Remove any GoDaddy "Website Builder" / forwarding entries for `@` and
     `www`, and any conflicting `AAAA` records for `@`.
   - Leave `MX` records alone if you use GoDaddy email — changing them breaks
     mail.
4. Set TTL to 600 seconds while you are cutting over, so mistakes are cheap.
5. Back in Vercel → Domains, wait for both entries to show **Valid
   Configuration**. Vercel issues the TLS certificate automatically.

Propagation is usually minutes, up to a few hours. Check with:

```bash
nslookup tourconnectt.com
curl -sI https://tourconnectt.com | head -5
```

The `Server:` header should stop saying `DPS/...` (GoDaddy) and start saying
`Vercel`.

## Step 5 — Post-DNS updates

Once `https://tourconnectt.com` serves the app:

1. **Google Cloud Console** → APIs & Services → Credentials → your OAuth client:
   - Authorised JavaScript origin: `https://tourconnectt.com`
   - Authorised redirect URI: `https://tourconnectt.com/api/google/calendar/callback`
   - Must match `GOOGLE_REDIRECT_URI` exactly — no trailing slash.
2. **Supabase** → Authentication → URL Configuration:
   - Site URL: `https://tourconnectt.com`
   - Redirect URLs: add `https://tourconnectt.com/**`
   - Without this, password reset and magic links point at localhost.
3. **WiPay dashboard** → register the webhook:
   - `https://tourconnectt.com/api/wipay/webhook`
   - Copy the endpoint signing secret into `WIPAY_WEBHOOK_SECRET` on Vercel.
4. Redeploy after changing any environment variable — Vercel does not apply them
   to an existing deployment.

## Step 6 — Seed the demo data on production

The app points at the same Supabase project, so the data is already there. If
you want to reset the walkthrough state:

```bash
DEMO_ACCOUNT_PASSWORD="<client password>" npm run seed:demo
npm run seed:demo-data
```

## Step 7 — Apply the new migration

One migration was added for guest Concierge rate limiting:

```
supabase/migrations/20260901000000_add_concierge_guest_usage.sql
```

It has already been applied to the live Supabase project. If you ever rebuild
the database, run every migration in `supabase/migrations` in filename order.

---

## What I need from you to do the deploy myself

I can run the whole deployment if you give me **one** of:

- A **Vercel access token** (Vercel → Account Settings → Tokens → Create). I
  would run `vercel link`, `vercel env add` for each variable, and
  `vercel deploy --prod`.
- Or connect the GitHub repo at <https://vercel.com/new> yourself — that is
  genuinely two clicks and avoids sharing a token.

I **cannot** change GoDaddy DNS for you regardless — that needs a login to your
GoDaddy account, and you should not share it. Step 4 is yours; it is about five
minutes of clicking.

## Notes

- `output: "standalone"` in `next.config.ts` is for the Cloudflare/OpenNext
  path. Vercel ignores it, so it is harmless, but if you ever fully drop the
  Cloudflare target you can remove it along with `wrangler.jsonc`,
  `open-next.config.ts` and the `build` / `build:worker` scripts.
- `.openai/hosting.json` refers to the dead chatgpt.site deployment. Safe to
  delete once you are on Vercel.
- Image optimisation now runs on Supabase-hosted images (they used to bypass
  it). On Vercel this counts toward the image-optimisation quota; the free tier
  is generous but watch it if traffic grows.
