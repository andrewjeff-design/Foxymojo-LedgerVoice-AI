/* Ledger VoiceAI - reports built from the posted journals, nothing else. */

import type { Entry } from "./types";

type Journal = Pick<Entry, "date" | "status" | "lines"> & { desc?: string };

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const CASH_CODES = ["1000", "1010"];
type AccountClass = "asset" | "liability" | "equity" | "income" | "expense";
const cls = (code: string): AccountClass => {
  const c = String(code)[0];
  return c === "1" ? "asset" : c === "2" ? "liability" : c === "3" ? "equity" : c === "4" ? "income" : "expense";
};
const inRange = (d: string, from?: string | null, to?: string | null) => (!from || d >= from) && (!to || d <= to);
const posted = <T extends Journal>(js: T[]) => js.filter((j) => j.status === "posted");
const upTo = <T extends Journal>(js: T[], to?: string | null) => posted(js).filter((j) => !to || j.date <= to);
const between = <T extends Journal>(js: T[], from?: string | null, to?: string | null) => posted(js).filter((j) => inRange(j.date, from, to));

/* account name without the invoice-line suffix */
const baseName = (name: string) => String(name).split(" — ")[0];

export type Balance = { code: string; name: string; dr: number; cr: number };
export type Amount = { code: string; name: string; amount: number };

function balances(journals: Journal[]): Balance[] {
  const map = new Map<string, Balance>();
  journals.forEach((j) => (j.lines || []).forEach((l) => {
    const row = map.get(l.code) || { code: l.code, name: baseName(l.account), dr: 0, cr: 0 };
    row.dr = r2(row.dr + (l.dr || 0));
    row.cr = r2(row.cr + (l.cr || 0));
    map.set(l.code, row);
  }));
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export function trialBalance(journals: Journal[], to?: string | null) {
  const rows = balances(upTo(journals, to)).map((a) => {
    const net = r2(a.dr - a.cr);
    return { code: a.code, name: a.name, dr: net > 0 ? net : 0, cr: net < 0 ? -net : 0, cls: cls(a.code) };
  }).filter((a) => a.dr !== 0 || a.cr !== 0);
  const totalDr = r2(rows.reduce((s, a) => s + a.dr, 0));
  const totalCr = r2(rows.reduce((s, a) => s + a.cr, 0));
  return { rows, totalDr, totalCr, balanced: Math.abs(totalDr - totalCr) < 0.005, asAt: to || null };
}

export function profitAndLoss(journals: Journal[], from?: string | null, to?: string | null) {
  const rows = balances(between(journals, from, to));
  const income: Amount[] = rows.filter((a) => cls(a.code) === "income").map((a) => ({ code: a.code, name: a.name, amount: r2(a.cr - a.dr) })).filter((a) => a.amount !== 0);
  const expense: Amount[] = rows.filter((a) => cls(a.code) === "expense").map((a) => ({ code: a.code, name: a.name, amount: r2(a.dr - a.cr) })).filter((a) => a.amount !== 0);
  const totalIncome = r2(income.reduce((s, a) => s + a.amount, 0));
  const totalExpense = r2(expense.reduce((s, a) => s + a.amount, 0));
  return { income, expense, totalIncome, totalExpense, profit: r2(totalIncome - totalExpense), from: from || null, to: to || null };
}

export function cumulativeProfit(journals: Journal[], to?: string | null) {
  const rows = balances(upTo(journals, to));
  const inc = rows.filter((a) => cls(a.code) === "income").reduce((s, a) => s + (a.cr - a.dr), 0);
  const exp = rows.filter((a) => cls(a.code) === "expense").reduce((s, a) => s + (a.dr - a.cr), 0);
  return r2(inc - exp);
}

export function balanceSheet(journals: Journal[], to?: string | null) {
  const rows = balances(upTo(journals, to));
  const pick = (kind: AccountClass, sign: number): Amount[] => rows.filter((a) => cls(a.code) === kind)
    .map((a) => ({ code: a.code, name: a.name, amount: r2(sign * (a.dr - a.cr)) }))
    .filter((a) => a.amount !== 0);
  const assets = pick("asset", 1);
  const liabilities = pick("liability", -1);
  const equity = pick("equity", -1);
  const profit = cumulativeProfit(journals, to);
  if (profit !== 0) equity.push({ code: "3200", name: "Profit for the period", amount: profit });
  const totalAssets = r2(assets.reduce((s, a) => s + a.amount, 0));
  const totalLiabilities = r2(liabilities.reduce((s, a) => s + a.amount, 0));
  const totalEquity = r2(equity.reduce((s, a) => s + a.amount, 0));
  const diff = r2(totalAssets - totalLiabilities - totalEquity);
  return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, diff, balanced: Math.abs(diff) < 0.005, asAt: to || null };
}

export function cashAt(journals: Journal[], to?: string | null) {
  const rows = balances(upTo(journals, to));
  return r2(rows.filter((a) => CASH_CODES.includes(a.code)).reduce((s, a) => s + (a.dr - a.cr), 0));
}

export type CashKind = "operating" | "investing" | "financing";

export function classify(journal: Journal): CashKind {
  const codes = (journal.lines || []).filter((l) => !CASH_CODES.includes(l.code)).map((l) => String(l.code));
  if (codes.some((c) => c.startsWith("15"))) return "investing";
  if (codes.some((c) => c.startsWith("22") || c.startsWith("23") || c.startsWith("30"))) return "financing";
  return "operating";
}

export type CashLine = { date: string; desc: string; amount: number };

export function cashFlow(journals: Journal[], from?: string | null, to?: string | null) {
  const dayBefore = from ? new Date(new Date(from).getTime() - 86400000).toISOString().slice(0, 10) : null;
  const opening = dayBefore ? cashAt(journals, dayBefore) : 0;
  const buckets: Record<CashKind, CashLine[]> = { operating: [], investing: [], financing: [] };
  between(journals, from, to).forEach((j) => {
    const move = r2((j.lines || []).filter((l) => CASH_CODES.includes(l.code)).reduce((s, l) => s + (l.dr || 0) - (l.cr || 0), 0));
    if (Math.abs(move) < 0.005) return;
    buckets[classify(j)].push({ date: j.date, desc: j.desc || "", amount: move });
  });
  const sum = (k: CashKind) => r2(buckets[k].reduce((s, x) => s + x.amount, 0));
  const operating = sum("operating");
  const investing = sum("investing");
  const financing = sum("financing");
  const net = r2(operating + investing + financing);
  const closing = cashAt(journals, to);
  return {
    opening, closing, operating, investing, financing, net,
    lines: buckets, ties: Math.abs(r2(opening + net) - closing) < 0.005,
    from: from || null, to: to || null
  };
}

export function analysis(journals: Journal[], from?: string | null, to?: string | null) {
  const pl = profitAndLoss(journals, from, to);
  const bs = balanceSheet(journals, to);
  const cf = cashFlow(journals, from, to);
  const find = (list: Amount[], code: string) => (list.find((a) => a.code === code) || { amount: 0 }).amount;
  const expenses = pl.expense.slice().sort((a, b) => b.amount - a.amount);
  const margin = pl.totalIncome ? r2((pl.profit / pl.totalIncome) * 100) : 0;
  const monthlyBurn = pl.totalExpense;
  const cash = cf.closing;
  return {
    period: { from: pl.from, to: pl.to },
    revenue: pl.totalIncome, expenses: pl.totalExpense, profit: pl.profit, margin,
    cash, receivables: find(bs.assets, "1100"), payables: find(bs.liabilities, "2000"),
    sstPayable: find(bs.liabilities, "2100"), directorAccount: find(bs.liabilities, "2200"),
    topExpenses: expenses.slice(0, 5),
    runwayMonths: monthlyBurn > 0 ? r2(cash / monthlyBurn) : null,
    arToRevenue: pl.totalIncome ? r2((find(bs.assets, "1100") / pl.totalIncome) * 100) : 0,
    checks: { tb: trialBalance(journals, to).balanced, bs: bs.balanced, cf: cf.ties }
  };
}

export type Analysis = ReturnType<typeof analysis>;
