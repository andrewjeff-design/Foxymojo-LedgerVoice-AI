/* Ledger VoiceAI - bank statement import and reconciliation.

   There are no bank feeds to buy in Malaysia. BNM's Open Finance framework is still an
   exposure draft, Plaid does not cover the country, and PayNet's APIs move money without
   returning account data. So the statement file is the integration, and this module is it.

   HEALTH WARNING ON THE COLUMN MAPS. The per-bank formats below are written from public
   statement layouts, not from verified exports. Before shipping, pull one real CSV from
   each bank, add it to the tests, and correct the map. The parser is built to fail
   loudly - an unrecognised shape returns warnings rather than silently mangling rows.

   The reconciliation half does not depend on the column maps and is fully tested. */

import type { Entry, TxInput } from "./types";

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/* ---------- primitives ---------- */

/** Split one CSV line, honouring quotes and doubled quotes inside them. */
export function splitCsvLine(line: string, delim: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === "\"") {
        if (line[i + 1] === "\"") { cur += "\""; i += 1; } else { quoted = false; }
      } else { cur += c; }
    } else if (c === "\"") { quoted = true; }
    else if (c === delim) { out.push(cur); cur = ""; }
    else { cur += c; }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Guess the delimiter from the first few populated lines. */
export function sniffDelimiter(lines: string[]) {
  let best = ",";
  let bestScore = -1;
  [",", ";", "\t", "|"].forEach((d) => {
    const counts = lines.slice(0, 12).map((l) => splitCsvLine(l, d).length);
    const max = Math.max(...counts, 0);
    if (max < 2) return;
    const consistent = counts.filter((c) => c === max).length;
    const score = consistent * 10 + max;
    if (score > bestScore) { bestScore = score; best = d; }
  });
  return best;
}

function iso(y: number, m: number, d: number) {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

/** Malaysian statements use dd/mm/yyyy far more than mm/dd/yyyy; ambiguity resolves to day-first. */
export function parseDate(raw: unknown, opts?: { monthFirst?: boolean }) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/\s+/g, " ");
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) {
    return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += y < 70 ? 2000 : 1900;
    /* day-first unless that is impossible */
    let d = a; let mo = b;
    if (a > 12 && b <= 12) { d = a; mo = b; }
    else if (b > 12 && a <= 12) { d = b; mo = a; }
    else if (opts && opts.monthFirst && a <= 12) { d = b; mo = a; }
    return iso(y, mo, d);
  }
  if ((m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{2,4})/))) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    let y = Number(m[3]);
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (mo) return iso(y, mo, Number(m[1]));
  }
  if ((m = s.match(/^([A-Za-z]{3,})[\s-](\d{1,2})[,\s]+(\d{4})/))) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo) return iso(Number(m[3]), mo, Number(m[2]));
  }
  return null;
}

/**
 * Parse a money cell. Handles thousands separators, a trailing or leading CR/DR marker,
 * parentheses for negatives, and a bare minus. Returns null for a blank or unreadable cell.
 */
export function parseAmount(raw: unknown) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s || s === "-" || s === "--") return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  const cr = /(^|\s)CR$|^CR(\s|$)/i.test(s);
  const dr = /(^|\s)DR$|^DR(\s|$)/i.test(s);
  if (cr) sign = Math.abs(sign);
  if (dr) sign = -Math.abs(sign);
  s = s.replace(/\b(CR|DR)\b/gi, "").replace(/(RM|MYR)\s*/gi, "").replace(/[,\s]/g, "");
  if (s.startsWith("-")) { sign = -Math.abs(sign); s = s.slice(1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (!s || !/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!isFinite(n)) return null;
  return r2(sign * n);
}

const norm = (s: unknown) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/* ---------- format registry ----------
   `match` decides whether a file belongs to this format. `cols` maps our field names onto
   header aliases, lowercased and punctuation-stripped. Verify each against a real export. */

type ColumnField = "date" | "desc" | "ref" | "debit" | "credit" | "amount" | "balance";
export type BankFormat = { id: string; name: string; verified: boolean; match: (text: string) => boolean; cols: Record<ColumnField, string[]> };

export const FORMATS: BankFormat[] = [
  {
    id: "maybank", name: "Maybank", verified: false,
    match: (text) => /maybank|malayan banking|m2u/i.test(text),
    cols: {
      date: ["transaction date", "date", "tarikh", "txn date", "posting date"],
      desc: ["transaction description", "description", "keterangan", "details", "particulars"],
      ref: ["reference", "ref no", "reference no", "cheque no"],
      debit: ["debit", "withdrawal", "dr", "keluar"],
      credit: ["credit", "deposit", "cr", "masuk"],
      amount: ["amount", "transaction amount", "jumlah"],
      balance: ["balance", "statement balance", "running balance", "baki"]
    }
  },
  {
    id: "cimb", name: "CIMB", verified: false,
    match: (text) => /\bcimb\b|clicks/i.test(text),
    cols: {
      date: ["date", "transaction date", "posting date", "value date"],
      desc: ["description", "transaction", "details", "particulars"],
      ref: ["reference", "ref", "cheque no"],
      debit: ["debit", "withdrawal", "money out"],
      credit: ["credit", "deposit", "money in"],
      amount: ["amount", "transaction amount"],
      balance: ["balance", "ledger balance", "available balance"]
    }
  },
  {
    id: "publicbank", name: "Public Bank", verified: false,
    match: (text) => /public bank|pbebank|pbb\b/i.test(text),
    cols: {
      date: ["date", "trans date", "transaction date", "posting date"],
      desc: ["description", "transaction description", "details", "particulars"],
      ref: ["reference", "ref no", "cheque no"],
      debit: ["debit", "withdrawal"],
      credit: ["credit", "deposit"],
      amount: ["amount"],
      balance: ["balance", "running balance"]
    }
  },
  {
    id: "generic", name: "Generic CSV",
    verified: true, /* the header sniffing itself is tested; no bank claim is made */
    match: () => true,
    cols: {
      date: ["date", "transaction date", "txn date", "posting date", "value date", "tarikh"],
      desc: ["description", "details", "particulars", "narrative", "transaction", "memo", "keterangan"],
      ref: ["reference", "ref", "ref no", "reference no", "cheque no", "transaction id"],
      debit: ["debit", "withdrawal", "money out", "paid out", "dr"],
      credit: ["credit", "deposit", "money in", "paid in", "cr"],
      amount: ["amount", "transaction amount", "value", "jumlah"],
      balance: ["balance", "running balance", "ledger balance", "baki"]
    }
  }
];

export const formatById = (id: string) => FORMATS.find((f) => f.id === id) || null;
const GENERIC = formatById("generic") as BankFormat;

/** Which format does this text look like? Never throws; falls back to generic. */
export function sniff(text: string) {
  const head = String(text || "").slice(0, 4000);
  return FORMATS.find((f) => f.id !== "generic" && f.match(head)) || GENERIC;
}

/** Find the header row: the first line whose cells match at least a date-ish and one money-ish alias. */
function findHeader(lines: string[], delim: string, cols: BankFormat["cols"]) {
  const wanted = new Set([...cols.date, ...cols.desc, ...cols.debit, ...cols.credit, ...cols.amount, ...cols.balance]);
  let best = -1;
  let bestHits = 0;
  for (let i = 0; i < Math.min(lines.length, 40); i += 1) {
    const cells = splitCsvLine(lines[i], delim).map(norm);
    const hits = cells.filter((c) => c && wanted.has(c)).length;
    const hasDate = cells.some((c) => cols.date.includes(c));
    const hasMoney = cells.some((c) => cols.debit.includes(c) || cols.credit.includes(c) || cols.amount.includes(c));
    if (hasDate && hasMoney && hits > bestHits) { best = i; bestHits = hits; }
  }
  return best;
}

function mapColumns(headerCells: string[], cols: BankFormat["cols"]) {
  const idx: Partial<Record<ColumnField, number>> = {};
  const normed = headerCells.map(norm);
  (Object.keys(cols) as ColumnField[]).forEach((field) => {
    const aliases = cols[field];
    let at = normed.findIndex((c) => c && aliases.includes(c));
    if (at < 0) at = normed.findIndex((c) => c && aliases.some((a) => c === a || c.startsWith(a + " ") || c.endsWith(" " + a)));
    if (at >= 0) idx[field] = at;
  });
  return idx;
}

export type BankRow = { date: string; desc: string; ref: string; amount: number; balance: number | null; line: number };
export type ParsedStatement = { format: BankFormat | null; rows: BankRow[]; warnings: string[]; opening: number | null; closing: number | null; totalIn: number; totalOut: number; balanceWalks: boolean };

/**
 * Parse a statement file. A row's amount is positive for money in.
 */
export function parse(text: string, opts?: { format?: string; delimiter?: string; monthFirst?: boolean }): ParsedStatement {
  const o = opts || {};
  const warnings: string[] = [];
  const raw = String(text || "");
  if (!raw.trim()) return { format: null, rows: [], warnings: ["The file is empty."], opening: null, closing: null, totalIn: 0, totalOut: 0, balanceWalks: false };

  const fmt = o.format ? (formatById(o.format) || sniff(raw)) : sniff(raw);
  const lines = raw.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  const delim = o.delimiter || sniffDelimiter(lines);
  const headerAt = findHeader(lines, delim, fmt.cols);

  if (headerAt < 0) {
    return { format: fmt, rows: [], opening: null, closing: null, totalIn: 0, totalOut: 0, balanceWalks: false,
      warnings: ["No header row found. Expected a line with a date column and a debit, credit or amount column. "
        + "If this is a PDF statement, convert it to CSV first — PDF is not read here."] };
  }

  const header = splitCsvLine(lines[headerAt], delim);
  const idx = mapColumns(header, fmt.cols);
  if (idx.date === undefined) warnings.push("No date column was recognised.");
  if (idx.debit === undefined && idx.credit === undefined && idx.amount === undefined) {
    warnings.push("No debit, credit or amount column was recognised.");
  }
  if (!fmt.verified) {
    warnings.push("The " + fmt.name + " column map has not been checked against a real export from the bank. Verify the first few rows by eye.");
  }

  const rows: BankRow[] = [];
  let skipped = 0;
  for (let i = headerAt + 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i], delim);
    if (cells.every((c) => !c)) continue;
    const date = idx.date !== undefined ? parseDate(cells[idx.date], o) : null;
    if (!date) { skipped += 1; continue; }

    let amount: number | null = null;
    const dr = idx.debit !== undefined ? parseAmount(cells[idx.debit]) : null;
    const cr = idx.credit !== undefined ? parseAmount(cells[idx.credit]) : null;
    if (dr !== null && dr !== 0) amount = -Math.abs(dr);
    else if (cr !== null && cr !== 0) amount = Math.abs(cr);
    else if (idx.amount !== undefined) amount = parseAmount(cells[idx.amount]);
    if (amount === null || amount === 0) { skipped += 1; continue; }

    rows.push({
      date,
      desc: (idx.desc !== undefined ? cells[idx.desc] : "") || "",
      ref: (idx.ref !== undefined ? cells[idx.ref] : "") || "",
      amount: r2(amount),
      balance: idx.balance !== undefined ? parseAmount(cells[idx.balance]) : null,
      line: i + 1
    });
  }

  if (skipped) warnings.push(skipped + " line" + (skipped === 1 ? "" : "s") + " skipped — no readable date or amount. Totals and subtotals are skipped on purpose.");
  if (!rows.length) warnings.push("No transaction rows were read.");

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.line - b.line));

  const totalIn = r2(rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0));
  const totalOut = r2(rows.filter((r) => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0));
  const withBal = rows.filter((r) => r.balance !== null) as (BankRow & { balance: number })[];
  const closing = withBal.length ? withBal[withBal.length - 1].balance : null;
  const opening = withBal.length ? r2(withBal[0].balance - withBal[0].amount) : null;

  /* If the file carries a running balance, every step should equal the previous balance
     plus the movement. A break means a misparsed row or a missing line. */
  let balanceWalks = false;
  if (withBal.length > 1) {
    balanceWalks = withBal.every((r, i) => (i === 0 ? true : Math.abs(withBal[i - 1].balance + r.amount - r.balance) < 0.005));
    if (!balanceWalks) warnings.push("The running balance does not walk from row to row. A line was probably misread or is missing.");
  }

  return { format: fmt, rows, warnings, opening, closing, totalIn, totalOut, balanceWalks };
}

/* ---------- reconciliation ----------
   Everything below works on parsed rows and posted journals and does not depend on any
   bank's column layout, so it is verifiable by test. */

const CASH = ["1000", "1010"];
type Journal = Pick<Entry, "date" | "status" | "lines"> & Partial<Pick<Entry, "desc" | "docRef" | "applies" | "inv" | "counterparty" | "id">>;

export const cashMove = (j: Journal) => r2((j.lines || []).filter((l) => CASH.includes(l.code)).reduce((s, l) => s + (l.dr || 0) - (l.cr || 0), 0));
const dayGap = (a: string, b: string) => Math.round(Math.abs(new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) / 86400000);

/** Token overlap between two descriptions, ignoring very short words. Returns 0..1. */
export function similarity(a: string, b: string) {
  const ta = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const tb = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  ta.forEach((w) => { if (tb.has(w)) hit += 1; });
  return hit / Math.min(ta.size, tb.size);
}

/** Does the journal's document reference appear in the bank narrative? */
function refHit(row: BankRow, j: Journal) {
  const hay = norm(row.desc + " " + row.ref);
  const cands = [j.docRef, j.applies, j.inv && j.inv.number].filter(Boolean).map(norm);
  return cands.some((c) => c.length >= 4 && hay.includes(c));
}

/**
 * Score a candidate pairing. Null means not a candidate at all.
 * The amount must agree to the cent - a bank line and a journal are the same event or they are not.
 */
function score(row: BankRow, j: Journal, windowDays: number) {
  const move = cashMove(j);
  if (Math.abs(move - row.amount) >= 0.005) return null;
  const gap = dayGap(row.date, j.date);
  if (gap > windowDays) return null;
  let s = 100 - gap * 4;
  const ref = refHit(row, j);
  if (ref) s += 60;
  const sim = similarity(row.desc, (j.desc || "") + " " + (j.counterparty || ""));
  s += Math.round(sim * 35);
  if (gap === 0) s += 10;
  return { s, gap, sim, ref };
}

export type Match<J> = { row: BankRow; entry: J; gapDays: number; confidence: "high" | "medium" | "low"; why: string };

/**
 * Reconcile statement rows against posted journals.
 * Greedy one-to-one assignment, strongest pairing first, so a confident match cannot be
 * stolen by a weaker one competing for the same journal.
 */
export function reconcile<J extends Journal>(rows: BankRow[], journals: J[], opts?: { windowDays?: number }) {
  const windowDays = opts?.windowDays === undefined ? 5 : opts.windowDays;
  const list = (journals || []).filter((j) => j.status === "posted" && j.date && cashMove(j) !== 0);

  const pairs: { ri: number; ji: number; s: number; gap: number; sim: number; ref: boolean }[] = [];
  rows.forEach((row, ri) => {
    list.forEach((j, ji) => {
      const sc = score(row, j, windowDays);
      if (sc) pairs.push({ ri, ji, ...sc });
    });
  });
  pairs.sort((a, b) => b.s - a.s);

  const rowTaken = new Set<number>();
  const jTaken = new Set<number>();
  const matched: Match<J>[] = [];
  pairs.forEach((p) => {
    if (rowTaken.has(p.ri) || jTaken.has(p.ji)) return;
    rowTaken.add(p.ri);
    jTaken.add(p.ji);
    matched.push({
      row: rows[p.ri],
      entry: list[p.ji],
      gapDays: p.gap,
      confidence: p.ref ? "high" : p.gap === 0 && p.sim > 0.3 ? "high" : p.gap <= 2 ? "medium" : "low",
      why: p.ref ? "document reference appears in the bank narrative"
        : p.gap === 0 ? "same amount, same day"
          : "same amount, " + p.gap + " day" + (p.gap === 1 ? "" : "s") + " apart"
    });
  });

  const unmatched = rows.filter((_, i) => !rowTaken.has(i));
  const ledgerOnly = list.filter((_, i) => !jTaken.has(i));

  /* Two bank lines with the same date, amount and narrative are usually a double import. */
  const seen = new Map<string, BankRow>();
  const duplicates: { first: BankRow; repeat: BankRow }[] = [];
  rows.forEach((r) => {
    const k = r.date + "|" + r.amount + "|" + norm(r.desc);
    const first = seen.get(k);
    if (first) duplicates.push({ first, repeat: r });
    else seen.set(k, r);
  });

  const statementMovement = r2(rows.reduce((s, r) => s + r.amount, 0));
  const ledgerMovement = r2(list.reduce((s, j) => s + cashMove(j), 0));
  const unmatchedValue = r2(unmatched.reduce((s, r) => s + r.amount, 0));
  const ledgerOnlyValue = r2(ledgerOnly.reduce((s, j) => s + cashMove(j), 0));

  return {
    matched, unmatched, ledgerOnly, duplicates,
    statementMovement, ledgerMovement, unmatchedValue, ledgerOnlyValue,
    difference: r2(statementMovement - ledgerMovement),
    /* The reconciliation is complete when what is left on each side explains the gap exactly. */
    ties: Math.abs(r2(statementMovement - ledgerMovement) - r2(unmatchedValue - ledgerOnlyValue)) < 0.005,
    cleared: matched.length,
    total: rows.length
  };
}

export type Reconciliation<J extends Journal = Entry> = ReturnType<typeof reconcile<J>>;

/* ---------- turning an unmatched bank line into something the rule engine can post ----------
   Keyword hints only. The rule engine still decides the accounting and the tax, and a
   person still approves it. Nothing here posts anything by itself. */

const HINTS = [
  { re: /\btnb\b|tenaga|syabas|air selangor|indah water|iwk\b/i, category: "utilities", who: "Utility" },
  { re: /maxis|celcom|digi|umobile|u mobile|time dotcom|unifi|tm\b|astro/i, category: "utilities", who: "Telco" },
  { re: /grab|mygrab|touch n go|tng|shell|petronas|petron|caltex|toll|smart tag/i, category: "transport", who: "Transport" },
  { re: /aws|amazon web|google|microsoft|azure|adobe|slack|zoom|xero|quickbook|github|openai|anthropic|canva|dropbox|notion/i, category: "software_subscription", who: "Software vendor" },
  { re: /salar|payroll|gaji|wages|epf|kwsp|socso|perkeso|eis\b/i, category: "staff_cost", who: "Payroll" },
  { re: /rent|sewa|tenancy|lease/i, category: "rent", who: "Landlord" },
  { re: /audit|secretarial|lawyer|legal|consult|advisory|tax agent|accounting/i, category: "professional_fees", who: "Professional firm" },
  { re: /facebook|meta ads|google ads|tiktok|shopee ads|advertis|marketing/i, category: "marketing", who: "Advertising" },
  { re: /insurance|takaful/i, category: "other", who: "Insurer" },
  { re: /bank charge|service charge|comm(ission)?\b|stamp duty|gst on|fee\b/i, category: "other", who: "Bank" }
];

/** Strip the noise Malaysian statements wrap around a counterparty name. */
export function counterpartyFrom(desc: string) {
  let s = String(desc || "")
    .replace(/\b(ibg|ibft|duitnow|fpx|rentas|transfer|trf|payment|pymt|pmt|to|from|acct?|a\/c|ref|cr|dr)\b/gi, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/[^A-Za-z0-9&'.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > 48) s = s.slice(0, 48).trim();
  return s;
}

/**
 * Propose the fields of a transaction for an unmatched bank row, shaped for propose().
 * Confidence is deliberately modest: a keyword is a hint, not a decision.
 */
export function suggest(row: BankRow, ctx?: { base?: string }): TxInput & { date: string; category: string; confidence: number } {
  const inbound = row.amount > 0;
  const hint = HINTS.find((h) => h.re.test(row.desc + " " + row.ref));
  const who = counterpartyFrom(row.desc);
  const category = inbound ? "settlement" : hint ? hint.category : "other";
  return {
    date: row.date,
    direction: inbound ? "receive" : "spend",
    category,
    amount: Math.abs(row.amount),
    currency: ctx?.base || "MYR",
    amount_includes_tax: true,
    counterparty: who || (hint ? hint.who : "Unknown"),
    counterparty_type: inbound ? "customer" : "supplier",
    counterparty_country: "MY",
    description: (row.desc || "").trim() || "Bank transaction",
    payment_method: "bank",
    doc_ref: row.ref || null,
    settled: true,
    source: "bank_statement",
    bank_line: row.line,
    confidence: hint ? 0.62 : inbound ? 0.45 : 0.4,
    needsReview: true
  };
}

/** A short, honest summary line for the UI. */
export function summarise(rec: { total: number; cleared: number; unmatched: unknown[]; ledgerOnly: unknown[] }) {
  if (!rec.total) return "No rows to reconcile.";
  const pct = Math.round((rec.cleared / rec.total) * 100);
  return rec.cleared + " of " + rec.total + " bank lines matched a posted entry (" + pct + "%). "
    + (rec.unmatched.length ? rec.unmatched.length + " still to account for. " : "")
    + (rec.ledgerOnly.length ? rec.ledgerOnly.length + " posted entries have not appeared on the statement." : "");
}

export const SAMPLE_STATEMENT = [
  "MAYBANK BERHAD",
  "Statement of Account",
  "",
  "Transaction Date,Transaction Description,Reference,Debit,Credit,Balance",
  "01/09/2026,BEGINNING BALANCE,,,,68000.00",
  "02/09/2026,IBG TRANSFER TO TECH SUPPLY SDN BHD,TS-2291,4500.00,,63500.00",
  "04/09/2026,TNB BILL PAYMENT KUALA LUMPUR,,486.30,,63013.70",
  "08/09/2026,DUITNOW FROM SUNRISE DENTAL GROUP,RCP-0451,,19440.00,82453.70",
  "11/09/2026,AWS EMEA SARL CLOUD SERVICES,,1284.00,,81169.70",
  "15/09/2026,MAXIS BROADBAND SDN BHD,,299.00,,80870.70",
  "22/09/2026,SALARY PAYMENT SEPTEMBER KWSP SOCSO,,18400.00,,62470.70",
  "23/09/2026,BANK SERVICE CHARGE,,15.00,,62455.70"
].join("\n");
