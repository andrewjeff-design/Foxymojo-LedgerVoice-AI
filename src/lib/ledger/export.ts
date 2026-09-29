/* Ledger VoiceAI - exports to the ledgers Malaysian SMEs already run.

   AutoCount and SQL Account are desktop-rooted and sold through a dealer and accountant
   channel. Displacing them means fighting a reseller network. Writing into them instead
   kills the migration objection and lets the product be priced against the bookkeeper's
   fee rather than against a licence.

   HEALTH WARNING ON THE COLUMN NAMES. The layouts below follow each product's documented
   import template as far as it is public. Before shipping, export a sample from a live
   copy of each, diff the headers, and correct the maps here. Each map carries a `verified`
   flag and `docs` link so nobody has to guess which ones were checked.

   The integrity checks - balanced journals, totals that foot, characters the importers
   choke on - are independent of the column names and are fully tested. */

import type { Entry, JournalLine } from "./types";

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const money = (n: number) => r2(n).toFixed(2);
const posted = (js: Entry[]) => (js || []).filter((j) => j.status === "posted" && j.lines && j.lines.length);
/* account name without the invoice-line suffix */
const accName = (l: JournalLine) => String(l.account || "").split(" — ")[0];

/* ---------- CSV writing ----------
   A leading =, +, - or @ makes Excel and several importers treat a cell as a formula.
   Statement narratives regularly start with one, so neutralise it. */
export function cell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  s = s.replace(/[\r\n]+/g, " ").trim();
  if (/^[=+\-@\t]/.test(s)) s = "'" + s;
  return "\"" + s.replace(/"/g, "\"\"") + "\"";
}
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export const dmy = (iso?: string | null) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const [y, m, d] = iso.split("-");
  return d + "/" + m + "/" + y;
};
export const docNo = (j: Entry, i: number) => j.docRef || (j.inv && j.inv.number) || "LV-" + String(i + 1).padStart(5, "0");
const taxCode = (j: Entry) => (j.taxGroup === "rental" ? "SV-6" : "SV-8");

/* ---------- the ledgers ---------- */
export type ExportTarget = {
  id: string;
  name: string;
  verified: boolean;
  docs: string | null;
  note: string;
  header: string[];
  row: (j: Entry, l: JournalLine, i: number) => string[];
};

export const TARGETS: Record<"autocount" | "sql" | "bukku" | "generic", ExportTarget> = {
  autocount: {
    id: "autocount",
    name: "AutoCount Accounting",
    verified: false,
    docs: "https://wiki.autocountsoft.com/wiki/Integration_Methods",
    note: "AutoCount documents several integration routes — API, file and direct database. "
      + "This is the journal-entry import file, the least invasive of the three.",
    /* One row per journal line; the document number groups the lines into one entry. */
    header: ["DocNo", "DocDate", "Description", "AccNo", "AccDesc", "DR", "CR", "Project", "Dept", "Ref"],
    row: (j, l, i) => [
      docNo(j, i), dmy(j.date), j.desc || "", l.code, accName(l),
      l.dr ? money(l.dr) : "", l.cr ? money(l.cr) : "", "", "", j.docRef || (j.inv && j.inv.number) || ""
    ]
  },
  sql: {
    id: "sql",
    name: "SQL Account",
    verified: false,
    docs: "https://wiki.sql.com.my/wiki/Restful_API",
    note: "SQL Account publishes a REST API and an SDK. This file is the fallback route; "
      + "prefer the API once credentials exist.",
    header: ["DocumentNumber", "DocumentDate", "Description", "AccountCode", "AccountName", "Debit", "Credit", "ProjectCode", "Remark"],
    row: (j, l, i) => [
      docNo(j, i), dmy(j.date), j.desc || "", l.code, accName(l),
      l.dr ? money(l.dr) : "0.00", l.cr ? money(l.cr) : "0.00", "", j.docRef || ""
    ]
  },
  bukku: {
    id: "bukku",
    name: "Bukku",
    verified: false,
    docs: "https://developers.bukku.my/",
    note: "Bukku is the most ISV-friendly of the three and already has live third-party "
      + "integrations. Use the API in production; this file is for a one-off catch-up.",
    header: ["Date", "Number", "Description", "Account Code", "Account Name", "Debit", "Credit", "Tax Code", "Tax Amount"],
    row: (j, l, i) => [
      j.date, docNo(j, i), j.desc || "", l.code, accName(l),
      l.dr ? money(l.dr) : "", l.cr ? money(l.cr) : "",
      l.code === "2100" ? taxCode(j) : "", l.code === "2100" ? money(Math.abs((l.cr || 0) - (l.dr || 0))) : ""
    ]
  },
  generic: {
    id: "generic",
    name: "Generic journal",
    verified: true,
    docs: null,
    note: "ISO dates, one row per line, no product-specific assumptions. Use this when the "
      + "customer runs something else, or to hand a file to their accountant.",
    header: ["entry_no", "date", "description", "account_code", "account_name", "debit", "credit", "reference", "entity", "approved_by", "rule_version", "spoken"],
    row: (j, l, i) => [
      docNo(j, i), j.date, j.desc || "", l.code, accName(l),
      l.dr ? money(l.dr) : "", l.cr ? money(l.cr) : "",
      j.docRef || (j.inv && j.inv.number) || "", j.entity || "", j.approver || "", j.version || "", j.utterance || ""
    ]
  }
};

export type ExportTargetId = keyof typeof TARGETS;

/* ---------- checks that run before anything leaves the building ---------- */

/** Refuse to export what an importer will reject or, worse, silently accept wrongly. */
export function check(journals: Entry[]) {
  const js = posted(journals);
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!js.length) problems.push("There are no posted entries to export.");

  js.forEach((j) => {
    const dr = r2((j.lines || []).reduce((s, l) => s + (l.dr || 0), 0));
    const cr = r2((j.lines || []).reduce((s, l) => s + (l.cr || 0), 0));
    if (Math.abs(dr - cr) >= 0.005) problems.push("Entry " + (j.docRef || j.desc || j.date) + " is out of balance by " + r2(dr - cr) + ".");
    if (!j.date || !/^\d{4}-\d{2}-\d{2}$/.test(j.date)) problems.push("Entry " + (j.desc || "") + " has no usable date.");
    (j.lines || []).forEach((l) => {
      if (!l.code) problems.push("A line on " + (j.date || "") + " has no account code.");
      if ((l.dr || 0) > 0 && (l.cr || 0) > 0) problems.push("A line on " + (j.date || "") + " is both a debit and a credit.");
    });
    if (!j.approver) warnings.push("Entry " + (j.docRef || j.date) + " carries no approver name.");
  });

  const totalDr = r2(js.reduce((s, j) => s + (j.lines || []).reduce((t, l) => t + (l.dr || 0), 0), 0));
  const totalCr = r2(js.reduce((s, j) => s + (j.lines || []).reduce((t, l) => t + (l.cr || 0), 0), 0));
  if (Math.abs(totalDr - totalCr) >= 0.005) problems.push("The file as a whole is out of balance by " + r2(totalDr - totalCr) + ".");

  /* Duplicate document numbers merge into one entry inside AutoCount and SQL. */
  const nums: Record<string, number> = {};
  js.forEach((j, i) => { const n = docNo(j, i); nums[n] = (nums[n] || 0) + 1; });
  Object.entries(nums).filter(([, c]) => c > 1).forEach(([n, c]) => {
    warnings.push("Document number " + n + " appears on " + c + " entries — importers will merge them into one.");
  });

  return { ok: problems.length === 0, problems, warnings, entries: js.length, totalDr, totalCr };
}

/** Accounts touched by the export, so the customer can map them before importing. */
export function chartOfAccounts(journals: Entry[]) {
  const seen = new Map<string, { code: string; name: string; lines: number; dr: number; cr: number }>();
  posted(journals).forEach((j) => (j.lines || []).forEach((l) => {
    if (!seen.has(l.code)) seen.set(l.code, { code: l.code, name: accName(l), lines: 0, dr: 0, cr: 0 });
    const a = seen.get(l.code)!;
    a.lines += 1; a.dr = r2(a.dr + (l.dr || 0)); a.cr = r2(a.cr + (l.cr || 0));
  }));
  return [...seen.values()].sort((a, b) => (a.code < b.code ? -1 : 1));
}

type Range = { from?: string | null; to?: string | null };
const inRange = (o?: Range) => (j: Entry) => (!o?.from || j.date >= o.from) && (!o?.to || j.date <= o.to);

/** Build the export. A failing check comes back on the result so the caller can show it. */
export function build(journals: Entry[], targetId: string, opts?: Range) {
  const t = TARGETS[targetId as ExportTargetId] || TARGETS.generic;
  const js = posted(journals).filter(inRange(opts));
  const res = check(js);
  const rows: string[][] = [t.header];
  js.forEach((j, i) => (j.lines || []).forEach((l) => rows.push(t.row(j, l, i))));
  const stamp = (opts?.to || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  return {
    target: t,
    filename: "ledger-" + t.id + "-journals-" + stamp + ".csv",
    csv: toCsv(rows),
    rows,
    check: res,
    entries: js.length,
    lines: rows.length - 1,
    accounts: chartOfAccounts(js)
  };
}

/** The account mapping sheet that travels with the journal file. */
export function buildChart(journals: Entry[], opts?: Range) {
  const accounts = chartOfAccounts(posted(journals).filter(inRange(opts)));
  const rows: (string | number)[][] = [["our_code", "our_account", "lines", "total_debit", "total_credit", "their_code"],
    ...accounts.map((a) => [a.code, a.name, a.lines, money(a.dr), money(a.cr), ""])];
  return { filename: "ledger-account-mapping.csv", csv: toCsv(rows), rows, accounts };
}

/** Sales invoices, which most ledgers import separately from journals. */
export function buildInvoices(journals: Entry[], opts?: Range) {
  const invs = posted(journals).filter((j) => j.inv && j.inv.number).filter(inRange(opts));
  const rows: string[][] = [["invoice_no", "date", "due_date", "customer", "customer_tin", "description", "amount_excl_tax", "tax", "total", "currency"]];
  invs.forEach((j) => {
    const inv = j.inv!;
    const total = r2(inv.total || 0);
    const tax = r2(inv.tax || 0);
    rows.push([inv.number, j.date, inv.due || "", inv.customer || "", inv.customer_tin || "",
      j.desc || "", money(total - tax), money(tax), money(total), inv.currency || "MYR"]);
  });
  return { filename: "ledger-invoices.csv", csv: toCsv(rows), rows, count: invs.length };
}
