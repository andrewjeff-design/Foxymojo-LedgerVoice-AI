import { redirect } from "next/navigation";
import LedgerApp from "@/components/ledger/LedgerApp";
import { getAuthenticatedUser, isEntitled, requireWorkspaceContext } from "@/lib/auth";
import { malaysiaToday, planById, trialDaysLeft } from "@/lib/ledger/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!(await getAuthenticatedUser())) redirect("/login");
  const context = await requireWorkspaceContext();
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase.from("ledger_entities").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId);
  /* set up the company first, then the plan, then the books */
  if (!count) redirect("/onboarding");
  if (!isEntitled(context.subscriptionStatus)) redirect("/plans");

  const plan = planById(context.plan);
  const trialDays = context.subscriptionStatus === "trialing" ? trialDaysLeft(context.trialEndsAt, malaysiaToday()) : null;
  const planLabel = plan ? (trialDays !== null ? plan.name + " · trial, " + trialDays + "d" : plan.name) : "trial";

  return (
    <main>
      <LedgerApp mode="live" title={context.workspaceName} planLabel={planLabel} person={context.user.name || context.user.email}
        usage={plan ? { items: plan.items, planName: plan.name } : null} readOnly={context.role === "viewer"} />
    </main>
  );
}
