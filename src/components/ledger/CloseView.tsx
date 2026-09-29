"use client";

import { useMemo, useState } from "react";
import { closeStatus, monthLabel } from "@/lib/ledger/modules";
import type { CloseState, Entity, Entry } from "@/lib/ledger/types";
import { downloadCsv } from "./bits";
import type { LedgerStore } from "./store";

export function CloseView({ store, entity, journals, close, today, signer, onChanged }: {
  store: LedgerStore; entity: Entity; journals: Entry[]; close: CloseState; today: string; signer: string; onChanged: () => Promise<void>;
}) {
  const months = useMemo(() => {
    const list = [...new Set(journals.filter((j) => j.status === "posted" && j.date).map((j) => j.date.slice(0, 7)))].sort().reverse();
    return list.length ? list : [today.slice(0, 7)];
  }, [journals, today]);
  const [picked, setPicked] = useState("");
  const [name, setName] = useState(signer);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const month = months.includes(picked) ? picked : months[0];

  if (!journals.length) {
    return (
      <>
        <Hero />
        <section className="close">
          <header><h2>Nothing to close yet</h2><p>{entity.name}</p></header>
          <div className="sect"><p className="note">The checklist fills in as entries post. The demo company shows a month that is part way through its close.</p></div>
        </section>
      </>
    );
  }

  const ticks = close.ticks[entity.id] || {};
  const signoffs = close.signoffs[entity.id] || {};
  const cs = closeStatus(journals, month, { ticks, signoffs, sstRegistered: entity.sstRegistered });
  const pct = Math.round((cs.done / cs.total) * 100);
  const csv = [["month", "item", "done", "checked_by", "detail"],
    ...cs.items.map((i) => [cs.month, i.label, i.done ? "yes" : "no", i.auto && i.agentDone ? "agent" : i.accepted ? "person (accepted against the agent’s finding)" : i.done ? "person" : "", i.detail])];

  const act = async (req: Parameters<LedgerStore["close"]>[0]) => {
    setBusy(true); setErr("");
    try { await store.close(req); await onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : "Could not save that."); } finally { setBusy(false); }
  };

  return (
    <>
      <Hero />
      <div className="rep-top">
        <label className="pick" htmlFor="close-month">Month
          <select id="close-month" value={month} onChange={(e) => setPicked(e.target.value)}>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
        </label>
        <div className="rep-tools"><button className="btn small ghost" type="button" onClick={() => downloadCsv("month-end-close-" + month + ".csv", csv)}>Export CSV</button></div>
      </div>
      <section className="close">
        <header><h2>Close {monthLabel(cs.month)}</h2><p>{entity.name} · {cs.from} to {cs.to}</p></header>
        <div className="prog">
          <div style={{ display: "flex", justifyContent: "space-between", font: "500 .8125rem/1.3 var(--f-mono)" }}>
            <span>{cs.done} of {cs.total} done{cs.accepted ? " · " + cs.accepted + " accepted by you" : ""}</span><span>{pct}%</span>
          </div>
          <div className="track"><div className={"fill" + (cs.ready ? " done" : "")} style={{ width: Math.max(2, pct) + "%" }} /></div>
        </div>
        {cs.items.map((i) => {
          /* the agent settles what it can see; anything it cannot, a person accepts in their own name */
          const settled = i.auto && i.agentDone;
          return (
            <div className="ck" key={i.id}>
              {settled
                ? <span className="box" title="Checked against the posted journals">✓</span>
                : <input type="checkbox" id={"ck-" + i.id} checked={i.tick} disabled={!!cs.signoff || busy}
                  onChange={(e) => void act({ action: e.target.checked ? "tick" : "untick", entityId: entity.id, month: cs.month, item: i.id })} />}
              <label className="lab" htmlFor={settled ? undefined : "ck-" + i.id}><b>{i.label}</b><span>{i.detail}</span></label>
              <span className="by">{settled ? "the agent" : i.accepted ? "you · accepted" : "you"}</span>
            </div>
          );
        })}
        {cs.signoff ? (
          <div className="signoff">
            <div className="row"><span className="badge ok">Closed</span><span>{monthLabel(cs.month)} signed off by {cs.signoff.by} on {cs.signoff.on}</span></div>
            <div className="row">
              <button className="btn small ghost" type="button" disabled={busy} onClick={() => void act({ action: "reopen", entityId: entity.id, month: cs.month })}>Reopen the month</button>
              <span className="note">Reopening leaves every posted entry exactly where it is. Only the sign-off is withdrawn.</span>
            </div>
          </div>
        ) : (
          <div className="signoff">
            <div className="row">
              <input type="text" aria-label="Your name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn primary small" type="button" disabled={!cs.ready || busy || !name.trim()}
                onClick={() => void act({ action: "signoff", entityId: entity.id, month: cs.month, name: name.trim() })}>Sign {monthLabel(cs.month)} off</button>
            </div>
            <span className="note">{cs.ready
              ? "Signing records your name and today’s date against the month. It changes no figures."
              : (cs.total - cs.done) + " item" + (cs.total - cs.done === 1 ? "" : "s") + " still open. The agent will not sign a month off on your behalf."}</span>
          </div>
        )}
        {err ? <p className="notice error" role="alert" style={{ margin: 12 }}>{err}</p> : null}
      </section>
    </>
  );
}

function Hero() {
  return (
    <header className="hero">
      <p className="eyebrow">The same eight things, every month</p>
      <h1>Close the month.</h1>
      <p>Four of these the agent checks against the posted journals. Where it can satisfy one it marks it and shows its working. Where it cannot — a director&apos;s balance still sitting there, no depreciation posted — it hands the item back with what it found, and you accept it in your own name. The other four are yours from the start, because no machine can confirm that the bank statement agrees. Nothing is <mark>ticked on your behalf</mark>, and the sign-off records who said the month was done.</p>
    </header>
  );
}
