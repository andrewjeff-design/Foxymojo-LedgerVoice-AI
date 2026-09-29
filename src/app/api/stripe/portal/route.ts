import { NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { stripe } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const context = await requireWorkspaceContext();
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.from("subscriptions").select("stripe_customer_id").eq("workspace_id", context.workspaceId).single();
    if (!data?.stripe_customer_id) return NextResponse.redirect(`${appUrl()}/plans?billing=no-customer`, 303);
    const session = await stripe().billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: `${appUrl()}/settings` });
    return NextResponse.redirect(session.url, 303);
  } catch (error) { return jsonError(error); }
}
