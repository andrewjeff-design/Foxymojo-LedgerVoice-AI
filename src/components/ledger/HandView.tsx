"use client";

import { useState } from "react";
import * as EI from "@/lib/ledger/einvoice";
import * as X from "@/lib/ledger/export";
import { signed, whole } from "@/lib/ledger/format";
import type { Entity, Entry } from "@/lib/ledger/types";
import { download, ReportCard } from "./bits";

export function HandView({ entity, journals, today }: { entity: Entity; journals: Entry[]; today: string }) {
  const posted = journals.filter((j) => j.status === "posted");
  const invs = posted.filter((j) => j.inv && j.inv.number);
  const [pick, setPick] = useState("");

  const hero = (
    <header className="hero">
      <p className="eyebrow">Sit beside what they already run</p>
      <h1>Hand the books over.</h1>
      <p>AutoCount and SQL Account are sold through a dealer and accountant channel, so replacing them means fighting a reseller network. Writing into them instead removes the migration objection. Every file is <mark>checked before it is written</mark> — an export that would not import cleanly is refused here rather than discovered over there.</p>
    </header>
  );

  if (!posted.length) {
    return <>{hero}<ReportCard title="Nothing to hand over yet" sub={entity.name}><p className="note">Post some entries first.</p></ReportCard></>;
  }

  const gate = X.check(journals);
  const save = (targetId: string, kind: "journals" | "chart" | "invoices") => {
    if (kind === "journals") {
      const out = X.build(journals, targetId);
      if (out.check.ok) download(out.filename, out.csv);
      return;
    }
    const out = kind === "chart" ? X.buildChart(journals) : X.buildInvoices(journals);
    download(targetId + "-" + out.filename, out.csv);
  };

  const ob = EI.obligation({ annualTurnover: entity.annualTurnover }, today);
  /* the supplier comes from the company profile; gaps show up as validation findings, never as made-up values */
  const supplier: EI.Supplier = {
    name: entity.name, tin: entity.tin, brn: entity.brn || entity.ssm, msic: entity.msic,
    sstRegistered: entity.sstRegistered, sstNo: entity.sstNo, address: entity.address
  };
  const chosen = invs.find((j) => j.inv!.number === pick) || invs[0];
  const built = chosen ? EI.build({
    number: chosen.inv!.number, date: chosen.date, due: chosen.inv!.due, customer: chosen.inv!.customer, customer_tin: chosen.inv!.customer_tin,
    items: chosen.inv!.items || [{ description: chosen.desc, qty: 1, unit_price: (chosen.inv!.total || 0) - (chosen.inv!.tax || 0) }],
    subtotal: (chosen.inv!.total || 0) - (chosen.inv!.tax || 0), tax: chosen.inv!.tax || 0, total: chosen.inv!.total || 0, currency: "MYR"
  }, supplier) : null;

  return (
    <>
      {hero}
      <div style={{ display: "grid", gap: 14 }}>
        <ReportCard title="Before anything leaves" sub={gate.entries + " posted entries checked"} checks={[{ ok: gate.ok, label: gate.ok ? "Safe to export" : "Export refused" }]}>
          {gate.problems.length
            ? <div className="warnbox"><b>These would break the import</b>{gate.problems.map((p) => <p key={p}>{p}</p>)}</div>
            : <p className="note" style={{ padding: "4px 6px" }}>Every entry balances, every line has an account code, and the file foots to {whole(gate.totalDr)} on each side.</p>}
          {gate.warnings.length ? <div className="warnbox"><b>Worth knowing</b>{gate.warnings.slice(0, 4).map((p) => <p key={p}>{p}</p>)}</div> : null}
        </ReportCard>

        <ReportCard title="Where it goes" sub="Journals, the account map to reconcile codes, and sales invoices"
          checks={[{ ok: false, warn: true, label: "Diff each unverified map against a real export from the customer’s own copy before relying on it" }]}>
          <div className="tgrid">{Object.values(X.TARGETS).map((t) => (
            <div className="tcard" key={t.id}>
              <h3>{t.name}</h3>
              <span className={"badge " + (t.verified ? "ok" : "warn")} style={{ width: "fit-content" }}>{t.verified ? "layout is ours" : "column map unverified"}</span>
              <p>{t.note}</p>
              <div className="cta-row">
                <button className="btn small" type="button" disabled={!gate.ok} onClick={() => save(t.id, "journals")}>Journals</button>
                <button className="btn small ghost" type="button" disabled={!gate.ok} onClick={() => save(t.id, "chart")}>Account map</button>
                <button className="btn small ghost" type="button" disabled={!gate.ok} onClick={() => save(t.id, "invoices")}>Invoices</button>
              </div>
              {t.docs ? <p className="note"><a href={t.docs} target="_blank" rel="noopener noreferrer">Integration docs</a></p> : null}
            </div>
          ))}</div>
        </ReportCard>

        <ReportCard title="e-Invoice (MyInvois)" sub="Built and validated here; submission needs credentials" checks={[
          { ok: false, warn: true, label: "Not submitted — needs an ERP registration and a certificate from a licensed CA" },
          { ok: false, warn: true, label: "Built against " + EI.SPEC.checkedAgainst + ", which is patched monthly" }
        ]}>
          <div className={ob.mandated ? "warnbox" : ""}>
            {ob.mandated ? <b>This company has to issue e-Invoices</b> : null}
            {ob.reasons.map((r) => <p key={r} className={ob.mandated ? undefined : "note"}>{r}</p>)}
            <p className="note">{ob.note}</p>
          </div>
          {chosen && built ? (
            <>
              <label className="pick hand-pick" htmlFor="ei-pick" style={{ margin: "12px 0" }}><span className="pl">Invoice</span>
                <select id="ei-pick" value={chosen.inv!.number} onChange={(e) => setPick(e.target.value)}>
                  {invs.map((j) => <option key={j.id} value={j.inv!.number}>{j.inv!.number} · {j.inv!.customer}</option>)}
                </select>
              </label>
              {!built.ok ? (
                <div className="warnbox"><b>LHDN would reject this</b>{built.validation.errors.map((e) => <p key={e}>{e}</p>)}
                  <p className="note">Supplier details come from the company profile in Settings: TIN, SSM number and the registered address.</p></div>
              ) : (
                <>
                  {built.validation.warnings.length ? <div className="warnbox"><b>Worth fixing first</b>{built.validation.warnings.map((w) => <p key={w}>{w}</p>)}</div> : null}
                  <table className="rt"><tbody>
                    {([["Document type", built.summary.type + " (" + built.summary.typeCode + ")"], ["Buyer TIN", built.summary.buyerTin], ["Excluding tax", signed(built.summary.subtotal)], ["Service tax", signed(built.summary.tax)], ["Total", signed(built.summary.total)]] as [string, string][])
                      .map(([k, v], i) => <tr key={k} className={i === 4 ? "total" : undefined}><td colSpan={3}>{k}</td><td className="n">{v}</td></tr>)}
                  </tbody></table>
                  <h3 style={{ margin: "14px 0 8px" }}>The UBL 2.1 document, as it would be submitted</h3>
                  <div className="jsonbox">{JSON.stringify(built.document, null, 1).slice(0, 4000)}</div>
                </>
              )}
            </>
          ) : <p className="note" style={{ marginTop: 10 }}>No sales invoices posted yet. Issue one from the Capture tab.</p>}
        </ReportCard>
      </div>
    </>
  );
}
