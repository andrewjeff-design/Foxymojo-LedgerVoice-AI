"use client";

import { useState } from "react";
import { money } from "@/lib/ledger/format";
import type { Entity, InvoiceInput, InvoiceProposal, Proposal, TxInput, TxProposal } from "@/lib/ledger/types";

export type Current =
  | { kind: "tx"; res: TxProposal; input: TxInput; utterance: string }
  | { kind: "invoice"; res: InvoiceProposal; input: InvoiceInput; utterance: string };

function Journal({ r, title }: { r: Proposal; title?: string }) {
  return (
    <div className="sect">
      <h3>{title || "Journal"}</h3>
      <table className="jrnl">
        <thead><tr><th>Code</th><th>Account</th><th className="n">Debit</th><th className="n">Credit</th></tr></thead>
        <tbody>{r.lines.map((l, i) => (
          <tr key={i}><td className="code">{l.code}</td><td>{l.account}</td><td className="n">{l.dr ? l.dr.toFixed(2) : ""}</td><td className="n">{l.cr ? l.cr.toFixed(2) : ""}</td></tr>
        ))}</tbody>
        <tfoot><tr><td /><td>Total {r.base}</td><td className="n">{r.totalDr.toFixed(2)}</td><td className="n">{r.totalCr.toFixed(2)}</td></tr></tfoot>
      </table>
    </div>
  );
}

export function ProposalCard({ current, entity, approver, setApprover, busy, onDecide, onReread, canReread }: {
  current: Current;
  entity: Entity;
  approver: string;
  setApprover: (v: string) => void;
  busy: boolean;
  onDecide: (decision: "posted" | "rejected") => void;
  onReread: (extra: string) => void;
  canReread: boolean;
}) {
  const r = current.res;
  const [extra, setExtra] = useState("");
  const verb = current.kind === "invoice" ? "Issue and post" : "Approve and post";

  return (
    <section className="card" aria-label="Proposal">
      {current.kind === "tx" ? (
        <>
          <div className="card-head">
            <div className="top">
              <div>
                <h2>{current.res.description || "Proposed entry"}</h2>
                <p className="meta">
                  <span>{r.entity}</span><span>{current.res.date || "date missing"}</span>
                  <span>{current.input.counterparty || "counterparty?"}</span><span>conf {Math.round((current.input.confidence || 0) * 100)}%</span>
                </p>
              </div>
              <div className="amt">{money(current.res.gross)}{current.res.currency !== r.base ? <small>{current.input.amount} {current.res.currency} @ {current.res.fx}</small> : null}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <span className={"badge " + (r.balanced ? "ok" : "stop")}>{r.balanced ? "Balanced" : "Does not balance"}</span>
              {current.res.tax.amount > 0 ? <span className="badge plain">{(current.res.tax.reverseCharge ? "Self-accounted " : "SST ") + (current.res.tax.rate * 100) + "%"}</span> : null}
              {current.res.capitalise ? <span className="badge plain">Capitalised</span> : null}
              {current.res.related ? <span className="badge warn">Related party</span> : null}
            </div>
          </div>
          <Journal r={r} />
          {current.res.tax.amount > 0 ? (
            <div className="sect"><p className="note">{current.res.tax.label} — base {money(current.res.tax.base)}, {current.res.tax.rate * 100}% = {money(current.res.tax.amount)}{current.res.tax.reverseCharge ? ", self-accounted on an imported service" : ""}</p></div>
          ) : null}
        </>
      ) : (
        <>
          <div className="inv-head">
            <div className="row">
              <div>
                <div className="inv-no">{current.res.number}</div>
                <div className="inv-meta"><span>Issued {current.res.date}</span><span>Due {current.res.due} ({current.res.terms} days)</span></div>
              </div>
              <div className="inv-meta" style={{ textAlign: "right" }}><span>{r.entity}</span><span>SST {entity.sstRegistered ? "registered" : "not registered"}</span></div>
            </div>
            <div className="row">
              <div className="inv-to"><strong>Bill to</strong>{current.res.customer || "customer?"}{current.res.customer_tin ? <div className="inv-meta"><span>TIN {current.res.customer_tin}</span></div> : null}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start" }}>
                <span className={"badge " + (current.res.einvoice ? "warn" : "plain")}>{current.res.einvoice ? "MyInvois submission" : "e-Invoice exempt"}</span>
                <span className={"badge " + (r.balanced ? "ok" : "stop")}>{r.balanced ? "Balanced" : "Error"}</span>
              </div>
            </div>
          </div>
          <div className="sect">
            <table className="items">
              <thead><tr><th>Description</th><th className="n">Qty</th><th className="n">Unit</th><th className="n">Amount</th></tr></thead>
              <tbody>{current.res.items.map((i, k) => <tr key={k}><td>{i.description}</td><td className="n">{i.qty}</td><td className="n">{i.unit.toFixed(2)}</td><td className="n">{i.amount.toFixed(2)}</td></tr>)}</tbody>
            </table>
            <div className="totals">
              <div><span>Subtotal</span><span>{current.res.subtotal.toFixed(2)}</span></div>
              <div><span>Service tax</span><span>{current.res.tax.toFixed(2)}</span></div>
              <div className="grand"><span>Total {current.res.currency}</span><span>{current.res.total.toFixed(2)}</span></div>
            </div>
          </div>
          <Journal r={r} title="Journal raised" />
        </>
      )}

      {r.flags.length ? (
        <div className="sect"><h3>What needs your eyes</h3>
          <div className="flags">{r.flags.map((f, i) => (
            <div className="flag" key={i}><span className={"badge " + (f.level === "stop" ? "stop" : "warn")}>{f.level === "stop" ? "Stop" : "Check"}</span><span>{f.text}</span></div>
          ))}</div>
        </div>
      ) : null}

      {r.ask.length ? (
        <div className="sect"><h3>Open questions</h3>
          <div className="asks">
            {r.ask.map((q) => <div className="ask" key={q}>{q}</div>)}
            {canReread ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input type="text" aria-label="Your answer" placeholder="Answer in a few words, then re-read" value={extra} onChange={(e) => setExtra(e.target.value)} />
                <button className="btn small" type="button" disabled={busy || !extra.trim()} onClick={() => onReread(extra.trim())}>Re-read with this</button>
              </div>
            ) : <p className="note">Reading answers back in needs the signed-in app. In the demo, approve with the question open or reject it.</p>}
          </div>
        </div>
      ) : null}

      <div className="sect"><h3>Rules applied</h3>
        <div className="rules">{r.rules.map((x, i) => (
          <div className="rule-row" key={i}><span className="pack">{x.pack} {x.id}</span><span>{x.text}<span className="cite">{x.cite}</span></span></div>
        ))}</div>
      </div>

      {r.notes.length ? <div className="sect"><h3>Notes</h3><ul className="note" style={{ margin: 0, paddingLeft: "1.1rem" }}>{r.notes.map((n) => <li key={n}>{n}</li>)}</ul></div> : null}
      {current.kind === "tx" && current.res.mirror ? <div className="sect"><h3>Other side of the group</h3><p className="note">{current.res.mirror.note}</p></div> : null}

      <div className="gate">
        <p className="eyebrow">{r.approval.required ? "Approval required: " + r.approval.reasons.join(", ") : "No approval rule triggered — still needs a name"}</p>
        <div className="who">
          <input type="text" aria-label="Approver name" placeholder="Your name, for the audit trail" value={approver} onChange={(e) => setApprover(e.target.value)} />
          <div className="acts">
            <button className="btn ok" type="button" disabled={busy || r.approval.blocked} onClick={() => onDecide("posted")}>{r.approval.blocked ? "Cannot post" : verb}</button>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => onDecide("rejected")}>Reject</button>
          </div>
        </div>
        <p className="note">Prepared by the agent under {r.version}. The words spoken, the rules applied and your name are stored with the entry.</p>
      </div>
    </section>
  );
}
