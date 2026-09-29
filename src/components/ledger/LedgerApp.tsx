"use client";

/* eslint-disable @next/next/no-img-element -- small static logo */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BankView } from "./BankView";
import { CaptureView } from "./CaptureView";
import { CloseView } from "./CloseView";
import { HandView } from "./HandView";
import { ReportsView } from "./ReportsView";
import { createApiStore, createDemoStore, previewContext, type Snapshot } from "./store";

type Section = "capture" | "reports" | "close" | "bank" | "hand";
const SECTIONS: [Section, string][] = [["capture", "Capture"], ["reports", "Reports"], ["close", "Close"], ["bank", "Bank"], ["hand", "Hand over"]];

export type AppProps = {
  mode: "demo" | "live";
  title: string;
  planLabel: string;
  person: string;
  usage?: { items: number; planName: string } | null;
  readOnly?: boolean;
};

export default function LedgerApp({ mode, title, planLabel, person, usage, readOnly }: AppProps) {
  const store = useMemo(() => (mode === "demo" ? createDemoStore() : createApiStore()), [mode]);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [entityId, setEntityId] = useState("");
  const [section, setSection] = useState<Section>("capture");

  const refresh = useCallback(async () => {
    try {
      const s = await store.load();
      setSnap(s);
      setEntityId((id) => (s.entities.some((e) => e.id === id) ? id : s.entities[0]?.id || ""));
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the books."); }
  }, [store]);

  useEffect(() => { const t = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(t); }, [refresh]);

  const entity = snap?.entities.find((e) => e.id === entityId);
  const entries = useMemo(() => (snap ? snap.entries.filter((e) => e.entityId === entityId) : []), [snap, entityId]);
  const journals = useMemo(() => entries.filter((e) => e.lines && e.lines.length), [entries]);
  const ctx = useMemo(() => (snap && entityId ? previewContext(snap, entityId, mode === "demo" && entityId === "acme" ? 240 : 0) : null), [snap, entityId, mode]);

  /* documents this month against the plan, the way the plan counts them */
  let notice = "";
  if (usage && snap) {
    const used = snap.entries.filter((e) => e.status === "posted" && (e.date || "").slice(0, 7) === snap.today.slice(0, 7)).length;
    if (used >= usage.items) notice = "You have used all " + usage.items.toLocaleString("en-US") + " documents on " + usage.planName + " this month. Change plan in Settings.";
    else if (used >= usage.items * 0.8) notice = used + " of " + usage.items.toLocaleString("en-US") + " documents used this month.";
  }
  if (readOnly) notice = "You have view-only access. Capturing, approving and closing need a recorder or approver.";

  return (
    <div className="page">
      <div className="bar">
        <img className="logo-mark" alt="Foxymojo" src="/foxymojo-mark.png" />
        <div className="brand"><span className="n">{title}</span><span className="v">{planLabel}</span></div>
        <div className="tabs" role="tablist" aria-label="Sections">
          {SECTIONS.map(([id, label]) => (
            <button key={id} role="tab" type="button" aria-selected={section === id} aria-controls={"view-" + id}
              onClick={() => { setSection(id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{label}</button>
          ))}
        </div>
        {snap && snap.entities.length > 1 ? (
          <label className="pick" htmlFor="entity"><span className="pl">Entity</span>
            <select id="entity" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              {snap.entities.map((e) => <option key={e.id} value={e.id}>{e.name + (e.demo ? " · demo" : "")}</option>)}
            </select>
          </label>
        ) : null}
        {mode === "live" ? <Link className="btn small ghost" href="/settings">Settings</Link> : <Link className="btn small primary" href="/login?mode=signup">Start my own books</Link>}
      </div>

      {error ? <p className="notice error" role="alert">{error} <button className="linky" type="button" onClick={() => void refresh()}>Try again</button></p> : null}
      {!snap || !entity || !ctx ? (!error ? <p className="note" style={{ padding: "24px 0" }}>Opening the books…</p> : null) : (
        <>
          <div className="view" id="view-capture" role="tabpanel" hidden={section !== "capture"}>
            <CaptureView store={store} entity={entity} entries={entries} ctx={ctx} today={snap.today} defaultApprover={entity.approver || person}
              notice={notice} onChanged={refresh} />
          </div>
          {section === "reports" ? <div className="view" id="view-reports" role="tabpanel"><ReportsView entity={entity} journals={journals} today={snap.today} ai={store.ai} signer={entity.approver || person} /></div> : null}
          {section === "close" ? <div className="view" id="view-close" role="tabpanel"><CloseView store={store} entity={entity} journals={journals} close={snap.close} today={snap.today} signer={entity.approver || person} onChanged={refresh} /></div> : null}
          {section === "bank" ? <div className="view" id="view-bank" role="tabpanel"><BankView store={store} entity={entity} journals={entries} onChanged={refresh} /></div> : null}
          {section === "hand" ? <div className="view" id="view-hand" role="tabpanel"><HandView entity={entity} journals={journals} today={snap.today} /></div> : null}
        </>
      )}

      <footer className="foot">
        <p><strong>How this works:</strong> the model only reads words into fields. The rule engine decides the accounting and the tax, and {mode === "live" ? "the server re-runs it before anything is stored" : "in this demo it runs in your browser"}. Posted entries cannot be edited; a mistake is corrected by a new entry, with its own name and reason. {mode === "demo" ? "The demo keeps its books in this browser only." : "MyInvois submission and bank feeds are not switched on yet."}</p>
        <p><strong>Rules as at 24 Sep 2026.</strong> Service tax 8% standard, 6% reduced group including rental and leasing after the cut on 1 Jan 2026; thresholds RM500k general, RM1m rental and financial, RM1.5m construction, F&amp;B and healthcare; imported services self-accounted, no input credit. e-Invoice Phase 4 since 1 Jan 2026, exemption raised to RM3m turnover in Sept 2026. MPERS sections 17, 20, 23, 30 and 33; MPERS (2025) applies from 1 Jan 2027. Bursa Main Market RM20m aggregate after-tax profit over 3–5 years with RM6m in the latest year, or RM500m market capitalisation; ACE no profit test; both 25% public spread.</p>
        <p>Not tax advice. Sources: <a href="https://www.bursamalaysia.com/listing/get_listed/listing_criteria" target="_blank" rel="noopener noreferrer">Bursa listing criteria</a> · <a href="https://www.masb.org.my/pages.php?id=20" target="_blank" rel="noopener noreferrer">MASB MPERS</a> · <a href="https://www.hasil.gov.my/e-invois/" target="_blank" rel="noopener noreferrer">LHDN e-Invoice</a> · <a href="https://mysst.customs.gov.my/" target="_blank" rel="noopener noreferrer">MySST</a></p>
      </footer>
    </div>
  );
}
