"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ASK_EXAMPLES, INV_EXAMPLES, type Lang, LANGS, TX_EXAMPLES } from "@/lib/ledger/examples";
import { money, signed, whole } from "@/lib/ledger/format";
import { answerOffline, type AskPack, buildAskPack } from "@/lib/ledger/modules";
import { propose, proposeInvoice } from "@/lib/ledger/rules";
import type { Entity, Entry, InvoiceInput, RuleContext, TxInput } from "@/lib/ledger/types";
import { downloadCsv, RepTable } from "./bits";
import { type Current, ProposalCard } from "./ProposalCard";
import type { LedgerStore } from "./store";
import { useDictation } from "./useDictation";

type Mode = "tx" | "inv" | "ask";
type Answer = { q: string; pack: AskPack; byModel: boolean; pending?: boolean; text: string };

const PLACEHOLDER: Record<Mode, string> = {
  tx: "Paid RM4,500 to Tech Supply for a laptop, invoice TS-2291",
  inv: "Invoice Klinik Mawar RM8,000 for the September retainer, 30 day terms",
  ask: "Who owes me money and how overdue are they?"
};
const GO_LABEL: Record<Mode, string> = { tx: "Read it and propose", inv: "Read it and draft the invoice", ask: "Answer from my books" };

export function CaptureView({ store, entity, entries, ctx, today, defaultApprover, notice, onChanged }: {
  store: LedgerStore;
  entity: Entity;
  entries: Entry[];
  ctx: RuleContext;
  today: string;
  defaultApprover: string;
  notice: string;
  onChanged: () => Promise<void>;
}) {
  const [lang, setLang] = useState<Lang>("en-MY");
  const [mode, setModeState] = useState<Mode>("tx");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [current, setCurrent] = useState<Current | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [approver, setApprover] = useState(defaultApprover);
  const [busy, setBusy] = useState(false);
  const proposalRef = useRef<HTMLDivElement>(null);
  const ai = store.ai;
  const journals = useMemo(() => entries.filter((e) => e.lines && e.lines.length), [entries]);

  /* a new company in the picker starts from a clean slate */
  const lastEntity = useRef(entity.id);
  useEffect(() => {
    if (lastEntity.current === entity.id) return;
    lastEntity.current = entity.id;
    const t = window.setTimeout(() => { setCurrent(null); setAnswer(null); setStatus(""); }, 0);
    return () => window.clearTimeout(t);
  }, [entity.id]);

  const scrollToProposal = () => window.setTimeout(() => proposalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);

  const proposeTx = useCallback((tx: TxInput, utterance: string) => {
    setAnswer(null);
    setCurrent({ kind: "tx", res: propose({ ...tx, entity_id: entity.id }, ctx), input: tx, utterance });
    scrollToProposal();
  }, [ctx, entity.id]);
  const proposeInv = useCallback((inv: InvoiceInput, utterance: string) => {
    setAnswer(null);
    setCurrent({ kind: "invoice", res: proposeInvoice({ ...inv, entity_id: entity.id }, ctx), input: inv, utterance });
    scrollToProposal();
  }, [ctx, entity.id]);

  /* the demo opens on a worked example so there is something to look at */
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || store.kind !== "demo") return;
    opened.current = true;
    const t = window.setTimeout(() => {
      setText(TX_EXAMPLES[0].text);
      setCurrent({ kind: "tx", res: propose({ ...TX_EXAMPLES[0].tx, entity_id: entity.id }, ctx), input: TX_EXAMPLES[0].tx, utterance: TX_EXAMPLES[0].text });
    }, 0);
    return () => window.clearTimeout(t);
  }, [store.kind, entity.id, ctx]);

  const dictation = useDictation({ lang, transcribe: ai ? ai.transcribe : null, onText: setText, onStatus: setStatus });

  function setMode(m: Mode) {
    setModeState(m);
    setCurrent(null);
    setAnswer(null);
    setStatus("");
  }

  async function extract(words: string) {
    if (!ai) { setStatus("Reading your own words needs the signed-in app — tap an example instead."); return; }
    setBusy(true);
    const t0 = Date.now();
    const timer = window.setInterval(() => setStatus("Reading… " + Math.round((Date.now() - t0) / 1000) + "s"), 1000);
    setStatus("Reading…");
    try {
      const fields = await ai.extract(mode === "inv" ? "invoice" : "tx", words, entity.id);
      setStatus("Read. Check the proposal below.");
      if (mode === "inv") proposeInv(fields as InvoiceInput, words); else proposeTx(fields as TxInput, words);
    } catch (e) {
      const code = (e as { status?: number }).status;
      setStatus(code === 429 ? "Too many requests just now. Try again in a minute." : e instanceof Error ? e.message : "Could not read that. Try again, or tap an example.");
    } finally { window.clearInterval(timer); setBusy(false); }
  }

  async function askBooks(q: string) {
    if (!journals.length) { setStatus("Nothing is posted for this entity yet, so there is nothing to ask about."); return; }
    const pack = buildAskPack(entries, entity, today);
    const offline = answerOffline(q, pack, money);
    setCurrent(null);
    if (!ai) {
      setAnswer({ q, pack, byModel: false, text: offline || "I can answer this one only with the model available. Without it I can still tell you the profit, the cash, who owes you money, what you owe, and the service tax position." });
      setStatus(offline ? "Answered straight from the ledger." : "The model is not available in the demo.");
      scrollToProposal();
      return;
    }
    setAnswer({ q, pack, byModel: true, pending: true, text: "" });
    setBusy(true);
    setStatus("Reading the books…");
    scrollToProposal();
    try {
      setAnswer({ q, pack, byModel: true, text: await ai.ask(q, entity.id) });
      setStatus("Answered from the posted journals.");
    } catch {
      setAnswer({ q, pack, byModel: false, text: offline || "Could not reach the model for that one. Ask about profit, cash, receivables, payables or service tax and I will answer from the ledger directly." });
      setStatus(offline ? "The model was unavailable — answered from the ledger instead." : "Could not answer that one.");
    } finally { setBusy(false); }
  }

  function go() {
    const words = text.trim();
    if (words.length < 6) {
      setStatus(mode === "tx" ? "Say what happened — who, how much, what for." : mode === "inv" ? "Say who to invoice, for what, and how much." : "Ask a question about the books.");
      return;
    }
    if (mode === "ask") void askBooks(words); else void extract(words);
  }

  async function decide(decision: "posted" | "rejected") {
    if (!current) return;
    const who = approver.trim();
    if (decision === "posted" && !who) { setStatus("Type a name first — nothing posts anonymously."); return; }
    setBusy(true);
    try {
      await store.post({ kind: current.kind, entityId: entity.id, input: current.input, utterance: current.utterance, approver: who || "unnamed", decision } as Parameters<LedgerStore["post"]>[0]);
      setCurrent(null);
      setText("");
      setStatus(decision === "posted" ? "Posted and logged." : "Rejected and logged.");
      await onChanged();
    } catch (e) { setStatus(e instanceof Error ? e.message : "Could not save that."); }
    finally { setBusy(false); }
  }

  async function decideDraft(entry: Entry, decision: "posted" | "rejected", who: string) {
    if (!who.trim()) { setStatus("Type a name first — nothing posts anonymously."); return; }
    setBusy(true);
    try {
      await store.decide(entry.id, who.trim(), decision);
      setStatus(decision === "posted" ? "Draft approved and posted." : "Draft rejected and logged.");
      await onChanged();
    } catch (e) { setStatus(e instanceof Error ? e.message : "Could not save that."); }
    finally { setBusy(false); }
  }

  const examples: { lang: Lang; tag: string; text: string; tx?: TxInput; inv?: InvoiceInput }[] =
    (mode === "tx" ? TX_EXAMPLES : mode === "inv" ? INV_EXAMPLES : ASK_EXAMPLES).filter((x) => x.lang === lang);

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{mode === "ask" ? "Your books, answering back" : entity.demo ? "Demo company · seeded books" : "Malaysian books, spoken"}</p>
        <h1>{mode === "ask" ? "Ask. It answers from the journals." : "Say it once. It posts correctly."}</h1>
        {mode === "ask"
          ? <p>Ask about the money in English, Bahasa Melayu or 中文. Every figure in the answer is footed from your posted journals — <mark>nothing is estimated, nothing is re-added</mark>. When the books do not hold the answer, it says so instead of guessing.</p>
          : <p>Speak or type a transaction or an invoice in English, Bahasa Melayu or 中文. The model only fills in the fields. A Malaysian rule engine decides the accounting and the tax — <mark>MPERS, SST, e-Invoice, intercompany</mark> — and nothing reaches the ledger until a named person approves it.</p>}
      </header>

      <section className="capture" aria-labelledby="cap-h">
        <h2 id="cap-h" className="sr-only">Capture</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <div className="modes" role="group" aria-label="What are you capturing?">
            <button type="button" aria-pressed={mode === "tx"} onClick={() => setMode("tx")}>Transaction</button>
            <button type="button" aria-pressed={mode === "inv"} onClick={() => setMode("inv")}>Invoice</button>
            <button type="button" aria-pressed={mode === "ask"} onClick={() => setMode("ask")}>Ask</button>
          </div>
          <div className="langs" role="group" aria-label="Spoken language">
            {LANGS.map((l) => <button key={l.lang} className="chip-btn" type="button" aria-pressed={lang === l.lang} onClick={() => setLang(l.lang)}>{l.tag}</button>)}
          </div>
        </div>
        <label className="sr-only" htmlFor="utterance">What happened?</label>
        <textarea id="utterance" placeholder={PLACEHOLDER[mode]} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} />
        <div className="cap-row">
          <button className="mic" type="button" aria-pressed={dictation.listening} aria-label="Dictate" disabled={!dictation.supported}
            title={dictation.supported ? undefined : "Dictation needs a browser with a microphone recogniser. Type instead."} onClick={() => void dictation.toggle()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" /><path d="M18 11a1 1 0 0 0-2 0 4 4 0 0 1-8 0 1 1 0 0 0-2 0 6 6 0 0 0 5 5.9V20H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-3.1A6 6 0 0 0 18 11z" /></svg>
          </button>
          <button className="btn primary" type="button" disabled={busy} onClick={go}>{GO_LABEL[mode]}</button>
          <span className="status" role="status">{status || notice}</span>
        </div>
        <div className="examples">
          {examples.map((x) => (
            <button key={x.text} className="ex" type="button" disabled={busy} onClick={() => {
              setText(x.text);
              if (mode === "ask") { void askBooks(x.text); return; }
              setStatus("Example — already read, no model call.");
              if (x.tx) proposeTx(x.tx, x.text);
              else if (x.inv) proposeInv(x.inv, x.text);
            }}><span className="tag">{x.tag}</span><span>{x.text}</span></button>
          ))}
        </div>
      </section>

      <div id="proposal" ref={proposalRef}>
        {current ? (
          <ProposalCard current={current} entity={entity} approver={approver} setApprover={setApprover} busy={busy}
            onDecide={(d) => void decide(d)} canReread={!!ai}
            onReread={(extra) => { const words = current.utterance + ". " + extra; setText(words); void extract(words); }} />
        ) : answer ? <AnswerCard a={answer} postedCount={journals.filter((j) => j.status === "posted").length} /> : null}
      </div>

      <Meters entity={ctx.entities.find((e) => e.id === entity.id) || entity} entries={entries} />
      <LedgerList entries={entries} approver={approver} busy={busy} onDecide={decideDraft} canReset={!!store.reset}
        onReset={async () => { await store.reset?.(); setCurrent(null); setAnswer(null); await onChanged(); setStatus("Demo company reset."); }} />
    </>
  );
}

function AnswerCard({ a, postedCount }: { a: Answer; postedCount: number }) {
  const b = a.pack.balance_sheet, pl = a.pack.profit_and_loss, r = a.pack.receivables;
  const figures: [string, number][] = [
    ["Revenue", pl.revenue], ["Expenses", pl.expenses], [pl.profit >= 0 ? "Profit" : "Loss", pl.profit],
    ["Cash at bank", b.cash], ["Owed to you", r.total_outstanding], ["Owed to suppliers", b.payables],
    ["Service tax payable", b.sst_payable], ["Director's account", b.director_account]
  ];
  return (
    <section className="answer">
      <header>
        <h2>From your books</h2>
        <span className={"badge " + (a.byModel ? "ok" : "warn")}>{a.byModel ? "The model read the figures" : "Answered without the model"}</span>
        <span className="badge">{a.pack.entity} · to {a.pack.period.to}</span>
      </header>
      <div className="said"><b>You asked</b>{a.q}</div>
      <div className="body">{a.pending ? <p className="note">Reading the books…</p> : a.text.split("\n").filter((x) => x.trim()).map((x, i) => <p key={i}>{x.trim()}</p>)}</div>
      <div className="sect"><h3>The figures it was given</h3>
        <RepTable head={["Item", "", "", "Amount"]}>{figures.map(([n, v]) => <tr key={n}><td colSpan={3}>{n}</td><td className="n">{signed(v)}</td></tr>)}</RepTable>
      </div>
      <div className="checks">
        <span className="badge ok">Footed from {postedCount} posted entries</span>
        <span className="badge">Nothing here was estimated</span>
        <span className="badge warn">Not tax advice</span>
      </div>
    </section>
  );
}

function Meters({ entity, entries }: { entity: Entity; entries: Entry[] }) {
  const meter = (k: string, v: string, pct: number, sub: string, level?: string | null) => (
    <div className="meter" key={k}>
      <span className="k">{k}</span><span className="v">{v}</span>
      <div className="track"><div className={"fill" + (level ? " " + level : "")} style={{ width: Math.max(2, Math.min(100, pct)) + "%" }} /></div>
      <span className="s">{sub}</span>
    </div>
  );
  const thr = 500000;
  const pct = (entity.taxableTurnover12m / thr) * 100;
  const posted = entries.filter((e) => e.status === "posted");
  const sst = entity.sstRegistered
    ? meter("Service tax", "Registered", 100, "Output tax on the books: " + money(posted.reduce((s, e) => s + (Number(e.taxAmount) || 0), 0)), "ok")
    : meter("Registration threshold", whole(entity.taxableTurnover12m), pct, "of " + whole(thr) + " rolling 12 months", pct >= 100 ? "stop" : pct >= 80 ? "warn" : null);
  const einv = meter("e-Invoice", entity.annualTurnover >= 3000000 ? "Required" : "Exempt", (entity.annualTurnover / 3000000) * 100,
    whole(entity.annualTurnover) + " turnover vs the RM3m exemption", entity.annualTurnover >= 3000000 ? "warn" : null);
  const dirty = posted.filter((e) => (e.badges || []).length).length;
  const cleanPct = posted.length ? ((posted.length - dirty) / posted.length) * 100 : 100;
  const dil = meter("Diligence queue", dirty + (dirty === 1 ? " item" : " items"), cleanPct,
    dirty ? "related-party, undocumented or director items to clear" : "nothing outstanding", dirty > 2 ? "stop" : dirty ? "warn" : "ok");
  return (
    <section className="sec" aria-labelledby="ready-h">
      <div className="sec-top"><h2 id="ready-h">Where this entity stands</h2><span className="note">Moves as entries post</span></div>
      <div className="meters">{sst}{einv}{dil}</div>
    </section>
  );
}

function LedgerList({ entries, approver, busy, onDecide, canReset, onReset }: {
  entries: Entry[]; approver: string; busy: boolean; canReset: boolean;
  onDecide: (e: Entry, d: "posted" | "rejected", who: string) => void;
  onReset: () => Promise<void>;
}) {
  const [names, setNames] = useState<Record<string, string>>({});
  /* anything not yet posted needs a person, so it goes to the top */
  const rank = (e: Entry) => (e.status === "draft" ? 0 : 1);
  const rows = entries.slice().sort((a, b) => rank(a) - rank(b) || String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 12);
  const exportAll = () => downloadCsv("ledger-entries.csv", [["date", "entity", "description", "amount", "sst", "status", "approver", "rule_version", "spoken"],
    ...entries.map((e) => [e.date || "", e.entity, e.desc, e.amount, e.taxAmount || 0, e.status, e.approver, e.version, e.utterance])]);

  return (
    <section className="sec" aria-labelledby="led-h">
      <div className="sec-top">
        <h2 id="led-h">Posted ledger</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn small ghost" type="button" onClick={exportAll} disabled={!entries.length}>Export CSV</button>
          {canReset ? <button className="btn small ghost" type="button" onClick={() => void onReset()}>Reset demo data</button> : null}
        </div>
      </div>
      <div className="ledger">
        {!rows.length ? <p className="empty">Nothing posted for this entity yet.</p> : rows.map((e) => (
          <div className="entry" key={e.id}>
            <div className="l1"><span className="desc">{e.desc}</span><span className="amt">{money(e.amount)}</span></div>
            <div className="l2">
              <span>{e.date || (e.at || "").slice(0, 10)}</span>
              <span>{e.status === "posted" ? "approved by " + e.approver : e.status === "draft" ? "waiting for approval" : "rejected by " + e.approver}</span>
              <span>{e.version}</span>
              {e.taxAmount ? <span>SST {Number(e.taxAmount).toFixed(2)}</span> : null}
            </div>
            <div className="badges">
              <span className={"badge " + (e.status === "posted" ? "ok" : e.status === "draft" ? "warn" : "stop")}>{e.status}</span>
              {e.source === "bank_statement" ? <span className="badge plain">from the bank statement</span> : null}
              {e.type && e.type !== "transaction" ? <span className="badge plain">{e.type}</span> : null}
              {(e.badges || []).map((b) => <span key={b} className="badge warn">{b}</span>)}
            </div>
            <p className="note">“{e.utterance || ""}”</p>
            {e.status === "draft" ? (
              <div className="row-acts">
                <input type="text" aria-label="Approver name" placeholder="Your name" value={names[e.id] ?? approver} onChange={(ev) => setNames({ ...names, [e.id]: ev.target.value })} />
                <button className="btn small ok" type="button" disabled={busy} onClick={() => onDecide(e, "posted", names[e.id] ?? approver)}>Approve and post</button>
                <button className="btn small ghost" type="button" disabled={busy} onClick={() => onDecide(e, "rejected", names[e.id] ?? approver)}>Reject</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <p className="note">Every line keeps the words that were spoken, the rule version that decided the treatment, and the name of whoever approved it.</p>
    </section>
  );
}
