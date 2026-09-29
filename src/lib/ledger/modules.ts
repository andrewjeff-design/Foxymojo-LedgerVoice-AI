/* Ledger VoiceAI - receivables, the SST-02 working, the month-end close and the pack behind
   "ask the books". Everything here reads the posted journals and the invoices attached to them. */

import { balanceSheet, cashFlow, profitAndLoss } from "./reports";
import type { Entity, Entry } from "./types";

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const posted = (js: Entry[]) => js.filter((j) => j.status === "posted");
const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const addMonths = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
export const endOfMonth = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};
export const endOfNextMonth = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0)).toISOString().slice(0, 10);
};
export const addDaysIso = (iso: string, n: number) => new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthLabel = (m: string) => MONTH_NAMES[Number(m.slice(5, 7)) - 1] + " " + m.slice(0, 4);

/* ---------- receivables ---------- */
export function invoices(js: Entry[]) {
  return posted(js).filter((j) => j.inv && j.inv.number).map((j) => ({ ...j.inv!, date: j.date, desc: j.desc }));
}
export function payments(js: Entry[]) {
  return posted(js).filter((j) => j.applies).map((j) => ({ date: j.date, applies: j.applies as string, amount: Math.abs(Number(j.amount) || 0) }));
}
function arBalance(js: Entry[], asAt?: string | null) {
  return r2(posted(js).filter((j) => !asAt || j.date <= asAt)
    .reduce((s, j) => s + (j.lines || []).filter((l) => l.code === "1100").reduce((t, l) => t + (l.dr || 0) - (l.cr || 0), 0), 0));
}

export type Bucket = "paid" | "current" | "d1_30" | "d31_60" | "d61_90" | "d90p";
export type AgingRow = { number: string; customer: string | null; date: string; due: string; total: number; tax: number; group: string; applied: number; outstanding: number; overdue: number; bucket: Bucket };

export function arAging(js: Entry[], asAt?: string | null) {
  const paid = payments(js).filter((p) => !asAt || p.date <= asAt);
  const rows: AgingRow[] = invoices(js).filter((i) => !asAt || i.date <= asAt).map((i) => {
    const applied = r2(paid.filter((p) => p.applies === i.number).reduce((s, p) => s + p.amount, 0));
    const outstanding = r2(Math.max(0, (i.total || 0) - applied));
    const overdue = i.due && asAt ? days(i.due, asAt) : 0;
    const bucket: Bucket = outstanding <= 0 ? "paid" : overdue <= 0 ? "current" : overdue <= 30 ? "d1_30" : overdue <= 60 ? "d31_60" : overdue <= 90 ? "d61_90" : "d90p";
    return { number: i.number, customer: i.customer, date: i.date, due: i.due, total: r2(i.total || 0), tax: r2(i.tax || 0), group: i.group || "professional", applied, outstanding, overdue, bucket };
  });
  const open = rows.filter((r) => r.outstanding > 0).sort((a, b) => b.overdue - a.overdue);
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
  open.forEach((r) => { const k = r.bucket as keyof typeof buckets; buckets[k] = r2(buckets[k] + r.outstanding); });
  const invoiceTotal = r2(open.reduce((s, r) => s + r.outstanding, 0));
  const ledger = arBalance(js, asAt);
  const unallocated = r2(ledger - invoiceTotal);
  const byCustomer: Record<string, number> = {};
  open.forEach((r) => { const k = r.customer || "Unknown"; byCustomer[k] = r2((byCustomer[k] || 0) + r.outstanding); });
  return {
    asAt: asAt || null, rows: open, all: rows, buckets, invoiceTotal, ledger, unallocated,
    ties: Math.abs(unallocated) < 0.005 || unallocated > 0,
    byCustomer: Object.entries(byCustomer).map(([customer, amount]) => ({ customer, amount })).sort((a, b) => b.amount - a.amount)
  };
}

/* ---------- SST-02 working, payment basis ---------- */
export function sstReturn(js: Entry[], from: string, to: string) {
  const inv = invoices(js);
  const pay = payments(js);
  const dueDate = endOfNextMonth(to);
  const lines: { number: string; customer: string | null; date: string; group: string; rate: number; taxTotal: number; paidInPeriod: number; taxDue: number; rule12: boolean }[] = [];
  let taxDue = 0, deferred = 0, twelveMonth = 0;

  inv.forEach((i) => {
    const total = r2(i.total || 0);
    const tax = r2(i.tax || 0);
    if (total <= 0 || tax <= 0) return;
    const paidInPeriod = r2(pay.filter((p) => p.applies === i.number && p.date >= from && p.date <= to).reduce((s, p) => s + p.amount, 0));
    const paidToDate = r2(pay.filter((p) => p.applies === i.number && p.date <= to).reduce((s, p) => s + p.amount, 0));
    const taxOnPaidInPeriod = r2(tax * (paidInPeriod / total));
    const anniversary = addMonths(i.date, 12);
    const unpaid = r2(Math.max(0, total - paidToDate));
    const taxUnpaid = r2(tax * (unpaid / total));
    let rule12 = 0;
    if (unpaid > 0 && anniversary >= from && anniversary <= to) rule12 = taxUnpaid;
    if (taxOnPaidInPeriod > 0 || rule12 > 0) {
      lines.push({ number: i.number, customer: i.customer, date: i.date, group: i.group || "professional",
        rate: total > 0 ? r2((tax / (total - tax)) * 100) / 100 : 0, taxTotal: tax, paidInPeriod, taxDue: r2(taxOnPaidInPeriod + rule12), rule12: rule12 > 0 });
    }
    taxDue = r2(taxDue + taxOnPaidInPeriod + rule12);
    twelveMonth = r2(twelveMonth + rule12);
    if (unpaid > 0 && !rule12) deferred = r2(deferred + taxUnpaid);
  });

  /* taxable sales settled at the point of sale: tax falls in the period of the sale */
  const cashSales = r2(posted(js).filter((j) => j.date >= from && j.date <= to && !j.inv && Number(j.taxAmount) > 0
    && (j.lines || []).some((l) => l.code === "2100" && l.cr > 0) && (j.lines || []).some((l) => String(l.code)[0] === "4" && l.cr > 0))
    .reduce((s, j) => s + Number(j.taxAmount), 0));

  /* tax the business self-accounts on imported services, declared when incurred */
  const imported = r2(posted(js).filter((j) => j.date >= from && j.date <= to && (j.badges || []).includes("self-accounted tax"))
    .reduce((s, j) => s + (Number(j.taxAmount) || 0), 0));

  const byRate: Record<string, number> = {};
  lines.forEach((l) => { byRate[l.group] = r2((byRate[l.group] || 0) + l.taxDue); });

  const ledgerBalance = r2(posted(js).filter((j) => j.date <= to)
    .reduce((s, j) => s + (j.lines || []).filter((l) => l.code === "2100").reduce((t, l) => t + (l.cr || 0) - (l.dr || 0), 0), 0));

  return {
    from, to, dueDate, taxDue: r2(taxDue + imported + cashSales), taxOnCollections: taxDue, cashSales, imported, deferred, twelveMonth,
    lines, byGroup: Object.entries(byRate).map(([group, amount]) => ({ group, amount })).sort((a, b) => b.amount - a.amount),
    ledgerBalance, basis: "payment" as const, reconciles: r2(ledgerBalance - deferred)
  };
}

/* Malaysian service tax is filed for two-month taxable periods: Jan-Feb, Mar-Apr, and so on. */
export function taxablePeriod(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const s = m % 2 === 1 ? m : m - 1;
  return {
    from: y + "-" + String(s).padStart(2, "0") + "-01",
    to: new Date(Date.UTC(y, s + 1, 0)).toISOString().slice(0, 10),
    label: MONTH_NAMES[s - 1] + "–" + MONTH_NAMES[s] + " " + y
  };
}

/* ---------- month-end close ---------- */
export const CLOSE_ITEMS = ["entries", "bank", "related", "director", "ar", "depn", "sst", "reports"] as const;
export type CloseItemId = typeof CLOSE_ITEMS[number];

export type CloseItem = { id: CloseItemId; label: string; auto: boolean; agentDone?: boolean; detail: string; tick: boolean; done: boolean; accepted: boolean; needsPerson: boolean };

export function closeStatus(js: Entry[], month: string, opts?: { ticks?: Record<string, boolean>; signoffs?: Record<string, { by: string; on: string }>; sstRegistered?: boolean }) {
  const o = opts || {};
  const from = month + "-01";
  const to = endOfMonth(from);
  const inMonth = posted(js).filter((j) => j.date >= from && j.date <= to);
  const bal = (code: string) => r2(posted(js).filter((j) => j.date <= to)
    .reduce((s, j) => s + (j.lines || []).filter((l) => l.code === code).reduce((t, l) => t + (l.cr || 0) - (l.dr || 0), 0), 0));
  const countBadge = (b: string) => inMonth.filter((j) => (j.badges || []).includes(b)).length;
  const noDoc = countBadge("no document");
  const related = countBadge("related party");
  const director = bal("2200");
  const depreciation = inMonth.some((j) => (j.lines || []).some((l) => l.code === "6000"));
  const tp = taxablePeriod(to);
  const sst = o.sstRegistered ? sstReturn(js, tp.from, tp.to) : null;
  const periodOpen = tp.to > to;
  const aging = arAging(js, to);
  const overdue = r2(aging.buckets.d1_30 + aging.buckets.d31_60 + aging.buckets.d61_90 + aging.buckets.d90p);
  const base: Omit<CloseItem, "tick" | "done" | "accepted" | "needsPerson">[] = [
    { id: "entries", label: "Every entry has a document", auto: true, agentDone: noDoc === 0,
      detail: noDoc === 0 ? "All " + inMonth.length + " entries carry a reference" : noDoc + " entries without a document reference — attach them, or accept them in writing" },
    { id: "bank", label: "Bank reconciled to the statement", auto: false, detail: "Tick when the closing balance agrees" },
    { id: "related", label: "Related-party transactions documented", auto: false, detail: related ? related + " in the month to evidence" : "None this month" },
    { id: "director", label: "Director's account agreed", auto: true, agentDone: Math.abs(director) < 0.005,
      detail: Math.abs(director) < 0.005 ? "Nil balance" : "Balance of RM " + fmt2(Math.abs(director)) + " — agree it with the director, document it, then accept" },
    { id: "ar", label: "Overdue receivables chased", auto: false, detail: overdue > 0 ? "RM " + fmt2(overdue) + " past due" : "Nothing past due" },
    { id: "depn", label: "Depreciation posted", auto: true, agentDone: depreciation,
      detail: depreciation ? "Posted this month" : "No depreciation entry found — post it, or accept that none is due" },
    { id: "sst", label: "Service tax accounted for", auto: true, agentDone: !o.sstRegistered || !!sst,
      detail: sst ? "RM " + fmt2(sst.taxDue) + " so far for " + tp.label + ", to file by " + sst.dueDate + (periodOpen ? " — the period is still open" : "") : "Not registered for service tax" },
    { id: "reports", label: "Reports reviewed", auto: false, detail: "Trial balance, P&L, balance sheet and cash flow" }
  ];
  /* The agent checks what it can see. Where it cannot satisfy an item it says so and leaves
     it to a person to accept in their own name; it never ticks anything on their behalf. */
  const ticks = o.ticks || {};
  const items: CloseItem[] = base.map((i) => {
    const tick = !!ticks[month + ":" + i.id];
    return {
      ...i,
      tick,
      done: i.auto ? (!!i.agentDone || tick) : tick,
      accepted: !!(i.auto && !i.agentDone && tick),
      needsPerson: !i.auto || !i.agentDone
    };
  });
  const done = items.filter((i) => i.done).length;
  const accepted = items.filter((i) => i.accepted).length;
  return { month, from, to, items, done, total: items.length, accepted, ready: done === items.length, signoff: (o.signoffs || {})[month] || null };
}

/* ---------- the pack behind "ask the books" ---------- */
export type AskPack = ReturnType<typeof buildAskPack>;

export function buildAskPack(js: Entry[], entity: Entity, today: string) {
  const dates = js.filter((j) => j.status === "posted").map((j) => j.date).filter(Boolean).sort();
  const last = dates[dates.length - 1] || today;
  /* questions are asked about today, so age the books to today even if the last entry is older */
  const to = last > today ? last : today;
  const pl = profitAndLoss(js, null, to);
  const bs = balanceSheet(js, to);
  const cf = cashFlow(js, null, to);
  const aging = arAging(js, to);
  const find = (list: { code: string; amount: number }[], code: string) => (list.find((a) => a.code === code) || { amount: 0 }).amount;
  const mp = profitAndLoss(js, to.slice(0, 7) + "-01", to);
  let service_tax:
    | { registered: true; basis: string; taxable_period: string; due_on: string; amount_due_so_far: number; deferred_until_customers_pay: number }
    | { registered: false; taxable_turnover_12m: number; threshold: number };
  if (entity.sstRegistered) {
    const tp = taxablePeriod(to);
    const sst = sstReturn(js, tp.from, tp.to);
    service_tax = { registered: true, basis: "tax follows the money, not the invoice", taxable_period: tp.label,
      due_on: sst.dueDate, amount_due_so_far: sst.taxDue, deferred_until_customers_pay: sst.deferred };
  } else {
    service_tax = { registered: false, taxable_turnover_12m: entity.taxableTurnover12m, threshold: 500000 };
  }
  return {
    entity: entity.name, period: { from: "start", to },
    profit_and_loss: { revenue: pl.totalIncome, expenses: pl.totalExpense, profit: pl.profit,
      revenue_lines: pl.income.map((a) => ({ account: a.name, amount: a.amount })),
      expense_lines: pl.expense.map((a) => ({ account: a.name, amount: a.amount })) },
    balance_sheet: { cash: find(bs.assets, "1000"), receivables: find(bs.assets, "1100"), equipment: find(bs.assets, "1500"),
      payables: find(bs.liabilities, "2000"), sst_payable: find(bs.liabilities, "2100"), director_account: find(bs.liabilities, "2200"),
      total_assets: bs.totalAssets, total_equity: bs.totalEquity },
    cash_flow: { opening: cf.opening, operating: cf.operating, investing: cf.investing, financing: cf.financing, closing: cf.closing },
    receivables: { total_outstanding: aging.invoiceTotal, buckets: aging.buckets, by_customer: aging.byCustomer.slice(0, 5) },
    current_month: { month: to.slice(0, 7), revenue: mp.totalIncome, expenses: mp.totalExpense, profit: mp.profit },
    service_tax
  };
}

/* Answers the common questions straight from the pack, with no model in the loop. */
export function answerOffline(q: string, pack: AskPack, money: (n: number) => string): string | null {
  const t = " " + q.toLowerCase() + " ";
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  const r = pack.receivables, pl = pack.profit_and_loss, bs = pack.balance_sheet, cf = pack.cash_flow;
  const monthName = (m: string) => MONTH_NAMES[Number(m.slice(5)) - 1];
  /* a tax word settles it first: "how much tax do I owe" is a tax question, not a receivables one */
  if (has("tax", "sst", "customs", "cukai", "税")) {
    const st = pack.service_tax;
    if (!st.registered) return "Not registered for service tax. Taxable turnover is " + money(st.taxable_turnover_12m) + " against the RM500,000 threshold.";
    return money(st.amount_due_so_far) + " of service tax is due for " + st.taxable_period + ", payable by " + st.due_on +
      ". A further " + money(st.deferred_until_customers_pay) + " sits on invoices that have not been paid yet, so it is not due.";
  }
  if (has("owe", "owing", "outstanding", "receivab", "debtor", "collect", "unpaid", "overdue", "hutang", "belum bayar", "kutip", "欠", "应收", "逾期")) {
    if (!r.total_outstanding) return "Nobody owes you anything — every invoice raised has been settled.";
    const who = r.by_customer.map((c) => c.customer + " " + money(c.amount)).join(", ");
    const late = r.buckets.d1_30 + r.buckets.d31_60 + r.buckets.d61_90 + r.buckets.d90p;
    return money(r.total_outstanding) + " is outstanding: " + who + ". " +
      (late ? money(late) + " of that is already past its due date." : "None of it is past due yet.");
  }
  if (has("profit", "earn", "margin", "bottom line", "untung", "keuntungan", "利润", "赚")) {
    const m = pack.current_month;
    return (pl.profit >= 0 ? "Profit of " : "A loss of ") + money(Math.abs(pl.profit)) + " to " + pack.period.to +
      ", on revenue of " + money(pl.revenue) + " against " + money(pl.expenses) + " of costs. " +
      monthName(m.month) + " alone is " + money(m.profit) + ".";
  }
  if (has("cash", "bank", "money in", "tunai", "duit", "baki", "现金", "银行")) {
    return money(bs.cash) + " at bank. Cash started the period at " + money(cf.opening) + " and moved " +
      (cf.closing - cf.opening >= 0 ? "up " : "down ") + money(Math.abs(cf.closing - cf.opening)) + ".";
  }
  if (has("spend", "spent", "expense", "cost", "went", "belanja", "kos", "开销", "费用", "花")) {
    const top = pl.expense_lines.slice().sort((a, b) => b.amount - a.amount).slice(0, 3);
    return money(pl.expenses) + " of costs, the largest being " + top.map((e) => e.account.toLowerCase() + " " + money(e.amount)).join(", ") + ".";
  }
  if (has("revenue", "sales", "turnover", "jualan", "pendapatan", "收入", "营业额")) {
    return money(pl.revenue) + " of revenue to " + pack.period.to + ", of which " + monthName(pack.current_month.month) + " is " + money(pack.current_month.revenue) + ".";
  }
  if (has("supplier", "payable", "creditor", "owe to", "bayar kepada", "应付")) {
    return money(bs.payables) + " owed to suppliers, plus " + money(bs.director_account) + " on the director's account.";
  }
  if (has("director", "shareholder", "pengarah", "董事")) {
    return bs.director_account ? money(bs.director_account) + " is owed to the director. It needs to be agreed and documented before year end." : "The director's account is nil.";
  }
  return null;
}
