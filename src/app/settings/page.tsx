import { redirect } from "next/navigation";
import { getAuthenticatedUser, requireWorkspaceContext } from "@/lib/auth";
import { annualPrice, malaysiaToday, planById, trialDaysLeft } from "@/lib/ledger/catalog";
import { whole } from "@/lib/ledger/format";
import { loadEntities } from "@/lib/ledger-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import SettingsClient from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  if (!(await getAuthenticatedUser())) redirect("/login");
  const context = await requireWorkspaceContext();
  const supabase = await createServerSupabaseClient();
  const today = malaysiaToday();
  const [entities, { data: invites }, { data: workspace }, { count: used }] = await Promise.all([
    loadEntities(supabase, context.workspaceId),
    supabase.from("workspace_invites").select("email, role").eq("workspace_id", context.workspaceId).order("created_at"),
    supabase.from("workspaces").select("go_live").eq("id", context.workspaceId).single(),
    supabase.from("ledger_entries").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId).eq("status", "posted").gte("entry_date", today.slice(0, 7) + "-01")
  ]);
  if (!entities.length) redirect("/onboarding");
  const query = await searchParams;

  const plan = planById(context.plan);
  const trialDays = context.subscriptionStatus === "trialing" ? trialDaysLeft(context.trialEndsAt, today) : null;

  return (
    <SettingsClient
      entities={entities}
      invites={(invites || []) as { email: string; role: string }[]}
      goLive={(workspace?.go_live || {}) as Record<string, boolean>}
      me={{ name: context.user.name, email: context.user.email, role: context.role }}
      admin={context.role === "owner" || context.role === "admin"}
      billingNotice={query.billing === "manage" ? "You already have a subscription. Change plan or billing period in the billing portal." : ""}
      plan={{
        name: plan?.name || "None chosen",
        billing: context.billing === "annual" ? "Annual" : context.billing === "monthly" ? "Monthly" : "—",
        price: plan ? (context.billing === "annual" ? whole(annualPrice(plan)) + " / year" : whole(plan.price) + " / month") : "—",
        status: context.subscriptionStatus,
        trial: trialDays === null ? "—" : trialDays + " days left",
        items: plan?.items || 0,
        used: used || 0,
        entityLimit: plan ? plan.entities : 1,
        hasCustomer: context.hasStripeCustomer
      }}
    />
  );
}
