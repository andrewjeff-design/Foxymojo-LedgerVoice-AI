import { describe, expect, it } from "vitest";
import * as Bank from "./bank";
import { DEMO_ENTITIES, DEMO_TODAY, FX_RATES } from "./catalog";
import * as EI from "./einvoice";
import { entryFromInvoice, entryFromTx, nextInvoiceNo, withPostedTurnover } from "./entries";
import { INV_EXAMPLES, TX_EXAMPLES } from "./examples";
import * as X from "./export";
import { answerOffline, arAging, buildAskPack, closeStatus, sstReturn, taxablePeriod } from "./modules";
import * as Rep from "./reports";
import { propose, proposeInvoice } from "./rules";
import { buildSeed } from "./seed";
import { money } from "./format";
import type { RuleContext } from "./types";

const ctx = (entityId = "acme"): RuleContext => ({ entityId, entities: DEMO_ENTITIES, fx: FX_RATES, today: DEMO_TODAY });
const seed = buildSeed(ctx());

describe("rule engine: transactions", () => {
  it("capitalises a laptop above the policy and needs approval for it", () => {
    const r = propose(TX_EXAMPLES[0].tx, ctx());
    expect(r.capitalise).toBe(true);
    expect(r.lines).toEqual([
      { code: "1500", account: "Office equipment", dr: 4500, cr: 0 },
      { code: "1000", account: "Cash at bank", dr: 0, cr: 4500 }
    ]);
    expect(r.approval.reasons).toContain("capitalisation");
    expect(r.balanced).toBe(true);
  });

  it("expenses equipment below the capitalisation policy", () => {
    const r = propose({ ...TX_EXAMPLES[0].tx, amount: 1200 }, ctx());
    expect(r.capitalise).toBe(false);
    expect(r.lines[0].account).toBe("Small equipment written off");
    expect(r.lines[0].code).toBe("5900");
  });

  it("translates SGD and self-accounts service tax on an imported service", () => {
    const r = propose(TX_EXAMPLES[1].tx, ctx());
    expect(r.gross).toBe(2560);
    expect(r.tax.reverseCharge).toBe(true);
    expect(r.tax.amount).toBe(204.8);
    expect(r.rules.map((x) => x.id)).toEqual(expect.arrayContaining(["S30", "IMP"]));
    expect(r.flags.some((f) => /self-billed/.test(f.text))).toBe(true);
    expect(r.totalDr).toBe(r.totalCr);
  });

  it("charges 8% output tax on a sale by a registered company", () => {
    const r = propose(TX_EXAMPLES[2].tx, ctx());
    expect(r.tax.amount).toBe(960);
    expect(r.lines.find((l) => l.code === "2100")?.cr).toBe(960);
    expect(r.lines.find((l) => l.code === "1000")?.dr).toBe(12960);
  });

  it("asks whether an amount includes tax when it cannot tell", () => {
    const r = propose({ ...TX_EXAMPLES[2].tx, amount_includes_tax: null }, ctx());
    expect(r.ask.some((q) => /inclusive of service tax/.test(q))).toBe(true);
    expect(r.approval.reasons).toContain("open question");
  });

  it("backs tax out of an inclusive amount", () => {
    const r = propose({ ...TX_EXAMPLES[2].tx, amount: 10800, amount_includes_tax: true }, ctx());
    expect(r.tax.base).toBe(10000);
    expect(r.tax.amount).toBe(800);
  });

  it("charges nothing for an unregistered company but watches the threshold", () => {
    const r = propose({ ...TX_EXAMPLES[2].tx, amount: 40000 }, ctx("mawar"));
    expect(r.tax.amount).toBe(0);
    expect(r.flags.some((f) => /passed the 500,000 threshold/.test(f.text))).toBe(true);
    const near = propose({ ...TX_EXAMPLES[2].tx, amount: 1000 }, ctx("mawar"));
    expect(near.flags.some((f) => /of the 500,000 registration threshold/.test(f.text))).toBe(true);
  });

  it("puts a director-paid expense on the director's account with a stop flag", () => {
    const r = propose(TX_EXAMPLES[3].tx, ctx());
    expect(r.lines.find((l) => l.cr > 0)?.code).toBe("2200");
    expect(r.flags.some((f) => f.level === "stop")).toBe(true);
    expect(r.related).toBe(true);
  });

  it("mirrors an intercompany charge into the other group company", () => {
    const r = propose(TX_EXAMPLES[4].tx, ctx());
    expect(r.mirror?.entity).toBe("Acme Logistics Sdn Bhd");
    expect(r.lines[0].code).toBe("2300");
  });

  it("flags an undocumented cash payment", () => {
    const r = propose(TX_EXAMPLES[5].tx, ctx());
    expect(r.lines.find((l) => l.cr > 0)?.code).toBe("1010");
    expect(r.flags.some((f) => /Cash payment above 1,000/.test(f.text))).toBe(true);
    expect(r.ask).toContain("What is the invoice or receipt number?");
  });

  it("refuses to post a currency it has no rate for", () => {
    const r = propose({ ...TX_EXAMPLES[1].tx, currency: "EUR" }, ctx());
    expect(r.approval.blocked).toBe(true);
    expect(r.approval.reasons).toContain("missing FX rate");
  });

  it("settles a receivable without new revenue or tax", () => {
    const r = propose({ direction: "receive", category: "settlement", amount: 6480, doc_ref: "RCP-1", applies: "INV-0230" }, ctx());
    expect(r.lines).toEqual([
      { code: "1000", account: "Cash at bank", dr: 6480, cr: 0 },
      { code: "1100", account: "Trade receivables", dr: 0, cr: 6480 }
    ]);
    expect(r.tax.amount).toBe(0);
  });

  it("asks about lease classification for a year-long lease", () => {
    const r = propose({ direction: "spend", category: "rent", amount: 3000, lease_months: 24, doc_ref: "L-1" }, ctx());
    expect(r.rules.some((x) => x.id === "S20")).toBe(true);
  });

  it("every example journal balances", () => {
    TX_EXAMPLES.forEach((x) => expect(propose(x.tx, ctx()).balanced).toBe(true));
  });
});

describe("rule engine: invoices", () => {
  it("builds a two-line invoice with 8% service tax", () => {
    const r = proposeInvoice(INV_EXAMPLES[0].inv, { ...ctx(), nextInvoiceNo: () => "INV-0999" });
    expect(r.number).toBe("INV-0999");
    expect(r.subtotal).toBe(9500);
    expect(r.tax).toBe(760);
    expect(r.total).toBe(10260);
    expect(r.due).toBe("2026-10-24");
    expect(r.einvoice).toBe(true);
    expect(r.balanced).toBe(true);
  });

  it("asks for the TIN when MyInvois applies", () => {
    const r = proposeInvoice({ ...INV_EXAMPLES[0].inv, customer_tin: null }, ctx());
    expect(r.ask.some((q) => /TIN/.test(q))).toBe(true);
  });

  it("charges no tax for an unregistered seller", () => {
    const r = proposeInvoice(INV_EXAMPLES[0].inv, ctx("mawar"));
    expect(r.tax).toBe(0);
    expect(r.einvoice).toBe(false);
  });
});

describe("reports from the seeded books", () => {
  it("the trial balance, balance sheet and cash flow all tie", () => {
    [["2026-08-01", "2026-08-31"], ["2026-09-01", "2026-09-30"], [null, "2026-09-30"]].forEach(([from, to]) => {
      expect(Rep.trialBalance(seed, to).balanced).toBe(true);
      expect(Rep.balanceSheet(seed, to).balanced).toBe(true);
      expect(Rep.cashFlow(seed, from, to).ties).toBe(true);
    });
  });

  it("classifies the laptop as investing cash flow", () => {
    const cf = Rep.cashFlow(seed, "2026-09-01", "2026-09-30");
    expect(cf.investing).toBe(-4500);
  });

  it("profit and loss adds up", () => {
    const pl = Rep.profitAndLoss(seed, "2026-09-01", "2026-09-30");
    expect(pl.profit).toBe(Math.round((pl.totalIncome - pl.totalExpense) * 100) / 100);
    expect(pl.income.length).toBeGreaterThan(0);
  });
});

describe("receivables, SST and the close", () => {
  it("ages the open invoices and ties to the ledger", () => {
    const ag = arAging(seed, DEMO_TODAY);
    expect(ag.rows.map((r) => r.number).sort()).toEqual(["INV-0235", "INV-0240"]);
    expect(ag.invoiceTotal).toBe(9720 + 19440);
    expect(ag.ties).toBe(true);
  });

  it("taxable periods run in pairs of months", () => {
    expect(taxablePeriod("2026-09-24")).toEqual({ from: "2026-09-01", to: "2026-10-31", label: "September–October 2026" });
    expect(taxablePeriod("2026-02-10").from).toBe("2026-01-01");
  });

  it("declares tax on what customers paid, not on what was invoiced", () => {
    const st = sstReturn(seed, "2026-09-01", "2026-10-31");
    /* INV-0231 was paid in September: 1,440 of tax; the 0242 sale was settled on the spot: 520 */
    expect(st.taxOnCollections).toBe(1440);
    expect(st.cashSales).toBe(520);
    expect(st.deferred).toBeGreaterThan(0);
    expect(st.dueDate).toBe("2026-11-30");
  });

  it("never ticks a person's item for them", () => {
    const cs = closeStatus(seed, "2026-09", { sstRegistered: true });
    const bank = cs.items.find((i) => i.id === "bank")!;
    expect(bank.done).toBe(false);
    const director = cs.items.find((i) => i.id === "director")!;
    expect(director.agentDone).toBe(false);
    expect(cs.ready).toBe(false);
    const ticks: Record<string, boolean> = {};
    cs.items.forEach((i) => { ticks["2026-09:" + i.id] = true; });
    const all = closeStatus(seed, "2026-09", { sstRegistered: true, ticks });
    expect(all.ready).toBe(true);
    expect(all.accepted).toBeGreaterThan(0);
  });

  it("answers the common questions without a model", () => {
    const pack = buildAskPack(seed, DEMO_ENTITIES[0], DEMO_TODAY);
    expect(answerOffline("How much service tax do I owe?", pack, money)).toMatch(/of service tax is due for September–October 2026/);
    expect(answerOffline("Siapa yang masih belum bayar saya?", pack, money)).toMatch(/outstanding/);
    expect(answerOffline("What colour is the sky?", pack, money)).toBeNull();
  });
});

describe("bank statements", () => {
  it("reads dates the Malaysian way", () => {
    expect(Bank.parseDate("02/09/2026")).toBe("2026-09-02");
    expect(Bank.parseDate("13/01/26")).toBe("2026-01-13");
    expect(Bank.parseDate("01/13/2026")).toBe("2026-01-13");
    expect(Bank.parseDate("5 Sep 2026")).toBe("2026-09-05");
    expect(Bank.parseDate("Sep 5, 2026")).toBe("2026-09-05");
    expect(Bank.parseDate("2026-09-05")).toBe("2026-09-05");
    expect(Bank.parseDate("nonsense")).toBeNull();
  });

  it("reads money cells in every common shape", () => {
    expect(Bank.parseAmount("1,234.50")).toBe(1234.5);
    expect(Bank.parseAmount("(1,234.50)")).toBe(-1234.5);
    expect(Bank.parseAmount("500.00 DR")).toBe(-500);
    expect(Bank.parseAmount("500.00 CR")).toBe(500);
    expect(Bank.parseAmount("RM 12.00")).toBe(12);
    expect(Bank.parseAmount("-")).toBeNull();
    expect(Bank.parseAmount("abc")).toBeNull();
  });

  it("splits quoted CSV cells", () => {
    expect(Bank.splitCsvLine("a,\"b, c\",\"d \"\"e\"\"\"", ",")).toEqual(["a", "b, c", "d \"e\""]);
  });

  it("parses the sample statement and walks the balance", () => {
    const p = Bank.parse(Bank.SAMPLE_STATEMENT);
    expect(p.format?.id).toBe("maybank");
    expect(p.rows.length).toBe(7);
    expect(p.balanceWalks).toBe(true);
    expect(p.opening).toBe(68000);
    expect(p.closing).toBe(62455.7);
    expect(p.warnings.some((w) => /not been checked/.test(w))).toBe(true);
  });

  it("fails loudly on a file with no header", () => {
    const p = Bank.parse("hello\nworld");
    expect(p.rows.length).toBe(0);
    expect(p.warnings[0]).toMatch(/No header row/);
  });

  it("matches statement lines to posted entries, one to one", () => {
    const p = Bank.parse(Bank.SAMPLE_STATEMENT);
    const rec = Bank.reconcile(p.rows, seed, { windowDays: 5 });
    const refs = rec.matched.map((m) => m.row.ref).sort();
    expect(refs).toEqual(["RCP-0451", "TS-2291"]);
    expect(rec.matched.every((m) => m.confidence === "high")).toBe(true);
    expect(rec.unmatched.length).toBe(5);
    expect(rec.ties).toBe(true);
  });

  it("suggests a category from the narrative but never posts", () => {
    const row = { date: "2026-09-04", desc: "TNB BILL PAYMENT", ref: "", amount: -486.3, balance: null, line: 3 };
    const s = Bank.suggest(row, { base: "MYR" });
    expect(s.category).toBe("utilities");
    expect(s.confidence).toBeLessThan(0.8);
    expect(propose(s, ctx()).balanced).toBe(true);
  });
});

describe("exports", () => {
  it("passes the seeded books and writes real account names", () => {
    const out = X.build(seed, "autocount", { to: "2026-09-30" });
    expect(out.check.ok).toBe(true);
    expect(out.rows[0]).toEqual(TARGETS_HEADER);
    expect(out.rows.slice(1).every((r) => r[4] !== "")).toBe(true);
    expect(out.filename).toBe("ledger-autocount-journals-20260930.csv");
  });

  it("neutralises cells that a spreadsheet would run as a formula", () => {
    expect(X.cell("=SUM(A1)")).toBe("\"'=SUM(A1)\"");
    expect(X.cell("a \"b\"")).toBe("\"a \"\"b\"\"\"");
  });

  it("refuses an unbalanced entry", () => {
    const bad = [{ ...seed[0], lines: [{ code: "1000", account: "Cash", dr: 10, cr: 0 }] }];
    expect(X.check(bad).ok).toBe(false);
  });
});
const TARGETS_HEADER = X.TARGETS.autocount.header;

describe("e-Invoice", () => {
  const supplier = { name: "Acme", tin: "C12345678900", brn: "202301012345", msic: "62010", sstRegistered: true, sstNo: "W10", address: { line1: "Level 12", city: "KL", postcode: "50400", state: "14" } };

  it("builds a UBL document from a posted invoice", () => {
    const built = EI.build({ number: "INV-0240", date: "2026-09-04", customer: "Sunrise", customer_tin: "C99887766554", items: [{ description: "Retainer", qty: 1, unit_price: 18000 }], subtotal: 18000, tax: 1440, total: 19440 }, supplier, { now: "2026-09-04T10:00:00Z" });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.summary.total).toBe(19440);
      expect(JSON.stringify(built.document)).toContain("\"unitCode\":\"C62\"");
    }
  });

  it("catches the arithmetic before LHDN does", () => {
    const v = EI.validate({ number: "X", date: "2026-09-04", customer: "B", customer_tin: "bad", items: [{ description: "a", qty: 1, unit_price: 100 }], subtotal: 90, tax: 0, total: 90 }, supplier);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/lines add to 100.00/);
    expect(v.errors.join(" ")).toMatch(/buyer TIN/);
  });

  it("knows who is mandated", () => {
    expect(EI.obligation({ annualTurnover: 4200000 }, DEMO_TODAY).mandated).toBe(true);
    expect(EI.obligation({ annualTurnover: 1200000 }, DEMO_TODAY).mandated).toBe(false);
  });
});

describe("stored entries", () => {
  it("numbers invoices after the highest one used in that entity", () => {
    expect(nextInvoiceNo(seed, "acme", 240)).toBe("INV-0243");
    expect(nextInvoiceNo(seed, "mawar")).toBe("INV-0001");
  });

  it("keeps the invoice on the entry so ageing and SST can see it", () => {
    const res = proposeInvoice(INV_EXAMPLES[1].inv, { ...ctx(), nextInvoiceNo: () => "INV-0300" });
    const e = entryFromInvoice(res, INV_EXAMPLES[1].inv, { id: "x", at: "", today: DEMO_TODAY, entityId: "acme", approver: "Jerry", status: "posted", utterance: "u" });
    expect(e.inv?.number).toBe("INV-0300");
    expect(e.inv?.total).toBe(19440);
    const ag = arAging([...seed, e], DEMO_TODAY);
    expect(ag.rows.some((r) => r.number === "INV-0300")).toBe(true);
  });

  it("a rejected entry carries no journal lines", () => {
    const res = propose(TX_EXAMPLES[0].tx, ctx());
    const e = entryFromTx(res, TX_EXAMPLES[0].tx, { id: "x", at: "", today: DEMO_TODAY, entityId: "acme", approver: "J", status: "rejected", utterance: "u" });
    expect(e.lines).toEqual([]);
  });

  it("moves the threshold as sales post", () => {
    const res = propose({ ...TX_EXAMPLES[2].tx }, ctx("mawar"));
    const e = entryFromTx(res, TX_EXAMPLES[2].tx, { id: "x", at: "", today: DEMO_TODAY, entityId: "mawar", approver: "J", status: "posted", utterance: "u" });
    const c = withPostedTurnover(ctx("mawar"), [e]);
    expect(c.entities.find((x) => x.id === "mawar")?.taxableTurnover12m).toBe(482000);
  });
});
