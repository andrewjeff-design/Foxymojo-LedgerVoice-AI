"use client";

import { useMemo, useRef, useState } from "react";
import * as B from "@/lib/ledger/bank";
import { signed, whole } from "@/lib/ledger/format";
import type { Entity, Entry } from "@/lib/ledger/types";
import { ReportCard } from "./bits";
import type { LedgerStore } from "./store";

export function BankView({ store, entity, journals, onChanged }: { store: LedgerStore; entity: Entity; journals: Entry[]; onChanged: () => Promise<void> }) {
  const [parsed, setParsed] = useState<B.ParsedStatement | null>(null);
  const [status, setStatus] = useState("");
  const [over, setOver] = useState(false);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* re-reconcile whenever the ledger moves, so drafts approved elsewhere drop out */
  const rec = useMemo(() => (parsed && parsed.rows.length ? B.reconcile(parsed.rows, journals, { windowDays: 5 }) : null), [parsed, journals]);

  function ingest(text: string, name: string) {
    const p = B.parse(text);
    setParsed(p);
    setOff(new Set());
    setStatus(p.rows.length ? p.rows.length + " rows read from " + name + " · " + p.format?.name : "Nothing readable in " + name + ".");
  }
  function readFile(file: File) {
    if (file.size > 5 * 1024 * 1024) { setStatus("That file is over 5 MB. Split the statement by month."); return; }
    file.text().then((t) => ingest(t, file.name), () => setStatus("That file could not be read."));
  }

  async function draft() {
    if (!rec) return;
    const chosen = rec.unmatched.map((row, i) => ({ row, i })).filter(({ i }) => !off.has(i));
    if (!chosen.length) return;
    setBusy(true);
    try {
      const made = await store.draftBank(entity.id, chosen.map(({ row }) => B.suggest(row, { base: entity.base })), chosen.map(({ row }) => row.desc || ""));
      setStatus(made + " draft" + (made === 1 ? "" : "s") + " created. They are on the Capture tab awaiting approval — nothing has been posted.");
      await onChanged();
    } catch (e) { setStatus(e instanceof Error ? e.message : "Could not create the drafts."); }
    finally { setBusy(false); }
  }

  const drafted = new Set(journals.filter((j) => j.status === "draft" && j.source === "bank_statement").map((j) => j.utterance));
  const picked = rec ? rec.unmatched.filter((_, i) => !off.has(i)).length : 0;

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Where the volume actually is</p>
        <h1>The statement is the integration.</h1>
        <p>There are no bank feeds to buy in Malaysia — open finance is still an exposure draft and the aggregators do not cover business accounts. So the statement file is how the money gets in. Drop one here: it is parsed, matched against what is already posted, and <mark>what is left over is proposed, never posted</mark>.</p>
      </header>

      <section className="capture" aria-labelledby="bank-h">
        <h2 id="bank-h" className="sr-only">Import a statement</h2>
        <div className={"drop" + (over ? " over" : "")}
          onDragEnter={(e) => { e.preventDefault(); setOver(true); }} onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) readFile(f); }}>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" aria-label="Statement file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
          <p><b>Drop a CSV statement here</b></p>
          <p className="note">Or <button type="button" className="linky" onClick={() => fileRef.current?.click()}>choose a file</button> · <button type="button" className="linky" onClick={() => ingest(B.SAMPLE_STATEMENT, "maybank-september-2026.csv")}>try a sample Maybank statement</button></p>
          <p className="note">PDF statements need converting to CSV first. The file is read in this browser; only the lines you choose to draft are sent.</p>
        </div>
        <span className="status" role="status">{status}</span>
      </section>

      {parsed ? (
        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          {parsed.warnings.length ? <div className="warnbox"><b>Read this before trusting the rows</b>{parsed.warnings.map((w) => <p key={w}>{w}</p>)}</div> : null}
          <ReportCard title="The statement" sub={(parsed.rows[0]?.date || "") + " to " + (parsed.rows[parsed.rows.length - 1]?.date || "")}
            checks={[{ ok: parsed.balanceWalks, warn: !parsed.balanceWalks, label: parsed.balanceWalks ? "The running balance walks line to line" : "No running balance to check against" }]}>
            <div className="kv" style={{ padding: "6px 6px 2px" }}>
              {([
                ["Format read as", (parsed.format?.name || "unknown") + (parsed.format && !parsed.format.verified ? " — column map unverified" : "")],
                ["Rows", String(parsed.rows.length)], ["Money in", whole(parsed.totalIn)], ["Money out", whole(parsed.totalOut)],
                ["Closing balance", parsed.closing === null ? "not in the file" : whole(parsed.closing)]
              ] as [string, string][]).map(([k, v]) => <div key={k}><span>{k}</span><span className="v">{v}</span></div>)}
            </div>
          </ReportCard>

          {rec && rec.matched.length ? (
            <ReportCard title="Already in the ledger" sub={rec.matched.length + " of " + rec.total + " lines matched a posted entry"} checks={[{ ok: true, label: "Nothing was posted — these were already there" }]}>
              <div>{rec.matched.map((m) => (
                <div className="mrow" key={m.row.line}>
                  <span className={"badge " + (m.confidence === "high" ? "ok" : "warn")}>{m.confidence}</span>
                  <div className="desc"><b>{m.row.desc || "(no narrative)"}</b><span>{m.row.date} · {m.why}</span></div>
                  <span className={"amt" + (m.row.amount > 0 ? " in" : "")}>{signed(m.row.amount)}</span>
                </div>
              ))}</div>
            </ReportCard>
          ) : null}

          {rec && rec.unmatched.length ? (
            <ReportCard title="Not in the ledger yet" sub={rec.unmatched.length + " lines to account for"}
              checks={[{ ok: false, warn: true, label: "Every category here is a keyword guess — the rule engine decides the accounting, you decide the category" }]}>
              <div>
                {rec.unmatched.map((row, i) => {
                  const sug = B.suggest(row, { base: entity.base });
                  const already = drafted.has("Imported from the bank statement: \"" + (row.desc || "") + "\"");
                  return (
                    <div className="mrow" key={row.line}>
                      <input type="checkbox" id={"pick-" + i} checked={!off.has(i)} onChange={(e) => { const n = new Set(off); if (e.target.checked) n.delete(i); else n.add(i); setOff(n); }} />
                      <label className="desc" htmlFor={"pick-" + i}>
                        <b>{row.desc || "(no narrative)"}</b>
                        <span>{row.date} · proposed as {sug.category.replace(/_/g, " ")}{sug.confidence >= 0.6 ? "" : " · low confidence, check it"}{already ? " · already drafted" : ""}</span>
                      </label>
                      <span className={"amt" + (row.amount > 0 ? " in" : "")}>{signed(row.amount)}</span>
                    </div>
                  );
                })}
                <div className="cta-row" style={{ padding: "14px 16px 4px" }}>
                  <button className="btn primary small" type="button" disabled={!picked || busy} onClick={() => void draft()}>Draft these for approval</button>
                  <span className="note">{picked} selected. They become drafts, not postings — each one still needs approving on the Capture tab.</span>
                </div>
              </div>
            </ReportCard>
          ) : null}

          {rec && rec.ledgerOnly.length ? (
            <ReportCard title="Posted but not on the statement" sub={rec.ledgerOnly.length > 8 ? "showing 8 of " + rec.ledgerOnly.length + " entries" : rec.ledgerOnly.length + " entries"}
              checks={[{ ok: false, warn: true, label: "Cheques in transit, or entries dated outside this statement" }]}>
              <div>{rec.ledgerOnly.slice(0, 8).map((e) => (
                <div className="mrow" key={e.id}>
                  <span className="badge warn">open</span>
                  <div className="desc"><b>{e.desc}</b><span>{e.date}</span></div>
                  <span className="amt">{signed(B.cashMove(e))}</span>
                </div>
              ))}</div>
            </ReportCard>
          ) : null}

          {rec ? (
            <ReportCard title="Does it reconcile?" sub={B.summarise(rec)} checks={[{ ok: rec.ties, label: rec.ties ? "The difference is fully explained by what is outstanding on each side" : "The difference is not yet explained" }]}>
              <table className="rt"><tbody>
                <tr><td colSpan={3}>Statement movement</td><td className="n">{signed(rec.statementMovement)}</td></tr>
                <tr><td colSpan={3}>Ledger movement over the same lines</td><td className="n">{signed(rec.ledgerMovement)}</td></tr>
                <tr className="total"><td colSpan={3}>Difference</td><td className="n">{signed(rec.difference)}</td></tr>
              </tbody></table>
            </ReportCard>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
