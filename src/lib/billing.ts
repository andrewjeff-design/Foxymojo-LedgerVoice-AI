import "server-only";
import { type BillingPeriod, type PlanId, PLANS } from "@/lib/ledger/catalog";

/* One Stripe price per plan and billing period, all in MYR. */
const PRICE_ENV: Record<PlanId, Record<BillingPeriod, string>> = {
  starter: { monthly: "STRIPE_PRICE_STARTER_MONTHLY", annual: "STRIPE_PRICE_STARTER_ANNUAL" },
  business: { monthly: "STRIPE_PRICE_BUSINESS_MONTHLY", annual: "STRIPE_PRICE_BUSINESS_ANNUAL" },
  group: { monthly: "STRIPE_PRICE_GROUP_MONTHLY", annual: "STRIPE_PRICE_GROUP_ANNUAL" }
};

export function priceIdFor(plan: PlanId, billing: BillingPeriod) {
  const name = PRICE_ENV[plan][billing];
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/* Which plan a Stripe price belongs to. Unknown prices (for example the legacy single price)
   fall back to Starter so a paying customer is never locked out. */
export function planForPrice(priceId?: string | null): { plan: PlanId; billing: BillingPeriod } | null {
  if (!priceId) return null;
  for (const plan of PLANS) {
    for (const billing of ["monthly", "annual"] as const) {
      if (process.env[PRICE_ENV[plan.id][billing]] === priceId) return { plan: plan.id, billing };
    }
  }
  return { plan: "starter", billing: "monthly" };
}
