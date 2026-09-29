import { NextResponse } from "next/server";
import { z } from "zod";
import { isEntitled, requireAdmin, requireWorkspaceContext } from "@/lib/auth";
import { priceIdFor } from "@/lib/billing";
import { appUrl } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { stripe } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  plan: z.enum(["starter", "business", "group"]),
  billing: z.enum(["monthly", "annual"])
});

/* Fourteen days free on any plan, no card to start. Stripe collects a payment method before
   the trial ends; without one the subscription cancels and the books go read-only. */
export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    requireAdmin(context);
    const form = await request.formData();
    const choice = checkoutSchema.parse({ plan: form.get("plan"), billing: form.get("billing") });
    const supabase = await createServerSupabaseClient();
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("workspace_id", context.workspaceId)
      .single();

    /* an existing subscriber changes plan in the billing portal, not with a second subscription */
    if (isEntitled(subscription?.status || "")) {
      return NextResponse.redirect(`${appUrl()}/settings?billing=manage`, 303);
    }

    const customer = subscription?.stripe_customer_id ? { customer: subscription.stripe_customer_id } : { customer_email: context.user.email };
    const session = await stripe().checkout.sessions.create({
      ...customer,
      mode: "subscription",
      line_items: [{ price: priceIdFor(choice.plan, choice.billing), quantity: 1 }],
      payment_method_collection: "if_required",
      allow_promotion_codes: true,
      client_reference_id: context.workspaceId,
      metadata: { workspace_id: context.workspaceId, user_id: context.user.id, plan: choice.plan, billing: choice.billing },
      subscription_data: {
        trial_period_days: 14,
        metadata: { workspace_id: context.workspaceId, plan: choice.plan, billing: choice.billing },
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } }
      },
      success_url: `${appUrl()}/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/plans?billing=cancelled`
    });

    if (!session.url) throw new Error("Stripe Checkout did not return a URL.");
    return NextResponse.redirect(session.url, 303);
  } catch (error) { return jsonError(error); }
}
