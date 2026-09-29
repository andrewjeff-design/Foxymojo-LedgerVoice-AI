# LedgerVoice AI — public SaaS deployment package

This package turns the LedgerVoice prototype into an independently deployable SaaS starter:

- public landing page, email/password accounts and a three-step company onboarding that sets the rules;
- Starter, Business and Group plans in ringgit through Stripe, with a 14-day trial and no card to start;
- voice or text capture in English, Bahasa Melayu and 中文, with OpenAI transcription and schema-controlled extraction;
- a Malaysian rule engine (MPERS, SST at 8% and 6%, imported services, thresholds, e-Invoice, intercompany, related parties) that decides every journal, re-run on the server before anything is stored;
- a named-approver gate, immutable posted journals and an audit trail;
- trial balance, P&L, balance sheet, cash flow, receivables ageing, SST-02 working and a month-end close, all footed from the journals;
- bank-statement import and reconciliation, ledger exports for AutoCount, SQL Account and Bukku, and a MyInvois UBL document builder (not submitted);
- a public `/demo` with seeded books that runs entirely in the browser;
- deployment target: Vercel + Supabase + Stripe + OpenAI.

## Start here

1. Read [DEPLOYMENT.md](DEPLOYMENT.md) from top to bottom.
2. Create a Supabase test project and run `supabase/migrations/0001_initial.sql`, then `0002_ledger.sql`.
3. Copy `.env.example` to `.env.local` and add test credentials.
4. Run:

   ```bash
   npm install
   npm run dev
   ```

5. Run `npm run test` (unit tests, typecheck, lint and build), or `npm run test:unit` for the engine alone.
6. Complete the test-mode acceptance checks in [docs/GO_LIVE_CHECKLIST.md](docs/GO_LIVE_CHECKLIST.md).
7. Read [SECURITY.md](SECURITY.md) before any real customer data is accepted.

## Important boundaries

- The Malaysian rule pack is dated (`MY-RULES 2026.09`, verified 24 Sep 2026) and every entry records the version that decided it. Re-verify it every quarter; it is not tax advice.
- The bank column maps (Maybank, CIMB, Public Bank) and the AutoCount, SQL Account and Bukku export layouts are written from public documentation and are flagged unverified in the app. Check each against a real file before relying on it.
- The MyInvois document is built and validated but never submitted; submission needs LHDN client credentials and a certificate. Foreign-currency rates come from a fixed table in `src/lib/ledger/catalog.ts` until a Bank Negara rate feed is added.
- People can be listed as invited, but nobody is emailed and invited people are not yet added to the workspace automatically.
- Stripe payment details are handled by Stripe Checkout. Do not add card fields to LedgerVoice.
- A verified merchant account must be controlled by an authorised adult or registered-business representative.
- This package is a secure production foundation, not a certification of legal, tax, privacy or security compliance.

## Package map

| Path | Purpose |
|---|---|
| `src/app` | Pages and server API routes |
| `src/components` | The app screens: Capture, Reports, Close, Bank, Hand over, plans |
| `src/lib/ledger` | The rule engine, reports, SST, close, bank reconciler, exports and e-Invoice builder, with tests |
| `src/lib` | Authentication, billing, clients, validation and rate limiting |
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
