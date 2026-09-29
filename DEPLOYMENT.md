# LedgerVoice AI deployment and go-live guide

Use test projects and dummy data until Section 10 is complete. Do not paste real customer financial records into a test environment.

## 1. Decide ownership before creating accounts

Record these people in your internal launch sheet:

| Role | Responsibility |
|---|---|
| Business owner | Product, pricing, privacy notice and customer terms |
| Authorised merchant representative | Owns and verifies Stripe; controls bank and payout changes |
| Technical administrator | Vercel, Supabase, domain, backups and incident response |
| Tax reviewer(s) | Validates each country/entity/year tax rule set |
| Privacy contact or DPO | Handles privacy requests, retention and breach decisions |

Use company-controlled email addresses, not a developer's personal address. Turn on multi-factor authentication for every provider account. Keep at least two authorised administrators, but grant the minimum access needed.

## 2. Prepare the source

1. Extract the ZIP into a new folder.
2. Install Node.js 20.9 or newer and Git.
3. Open a terminal in the extracted folder.
4. Run `npm install`.
5. Copy `.env.example` to `.env.local`.
6. Never commit `.env.local`. The included `.gitignore` excludes it.
7. Create a private Git repository and push the source after confirming no secrets are present.

Check before every push:

```bash
git status
git diff --cached
```

Do not push keys beginning with `sk_`, `whsec_`, `sb_secret_`, or an OpenAI project key.

## 3. Create the Supabase database and client isolation

### 3.1 Create the project

1. Sign in to Supabase using the company administrator account.
2. Create a new organisation and a new project.
3. Choose a region after deciding where customer data should be hosted. Data residency and cross-border transfers require legal review for the actual customer markets.
4. Generate a strong database password and store it in the business password manager.
5. Wait until the database is healthy.

### 3.2 Apply the schema

1. In Supabase, open **SQL Editor**.
2. Open `supabase/migrations/0001_initial.sql` from this package, paste the entire migration into a new SQL query and run it once.
3. Do the same with `supabase/migrations/0002_ledger.sql`. It must run after `0001`.
4. Confirm these tables exist: `workspaces`, `workspace_members`, `subscriptions`, `audit_logs`, `ledger_entities`, `ledger_entries`, `ledger_close_marks`, `ledger_close_signoffs` and `workspace_invites`. (`customers`, `invoices` and `expenses` from `0001` are no longer written by the app; the journals in `ledger_entries` replace them.)
5. Confirm that updating a posted row in `ledger_entries` fails with "Posted and rejected entries are immutable".
6. Open the table editor and confirm RLS shows as enabled on every public table.

The signup trigger creates four linked records automatically:

1. the user's `profile`;
2. a private `workspace`;
3. an owner row in `workspace_members`;
4. an `incomplete` subscription row.

The application never accepts a workspace ID from the browser as authority. It resolves membership on the server, and PostgreSQL applies RLS again to every query.

### 3.3 Configure authentication

1. In **Authentication → Providers**, enable email/password.
2. Require email confirmation for production.
3. Configure a production SMTP provider before launch; default shared email delivery is not suitable for a commercial launch.
4. In **Authentication → URL Configuration**, initially set:
   - Site URL: `http://localhost:3000`
   - Redirect URL: `http://localhost:3000/auth/callback`
5. After the production domain exists, add `https://YOUR-DOMAIN/auth/callback` and change the Site URL to `https://YOUR-DOMAIN`.
6. Set password controls appropriate for your risk profile and enable leaked-password protection when available on your plan.

### 3.4 Collect Supabase values

From **Project Settings → API**, copy:

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- Publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Secret key → `SUPABASE_SECRET_KEY`

The publishable key may be used by the browser because RLS authorises the signed-in user. The secret key bypasses RLS and must exist only in server-side environment variables. Never add `NEXT_PUBLIC_` to the secret key.

### 3.5 Backups and recovery

Before real data:

1. Choose a Supabase plan with backup/recovery capability that matches the business's recovery targets.
2. Record the current backup schedule and retention.
3. Define an initial recovery objective, for example RPO 24 hours and RTO 8 hours, then revise it after usage grows.
4. Perform a restore drill into a separate non-production project.
5. Record the date, administrator and result of every restore test.

## 4. Configure Stripe subscriptions in test mode

A verified Stripe merchant must be managed by an authorised adult or registered-business representative. Do not use another person's identity or bypass Stripe verification.

### 4.1 Create the plans

1. Open Stripe in **Test mode**.
2. Create three products, `Ledger VoiceAI Starter`, `Business` and `Group`, each with two recurring MYR prices. Annual is ten months for twelve:

   | Plan | Monthly | Annual | Environment variables |
   |---|---|---|---|
   | Starter | RM249 | RM2,490 | `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL` |
   | Business | RM690 | RM6,900 | `STRIPE_PRICE_BUSINESS_MONTHLY`, `STRIPE_PRICE_BUSINESS_ANNUAL` |
   | Group | RM1,890 | RM18,900 | `STRIPE_PRICE_GROUP_MONTHLY`, `STRIPE_PRICE_GROUP_ANNUAL` |

3. Copy each `price_...` ID to its variable. The app maps a subscription's price back to its plan, which sets the entity and document limits.
4. Copy the test secret key to `STRIPE_SECRET_KEY`.
5. Prices exclude 8% service tax. Configure Stripe Tax or tax rates once your tax agent confirms the treatment.

The code applies `trial_period_days: 14` and `payment_method_collection: if_required`, so the trial starts with no card. Stripe asks for one before the trial ends; with none on file the subscription cancels (`missing_payment_method: cancel`). Access is granted only after a verified webhook reports `trialing` or `active`.

### 4.2 Configure the customer portal

1. In Stripe Billing, open Customer Portal settings.
2. Allow customers to update payment details.
3. Allow subscription cancellation.
4. Decide whether cancellation is immediate or at period end and make the website wording match.
5. Add support/contact information and save the portal configuration.

### 4.3 Create the webhook after the first Vercel deployment

Create an endpoint at:

`https://YOUR-DOMAIN/api/stripe/webhook`

Subscribe at minimum to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed` (monitoring/notification can be added next)

Copy the endpoint signing secret to `STRIPE_WEBHOOK_SECRET`. The application validates `Stripe-Signature` against the raw request body and records processed event IDs to reduce duplicate handling.

Do not enable live mode yet.

## 5. Configure the OpenAI project

1. Create a dedicated OpenAI API project for LedgerVoice production.
2. Create a server-side API key and store it as `OPENAI_API_KEY`.
3. Set a monthly budget alert and usage limits.
4. Keep the defaults unless you have evaluated replacements:
   - `OPENAI_TEXT_MODEL=gpt-5-mini`
   - `OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe`
5. Test Malaysian, Singaporean, Australian and Indonesian accents and business vocabulary with synthetic or consented test samples.

LedgerVoice uses a chained workflow: audio → transcript → schema-controlled draft → human review → database save. This is appropriate for approval-heavy financial work because every intermediate step can be inspected. Audio is capped at 10 MB, text at 4,000 characters, and API calls are rate limited per signed-in user.

Do not place the OpenAI key in browser code. Do not allow model output to write directly to the database.

## 6. Run locally with test credentials

Fill `.env.local`:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
OPENAI_API_KEY=...
OPENAI_TEXT_MODEL=gpt-5-mini
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_BUSINESS_MONTHLY=price_...
STRIPE_PRICE_BUSINESS_ANNUAL=price_...
STRIPE_PRICE_GROUP_MONTHLY=price_...
STRIPE_PRICE_GROUP_ANNUAL=price_...
RATE_LIMIT_SECRET=use-at-least-32-random-bytes
SUPPORT_EMAIL=support@yourdomain.com
```

Then run:

```bash
npm run dev
```

Open `http://localhost:3000` and create a test account. To test Stripe webhooks locally, use Stripe's official CLI and forward events to `localhost:3000/api/stripe/webhook`; place the CLI's temporary `whsec_...` value in `.env.local`, then restart the development server.

## 7. Deploy to Vercel

### 7.1 Import the repository

1. Sign in to Vercel with the company account.
2. Select **Add New → Project**.
3. Import the private Git repository.
4. Framework preset should be Next.js.
5. Root directory is the package root containing `package.json`.
6. Do not deploy yet if environment variables are missing.

### 7.2 Add environment variables

Add every variable from `.env.example` under **Project Settings → Environment Variables**.

- Public variables may be available to Production and Preview.
- Add `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `RATE_LIMIT_SECRET` as sensitive server values.
- Use separate Supabase, Stripe and preferably OpenAI projects for Preview and Production.
- Set `NEXT_PUBLIC_APP_URL` to the final HTTPS domain for Production.

Environment-variable changes affect new deployments, so redeploy after changing them.

### 7.3 First deployment

1. Deploy.
2. Wait for the build to succeed.
3. Open `/api/health`; it should return `status: ok`.
4. Open the landing page.
5. Do not advertise the URL yet.

### 7.4 Add the custom domain

1. In **Project Settings → Domains**, add the chosen domain, such as `app.ledgervoice.ai`.
2. Add the DNS record Vercel provides at your domain registrar.
3. Wait until Vercel confirms the domain and HTTPS certificate.
4. Change `NEXT_PUBLIC_APP_URL` to `https://YOUR-DOMAIN` and redeploy.
5. Update Supabase Site URL and redirect URL.
6. Create or update the Stripe webhook endpoint with the same final domain.

Never weaken browser SSL settings to work around certificate provisioning.

## 8. Connect and verify Stripe webhooks

1. Add the production URL endpoint in Stripe Test mode.
2. Copy its signing secret into Vercel.
3. Redeploy.
4. Send a Stripe test event.
5. Confirm Stripe reports HTTP 200.
6. Check Supabase `stripe_events` contains the event ID.
7. Sign up, finish onboarding, pick a plan and complete Checkout (no card is needed for the trial).
8. Confirm the subscriber's `subscriptions.status` becomes `trialing`.
9. Sign back in and confirm the workspace opens.
10. Cancel in the customer portal and confirm a later webhook updates the status.

The browser redirect after Checkout is not proof of payment. Subscriber access must follow the signed webhook state only.

## 9. Test tenant separation and finance controls

Use two accounts, A and B.

1. Activate both in Stripe Test mode.
2. Account A posts one transaction and issues one invoice from the Capture tab.
3. Account B must see zero Account A records.
4. Copy Account A record IDs from an administrator view and attempt to query or modify them while signed in as B. The database must return no row/permission denied.
5. Use Account A's voice flow. Confirm AI output appears only as a draft.
6. Change the amount before approval and save it. Confirm the edited value is stored.
7. Confirm an `audit_logs` entry exists.
8. Confirm a viewer-role user cannot save a record.
9. Confirm a canceled/unpaid subscriber receives HTTP 402 from finance endpoints.
10. Confirm audio over 10 MB and transcript over 4,000 characters are rejected.

## 10. Privacy, data residency and legal launch gate

LedgerVoice may process customer contact details, invoice descriptions, financial records and voice transcripts. Before accepting real data:

1. Identify the operating company and the countries where it offers the service.
2. Map the controller/processor roles for LedgerVoice, Supabase, Vercel, OpenAI, Stripe, email provider and support tools.
3. Select data regions and review international transfer mechanisms.
4. Publish a lawyer-reviewed privacy notice and terms of service.
5. Define collection purpose, lawful basis/consent, retention period, access/correction/deletion process and breach contacts.
6. Decide whether source transcripts should be stored. The starter stores them with approved records; remove or shorten this if they are not required.
7. Do not collect card details, government IDs, passwords, health data or unnecessary sensitive information in voice commands.
8. Complete a data-protection impact assessment for AI-assisted financial processing.

Official starting points:

- Malaysia: [Personal Data Protection Commissioner / Act 709](https://www.pdp.gov.my/ppdpv1/en/main-page/)
- Singapore: [PDPC data protection obligations](https://www.pdpc.gov.sg/data-protection-obligations)
- Australia: [OAIC Australian Privacy Principles](https://www.oaic.gov.au/privacy/australian-privacy-principles)
- Indonesia: [Law No. 27 of 2022](https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022)

These laws are not identical and can change. Hosting a four-country tax workspace does not automatically make the business compliant in all four countries.

## 11. Move from test to live payments

Only after Sections 8–10 pass:

1. Complete Stripe business verification through the authorised representative.
2. Re-create or confirm the three products and six MYR prices in Live mode.
3. Create a Live-mode webhook endpoint.
4. Replace in Vercel:
   - `STRIPE_SECRET_KEY`
   - the six `STRIPE_PRICE_*` variables
   - `STRIPE_WEBHOOK_SECRET`
5. Keep test and live values clearly separated.
6. Redeploy Production.
7. Make one controlled real purchase, refund/cancel it according to the business process, and reconcile the Stripe record to Supabase.
8. Confirm invoice/receipt wording and any indirect-tax treatment with an accountant.

## 12. Final go-live actions

1. Complete `docs/GO_LIVE_CHECKLIST.md` with names and dates.
2. Freeze production changes during launch day.
3. Enable uptime monitoring for `/api/health` and error monitoring for server routes.
4. Monitor Stripe webhook failures, Supabase database health, OpenAI usage and Vercel errors.
5. Publish support, privacy, terms, cancellation and data-request contacts.
6. Invite a limited pilot group first.
7. Review incidents and customer feedback before public advertising.

## 13. Updating safely

For every release:

1. Create a branch.
2. Test database migrations in a separate project.
3. Run `npm test`.
4. Deploy to Preview with non-production credentials.
5. Perform tenant-isolation and billing tests.
6. Back up before a destructive migration.
7. Deploy Production.
8. Monitor and keep a rollback plan.

Never edit an already-applied migration. Add a new numbered migration so production history remains reproducible.
