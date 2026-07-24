# Tour ConnecTT Client Handoff

## Production

- Website: `https://tourconnectt.rabbanirihab.chatgpt.site`
- Repository: `https://github.com/AynaSulaiman04/Tourconnectt`

The hosted website currently uses owner-only Sites access. Visitors must pass the
Sites access screen before reaching the application.

## Demo Accounts

Run `npm run seed:demo` with `DEMO_ACCOUNT_PASSWORD` set to the password that will
be shared with the client. The seeder creates or updates these accounts:

| Role | Email | Login route | Home route |
| --- | --- | --- | --- |
| Traveler | `traveler.demo@tourconnectt.test` | `/LoginPage` | `/TravellerProfile` |
| Operator | `operator.demo@tourconnectt.test` | `/OperatorLogin` | `/OperatorDashboard` |
| Admin | `admin.demo@tourconnectt.test` | `/AdminLogin` | `/AdminDashboard` |

The application currently supports `traveler`, `operator`, and `admin`. It does
not currently contain an `employee` role or employee portal.

## Public Routes

- `/` and `/LandingPage`
- `/AboutUs`
- `/Careers`
- `/ContactUs`
- `/HelpCenter`
- `/HowItWorks`
- `/Inquiry`
- `/Partners`
- `/PrivacyPolicy`
- `/TermsOfService`
- `/SignUp`
- `/OperatorSignUp`
- `/AdminSignUp`

## Traveler Routes

- `/LoginPage`
- `/TravellerProfile`
- `/AccountSetting`
- `/Messages`
- `/ConciergeChat`
- `/ConfirmationPage`

## Operator Routes

- `/OperatorLogin`
- `/OperatorDashboard`
- `/OperatorBookings`
- `/OperatorDocuments`
- `/OperatorListings`
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
- `/AdminAnalytics`
- `/AdminContent`
- `/AdminPromotions`
- `/AdminSettings`

## Credential Safety

- Never send `.env.local` to the client.
- Never share Supabase service-role or secret keys.
- Never share database passwords, SMTP app passwords, Google client secrets, or AI API keys.
- Rotate the client demo password after acceptance testing.
