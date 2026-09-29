/* eslint-disable @next/next/no-img-element -- small static logo */
import { redirect } from "next/navigation";
import { getAuthenticatedUser, requireWorkspaceContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Wizard from "./wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login?mode=signup");
  const context = await requireWorkspaceContext();
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase.from("ledger_entities").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId);
  if (count) redirect("/dashboard");

  const { data } = await supabase.auth.getUser();
  const company = String(data.user?.user_metadata?.company || "");

  return (
    <main>
      <div className="wrap">
        <nav className="topnav"><img className="logo-wide" alt="Foxymojo" src="/foxymojo-wide.png" /><div className="spacer" /><span className="note">{user.email}</span></nav>
        <div className="auth-wrap" style={{ maxWidth: 600 }}>
          <Wizard company={company} name={user.name} />
        </div>
      </div>
    </main>
  );
}
