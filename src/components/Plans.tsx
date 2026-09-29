"use client";

import Link from "next/link";
import { useState } from "react";
import { ADDONS, annualPrice, type BillingPeriod, type Plan, PLANS } from "@/lib/ledger/catalog";
import { whole } from "@/lib/ledger/format";

export function BillingToggle({ billing, onChange }: { billing: BillingPeriod; onChange: (b: BillingPeriod) => void }) {
  return (
    <div className="bill-toggle" role="group" aria-label="Billing period">
      <button type="button" aria-pressed={billing === "monthly"} onClick={() => onChange("monthly")}>Monthly</button>
      <button type="button" aria-pressed={billing === "annual"} onClick={() => onChange("annual")}>Annual · 2 months free</button>
    </div>
  );
}

function priceLabel(p: Plan, billing: BillingPeriod): [string, string] {
  return billing === "monthly" ? [whole(p.price), "/ month"] : [whole(annualPrice(p)), "/ year"];
}

/* The plan card, and what its button does: a link on the landing page, a checkout form once
   the company is set up. */
export function PlanCard({ plan, billing, action }: { plan: Plan; billing: BillingPeriod; action: React.ReactNode }) {
  const [big, per] = priceLabel(plan, billing);
  return (
    <div className={"plan" + (plan.popular ? " pop" : "")}>
      <div className="ptop"><span className="pname">{plan.name}</span>{plan.popular ? <span className="pill">Most chosen</span> : null}</div>
      <p className="pfor">{plan.blurb}</p>
      <p className="pprice"><b>{big}</b><span>{per}</span>{billing === "annual" ? <span>· {whole(Math.round(annualPrice(plan) / 12))} a month</span> : null}</p>
      <ul>{plan.features.map((f) => <li key={f}>{f}</li>)}</ul>
      <p className="limits">{[
        plan.entities === "Unlimited" ? "Unlimited entities" : plan.entities + (plan.entities > 1 ? " entities" : " entity"),
        plan.users === "Unlimited" ? "unlimited users" : plan.users + " users",
        plan.items.toLocaleString("en-US") + " documents a month"
      ].join(" · ")}</p>
      {action}
    </div>
  );
}

export function LandingPricing() {
  const [billing, setBilling] = useState<BillingPeriod>("monthly");
  return (
    <>
      <BillingToggle billing={billing} onChange={setBilling} />
      <div className="plans">
        {PLANS.map((p) => (
          <PlanCard key={p.id} plan={p} billing={billing}
            action={<Link className={"btn " + (p.popular ? "primary" : "")} href="/login?mode=signup">Start the trial</Link>} />
        ))}
      </div>
      <h3 style={{ marginTop: 22 }}>Add-ons</h3>
      <div className="addons">{ADDONS.map(([n, v]) => <div key={n}><span>{n}</span><span className="a">{v}</span></div>)}</div>
    </>
  );
}

/* Choosing a plan starts Stripe Checkout; the trial begins there with no card. */
export function ChoosePlans({ current, disabled }: { current?: string | null; disabled?: boolean }) {
  const [billing, setBilling] = useState<BillingPeriod>("monthly");
  return (
    <>
      <BillingToggle billing={billing} onChange={setBilling} />
      <div className="plans" style={{ marginBottom: 40 }}>
        {PLANS.map((p) => (
          <PlanCard key={p.id} plan={p} billing={billing} action={
            <form action="/api/stripe/checkout" method="post">
              <input type="hidden" name="plan" value={p.id} />
              <input type="hidden" name="billing" value={billing} />
              <button className={"btn " + (p.popular ? "primary" : "")} style={{ width: "100%" }} type="submit" disabled={disabled || current === p.id}>
                {current === p.id ? "Current plan" : "Start the trial"}
              </button>
            </form>
          } />
        ))}
      </div>
    </>
  );
}
