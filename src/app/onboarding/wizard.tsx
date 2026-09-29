"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SST_GROUP_OPTIONS } from "@/lib/ledger/catalog";

const TITLES = ["Company", "Tax profile", "Policies and people"];
const HEADS = ["Tell the agent about your company", "How you stand with SST and e-Invoice", "The rules it must follow"];
const SUBS = [
  "These answers set the rules the engine applies to every entry. You can change them later in Settings.",
  "Service tax and e-Invoice behaviour follow these answers exactly.",
  "Thresholds decide what the agent does alone and what waits for a person."
];
const LANG_CHIPS: [string, string][] = [["en", "English"], ["ms", "Bahasa Melayu"], ["zh", "中文"]];

export default function Wizard({ company, name }: { company: string; name: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: company, ssm: "", entityType: "Sdn Bhd", fye: "31 December", base: "MYR",
    sstRegistered: false, sstNo: "", sstGroup: "professional", annualTurnover: "", tin: "",
    capPolicy: "2000", approvalLimit: "5000", approver: name, approverRole: "Owner / Director",
    langs: ["en", "ms", "zh"]
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  const turnover = Number(f.annualTurnover || 0);

  function toggleLang(code: string) {
    const on = f.langs.includes(code);
    if (on && f.langs.length === 1) return;
    setF({ ...f, langs: on ? f.langs.filter((l) => l !== code) : [...f.langs, code] });
  }

  async function next() {
    setErr("");
    if (step === 1) {
      if (!f.name.trim()) { setErr("The registered name is needed."); return; }
      setStep(2); return;
    }
    if (step === 2) {
      if (f.sstRegistered && !f.sstNo.trim()) { setErr("Add the SST registration number, or untick registration."); return; }
      if (!turnover) { setErr("Annual turnover decides your e-Invoice position, so it is needed."); return; }
      setStep(3); return;
    }
    if (!f.approver.trim()) { setErr("Name whoever approves entries. Nothing posts without a name."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/entities", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, annualTurnover: turnover, capPolicy: Number(f.capPolicy || 2000), approvalLimit: Number(f.approvalLimit || 5000) })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save the company.");
      router.push("/plans");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the company.");
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="wiz" aria-hidden="true">{[1, 2, 3].map((n) => <div key={n} className={n <= step ? "on" : ""} />)}</div>
      <p className="wiz-lab">Step {step} of 3 · {TITLES[step - 1]}</p>
      <h2>{HEADS[step - 1]}</h2>
      <p className="note">{SUBS[step - 1]}</p>

      <div hidden={step !== 1}>
        <label className="field-l" htmlFor="c-legal">Registered name<input id="c-legal" type="text" value={f.name} onChange={set("name")} placeholder="Acme Trading Sdn Bhd" /></label>
        <div className="two" style={{ marginTop: 12 }}>
          <label className="field-l" htmlFor="c-ssm">SSM registration no.<input id="c-ssm" className="mono" type="text" value={f.ssm} onChange={set("ssm")} placeholder="202001012345 (1234567-A)" /></label>
          <label className="field-l" htmlFor="c-type">Entity type<select id="c-type" value={f.entityType} onChange={set("entityType")}>{["Sdn Bhd", "Berhad", "Enterprise / Sole proprietor", "LLP", "Partnership"].map((o) => <option key={o}>{o}</option>)}</select></label>
        </div>
        <div className="two" style={{ marginTop: 12 }}>
          <label className="field-l" htmlFor="c-fye">Financial year end<select id="c-fye" value={f.fye} onChange={set("fye")}>{["31 December", "31 March", "30 June", "30 September", "Other"].map((o) => <option key={o}>{o}</option>)}</select></label>
          <label className="field-l" htmlFor="c-cur">Reporting currency<select id="c-cur" value={f.base} onChange={set("base")}>{["MYR", "SGD", "USD"].map((o) => <option key={o}>{o}</option>)}</select></label>
        </div>
      </div>

      <div hidden={step !== 2}>
        <div className="switchrow"><input type="checkbox" id="t-sst" checked={f.sstRegistered} onChange={set("sstRegistered")} /><label htmlFor="t-sst">Registered for service tax (SST)</label></div>
        <div className="two" style={{ marginTop: 12 }}>
          <label className="field-l" htmlFor="t-sstno">SST registration no.<input id="t-sstno" className="mono" type="text" value={f.sstNo} onChange={set("sstNo")} disabled={!f.sstRegistered} placeholder="W10-1808-3100xxxx" /></label>
          <label className="field-l" htmlFor="t-group">Main taxable service<select id="t-group" value={f.sstGroup} onChange={set("sstGroup")} disabled={!f.sstRegistered}>{SST_GROUP_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
        <div className="two" style={{ marginTop: 12 }}>
          <label className="field-l" htmlFor="t-turnover">Annual turnover (RM)<input id="t-turnover" className="mono" type="number" min="0" step="10000" value={f.annualTurnover} onChange={set("annualTurnover")} placeholder="1200000" /></label>
          <label className="field-l" htmlFor="t-tin">Tax identification no. (TIN)<input id="t-tin" className="mono" type="text" value={f.tin} onChange={set("tin")} placeholder="C12345678900" /></label>
        </div>
        <p className="note" style={{ marginTop: 10 }}>{turnover >= 3000000
          ? "At RM" + turnover.toLocaleString("en-US") + " turnover you are inside e-Invoice Phase 4, so sales invoices go to MyInvois for validation."
          : "Under the RM3m exemption raised in September 2026, e-Invoice is optional for you. The agent will still keep invoices MyInvois-ready."}</p>
      </div>

      <div hidden={step !== 3}>
        <div className="two">
          <label className="field-l" htmlFor="p-cap">Capitalise anything above (RM)<input id="p-cap" className="mono" type="number" min="0" step="100" value={f.capPolicy} onChange={set("capPolicy")} /></label>
          <label className="field-l" htmlFor="p-limit">Approval needed above (RM)<input id="p-limit" className="mono" type="number" min="0" step="500" value={f.approvalLimit} onChange={set("approvalLimit")} /></label>
        </div>
        <div className="two" style={{ marginTop: 12 }}>
          <label className="field-l" htmlFor="p-approver">Who approves entries<input id="p-approver" type="text" value={f.approver} onChange={set("approver")} placeholder="Name of the approver" /></label>
          <label className="field-l" htmlFor="p-role">Their role<select id="p-role" value={f.approverRole} onChange={set("approverRole")}>{["Owner / Director", "Finance manager", "Accountant", "External bookkeeper"].map((o) => <option key={o}>{o}</option>)}</select></label>
        </div>
        <p className="wiz-lab" style={{ marginTop: 14 }}>Languages to capture in</p>
        <div className="langs" style={{ marginTop: 6 }}>
          {LANG_CHIPS.map(([code, label]) => <button key={code} className="chip-btn" type="button" aria-pressed={f.langs.includes(code)} onClick={() => toggleLang(code)}>{label}</button>)}
        </div>
      </div>

      <p className="err" role="alert">{err}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn ghost" type="button" disabled={step === 1 || busy} onClick={() => { setErr(""); setStep(step - 1); }}>Previous</button>
        <button className="btn primary" type="button" disabled={busy} onClick={next}>{step === 3 ? (busy ? "Saving…" : "Save and choose a plan") : "Continue"}</button>
      </div>
    </div>
  );
}
