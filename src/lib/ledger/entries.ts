/* Turning an approved proposal into a stored journal entry. The demo store and the server
   both call this, so an entry means the same thing wherever it was posted. */

import { round2 } from "./rules";
import type { Entry, EntryStatus, InvoiceInput, InvoiceProposal, RuleContext, TxInput, TxProposal } from "./types";

/* The rolling taxable turnover moves as sales post, so the threshold meter and the engine
   see what is on the books, not only the figure given at onboarding. */
export function withPostedTurnover(ctx: RuleContext, entries: Pick<Entry, "status" | "entityId" | "revenueBase">[]): RuleContext {
  const delta: Record<string, number> = {};
  entries.filter((e) => e.status === "posted").forEach((e) => { delta[e.entityId] = (delta[e.entityId] || 0) + (e.revenueBase || 0); });
  return { ...ctx, entities: ctx.entities.map((e) => ({ ...e, taxableTurnover12m: round2((e.taxableTurnover12m || 0) + (delta[e.id] || 0)) })) };
}

/* Next invoice number for one entity, after the highest one already used. */
export function nextInvoiceNo(entries: Pick<Entry, "entityId" | "desc" | "inv" | "docRef">[], entityId: string, floor = 0) {
  let max = floor;
  entries.filter((e) => e.entityId === entityId).forEach((e) => {
    [e.inv?.number, e.docRef, e.desc].forEach((s) => {
      const m = /INV-(\d{3,})/.exec(s || "");
      if (m) max = Math.max(max, Number(m[1]));
    });
  });
  return "INV-" + String(max + 1).padStart(4, "0");
}

type Common = { id: string; at: string; today: string; entityId: string; approver: string; status: EntryStatus; utterance: string };

export function entryFromTx(res: TxProposal, tx: TxInput, c: Common): Entry {
  const posted = c.status === "posted";
  return {
    id: c.id, at: c.at, date: res.date || c.today,
    entityId: c.entityId, entity: res.entity,
    type: tx.category === "settlement" ? "settlement" : "transaction",
    desc: res.description || "Entry",
    amount: res.gross, base: res.base, taxAmount: res.tax.amount, taxGroup: res.tax.group,
    docRef: tx.doc_ref || null, counterparty: tx.counterparty || null, applies: tx.applies || null, inv: null,
    lines: posted || c.status === "draft" ? res.lines : [],
    approver: c.approver, status: c.status, utterance: c.utterance, version: res.version,
    revenueBase: posted && tx.direction === "receive" && tx.category !== "settlement" ? (res.tax.base || res.gross) : 0,
    badges: [
      res.related ? "related party" : null,
      res.capitalise ? "capitalised" : null,
      res.tax.reverseCharge ? "self-accounted tax" : null,
      !tx.doc_ref ? "no document" : null,
      tx.counterparty_type === "director" ? "director's account" : null
    ].filter((b): b is string => !!b),
    source: tx.source || null
  };
}

export function entryFromInvoice(res: InvoiceProposal, inv: InvoiceInput, c: Common): Entry {
  const posted = c.status === "posted";
  const group = res.items.find((i) => i.tax > 0)?.group || res.items[0]?.group || "professional";
  return {
    id: c.id, at: c.at, date: res.date,
    entityId: c.entityId, entity: res.entity, type: "invoice",
    desc: "Invoice " + res.number + " — " + (res.customer || "customer"),
    amount: res.grossTotal, base: res.base, taxAmount: res.tax, taxGroup: group,
    docRef: res.number, counterparty: res.customer, applies: null,
    inv: {
      number: res.number, customer: res.customer, customer_tin: res.customer_tin, date: res.date, due: res.due,
      total: res.grossTotal, tax: round2(res.tax * (res.fx || 1)), group, currency: res.currency,
      items: res.items.map((i) => ({ description: i.description, qty: i.qty, unit_price: i.unit, category: i.category }))
    },
    lines: posted ? res.lines : [],
    approver: c.approver, status: c.status, utterance: c.utterance, version: res.version,
    revenueBase: posted ? round2(res.subtotal * (res.fx || 1)) : 0,
    badges: [inv.customer_type === "related_entity" ? "related party" : null, res.einvoice ? "MyInvois" : null].filter((b): b is string => !!b),
    source: null
  };
}
