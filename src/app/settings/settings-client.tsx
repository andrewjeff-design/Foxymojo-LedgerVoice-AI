"use client";

/* eslint-disable @next/next/no-img-element -- small static logo */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GO_LIVE, SST_GROUP_OPTIONS } from "@/lib/ledger/catalog";
import { csvOf } from "@/lib/ledger/format";
import { VERIFIED, VERSION } from "@/lib/ledger/rules";
import type { Entity } from "@/lib/ledger/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { download } from "@/components/ledger/bits";

type PlanInfo = { name: string; billing: string; price: string; status: string; trial: string; items: number; used: number; entityLimit: number | "Unlimited"; hasCustomer: boolean };

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
  return data;
}

const blank: Entity = { id: "", name: "", base: "MYR", sstRegistered: false, taxableTurnover12m: 0, annualTurnover: 0, capPolicy: 2000, approvalLimit: 5000 };

function CompanyCard({ entity, admin, onSaved }: { entity: Entity; admin: boolean; onSaved: () => void }) {
  const isNew = !entity.id;
  const [f, setF] = useState({
    name: entity.name, ssm: entity.ssm || "", tin: entity.tin || "", msic: entity.msic || "",
    annualTurnover: String(entity.annualTurnover || ""), sstRegistered: entity.sstRegistered, sstNo: entity.sstNo || "",
    sstGroup: entity.sstGroup && entity.sstGroup !== "none" ? entity.sstGroup : "professional",
    capPolicy: String(entity.capPolicy), approvalLimit: String(entity.approvalLimit), approver: entity.approver || "",
    line1: entity.address?.line1 || "", city: entity.address?.city || "", postcode: entity.address?.postcode || "", state: entity.address?.state || ""
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  const id = (k: string) => (entity.id || "new") + "-" + k;
  const field = (k: keyof typeof f, label: string, mono?: boolean, type = "text") => (
    <label className="field-l" htmlFor={id(k)}>{label}<input id={id(k)} type={type} className={mono ? "mono" : undefined} value={String(f[k])} onChange={set(k)} disabled={!admin} /></label>
  );

  async function save() {
    setBusy(true); setMsg("");
    try {
      const body = {
        name: f.name, ssm: f.ssm, tin: f.tin, msic: f.msic, annualTurnover: Number(f.annualTurnover || 0),
        sstRegistered: f.sstRegistered, sstNo: f.sstNo, sstGroup: f.sstGroup,
        capPolicy: Number(f.capPolicy || 2000), approvalLimit: Number(f.approvalLimit || 5000), approver: f.approver,
        approverRole: entity.approverRole || "", entityType: entity.entityType || "Sdn Bhd", fye: entity.fye || "31 December", base: entity.base || "MYR",
        langs: entity.langs && entity.langs.length ? entity.langs : ["en", "ms", "zh"],
        address: { line1: f.line1, city: f.city, postcode: f.postcode, state: f.state }
      };
      await send("/api/entities", isNew ? "POST" : "PATCH", isNew ? body : { ...body, id: entity.id });
      setMsg(isNew ? "Added." : "Saved — the rules now follow this.");
      onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  }

  return (
    <div className="set-card">
      <h3>{isNew ? "Add another company" : entity.name}</h3>
      {field("name", "Registered name")}
      <div className="two">{field("ssm", "SSM registration no.", true)}{field("tin", "TIN", true)}</div>
      <div className="two">{field("annualTurnover", "Annual turnover (RM)", true, "number")}{field("msic", "MSIC code", true)}</div>
      <div className="switchrow"><input type="checkbox" id={id("sst")} checked={f.sstRegistered} onChange={set("sstRegistered")} disabled={!admin} /><label htmlFor={id("sst")}>Registered for service tax</label></div>
      <div className="two">
        {field("sstNo", "SST registration no.", true)}
        <label className="field-l" htmlFor={id("group")}>Main taxable service<select id={id("group")} value={f.sstGroup} onChange={set("sstGroup")} disabled={!admin || !f.sstRegistered}>{SST_GROUP_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      <div className="two">{field("capPolicy", "Capitalise above (RM)", true, "number")}{field("approvalLimit", "Approval above (RM)", true, "number")}</div>
      {field("approver", "Who approves entries")}
      {field("line1", "Registered address")}
      <div className="two">{field("city", "City")}{field("postcode", "Postcode", true)}</div>
      {field("state", "LHDN state code", true)}
      {admin ? <button className="btn primary" type="button" disabled={busy || !f.name.trim()} onClick={() => void save()}>{busy ? "Saving…" : isNew ? "Add company" : "Save company"}</button> : null}
      {msg ? <p className="note" role="status">{msg}</p> : null}
      <p className="note">These figures drive the engine: registration decides whether tax is charged, turnover decides e-Invoice, and the two thresholds decide what waits for a person. The address, TIN and MSIC go on e-Invoices.</p>
    </div>
  );
}

export default function SettingsClient({ entities, invites, goLive, me, admin, plan, billingNotice }: {
  entities: Entity[];
  invites: { email: string; role: string }[];
  goLive: Record<string, boolean>;
  me: { name: string; email: string; role: string };
  admin: boolean;
  plan: PlanInfo;
  billingNotice: string;
}) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Approver");
  const [gl, setGl] = useState(goLive);
  const [msg, setMsg] = useState("");
  const refresh = () => router.refresh();
  const pct = plan.items ? (plan.used / plan.items) * 100 : 0;
  const canAdd = plan.entityLimit === "Unlimited" || entities.length < plan.entityLimit;

  async function invite() {
    setMsg("");
    try { await send("/api/workspace/invites", "POST", { email: inviteEmail.trim(), role: inviteRole }); setInviteEmail(""); refresh(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not add that."); }
  }
  async function toggleGoLive(item: string, done: boolean) {
    setGl({ ...gl, [item]: done });
    try { setGl((await send("/api/workspace/go-live", "POST", { item, done })).goLive); } catch { setGl(gl); }
  }
  async function exportAll() {
    const snap = await send("/api/ledger", "GET") as { entries: { date: string; entity: string; desc: string; amount: number; taxAmount: number; status: string; approver: string; version: string; utterance: string }[] };
    download("ledger-entries.csv", csvOf([["date", "entity", "description", "amount", "sst", "status", "approver", "rule_version", "spoken"],
      ...snap.entries.map((e) => [e.date, e.entity, e.desc, e.amount, e.taxAmount || 0, e.status, e.approver, e.version, e.utterance])]));
  }
  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <main>
      <div className="wrap">
        <nav className="topnav">
          <img className="logo-mark" alt="Foxymojo" src="/foxymojo-mark.png" />
          <div className="brand"><span className="n">Settings</span></div>
          <div className="spacer" />
          <Link className="btn small ghost" href="/dashboard">Back to the app</Link>
          <button className="btn small ghost" type="button" onClick={() => void signOut()}>Sign out</button>
        </nav>
        {billingNotice ? <p className="notice info">{billingNotice}</p> : null}
        <div className="set-grid">
          {entities.map((e) => <CompanyCard key={e.id} entity={e} admin={admin} onSaved={refresh} />)}

          <div className="set-card">
            <h3>Plan and billing</h3>
            <div className="kv">
              <div><span>Plan</span><span className="v">{plan.name}</span></div>
              <div><span>Billing</span><span className="v">{plan.billing}</span></div>
              <div><span>Price</span><span className="v">{plan.price}</span></div>
              <div><span>Status</span><span className="v">{plan.status}</span></div>
              <div><span>Trial</span><span className="v">{plan.trial}</span></div>
            </div>
            <div className="usage">
              <span className="note">Documents this month: {plan.used} of {plan.items ? plan.items.toLocaleString("en-US") : "—"}</span>
              <div className="track"><div className={"fill" + (pct >= 100 ? " stop" : pct >= 80 ? " warn" : "")} style={{ width: Math.max(2, Math.min(100, pct)) + "%" }} /></div>
            </div>
            {plan.hasCustomer && admin
              ? <form action="/api/stripe/portal" method="post"><button className="btn" type="submit">Change plan, card or cancel</button></form>
              : admin ? <Link className="btn" href="/plans">Choose a plan</Link> : null}
            <p className="note">Billing is handled by Stripe in ringgit; prices exclude 8% service tax. Card details never touch Ledger VoiceAI.</p>
          </div>

          <div className="set-card">
            <h3>People</h3>
            <div className="team">
              <div className="row"><span><strong>{me.name || me.email}</strong><br /><span className="note">{me.email}</span></span><span className="badge plain">{me.role}</span></div>
              {invites.map((m) => (
                <div className="row" key={m.email}>
                  <span><strong>{m.email.split("@")[0]}</strong><br /><span className="note">{m.email} · invited</span></span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span className="badge plain">{m.role}</span>
                    {admin ? <button className="linky" type="button" onClick={() => void send("/api/workspace/invites?email=" + encodeURIComponent(m.email), "DELETE").then(refresh)}>remove</button> : null}
                  </span>
                </div>
              ))}
            </div>
            {admin ? (
              <>
                <div className="two">
                  <label className="field-l" htmlFor="inv-email">Invite by email<input id="inv-email" type="email" placeholder="colleague@company.com.my" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /></label>
                  <label className="field-l" htmlFor="inv-role">Role<select id="inv-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>{["Approver", "Recorder", "Viewer", "External accountant"].map((r) => <option key={r}>{r}</option>)}</select></label>
                </div>
                <button className="btn" type="button" disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteEmail.trim())} onClick={() => void invite()}>Add to the list</button>
                {msg ? <p className="err">{msg}</p> : null}
              </>
            ) : null}
            <p className="note">Recorders capture, approvers post, viewers read. Invitations are recorded here; nobody is emailed yet.</p>
          </div>

          <div className="set-card">
            <h3>Rule pack</h3>
            <div className="kv">
              <div><span>Version</span><span className="v">{VERSION}</span></div>
              <div><span>Verified</span><span className="v">{VERIFIED}</span></div>
              <div><span>Service tax</span><span className="v">8% standard · 6% reduced</span></div>
              <div><span>e-Invoice exemption</span><span className="v">RM3,000,000</span></div>
              <div><span>MPERS</span><span className="v">S17 S20 S23 S30 S33</span></div>
            </div>
            <p className="note">MPERS (2025) applies to periods beginning 1 January 2027. The pack is dated so you can prove which rules produced an entry.</p>
          </div>

          <div className="set-card">
            <h3>Before this goes live</h3>
            <div className="golive">{GO_LIVE.map((item, i) => {
              const key = "gl" + i;
              return <label key={key} htmlFor={key}><input type="checkbox" id={key} checked={!!gl[key]} disabled={!admin} onChange={(e) => void toggleGoLive(key, e.target.checked)} /><span>{item}</span></label>;
            })}</div>
            <p className="note">The operator&apos;s checklist. Capture, the rule engine, invoices, approvals, the ledger and the four statements already work.</p>
          </div>

          {admin && canAdd ? <CompanyCard key={"new-" + entities.length} entity={blank} admin={admin} onSaved={refresh} /> : null}

          <div className="set-card">
            <h3>Data</h3>
            <p className="note">Your books are stored in your workspace and protected by row-level security. Posted entries cannot be edited or deleted; export them whenever you like.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn small ghost" type="button" onClick={() => void exportAll()}>Export every entry (CSV)</button>
              <Link className="btn small ghost" href="/demo">Open the demo company</Link>
            </div>
            {!canAdd ? <p className="note">{plan.name} covers {String(plan.entityLimit)} compan{plan.entityLimit === 1 ? "y" : "ies"}. Change plan to add another.</p> : null}
          </div>
        </div>
        <div style={{ height: 40 }} />
      </div>
    </main>
  );
}
