import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser, requireWorkspaceContext } from "@/lib/auth";
import DashboardClient from "./dashboard-client";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!(await getAuthenticatedUser())) redirect("/login");
  const context = await requireWorkspaceContext();
  const entitled = new Set(["trialing", "active"]).has(context.subscriptionStatus);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-nav">
        <Link className="brand" href="/"><span>LV</span> LedgerVoice AI</Link>
        <div><span>{context.workspaceName}</span><form action={signOut}><button className="link-button">Sign out</button></form></div>
      </header>
      {entitled ? (
        <DashboardClient country={context.country} currency={context.currency} />
      ) : (
        <section className="subscription-gate">
          <div><p className="eyebrow">LEDGERVOICE PRO</p><h1>Activate your private workspace.</h1><p>Add a card securely through Stripe. Your RM79/month subscription starts after the 14-day trial.</p><ul><li>No charge today</li><li>Cancel through the billing portal</li><li>Payment details stay with Stripe</li></ul></div>
          <form action="/api/stripe/checkout" method="post"><button className="button primary">Start trial in Stripe</button></form>
        </section>
      )}
    </main>
  );
}
