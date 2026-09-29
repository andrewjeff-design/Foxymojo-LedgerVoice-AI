/* Demo history for Acme Trading: an opening trial balance and a month of activity,
   every entry produced by the same rule engine the app uses. */

import { propose, VERSION } from "./rules";
import type { Entry, RuleContext, TxInput } from "./types";

const addDays = (iso: string, n: number) => new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

const TXS: [string, TxInput][] = [
  ["2026-08-04", { direction: "receive", category: "sales_services", amount: 18000, counterparty: "Sunrise Dental Group", counterparty_type: "customer", counterparty_country: "MY", doc_ref: "INV-0231", description: "Monthly retainer — August", payment_method: "bank", amount_includes_tax: false, settled: false, confidence: 1 }],
  ["2026-08-05", { direction: "receive", category: "sales_services", amount: 6000, counterparty: "Klinik Mawar", counterparty_type: "customer", counterparty_country: "MY", doc_ref: "INV-0230", description: "Advisory — August", payment_method: "bank", amount_includes_tax: false, settled: false, confidence: 1 }],
  ["2026-08-22", { direction: "receive", category: "sales_services", amount: 9000, counterparty: "Klinik Mawar", counterparty_type: "customer", counterparty_country: "MY", doc_ref: "INV-0235", description: "Systems review", payment_method: "bank", amount_includes_tax: false, settled: false, confidence: 1 }],
  ["2026-08-28", { direction: "receive", category: "settlement", amount: 6480, counterparty: "Klinik Mawar", counterparty_type: "customer", counterparty_country: "MY", doc_ref: "RCP-0447", applies: "INV-0230", description: "Receipt against INV-0230", payment_method: "bank", confidence: 1 }],
  ["2026-08-06", { direction: "spend", category: "rent", amount: 3800, counterparty: "Menara Suria", counterparty_type: "supplier", counterparty_country: "MY", doc_ref: "RN-0808", description: "Office rent — August", payment_method: "bank", amount_includes_tax: true, confidence: 1 }],
  ["2026-08-08", { direction: "spend", category: "staff_cost", amount: 21500, counterparty: "Payroll", counterparty_type: "staff", counterparty_country: "MY", doc_ref: "PR-0801", description: "Salaries — August", payment_method: "bank", confidence: 1 }],
  ["2026-08-12", { direction: "receive", category: "settlement", amount: 24000, counterparty: "Sunrise Dental Group", counterparty_type: "customer", counterparty_country: "MY", doc_ref: "RCP-0442", description: "Receipt against July invoices", payment_method: "bank", confidence: 1 }],
  ["2026-08-15", { direction: "spend", category: "software_subscription", amount: 800, currency: "SGD", counterparty: "Sing Soft Pte Ltd", counterparty_type: "supplier", counterparty_country: "SG", doc_ref: "SS-4410", description: "Annual software licence", payment_method: "bank", confidence: 1 }],
  ["2026-08-19", { direction: "spend", category: "marketing", amount: 2400, counterparty: "Ad agency", counterparty_type: "supplier", counterparty_country: "MY", doc_ref: "AG-119", description: "Campaign for the September launch", payment_method: "bank", confidence: 1 }],
  ["2026-08-26", { direction: "receive", category: "sales_goods", amount: 9500, counterparty: "Retail customer", counterparty_type: "customer", counterparty_country: "MY", doc_ref: "INV-0236", description: "Hardware resale", payment_method: "bank", confidence: 1 }],
  ["2026-09-02", { direction: "spend", category: "equipment", amount: 4500, counterparty: "Tech Supply Sdn Bhd", counterparty_type: "supplier", counterparty_country: "MY", doc_ref: "TS-2291", description: "Laptop for the office", payment_method: "bank", confidence: 1 }],
  ["2026-09-04", { direction: "receive", category: "sales_services", amount: 18000, counterparty: "Sunrise Dental Group", counterparty_type: "customer", counterparty_country: "MY", doc_ref: "INV-0240", description: "Monthly retainer — September", payment_method: "bank", amount_includes_tax: false, settled: false, confidence: 1 }],
  ["2026-09-06", { direction: "spend", category: "rent", amount: 3800, counterparty: "Menara Suria", counterparty_type: "supplier", counterparty_country: "MY", doc_ref: "RN-0908", description: "Office rent — September", payment_method: "bank", amount_includes_tax: true, confidence: 1 }],
  ["2026-09-08", { direction: "spend", category: "staff_cost", amount: 21500, counterparty: "Payroll", counterparty_type: "staff", counterparty_country: "MY", doc_ref: "PR-0901", description: "Salaries — September", payment_method: "bank", confidence: 1 }],
  ["2026-09-11", { direction: "receive", category: "settlement", amount: 19440, counterparty: "Sunrise Dental Group", counterparty_type: "customer", counterparty_country: "MY", doc_ref: "RCP-0451", applies: "INV-0231", description: "Receipt against INV-0231", payment_method: "bank", confidence: 1 }],
  ["2026-09-15", { direction: "spend", category: "utilities", amount: 620, counterparty: "TNB", counterparty_type: "supplier", counterparty_country: "MY", doc_ref: "TNB-0915", description: "Electricity — September", payment_method: "bank", confidence: 1 }],
  ["2026-09-18", { direction: "spend", category: "professional_fees", amount: 2500, counterparty: "Tax agent", counterparty_type: "supplier", counterparty_country: "MY", doc_ref: "TA-771", description: "Tax filing fee", payment_method: "bank", settled: false, confidence: 1 }],
  ["2026-09-19", { direction: "receive", category: "sales_goods", amount: 12000, counterparty: "Retail customer", counterparty_type: "customer", counterparty_country: "MY", doc_ref: "INV-0241", description: "Hardware resale — September", payment_method: "bank", confidence: 1 }],
  ["2026-09-20", { direction: "receive", category: "sales_services", amount: 6500, counterparty: "Klinik Mawar", counterparty_type: "customer", counterparty_country: "MY", doc_ref: "INV-0242", description: "Project work — data cleanup", payment_method: "bank", amount_includes_tax: false, confidence: 1 }]
];

export function buildSeed(ctx: RuleContext): Entry[] {
  const entity = ctx.entities.find((e) => e.id === ctx.entityId) || ctx.entities[0];
  const base = { entityId: entity.id, entity: entity.name, approver: "Seeded example", status: "posted" as const, version: VERSION, revenueBase: 0, badges: [] as string[], taxAmount: 0 };
  const entries: Entry[] = [];

  entries.push({
    ...base,
    id: "open", at: "2026-08-01T08:00:00", date: "2026-08-01", type: "opening",
    desc: "Opening balances at 1 August 2026", utterance: "Opening trial balance brought forward",
    amount: 141000,
    lines: [
      { code: "1000", account: "Cash at bank", dr: 85000, cr: 0 },
      { code: "1100", account: "Trade receivables", dr: 24000, cr: 0 },
      { code: "1500", account: "Office equipment", dr: 32000, cr: 0 },
      { code: "2000", account: "Trade payables", dr: 0, cr: 18500 },
      { code: "2100", account: "SST payable", dr: 0, cr: 3200 },
      { code: "2200", account: "Director's account", dr: 0, cr: 12000 },
      { code: "3000", account: "Share capital", dr: 0, cr: 100000 },
      { code: "3100", account: "Retained earnings brought forward", dr: 0, cr: 7300 }
    ]
  });

  TXS.forEach(([date, tx], i) => {
    const res = propose({ date, currency: "MYR", ...tx, entity_id: entity.id }, ctx);
    const isInvoice = tx.direction === "receive" && tx.settled === false && /^INV-/.test(tx.doc_ref || "");
    entries.push({
      ...base,
      inv: isInvoice ? { number: tx.doc_ref as string, customer: tx.counterparty || null, date, due: addDays(date, 30),
        total: res.gross + res.tax.amount, tax: res.tax.amount, group: "professional" } : null,
      applies: tx.applies || null,
      docRef: tx.doc_ref || null,
      counterparty: tx.counterparty || null,
      id: "sd" + i, at: date + "T10:00:00", date, type: tx.category === "settlement" ? "settlement" : "transaction",
      desc: res.description, utterance: tx.description || "", amount: res.gross, base: res.base,
      taxAmount: res.tax.amount, taxGroup: res.tax.group, lines: res.lines,
      revenueBase: tx.direction === "receive" && tx.category !== "settlement" ? (res.tax.base || res.gross) : 0,
      badges: [res.related ? "related party" : null, res.capitalise ? "capitalised" : null, res.tax.reverseCharge ? "self-accounted tax" : null].filter((b): b is string => !!b)
    });
  });
  return entries.reverse();
}
