# Go-live sign-off

Complete in test mode first. Add the responsible person's initials and date to every checked item.

## Business and legal

- [ ] Operating entity and authorised merchant representative verified.
- [ ] RM79/month and 14-day card-required trial wording approved.
- [ ] Terms, privacy notice, cancellation/refund policy and support contact published.
- [ ] Data map, retention schedule, subprocessors and cross-border review completed.
- [ ] Tax claims reviewed; no feature is described as automatic filing or guaranteed optimisation.

## Accounts and secrets

- [ ] MFA enabled on every provider and the domain registrar.
- [ ] Two business administrators can recover each critical account.
- [ ] Test and production credentials are separate.
- [ ] No secret appears in Git history, screenshots, tickets or browser code.
- [ ] Budget/usage alerts configured for OpenAI, Vercel, Supabase and Stripe.

## Database

- [ ] Migration applied successfully in production.
- [ ] RLS enabled on all public customer-data tables.
- [ ] Two-account tenant-isolation test passed.
- [ ] Backup schedule recorded and restore drill passed.
- [ ] Audit logs created for approved invoices and expenses.

## Authentication

- [ ] Production SMTP configured.
- [ ] Email confirmation enabled.
- [ ] Site URL and callback URL use the final HTTPS domain.
- [ ] Sign-up, confirmation, sign-in and sign-out tested.
- [ ] Lost-password and support recovery process tested before public launch.

## Billing

- [ ] Stripe product/price is exactly MYR 79 monthly.
- [ ] Checkout requires a card and creates a 14-day trial.
- [ ] Webhook signature verification tested.
- [ ] Trialing/active access tested.
- [ ] Cancellation, failed payment and billing portal tested.
- [ ] One controlled live transaction reconciled after live keys are enabled.

## Finance workflow

- [ ] Voice and typed commands tested in expected languages/accents.
- [ ] No AI output saves automatically.
- [ ] User can edit every material draft field before approval.
- [ ] Reports reconcile to test invoices and expenses.
- [ ] Expense tax status defaults to review.
- [ ] No tax rule set is active without qualified written sign-off.

## Operations

- [ ] `/api/health` monitored.
- [ ] Server errors and Stripe webhook failures alert an operator.
- [ ] Incident-response contacts and escalation path published internally.
- [ ] Rollback steps and database recovery objectives recorded.
- [ ] Pilot completed before general public advertising.

Launch approved by: ____________________  Date: __________

Technical sign-off: ____________________  Date: __________

Privacy/legal sign-off: _________________ Date: __________

Tax/accounting sign-off: ________________ Date: __________
