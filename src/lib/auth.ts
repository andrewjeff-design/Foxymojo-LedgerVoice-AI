import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthenticatedUser = { id: string; email: string };

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) return null;
  return { id: String(claims.sub), email: String(claims.email || "") };
}

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
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

  if (membershipError || !membership) throw new Response("Workspace not found", { status: 403 });

  const [{ data: workspace }, { data: subscription }] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name, default_country, default_currency")
      .eq("id", membership.workspace_id)
      .single(),
    supabase
      .from("subscriptions")
      .select("status")
      .eq("workspace_id", membership.workspace_id)
      .single()
  ]);

  if (!workspace) throw new Response("Workspace not found", { status: 403 });

  return {
    user,
    workspaceId: membership.workspace_id,
    workspaceName: workspace.name,
    country: workspace.default_country,
    currency: workspace.default_currency,
    role: membership.role,
    subscriptionStatus: subscription?.status || "incomplete"
  };
}

export async function requireEntitledWorkspace() {
  const context = await requireWorkspaceContext();
  if (!new Set(["trialing", "active"]).has(context.subscriptionStatus)) {
    throw new Response("Active subscription required", { status: 402 });
  }
  return context;
}
