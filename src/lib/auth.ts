import { planForPrice } from "@/lib/billing";
import type { BillingPeriod, PlanId } from "@/lib/ledger/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthenticatedUser = { id: string; email: string; name: string };

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) return null;
  const meta = (claims.user_metadata || {}) as { full_name?: string };
  return { id: String(claims.sub), email: String(claims.email || ""), name: String(meta.full_name || "") };
}

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser();
  if (!user) throw new Response("Unauthorized", { status: 401, statusText: "Unauthorized" });
  return user;
}

export type WorkspaceContext = {
  user: AuthenticatedUser;
  workspaceId: string;
  workspaceName: string;
  country: "MY" | "SG" | "AU" | "ID";
  currency: "MYR" | "SGD" | "AUD" | "IDR";
  role: "owner" | "admin" | "member" | "viewer";
  subscriptionStatus: string;
  plan: PlanId | null;
  billing: BillingPeriod | null;
  trialEndsAt: string | null;
  hasStripeCustomer: boolean;
};

export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const user = await requireAuthenticatedUser();
  const supabase = await createServerSupabaseClient();

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipError || !membership) throw new Response("Workspace not found", { status: 403, statusText: "Workspace not found" });

  const [{ data: workspace }, { data: subscription }] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name, default_country, default_currency")
      .eq("id", membership.workspace_id)
      .single(),
    supabase
      .from("subscriptions")
      .select("status, stripe_price_id, stripe_customer_id, trial_ends_at")
      .eq("workspace_id", membership.workspace_id)
      .single()
  ]);

  if (!workspace) throw new Response("Workspace not found", { status: 403, statusText: "Workspace not found" });
  const plan = planForPrice(subscription?.stripe_price_id);

  return {
    user,
    workspaceId: membership.workspace_id,
    workspaceName: workspace.name,
    country: workspace.default_country,
    currency: workspace.default_currency,
    role: membership.role,
    subscriptionStatus: subscription?.status || "incomplete",
    plan: plan?.plan || null,
    billing: plan?.billing || null,
    trialEndsAt: subscription?.trial_ends_at || null,
    hasStripeCustomer: !!subscription?.stripe_customer_id
  };
}

export const isEntitled = (status: string) => new Set(["trialing", "active"]).has(status);

export async function requireEntitledWorkspace() {
  const context = await requireWorkspaceContext();
  if (!isEntitled(context.subscriptionStatus)) {
    throw new Response("Active subscription required", { status: 402, statusText: "Active subscription required" });
  }
  return context;
}

export function requireWriter(context: WorkspaceContext) {
  if (context.role === "viewer") throw new Response("View-only account", { status: 403, statusText: "View-only account" });
}

export function requireAdmin(context: WorkspaceContext) {
  if (context.role !== "owner" && context.role !== "admin") throw new Response("Only an owner or admin can change this", { status: 403, statusText: "Only an owner or admin can change this" });
}
