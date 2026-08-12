import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth";
import { appUrl, requireEnv } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { stripe } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const context = await requireWorkspaceContext();
    const supabase = await createServerSupabaseClient();
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("workspace_id", context.workspaceId)
      .single();

    if (new Set(["trialing", "active"]).has(subscription?.status || "")) {
      return NextResponse.redirect(`${appUrl()}/dashboard`);
    }

    const customer = subscription?.stripe_customer_id ? { customer: subscription.stripe_customer_id } : { customer_email: context.user.email };
    const session = await stripe().checkout.sessions.create({
      ...customer,
      mode: "subscription",
      line_items: [{ price: requireEnv("STRIPE_PRICE_ID"), quantity: 1 }],
      payment_method_collection: "always",
      allow_promotion_codes: true,
      client_reference_id: context.workspaceId,
      metadata: { workspace_id: context.workspaceId, user_id: context.user.id },
      subscription_data: {
        trial_period_days: 14,
        metadata: { workspace_id: context.workspaceId },
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } }
      },
      success_url: `${appUrl()}/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/dashboard?billing=cancelled`
    });

    if (!session.url) throw new Error("Stripe Checkout did not return a URL.");
    return NextResponse.redirect(session.url, 303);
  } catch (error) { return jsonError(error); }
}
