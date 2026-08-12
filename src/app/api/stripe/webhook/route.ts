import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requireEnv } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const allowedStatuses = new Set(["incomplete", "trialing", "active", "past_due", "canceled", "unpaid", "paused"]);

function statusForDatabase(status: Stripe.Subscription.Status) {
  return allowedStatuses.has(status) ? status : "incomplete";
}

async function workspaceForSubscription(subscription: Stripe.Subscription) {
  if (subscription.metadata.workspace_id) return subscription.metadata.workspace_id;
  const admin = createAdminSupabaseClient();
  const { data } = await admin.from("subscriptions").select("workspace_id").or(`stripe_subscription_id.eq.${subscription.id},stripe_customer_id.eq.${String(subscription.customer)}`).maybeSingle();
  return data?.workspace_id || null;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const workspaceId = await workspaceForSubscription(subscription);
  if (!workspaceId) throw new Error(`No workspace mapping for subscription ${subscription.id}`);
  const item = subscription.items.data[0];
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("subscriptions").upsert({
    workspace_id: workspaceId,
    stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    stripe_subscription_id: subscription.id,
    stripe_price_id: item?.price?.id || null,
    status: statusForDatabase(subscription.status),
    trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    current_period_ends_at: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString()
  }, { onConflict: "workspace_id" });
  if (error) throw error;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, requireEnv("STRIPE_WEBHOOK_SECRET"));
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: duplicate } = await admin.from("stripe_events").select("event_id").eq("event_id", event.id).maybeSingle();
  if (duplicate) return NextResponse.json({ received: true, duplicate: true });

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspace_id || session.client_reference_id;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (workspaceId && subscriptionId) {
        const subscription = await stripe().subscriptions.retrieve(subscriptionId);
        await syncSubscription(subscription);
      }
    }
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      await syncSubscription(event.data.object as Stripe.Subscription);
    }

    const { error } = await admin.from("stripe_events").insert({ event_id: event.id, event_type: event.type });
    if (error && error.code !== "23505") throw error;
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
