/* Ledger VoiceAI - Malaysian rule engine.
   The model extracts fields. This file decides the accounting and the tax.
   Every rule carries its source and the date it was last verified. */

import type { AppliedRule, Entity, Flag, InvoiceInput, InvoiceItem, InvoiceProposal, JournalLine, RuleContext, TxInput, TxProposal } from "./types";

export const VERSION = "MY-RULES 2026.09";
export const VERIFIED = "2026-09-24";

/* ---------- rate tables ---------- */
export type SstGroup = "professional" | "construction" | "financial" | "wellness" | "digital" | "rental" | "logistics" | "fnb" | "telco" | "parking" | "none";

export const SST: Record<SstGroup, { rate: number; label: string; cite: string }> = {
  professional: { rate: 0.08, label: "Professional services (accounting, legal, consulting, IT, engineering)", cite: "Service tax standard rate 8% since 1 Mar 2024" },
  construction: { rate: 0.08, label: "Construction works services", cite: "Added to scope 1 Jul 2025, 8%" },
  financial: { rate: 0.08, label: "Financial services", cite: "Added to scope 1 Jul 2025, 8%" },
  wellness: { rate: 0.08, label: "Wellness and beauty services", cite: "Added to scope 1 Jul 2025, 8%" },
  digital: { rate: 0.08, label: "Digital / software services", cite: "Digital services 8%; imported services self-accounted" },
  rental: { rate: 0.06, label: "Rental or leasing services", cite: "Reduced from 8% to 6% effective 1 Jan 2026" },
  logistics: { rate: 0.06, label: "Logistics and freight", cite: "Reduced-rate group, 6%" },
  fnb: { rate: 0.06, label: "Food and beverage", cite: "Reduced-rate group, 6%" },
  telco: { rate: 0.06, label: "Telecommunications", cite: "Reduced-rate group, 6%" },
  parking: { rate: 0.06, label: "Parking", cite: "Reduced-rate group, 6%" },
  none: { rate: 0, label: "Not a taxable service", cite: "Outside the taxable service groups" }
};

export const REG_THRESHOLD: Record<string, number> = {
  general: 500000, rental: 1000000, financial: 1000000,
  construction: 1500000, fnb: 1500000, healthcare: 1500000
};

export const EINVOICE = { exemptTurnover: 3000000, phase4From: "2026-01-01", relaxationEnds: "2027-12-31" };

export const BURSA = {
  main: { test: "RM20m aggregate after-tax profit over 3-5 FY and RM6m in the latest FY, or RM500m market capitalisation", spread: "25% public spread, 1,000 holders", moratorium: "promoters locked 6 months" },
  ace: { test: "no profit or track-record test", spread: "25% public spread, 200 holders", moratorium: "promoters locked 6 months, then 45% for 6 months, staggered over 3 years" },
  leap: { test: "no profit test, sophisticated investors only", spread: "10% public spread", moratorium: "promoters locked 12 months, then 45% for 36 months" }
};

/* ---------- chart of accounts ---------- */
export const ACC = {
  bank: ["1000", "Cash at bank"],
  cash: ["1010", "Cash in hand"],
  ar: ["1100", "Trade receivables"],
  equipment: ["1500", "Office equipment"],
  ap: ["2000", "Trade payables"],
  sstPayable: ["2100", "SST payable"],
  director: ["2200", "Director's account"],
  intercompany: ["2300", "Amount due to / from related company"],
  revService: ["4000", "Service revenue"],
  revGoods: ["4100", "Sale of goods"],
  rent: ["5000", "Rent expense"],
  professional: ["5100", "Professional fees"],
  software: ["5200", "Software subscriptions"],
  utilities: ["5300", "Utilities"],
  transport: ["5400", "Transport and delivery"],
  staff: ["5500", "Staff costs"],
  sstExpense: ["5600", "SST expense (not recoverable)"],
  other: ["5900", "Other expenses"],
  marketing: ["5700", "Marketing"],
  depreciation: ["6000", "Depreciation"],
  capital: ["3000", "Share capital"],
  retained: ["3100", "Retained earnings brought forward"]
} as const satisfies Record<string, readonly [string, string]>;

export type AccountKey = keyof typeof ACC;

/* category -> account + service-tax group */
export const CATEGORY: Record<string, { acc: AccountKey; sst: SstGroup; capital?: boolean }> = {
  equipment: { acc: "equipment", sst: "none", capital: true },
  rent: { acc: "rent", sst: "rental" },
  professional_fees: { acc: "professional", sst: "professional" },
  software_subscription: { acc: "software", sst: "digital" },
  utilities: { acc: "utilities", sst: "none" },
  transport: { acc: "transport", sst: "logistics" },
  staff_cost: { acc: "staff", sst: "none" },
  sales_services: { acc: "revService", sst: "professional" },
  sales_goods: { acc: "revGoods", sst: "none" },
  marketing: { acc: "marketing", sst: "none" },
  settlement: { acc: "ar", sst: "none" },
  other: { acc: "other", sst: "none" }
};

export const TX_CATEGORIES = Object.keys(CATEGORY);

/* ---------- helpers ---------- */
export const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const isRelated = (t?: string) => ["director", "shareholder", "related_entity", "related_party"].includes(t || "");
const num = (n: number) => n.toLocaleString("en-US");
const rule = (pack: string, id: string, text: string, cite: string): AppliedRule => ({ pack, id, text, cite });

function pickEntity(ctx: RuleContext, id?: string): Entity {
  const entity = ctx.entities.find((e) => e.id === (id || ctx.entityId)) || ctx.entities[0];
  if (!entity) throw new Error("The rule engine needs at least one entity.");
  return entity;
}

/* ---------- the engine ---------- */
export function propose(tx: TxInput, ctx: RuleContext): TxProposal {
  const notes: string[] = [];
  const flags: Flag[] = [];
  const rules: AppliedRule[] = [];
  const ask: string[] = [];

  const entity = pickEntity(ctx, tx.entity_id);
  const cat = CATEGORY[tx.category || ""] || CATEGORY.other;
  const direction = tx.direction === "receive" ? "receive" : "spend";
  const foreignParty = !!tx.counterparty_country && tx.counterparty_country !== "MY";

  /* --- FX: MPERS Section 30, translate at the transaction date rate --- */
  const cur = (tx.currency || entity.base || "MYR").toUpperCase();
  const fx = cur === entity.base ? 1 : (ctx.fx[cur + "/" + entity.base] || null);
  let fxMissing = false;
  if (cur !== entity.base && !fx) {
    fxMissing = true;
    ask.push("No " + cur + "/" + entity.base + " rate for " + (tx.date || "this date") + ".");
    flags.push({ level: "stop", text: "No " + cur + "/" + entity.base + " rate on file, so the amount cannot be translated." });
  }
  const gross = round2(Number(tx.amount || 0) * (fx || 1));
  if (cur !== entity.base && fx) {
    rules.push(rule("MPERS", "S30", "Foreign currency translated at the transaction-date rate " + fx + " (" + cur + "/" + entity.base + ")", "MPERS Section 30 Foreign Currency Translation"));
  }

  /* --- service tax --- */
  const group = cat.sst;
  const rateInfo = SST[group] || SST.none;
  let taxRate = rateInfo.rate;
  let taxBase = 0;
  let taxAmount = 0;
  let reverseCharge = false;
  const inclusive = tx.amount_includes_tax;

  if (direction === "receive" && group !== "none") {
    if (entity.sstRegistered) {
      if (inclusive === null || inclusive === undefined) {
        ask.push("Is the " + cur + " " + tx.amount + " inclusive of service tax?");
      }
      taxBase = inclusive ? round2(gross / (1 + taxRate)) : gross;
      taxAmount = round2(taxBase * taxRate);
      rules.push(rule("SST", "OUT", "Service tax " + (taxRate * 100) + "% on " + rateInfo.label.toLowerCase(), rateInfo.cite));
    } else {
      taxBase = gross;
      rules.push(rule("SST", "NOTREG", entity.name + " is not service-tax registered, so no tax is charged. This sale still counts toward the registration threshold.", "Registration is on a rolling 12-month basis"));
    }
  } else if (direction === "spend" && group !== "none" && foreignParty) {
    /* imported taxable service - the buyer self-accounts */
    reverseCharge = true;
    taxBase = gross;
    taxRate = SST[group].rate || 0.08;
    taxAmount = round2(gross * taxRate);
    flags.push({ level: "warn", text: "Imported taxable service: " + entity.name + " self-accounts service tax of " + taxAmount.toFixed(2) + " " + entity.base + "." });
    rules.push(rule("SST", "IMP", "Service tax on imported taxable services is self-accounted by the Malaysian recipient", "Reverse charge on imported taxable services"));
  } else if (direction === "spend" && group !== "none" && !foreignParty) {
    taxBase = gross;
    notes.push("Any service tax charged by the supplier is a cost: Malaysia has no input tax credit.");
    rules.push(rule("SST", "NOCREDIT", "Service tax paid to suppliers is not recoverable and stays in the expense", "SST is a single-stage tax with no input credit"));
  }

  /* --- threshold monitor --- */
  const thr = REG_THRESHOLD[group] || REG_THRESHOLD.general;
  if (!entity.sstRegistered && direction === "receive" && group !== "none") {
    const rolling = round2((entity.taxableTurnover12m || 0) + taxBase);
    const pct = thr > 0 ? rolling / thr : 0;
    if (pct >= 1) {
      flags.push({ level: "stop", text: "Rolling 12-month taxable turnover " + num(rolling) + " has passed the " + num(thr) + " threshold. Register within 28 days." });
    } else if (pct >= 0.8) {
      flags.push({ level: "warn", text: "Taxable turnover is at " + Math.round(pct * 100) + "% of the " + num(thr) + " registration threshold." });
    }
    rules.push(rule("SST", "THR", "Registration threshold for this service group is RM " + num(thr), "RM500k general; RM1m rental and financial; RM1.5m construction, F&B, healthcare"));
  }

  /* --- MPERS: capitalise or expense --- */
  let capitalise = false;
  const capPolicy = entity.capPolicy || 2000;
  if (direction === "spend" && cat.capital) {
    capitalise = gross >= capPolicy;
    rules.push(rule("MPERS", "S17", capitalise
      ? "Capitalised: cost is above the " + num(capPolicy) + " capitalisation policy, so it is property, plant and equipment and depreciated over its useful life"
      : "Expensed: below the " + num(capPolicy) + " capitalisation policy",
    "MPERS Section 17 Property, Plant and Equipment"));
    if (capitalise) notes.push("Set a useful life and start depreciation in the month of use.");
  }
  if (tx.category === "rent" && (tx.lease_months || 0) >= 12) {
    rules.push(rule("MPERS", "S20", "Lease of 12 months or more: classify as finance or operating lease. MPERS keeps that split, MFRS 16 does not.", "MPERS Section 20 Leases"));
    ask.push("Is this lease a finance lease (risks and rewards transferred) or an operating lease?");
  }
  if (direction === "receive") {
    rules.push(rule("MPERS", "S23", "Revenue recognised when the service is performed or control of the goods passes, not when cash arrives", "MPERS Section 23 Revenue"));
  }

  /* --- related party and group --- */
  const related = isRelated(tx.counterparty_type);
  if (related) {
    flags.push({ level: "warn", text: "Related-party transaction: disclose it, and keep the evidence that the price is at arm’s length." });
    rules.push(rule("MPERS", "S33", "Related-party transactions are disclosed in the notes, with amounts and balances", "MPERS Section 33 Related Party Disclosures"));
    rules.push(rule("BURSA", "RPT", "Related-party transactions are the first thing listing diligence pulls apart. Document the terms now.", "Bursa listing diligence"));
  }
  let mirror: TxProposal["mirror"] = null;
  if (tx.counterparty_type === "related_entity") {
    const other = ctx.entities.find((e) => e.name === tx.counterparty || e.id === tx.counterparty_entity_id);
    if (other) {
      mirror = { entity: other.name, note: "Mirror entry in " + other.name + ", tagged for elimination on consolidation." };
      rules.push(rule("GROUP", "IC", "Intercompany balance recorded in both entities and eliminated on consolidation", "Consolidation: intercompany balances and income eliminate"));
      rules.push(rule("GROUP", "TP", "Cross-border charges between related companies need transfer pricing documentation", "Malaysian transfer pricing rules"));
    }
  }

  /* --- evidence and audit readiness --- */
  if (!tx.doc_ref) {
    flags.push({ level: "warn", text: "No document reference. An entry without a supporting document is an audit finding waiting to happen." });
    ask.push("What is the invoice or receipt number?");
  }
  if (tx.payment_method === "cash" && gross >= 1000) {
    flags.push({ level: "warn", text: "Cash payment above 1,000. Attach the receipt and note who paid." });
    rules.push(rule("BURSA", "CASH", "Material cash transactions without documents weaken a listing file", "Bursa listing diligence"));
  }
  if (tx.counterparty_type === "director") {
    flags.push({ level: "stop", text: "Posted to the director's account. Clear it before year end: directors' balances are a standing question in diligence." });
  }

  /* --- e-invoice --- */
  const turnover = entity.annualTurnover || 0;
  if (turnover >= EINVOICE.exemptTurnover) {
    rules.push(rule("EINV", "REQ", "Turnover is at or above RM3m, so e-Invoice applies (Phase 4 since 1 Jan 2026)", "IRBM e-Invoice phases; relaxation to 31 Dec 2027"));
    if (foreignParty && direction === "spend") {
      flags.push({ level: "warn", text: "Foreign supplier: issue a self-billed e-Invoice for this purchase." });
    }
  } else {
    rules.push(rule("EINV", "EXEMPT", "Turnover is under RM3m, so e-Invoice is not mandatory (exemption threshold raised to RM3m, Sept 2026). You may still issue voluntarily.", "IRBM raised the exemption threshold to RM3m"));
  }

  /* --- build the journal --- */
  const lines: JournalLine[] = [];
  const add = (accKey: AccountKey, dr: number, cr: number, label?: string | null) => {
    const a = ACC[accKey];
    lines.push({ code: a[0], account: label || a[1], dr: round2(dr), cr: round2(cr) });
  };
  const payKey: AccountKey = tx.payment_method === "cash" ? "cash" : "bank";

  if (tx.category === "settlement") {
    /* money against an invoice already raised: no new revenue, no new tax */
    add(payKey, gross, 0);
    add("ar", 0, gross);
    rules.push(rule("MPERS", "S23", "Settlement of an invoice already recognised: cash replaces the receivable, no new revenue", "MPERS Section 23 Revenue"));
  } else if (direction === "receive") {
    const charged = entity.sstRegistered && group !== "none";
    const net = charged ? taxBase : gross;
    const cash = charged ? round2(net + taxAmount) : gross;
    add(tx.counterparty_type === "related_entity" ? "intercompany" : (tx.settled === false ? "ar" : payKey), cash, 0);
    add(cat.acc === "revGoods" ? "revGoods" : "revService", 0, net);
    if (taxAmount > 0) add("sstPayable", 0, taxAmount, "SST payable (output tax)");
  } else {
    const smallAsset = !!cat.capital && !capitalise;
    const debitKey: AccountKey = capitalise ? "equipment" : smallAsset ? "other" : cat.acc;
    add(debitKey, gross, 0, smallAsset ? "Small equipment written off" : null);
    if (reverseCharge) {
      add("sstExpense", taxAmount, 0, "SST expense (imported service, self-accounted)");
      add("sstPayable", 0, taxAmount, "SST payable (imported services)");
    }
    const creditKey: AccountKey = tx.counterparty_type === "director" ? "director"
      : tx.counterparty_type === "related_entity" ? "intercompany"
        : tx.settled === false ? "ap" : payKey;
    add(creditKey, 0, gross);
  }

  const totalDr = round2(lines.reduce((s, l) => s + l.dr, 0));
  const totalCr = round2(lines.reduce((s, l) => s + l.cr, 0));
  const balanced = Math.abs(totalDr - totalCr) < 0.005;
  if (!balanced) flags.push({ level: "stop", text: "Journal does not balance (" + totalDr + " vs " + totalCr + "). Nothing will post." });

  /* --- approval gate --- */
  const approvalLimit = entity.approvalLimit || 5000;
  const reasons: string[] = [];
  if (related) reasons.push("related party");
  if (capitalise) reasons.push("capitalisation");
  if (reverseCharge) reasons.push("self-accounted tax");
  if (gross >= approvalLimit) reasons.push("above " + num(approvalLimit));
  if (tx.confidence != null && tx.confidence < 0.8) reasons.push("low confidence");
  if (fxMissing) reasons.push("missing FX rate");
  if (ask.length) reasons.push("open question");
  if (!balanced) reasons.push("journal error");

  return {
    kind: "tx", version: VERSION, verified: VERIFIED,
    entity: entity.name, entityId: entity.id, base: entity.base,
    date: tx.date || null,
    description: tx.description || "",
    currency: cur, fx, gross,
    tax: { group, rate: taxRate, base: round2(taxBase), amount: round2(taxAmount), reverseCharge, label: rateInfo.label },
    capitalise, related, mirror,
    lines, totalDr, totalCr, balanced,
    flags, notes, rules, ask,
    approval: { required: reasons.length > 0 || !balanced, reasons, blocked: !balanced || fxMissing }
  };
}

/* ---------- invoices ---------- */
const addDays = (iso: string, n: number) => new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

export function proposeInvoice(inv: InvoiceInput, ctx: RuleContext): InvoiceProposal {
  const flags: Flag[] = [];
  const rules: AppliedRule[] = [];
  const notes: string[] = [];
  const ask: string[] = [];
  const entity = pickEntity(ctx, inv.entity_id);
  const cur = (inv.currency || entity.base).toUpperCase();
  const fx = cur === entity.base ? 1 : (ctx.fx[cur + "/" + entity.base] || null);
  if (!fx) {
    flags.push({ level: "stop", text: "No " + cur + "/" + entity.base + " rate on file, so this invoice cannot be valued." });
  }
  const source = inv.items && inv.items.length
    ? inv.items
    : [{ description: inv.description || "Services rendered", qty: 1, unit_price: Number(inv.amount || 0), category: inv.category || "sales_services" }];
  const items: InvoiceItem[] = source.map((it) => {
    const qty = Number(it.qty || 1);
    const unit = Number(it.unit_price || 0);
    const amount = round2(qty * unit);
    const cat = CATEGORY[it.category || ""] || CATEGORY.sales_services;
    const group = cat.sst;
    const taxable = entity.sstRegistered && group !== "none";
    const rateInfo = SST[group] || SST.none;
    const tax = taxable ? round2(amount * rateInfo.rate) : 0;
    return { description: it.description || "Services", qty, unit, amount, category: it.category || "sales_services", group, rate: taxable ? rateInfo.rate : 0, tax, acc: cat.acc, label: rateInfo.label, cite: rateInfo.cite };
  });
  const subtotal = round2(items.reduce((s, i) => s + i.amount, 0));
  const tax = round2(items.reduce((s, i) => s + i.tax, 0));
  const total = round2(subtotal + tax);
  const terms = Number(inv.terms_days || 30);
  const date = inv.date || ctx.today || new Date().toISOString().slice(0, 10);
  const due = addDays(date, terms);
  const number = inv.number || (ctx.nextInvoiceNo ? ctx.nextInvoiceNo() : "INV-0001");

  if (entity.sstRegistered && tax > 0) {
    const g = items.find((i) => i.tax > 0) as InvoiceItem;
    rules.push(rule("SST", "OUT", "Service tax " + (g.rate * 100) + "% charged on " + g.label.toLowerCase(), g.cite));
  } else if (!entity.sstRegistered) {
    rules.push(rule("SST", "NOTREG", entity.name + " is not registered, so no service tax is charged. The invoice still counts toward the threshold.", "Rolling 12-month registration test"));
  }
  if (inv.customer_country && inv.customer_country !== "MY") {
    flags.push({ level: "warn", text: "Customer is outside Malaysia. Check whether this counts as an exported service before charging service tax." });
    rules.push(rule("SST", "EXPORT", "Services exported out of Malaysia can fall outside the charge. Confirm the place of supply.", "Service tax is on services provided in Malaysia"));
  }
  if (inv.customer_type === "related_entity") {
    flags.push({ level: "warn", text: "Invoicing a company in the same group: price it at arm’s length and keep the basis on file." });
    rules.push(rule("GROUP", "TP", "Intercompany charges need transfer pricing support and eliminate on consolidation", "Malaysian transfer pricing rules"));
  }
  const einvoice = entity.annualTurnover >= EINVOICE.exemptTurnover;
  rules.push(einvoice
    ? rule("EINV", "SUBMIT", "Turnover is at or above RM3m, so this invoice is submitted to MyInvois for validation before it is sent", "e-Invoice Phase 4 since 1 Jan 2026")
    : rule("EINV", "EXEMPT", "Under the RM3m exemption, so a normal invoice is fine. You can still issue an e-Invoice voluntarily.", "Exemption threshold raised to RM3m, Sept 2026"));
  if (einvoice && !inv.customer_tin) ask.push("What is the customer TIN? MyInvois validation needs it.");
  if (!inv.customer) ask.push("Who is the invoice for?");
  rules.push(rule("MPERS", "S23", "Revenue is recognised when the service is performed, which is what dates this invoice, not the payment date", "MPERS Section 23 Revenue"));

  const lines: JournalLine[] = [];
  const grossTotal = round2(total * (fx || 1));
  lines.push({ code: ACC.ar[0], account: ACC.ar[1], dr: grossTotal, cr: 0 });
  items.forEach((i) => {
    const a = ACC[i.acc as AccountKey] || ACC.revService;
    lines.push({ code: a[0], account: a[1] + " — " + i.description, dr: 0, cr: round2(i.amount * (fx || 1)) });
  });
  if (tax > 0) lines.push({ code: ACC.sstPayable[0], account: "SST payable (output tax)", dr: 0, cr: round2(tax * (fx || 1)) });
  const totalDr = round2(lines.reduce((s, l) => s + l.dr, 0));
  const totalCr = round2(lines.reduce((s, l) => s + l.cr, 0));
  const balanced = Math.abs(totalDr - totalCr) < 0.005;

  const approvalLimit = entity.approvalLimit || 5000;
  const reasons: string[] = [];
  if (inv.customer_type === "related_entity") reasons.push("related party");
  if (grossTotal >= approvalLimit) reasons.push("above " + num(approvalLimit));
  if (ask.length) reasons.push("open question");
  if (!balanced || !fx) reasons.push("cannot value");

  return {
    kind: "invoice", version: VERSION, verified: VERIFIED,
    entity: entity.name, entityId: entity.id, base: entity.base, currency: cur, fx,
    number, date, due, terms, customer: inv.customer || null, customer_tin: inv.customer_tin || null,
    customer_country: inv.customer_country || "MY", items, subtotal, tax, total, grossTotal,
    einvoice, lines, totalDr, totalCr, balanced, flags, rules, notes, ask,
    approval: { required: reasons.length > 0, reasons, blocked: !balanced || !fx }
  };
}
