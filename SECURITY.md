# Security and data-protection runbook

## Security model included in the package

| Risk | Control in this package |
|---|---|
| Subscriber A reads Subscriber B data | Supabase Auth + server membership resolution + PostgreSQL RLS on tenant tables |
| Browser obtains administrator access | Supabase secret key is imported only by `server-only` modules and is never prefixed `NEXT_PUBLIC_` |
| Fake payment unlocks access | Access uses signed Stripe webhook state, not the browser success redirect |
| Duplicate webhooks | Processed Stripe event IDs are recorded; subscription writes are idempotent upserts |
| AI posts a wrong amount | Structured output produces a draft; the user must review and approve before save |
| Prompt produces unsafe tax certainty | AI extractor is prohibited from determining deductibility; expenses default to `review` |
| Oversized or automated AI use | Audio/text size limits and user-scoped server rate limits |
| Input corruption or unexpected fields | Zod schemas validate all finance write endpoints |
| Lost accountability | Approved finance writes append audit entries |
| Web injection/clickjacking | CSP and browser security headers in `next.config.ts` |
| Payment-card exposure | Stripe-hosted Checkout and customer portal; LedgerVoice stores only Stripe IDs/status |

## Controls that still require configuration

- MFA on Vercel, Supabase, Stripe, OpenAI, domain registrar, source repository and email accounts.
- Production SMTP and account-recovery procedures.
- Supabase backups, recovery drills and database alerts.
- WAF/bot protection, central logging, alerting and dependency scanning.
- Privacy notice, terms, retention schedule, subprocessors list and data-request procedure.
- Penetration testing before a broad public launch.
- Qualified review of every active tax rule set.
- A tested incident-response team and communications process.

## Secret management

1. Store secrets in provider environment-variable settings and a company password manager.
2. Never send secrets by ordinary email or chat.
3. Give production access only to people who need it.
4. Use separate test and production keys.
5. Rotate immediately after suspected exposure, staff departure or repository leak.
6. After rotation, redeploy: older deployments can still contain older environment values.
7. Search Git history and build logs after any exposure; deleting a visible line is not sufficient.

## Tenant isolation

RLS is the primary data boundary. Do not add a new table holding customer data without:

1. `workspace_id` as a required foreign key;
2. an index beginning with `workspace_id` for tenant queries;
3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`;
4. explicit policies for select/insert/update/delete;
5. tests using two unrelated authenticated users;
6. server routes that derive workspace membership rather than trusting a request field.

The Supabase secret key bypasses RLS. Use it only for Stripe webhook synchronisation and operational rate-limit data. Normal finance CRUD uses the signed-in user's server client so RLS remains effective.

## Data minimisation and retention

Recommended launch defaults, subject to legal/accounting review:

| Data | Suggested approach |
|---|---|
| Raw microphone audio | Transcribe in-request and do not persist |
| Voice transcript | Store only if needed for audit; otherwise remove or redact after approval |
| Invoice/expense records | Retain for the period required by the relevant accounting/tax law |
| Audit logs | Append-only, access restricted, retention tied to accountability needs |
| Stripe event IDs | Retain for webhook idempotency and billing investigation |
| Closed-account data | Export if required, then delete/anonymise on a documented schedule unless legal retention applies |

Do not log full transcripts, authentication tokens, secret keys, tax IDs, receipts or customer addresses in ordinary application logs.

## Incident response

When a suspected data incident occurs:

1. Preserve evidence and record the detection time.
2. Contain access: disable affected accounts or deployments and rotate relevant keys.
3. Determine systems, tenants, fields, dates and recipients affected.
4. Restore service safely without deleting evidence.
5. Ask privacy/legal advisers to assess notification obligations and deadlines in every affected jurisdiction.
6. Notify customers/regulators when required, using verified facts.
7. Document cause, corrective actions and the owner/date for each follow-up.

Do not silently alter audit logs or tell customers an incident is resolved before the scope is verified.

## Release security checklist

- `npm audit` reviewed; high/critical findings resolved or formally accepted.
- `npm run test` passes.
- No secrets in Git, build output or browser bundles.
- New database tables have RLS and tenant tests.
- Stripe webhook signature failure returns HTTP 400.
- Account B cannot access Account A IDs.
- Canceled/unpaid accounts cannot use finance APIs.
- Backup and rollback paths are current.
- Privacy and tax reviewers approved relevant changes.
