# LedgerVoice AI — public SaaS deployment package

This package turns the LedgerVoice prototype into an independently deployable SaaS starter:

- public landing page and email/password accounts;
- one private workspace created for every new account;
- RM79/month Stripe subscription with a card-required 14-day trial;
- OpenAI audio transcription and schema-controlled invoice/expense drafts;
- mandatory review before an invoice or expense is saved;
- PostgreSQL multi-tenant records protected by row-level security (RLS);
- monthly/yearly reporting foundation, audit logs and a versioned tax-rule framework;
- deployment target: Vercel + Supabase + Stripe + OpenAI.

## Start here

1. Read [DEPLOYMENT.md](DEPLOYMENT.md) from top to bottom.
2. Create a Supabase test project and run `supabase/migrations/0001_initial.sql`.
3. Copy `.env.example` to `.env.local` and add test credentials.
4. Run:

   ```bash
   npm install
   npm run dev
   ```

5. Complete the test-mode acceptance checks in [docs/GO_LIVE_CHECKLIST.md](docs/GO_LIVE_CHECKLIST.md).
6. Read [SECURITY.md](SECURITY.md) before any real customer data is accepted.

## Important boundaries

- The tax workspace is a planning and evidence-preparation framework. The four seed rule sets are deliberately inactive. A qualified professional must validate a jurisdiction, entity type and tax year before a rule set is activated.
- Invoice totals are treated as approved revenue in the starter summary. Production accounting must distinguish cash versus accrual basis, tax-inclusive versus tax-exclusive amounts, credits, refunds, FX and bad debts.
- Stripe payment details are handled by Stripe Checkout. Do not add card fields to LedgerVoice.
- A verified merchant account must be controlled by an authorised adult or registered-business representative.
- This package is a secure production foundation, not a certification of legal, tax, privacy or security compliance.

## Package map

| Path | Purpose |
|---|---|
| `src/app` | Pages and server API routes |
| `src/lib` | Authentication, clients, validation and rate limiting |
| `supabase/migrations` | Database schema, triggers, indexes and RLS policies |
| `DEPLOYMENT.md` | Full setup and go-live guide |
| `SECURITY.md` | Threat controls, operational requirements and incident process |
| `docs/ARCHITECTURE.md` | System and data-flow explanation |
| `docs/GO_LIVE_CHECKLIST.md` | Test and launch sign-off |
| `docs/TAX_RULE_GOVERNANCE.md` | Safe four-country tax rule maintenance |

## Official references

- [OpenAI voice-agent architecture](https://developers.openai.com/api/docs/guides/voice-agents)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Supabase Next.js authentication](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Stripe subscription Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions)
- [Stripe webhook security](https://docs.stripe.com/webhooks)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
