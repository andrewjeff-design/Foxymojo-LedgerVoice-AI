"use client";

import { useEffect, useMemo, useState } from "react";
import { money, signed, whole } from "@/lib/ledger/format";
import { addDaysIso, arAging, type AgingRow, monthLabel, sstReturn, taxablePeriod } from "@/lib/ledger/modules";
import * as Rep from "@/lib/ledger/reports";
import type { Entity, Entry } from "@/lib/ledger/types";
import { downloadCsv, ReportCard, RepTable } from "./bits";
import type { AiClient } from "./store";

type ReportId = "analysis" | "tb" | "pl" | "bs" | "cf" | "ar" | "sst";
const NAV: [ReportId, string][] = [["analysis", "Analysis"], ["tb", "Trial balance"], ["pl", "Profit & loss"], ["bs", "Balance sheet"], ["cf", "Cash flow"], ["ar", "Receivables"], ["sst", "SST-02"]];

export function ReportsView({ entity, journals, today, ai, signer }: { entity: Entity; journals: Entry[]; today: string; ai: AiClient | null; signer: string }) {
  const [report, setReport] = useState<ReportId>("analysis");
  const months = useMemo(() => [...new Set(journals.filter((j) => j.status === "posted").map((j) => j.date.slice(0, 7)))].sort().reverse(), [journals]);
  const [period, setPeriod] = useState<string>("");
  const [commentary, setCommentary] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [chaser, setChaser] = useState<AgingRow | null>(null);

  /* default to the latest month with entries; forget commentary when the figures change */
  const selected = period && (period === "all" || months.includes(period)) ? period : (months[0] || "all");
  useEffect(() => { const t = window.setTimeout(() => { setCommentary(null); setChaser(null); }, 0); return () => window.clearTimeout(t); }, [entity.id, selected]);

  if (!journals.length) {
    return (
      <section className="report">
        <header><h2>Nothing posted yet</h2><p>{entity.name}</p></header>
        <div className="rep-body"><p className="note" style={{ padding: "8px 6px" }}>Capture your first transaction or invoice and the four statements build themselves from the journals. The demo company shows them with a month of history.</p></div>
      </section>
    );
  }

  const range = (() => {
    if (selected === "all") {
      const dates = journals.map((j) => j.date).filter(Boolean).sort();
      const last = dates[dates.length - 1] || today;
      return { from: null as string | null, to: last, label: "Everything to " + last };
    }
    const [y, m] = selected.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { from: selected + "-01", to: last, label: selected + "-01 to " + last };
  })();
  const { from, to, label } = range;
  let csv: unknown[][] = [["empty"]];
  let node: React.ReactNode = null;

  if (report === "tb") {
    const tb = Rep.trialBalance(journals, to);
    csv = [["code", "account", "debit", "credit"], ...tb.rows.map((r) => [r.code, r.name, r.dr, r.cr])];
    node = (
      <ReportCard title="Trial balance" sub={entity.name + " · as at " + to} checks={[{ ok: tb.balanced, label: tb.balanced ? "Debits equal credits" : "Out of balance" }]}>
        <RepTable head={["Code", "Account", "Debit", "Credit"]}>
          {tb.rows.map((r) => <tr key={r.code}><td className="code">{r.code}</td><td>{r.name}</td><td className="n">{r.dr ? signed(r.dr) : ""}</td><td className="n">{r.cr ? signed(r.cr) : ""}</td></tr>)}
          <tr className="total"><td /><td>Total</td><td className="n">{signed(tb.totalDr)}</td><td className="n">{signed(tb.totalCr)}</td></tr>
        </RepTable>
      </ReportCard>
    );
  } else if (report === "pl") {
    const pl = Rep.profitAndLoss(journals, from, to);
    csv = [["section", "code", "account", "amount"], ...pl.income.map((r) => ["revenue", r.code, r.name, r.amount]), ...pl.expense.map((r) => ["expense", r.code, r.name, r.amount]), ["", "", "Profit", pl.profit]];
    node = (
      <ReportCard title="Profit and loss" sub={entity.name + " · " + label} checks={[{ ok: true, label: "Footed from " + Rep.trialBalance(journals, to).rows.length + " accounts" }]}>
        <RepTable head={["Code", "Account", "", "Amount"]}>
          <tr className="grp"><td colSpan={4}>Revenue</td></tr>
          {pl.income.map((r) => <tr key={r.code}><td className="code">{r.code}</td><td colSpan={2}>{r.name}</td><td className="n">{signed(r.amount)}</td></tr>)}
          <tr className="sum"><td /><td colSpan={2}>Total revenue</td><td className="n">{signed(pl.totalIncome)}</td></tr>
          <tr className="grp"><td colSpan={4}>Expenses</td></tr>
          {pl.expense.map((r) => <tr key={r.code}><td className="code">{r.code}</td><td colSpan={2}>{r.name}</td><td className="n">{signed(r.amount)}</td></tr>)}
          <tr className="sum"><td /><td colSpan={2}>Total expenses</td><td className="n">{signed(pl.totalExpense)}</td></tr>
          <tr className="total"><td /><td colSpan={2}>{pl.profit >= 0 ? "Profit for the period" : "Loss for the period"}</td><td className="n">{signed(pl.profit)}</td></tr>
        </RepTable>
      </ReportCard>
    );
  } else if (report === "bs") {
    const bs = Rep.balanceSheet(journals, to);
    csv = [["section", "code", "account", "amount"], ...bs.assets.map((r) => ["asset", r.code, r.name, r.amount]), ...bs.liabilities.map((r) => ["liability", r.code, r.name, r.amount]), ...bs.equity.map((r) => ["equity", r.code, r.name, r.amount])];
    const grp = (name: string, rows: Rep.Amount[], total: number) => [
      <tr className="grp" key={name}><td colSpan={4}>{name}</td></tr>,
      ...rows.map((r) => <tr key={name + r.code}><td className="code">{r.code}</td><td colSpan={2}>{r.name}</td><td className="n">{signed(r.amount)}</td></tr>),
      <tr className="sum" key={name + "sum"}><td /><td colSpan={2}>Total {name.toLowerCase()}</td><td className="n">{signed(total)}</td></tr>
    ];
    node = (
      <ReportCard title="Balance sheet" sub={entity.name + " · as at " + to} checks={[{ ok: bs.balanced, label: bs.balanced ? "Assets equal liabilities plus equity" : "Out by " + signed(bs.diff) }]}>
        <RepTable head={["Code", "Account", "", "Amount"]}>
          {grp("Assets", bs.assets, bs.totalAssets)}
          {grp("Liabilities", bs.liabilities, bs.totalLiabilities)}
          {grp("Equity", bs.equity, bs.totalEquity)}
          <tr className="total"><td /><td colSpan={2}>Liabilities plus equity</td><td className="n">{signed(bs.totalLiabilities + bs.totalEquity)}</td></tr>
        </RepTable>
      </ReportCard>
    );
  } else if (report === "cf") {
    const cf = Rep.cashFlow(journals, from, to);
    const kinds: Rep.CashKind[] = ["operating", "investing", "financing"];
    csv = [["section", "date", "description", "amount"], ...kinds.flatMap((k) => cf.lines[k].map((r) => [k, r.date, r.desc, r.amount]))];
    const grp = (k: Rep.CashKind, total: number) => [
      <tr className="grp" key={k}><td colSpan={4}>{k[0].toUpperCase() + k.slice(1)}</td></tr>,
      ...cf.lines[k].map((r, i) => <tr key={k + i}><td className="code">{r.date.slice(5)}</td><td colSpan={2}>{r.desc}</td><td className="n">{signed(r.amount)}</td></tr>),
      <tr className="sum" key={k + "sum"}><td /><td colSpan={2}>Net {k}</td><td className="n">{signed(total)}</td></tr>
    ];
    node = (
      <ReportCard title="Cash flow" sub={entity.name + " · " + label + " · direct from the bank movements"} checks={[{ ok: cf.ties, label: cf.ties ? "Opening plus movement equals closing" : "Cash does not tie" }]}>
        <RepTable head={["Date", "Movement", "", "Amount"]}>
          <tr><td /><td colSpan={2}>Cash at start</td><td className="n">{signed(cf.opening)}</td></tr>
          {grp("operating", cf.operating)}{grp("investing", cf.investing)}{grp("financing", cf.financing)}
          <tr className="sum"><td /><td colSpan={2}>Net movement</td><td className="n">{signed(cf.net)}</td></tr>
          <tr className="total"><td /><td colSpan={2}>Cash at end</td><td className="n">{signed(cf.closing)}</td></tr>
        </RepTable>
      </ReportCard>
    );
  } else if (report === "ar") {
    /* an invoice cannot be overdue on a date that has not happened yet */
    const asAt = to > today ? today : to;
    const ag = arAging(journals, asAt);
    csv = [["invoice", "customer", "date", "due", "days_overdue", "invoiced", "received", "outstanding"], ...ag.rows.map((r) => [r.number, r.customer, r.date, r.due, r.overdue > 0 ? r.overdue : 0, r.total, r.applied, r.outstanding])];
    const B = ag.buckets;
    const tie = Math.abs(ag.unallocated) < 0.005;
    node = (
      <ReportCard title="Receivables ageing" sub={entity.name + " · as at " + asAt} checks={[
        { ok: tie, label: tie ? "Ties to trade receivables in the ledger" : signed(ag.unallocated) + " in the ledger is not matched to an invoice" },
        { ok: !B.d90p, label: B.d90p ? signed(B.d90p) + " over 90 days" : "Nothing over 90 days" }
      ]}>
        <div className="aging">
          <div className="b"><span className="k">Not yet due</span><span className="v">{signed(B.current)}</span></div>
          <div className={"b" + (B.d1_30 ? " warm" : "")}><span className="k">1–30 days</span><span className="v">{signed(B.d1_30)}</span></div>
          <div className={"b" + (B.d31_60 ? " warm" : "")}><span className="k">31–60 days</span><span className="v">{signed(B.d31_60)}</span></div>
          <div className={"b" + (B.d61_90 ? " hot" : "")}><span className="k">61–90 days</span><span className="v">{signed(B.d61_90)}</span></div>
          <div className={"b" + (B.d90p ? " hot" : "")}><span className="k">Over 90 days</span><span className="v">{signed(B.d90p)}</span></div>
        </div>
        <h3 style={{ margin: "4px 0 8px" }}>Open invoices</h3>
        <RepTable head={["Invoice", "Customer", "", "Outstanding"]}>
          {ag.rows.length ? ag.rows.map((r) => (
            <tr key={r.number}>
              <td className="code">{r.number}</td>
              <td colSpan={2}>{r.customer}<span className="who">{(r.overdue > 0 ? r.overdue + " days past due · " : "") + "due " + r.due}</span>
                <div style={{ marginTop: 6 }}><button className="btn small ghost" type="button" onClick={() => setChaser(r)}>Draft the chaser</button></div></td>
              <td className="n">{signed(r.outstanding)}</td>
            </tr>
          )) : <tr><td colSpan={4}><span className="note">Every invoice raised has been settled.</span></td></tr>}
          <tr className="total"><td /><td colSpan={2}>Total outstanding</td><td className="n">{signed(ag.invoiceTotal)}</td></tr>
        </RepTable>
        {ag.byCustomer.length ? (
          <div><h3 style={{ margin: "16px 0 8px" }}>By customer</h3>
            <RepTable head={["Customer", "", "", "Owed"]}>{ag.byCustomer.map((c) => <tr key={c.customer}><td colSpan={3}>{c.customer}</td><td className="n">{signed(c.amount)}</td></tr>)}</RepTable>
          </div>
        ) : null}
        {chaser ? <Chaser key={chaser.number} r={chaser} who={(signer || "Accounts") + "\n" + entity.name} today={today} onClose={() => setChaser(null)} /> : null}
      </ReportCard>
    );
  } else if (report === "sst") {
    const tp = taxablePeriod(to);
    const st = sstReturn(journals, tp.from, tp.to);
    const open = tp.to > today;
    csv = [["invoice", "customer", "group", "tax_on_invoice", "received_in_period", "tax_due", "twelve_month_rule"],
      ...st.lines.map((l) => [l.number, l.customer, l.group, l.taxTotal, l.paidInPeriod, l.taxDue, l.rule12 ? "yes" : ""]),
      ["", "", "imported services", "", "", st.imported, ""], ["", "", "cash sales", "", "", st.cashSales, ""], ["", "", "TOTAL", "", "", st.taxDue, ""]];
    if (!entity.sstRegistered) {
      node = (
        <ReportCard title="SST-02" sub={entity.name + " · " + tp.label} checks={[{ ok: true, label: "Nothing to file" }]}>
          <p className="note" style={{ padding: "8px 6px" }}>This company is not registered for service tax. Taxable turnover over the last twelve months is {whole(entity.taxableTurnover12m)} against the RM500,000 threshold. The meter on the Capture tab tracks it; registration is due within 30 days of the month the threshold is crossed.</p>
        </ReportCard>
      );
    } else {
      node = (
        <ReportCard title="SST-02 working" sub={entity.name + " · " + tp.label + (open ? " · period still open" : "")} checks={[
          { ok: Math.abs(st.reconciles - (st.ledgerBalance - st.deferred)) < 0.005, label: "Reconciles to the control account" },
          { ok: true, label: "Payment basis" },
          { ok: !st.twelveMonth, label: st.twelveMonth ? signed(st.twelveMonth) + " from the twelve-month rule" : "No twelve-month items" }
        ]}>
          <div className="kpis" style={{ margin: "-6px -10px 14px" }}>
            <Kpi k="Tax to declare" v={whole(st.taxDue)} s={open ? "period still open" : "for " + tp.label} cls={st.taxDue ? undefined : "good"} />
            <Kpi k="Due by" v={st.dueDate} s="last day of the month after the period" />
            <Kpi k="On money received" v={whole(st.taxOnCollections)} s={st.lines.length + " invoice" + (st.lines.length === 1 ? "" : "s")} />
            <Kpi k="Not yet due" v={whole(st.deferred)} s="tax on invoices the customer has not paid" />
          </div>
          <h3 style={{ margin: "4px 0 8px" }}>Tax on what customers actually paid</h3>
          <RepTable head={["Invoice", "Customer", "Received", "Tax due"]}>
            {st.lines.length ? st.lines.map((l) => (
              <tr key={l.number}><td className="code">{l.number}</td><td>{l.customer}{l.rule12 ? <span className="who">unpaid twelve months — tax falls due anyway</span> : null}</td><td className="n">{signed(l.paidInPeriod)}</td><td className="n">{signed(l.taxDue)}</td></tr>
            )) : <tr><td colSpan={4}><span className="note">No customer payments landed in this period.</span></td></tr>}
            {st.cashSales ? <tr><td className="code">—</td><td>Sales settled at the point of sale</td><td className="n" /><td className="n">{signed(st.cashSales)}</td></tr> : null}
            {st.imported ? <tr><td className="code">—</td><td>Imported services, self-accounted<span className="who">declared when incurred, no input credit</span></td><td className="n" /><td className="n">{signed(st.imported)}</td></tr> : null}
            <tr className="total"><td /><td>Payable to Customs</td><td className="n" /><td className="n">{signed(st.taxDue)}</td></tr>
          </RepTable>
          <h3 style={{ margin: "16px 0 8px" }}>Against the ledger</h3>
          <RepTable head={["Item", "", "", "Amount"]}>
            <tr><td colSpan={3}>Service tax control account (2100)</td><td className="n">{signed(st.ledgerBalance)}</td></tr>
            <tr><td colSpan={3}>Less tax on invoices not yet paid</td><td className="n">{signed(-st.deferred)}</td></tr>
            <tr className="total"><td colSpan={3}>Payable on the payment basis</td><td className="n">{signed(st.reconciles)}</td></tr>
          </RepTable>
          <p className="note" style={{ padding: "8px 6px 0" }}>Service tax is accounted for when the customer pays, not when the invoice is raised — except that tax on an invoice still unpaid after twelve months falls due in that month regardless. Both rules are applied above.</p>
        </ReportCard>
      );
    }
  } else {
    const an = Rep.analysis(journals, from, to);
    csv = [["metric", "value"], ["revenue", an.revenue], ["expenses", an.expenses], ["profit", an.profit], ["margin_pct", an.margin],
      ["cash", an.cash], ["receivables", an.receivables], ["payables", an.payables], ["sst_payable", an.sstPayable], ["director_account", an.directorAccount]];
    const maxExp = Math.max(1, ...an.topExpenses.map((e) => e.amount));
    const write = async () => {
      if (!ai) return;
      setWriting(true);
      try { setCommentary(await ai.commentary(entity.id, from, to, label)); } catch { /* leave the button to try again */ } finally { setWriting(false); }
    };
    node = (
      <ReportCard title="Analysis" sub={entity.name + " · " + label} checks={[{ ok: an.checks.tb, label: "Trial balance ties" }, { ok: an.checks.bs, label: "Balance sheet balances" }, { ok: an.checks.cf, label: "Cash ties" }]}
        after={
          <div className="commentary">
            {commentary ? commentary.split("\n").filter((x) => x.trim()).map((p, i) => <p key={i}>{p.trim()}</p>) : null}
            {ai
              ? <div><button className="btn small" type="button" disabled={writing} onClick={() => void write()}>{writing ? "Writing…" : commentary ? "Write it again" : "Ask the model to write the commentary"}</button></div>
              : !commentary ? <p className="note">In the signed-in app the model writes a short commentary on these figures. It is given the figures, never asked to compute them.</p> : null}
          </div>
        }>
        <div className="kpis" style={{ margin: "-6px -10px 14px" }}>
          <Kpi k="Revenue" v={whole(an.revenue)} s={label.slice(0, 10) + " onward"} />
          <Kpi k="Expenses" v={whole(an.expenses)} s={an.topExpenses.length + " accounts"} />
          <Kpi k={an.profit >= 0 ? "Profit" : "Loss"} v={whole(Math.abs(an.profit))} s={an.margin + "% margin"} cls={an.profit >= 0 ? "good" : "bad"} />
          <Kpi k="Cash at bank" v={whole(an.cash)} s={an.runwayMonths ? an.runwayMonths + " months of costs" : "no spend yet"} />
        </div>
        <h3 style={{ margin: "4px 0 8px" }}>Where the money went</h3>
        <div className="bars">{an.topExpenses.map((e) => (
          <div className="bar-row" key={e.code}>
            <div className="bar-lab"><span>{e.name}</span><b>{signed(e.amount)}</b></div>
            <div className="bar-track"><div className="bar-fill" style={{ width: Math.max(3, (e.amount / maxExp) * 100) + "%" }} /></div>
          </div>
        ))}</div>
        <h3 style={{ margin: "16px 0 8px" }}>Position</h3>
        <RepTable head={["Item", "", "", "Amount"]}>
          {([["Receivables outstanding", an.receivables], ["Payables outstanding", an.payables], ["SST payable to Customs", an.sstPayable], ["Director's account", an.directorAccount]] as [string, number][])
            .map(([n, v]) => <tr key={n}><td colSpan={3}>{n}</td><td className="n">{signed(v)}</td></tr>)}
        </RepTable>
      </ReportCard>
    );
  }

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Straight from the journals</p>
        <h1>Reports that tie.</h1>
        <p>Nothing here is typed in. Every figure is footed from the posted journals, and each report shows its own integrity check — <mark>debits equal credits, assets equal liabilities plus equity, cash ties</mark>.</p>
      </header>
      <div className="rep-top">
        <div className="rep-nav" role="group" aria-label="Report">
          {NAV.map(([id, name]) => <button key={id} type="button" aria-pressed={report === id} onClick={() => setReport(id)}>{name}</button>)}
        </div>
        <div className="rep-tools">
          <label className="pick" htmlFor="period">Period
            <select id="period" value={selected} onChange={(e) => setPeriod(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              <option value="all">Everything to date</option>
            </select>
          </label>
          <button className="btn small ghost" type="button" onClick={() => downloadCsv("ledger-" + report + ".csv", csv)}>Export CSV</button>
        </div>
      </div>
      {node}
    </>
  );
}

function Kpi({ k, v, s, cls }: { k: string; v: string; s: string; cls?: string }) {
  return <div className="kpi"><span className="k">{k}</span><span className={"v" + (cls ? " " + cls : "")}>{v}</span><span className="s">{s}</span></div>;
}

/* ---------- collections: the same four letters, in order ---------- */
const CHASE_STAGES = [
  { max: 0, name: "Courtesy note", tone: "before it is due",
    body: (r: AgingRow, who: string) => "Hi " + r.customer + ",\n\nA quick note that invoice " + r.number + " for " + money(r.outstanding) + " falls due on " + r.due + ". The details are the same as the copy we sent on " + r.date + ".\n\nIf anything on it needs changing, tell me now and I will reissue it.\n\nThanks,\n" + who },
  { max: 30, name: "First reminder", tone: "1–30 days past due",
    body: (r: AgingRow, who: string) => "Hi " + r.customer + ",\n\nInvoice " + r.number + " for " + money(r.outstanding) + " was due on " + r.due + " and is now " + r.overdue + " days past due. I have attached the copy again.\n\nIf it is already with your payments team, could you let me know the run date? If something is holding it up, I would rather hear it than keep sending reminders.\n\nThanks,\n" + who },
  { max: 60, name: "Second reminder", tone: "31–60 days past due",
    body: (r: AgingRow, who: string, today: string) => "Hi " + r.customer + ",\n\nInvoice " + r.number + " for " + money(r.outstanding) + " is now " + r.overdue + " days past due and this is my second reminder.\n\nI would like to agree a payment date this week. If the full amount is difficult, tell me what you can do and by when, and I will work with it. If I do not hear back by " + addDaysIso(today, 7) + " I will pass it to our accounts team to put new work on hold.\n\nThanks,\n" + who },
  { max: 1e9, name: "Final notice", tone: "over 60 days past due",
    body: (r: AgingRow, who: string, today: string) => "Dear " + r.customer + ",\n\nInvoice " + r.number + " dated " + r.date + " for " + money(r.outstanding) + " remains unpaid " + r.overdue + " days after its due date, despite earlier reminders.\n\nUnless the amount is settled, or a payment schedule is agreed in writing, by " + addDaysIso(today, 14) + ", the account will be placed on hold and the debt referred for recovery. I would much rather settle this between us.\n\nPlease treat this as the final reminder before that step.\n\nRegards,\n" + who }
];

function Chaser({ r, who, today, onClose }: { r: AgingRow; who: string; today: string; onClose: () => void }) {
  const stage = CHASE_STAGES.find((s) => r.overdue <= s.max) || CHASE_STAGES[CHASE_STAGES.length - 1];
  const [text, setText] = useState(stage.body(r, who, today));
  const [copied, setCopied] = useState("Copy");
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied("Copied"); } catch { setCopied("Select and copy"); }
    window.setTimeout(() => setCopied("Copy"), 2500);
  };
  return (
    <div className="report chaser" style={{ marginTop: 14 }}>
      <header><h2>{stage.name} · {r.number}</h2><p>{r.customer} · {money(r.outstanding)} · {stage.tone}</p></header>
      <div className="sect">
        <textarea rows={12} aria-label="Chaser letter" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="cta-row" style={{ marginTop: 10 }}>
          <button className="btn small" type="button" onClick={() => void copy()}>{copied}</button>
          <button className="btn small ghost" type="button" onClick={onClose}>Close</button>
          <span className="note">Written from the ageing, not from a model. Read it before you send it.</span>
        </div>
      </div>
    </div>
  );
}
