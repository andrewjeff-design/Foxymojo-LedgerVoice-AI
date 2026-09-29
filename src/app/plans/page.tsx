/* eslint-disable @next/next/no-img-element -- small static logo */
import { redirect } from "next/navigation";
import { ChoosePlans } from "@/components/Plans";
import { getAuthenticatedUser, isEntitled, requireWorkspaceContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  if (!(await getAuthenticatedUser())) redirect("/login?mode=signup");
  const context = await requireWorkspaceContext();
  if (isEntitled(context.subscriptionStatus)) redirect("/dashboard");
  const query = await searchParams;
  const admin = context.role === "owner" || context.role === "admin";

  return (
    <main>
      <div className="wrap">
        <nav className="topnav"><img className="logo-wide" alt="Foxymojo" src="/foxymojo-wide.png" /><div className="spacer" /><span className="note">{context.user.email}</span></nav>
        <header className="lead" style={{ maxWidth: "56ch" }}>
          <p className="eyebrow">Last step</p>
          <h1 style={{ fontSize: "clamp(1.8rem,5vw,2.4rem)" }}>Pick a plan to start the trial</h1>
          <p className="sub">Fourteen days free on any plan, no card. You can change or cancel from Settings before the trial ends. Prices exclude 8% service tax.</p>
          {query.billing === "cancelled" && <p className="notice info">Checkout was closed before it finished. Nothing was charged.</p>}
          {!admin && <p className="notice info">Only the owner or an admin of {context.workspaceName} can start the subscription.</p>}
        </header>
        <ChoosePlans disabled={!admin} />
      </div>
    </main>
  );
}
