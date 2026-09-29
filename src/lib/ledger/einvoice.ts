/* Ledger VoiceAI - MyInvois e-Invoice document builder.

   WHAT THIS IS. The UBL 2.1 JSON document LHDN expects, built from the invoice object the
   rule engine already produces, plus the validation that catches a rejection before it costs
   a submission. Everything here is pure and testable.

   WHAT THIS IS NOT. It does not submit. Submission needs an ERP registration on the MyInvois
   portal, a client id and secret, and a digital certificate from a Malaysian licensed CA
   (Pos Digicert or MSC Trustgate). The client at the bottom is a skeleton with the call
   shapes and the retry and polling logic; it is wired to nothing.

   BEFORE YOU RELY ON THIS, three things need checking against the live SDK, because the spec
   is patched near-monthly and was last changed 21 September 2026:
     1. the classification code list (LHDN's own list, not the sample below),
     2. the cancellation window (widely quoted as 72 hours - unconfirmed here),
     3. the sandbox base URL and how a vendor gets access.
   Docs: https://sdk.myinvois.hasil.gov.my/

   URGENCY, AS AT 24 SEPTEMBER 2026. The exemption threshold rose to RM3m on 1 September 2026,
   Phase 4 relaxation runs to 31 December 2027 and penalties start 1 January 2028. Most SMEs
   are exempt today. This is a feature to have ready, not one to ship first. */

import type { Address } from "./types";

export const SPEC = {
  version: "1.1",
  ublVersion: "2.1",
  /* what this code was written against - bump it when you re-check the SDK */
  checkedAgainst: "MyInvois SDK 1.0, release notes to 21 Sep 2026",
  verified: false,
  docs: "https://sdk.myinvois.hasil.gov.my/"
};

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const money = (n: number) => r2(n).toFixed(2);

/* Document types. The full list lives in the SDK; these are the ones a service SME issues. */
export const DOC_TYPES = {
  invoice: { code: "01", name: "Invoice" },
  credit_note: { code: "02", name: "Credit Note" },
  debit_note: { code: "03", name: "Debit Note" },
  refund_note: { code: "04", name: "Refund Note" },
  self_billed_invoice: { code: "11", name: "Self-billed Invoice" }
};

/* Tax types. 'E' is exempt; '06' is the not-applicable code used where no tax arises. */
export const TAX_TYPES = { service: "01", sales: "02", tourism: "03", exempt: "E", not_applicable: "06" };

/* A small sample of LHDN's classification codes. Replace with the published list. */
export const CLASSIFICATION: Record<string, string> = {
  sales_services: "022",
  sales_goods: "004",
  professional: "022",
  default: "022"
};

const MSIC_DEFAULT = "00000"; /* "Not applicable" - set the real MSIC on the supplier profile */

export type EInvoiceItem = { description?: string; qty?: number; unit_price?: number; unitPrice?: number; unit?: number; amount?: number; category?: string; uom?: string; unit_code?: string };
export type EInvoiceInput = {
  number?: string;
  date?: string;
  due?: string;
  customer?: string | null;
  customer_tin?: string | null;
  customer_brn?: string;
  customer_address?: Address;
  consolidated?: boolean;
  items?: EInvoiceItem[];
  subtotal?: number;
  tax?: number;
  total?: number;
  tax_rate?: number;
  currency?: string;
  fx_rate?: number;
  payment_means?: string;
  terms?: string;
};
export type Supplier = { name?: string; tin?: string; brn?: string; msic?: string; msicName?: string; sstRegistered?: boolean; sstNo?: string; address?: Address; phone?: string; email?: string; idType?: string };

type NormalisedItem = { description: string; qty: number; unit_price: number | undefined; amount: number | undefined; category?: string; uom: string };

/* ---------- line normalisation ----------
   The rule engine emits { description, qty, unit, amount } where `unit` is the unit PRICE.
   Hand-built invoices use `unit_price`. UBL's `unitCode` is a unit of MEASURE, which is a
   different thing entirely - read it from `uom` only, never from `unit`, or the document
   goes out with a price where the measure should be. */
export function normaliseItems(items?: EInvoiceItem[]): NormalisedItem[] {
  return (items || []).map((it) => {
    const qty = Number(it.qty === undefined ? 1 : it.qty);
    let price: number | undefined = [it.unit_price, it.unitPrice, it.unit].find((x) => x !== undefined && x !== null && !Number.isNaN(Number(x)));
    if (price === undefined && it.amount !== undefined && qty) price = Number(it.amount) / qty;
    return {
      description: it.description || "",
      qty,
      unit_price: price === undefined ? undefined : Number(price),
      amount: it.amount !== undefined ? r2(it.amount) : (price === undefined ? undefined : r2(qty * Number(price))),
      category: it.category,
      uom: it.uom || it.unit_code || "C62" /* C62 = "one" in UN/ECE Rec 20 */
    };
  });
}

/* ---------- validation ----------
   A rejection costs a round trip and, in a batch, can stall a day's invoicing. Catch it here. */

const TIN_RE = /^(C\d{10}|\d{12}|IG\d{11}|[A-Z]{1,2}\d{8,12})$/i;
const BRN_RE = /^\d{6,}-?[A-Z]?$|^\d{12}$/i;

export type Validation = { ok: boolean; errors: string[]; warnings: string[]; subtotal: number; tax: number; total: number; lineSum: number; items: NormalisedItem[] };

/** Validate an invoice before building the document. Errors block; warnings do not. */
export function validate(inv: EInvoiceInput | null | undefined, supplier?: Supplier): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const s = supplier || {};

  if (!inv || typeof inv !== "object") return { ok: false, errors: ["No invoice was given."], warnings: [], subtotal: 0, tax: 0, total: 0, lineSum: 0, items: [] };

  if (!inv.number) errors.push("The invoice has no number.");
  if (!inv.date || !/^\d{4}-\d{2}-\d{2}$/.test(inv.date)) errors.push("The invoice date must be YYYY-MM-DD.");

  /* Supplier */
  if (!s.name) errors.push("The supplier name is missing.");
  if (!s.tin) errors.push("The supplier TIN is missing — it comes from the company profile, not the invoice.");
  else if (!TIN_RE.test(s.tin)) errors.push("The supplier TIN \"" + s.tin + "\" is not a recognised format.");
  if (!s.brn) warnings.push("No supplier registration number (BRN). LHDN pairs it with the TIN for validation.");
  else if (!BRN_RE.test(String(s.brn).replace(/\s/g, ""))) warnings.push("The supplier BRN format looks unusual — check it.");
  if (!s.msic) warnings.push("No MSIC industry code on the supplier. " + MSIC_DEFAULT + " (not applicable) will be sent.");
  if (!s.sstNo && s.sstRegistered) warnings.push("The company is marked SST-registered but carries no SST number.");
  if (!s.address || !s.address.line1) errors.push("The supplier address is incomplete.");
  if (!s.address || !s.address.state) warnings.push("No supplier state code — LHDN uses its own state list.");

  /* Buyer */
  if (!inv.customer) errors.push("The buyer name is missing.");
  const isConsolidated = inv.consolidated === true;
  if (!isConsolidated && !inv.customer_tin) {
    warnings.push("No buyer TIN. For a business buyer this will be rejected; for a consumer, "
      + "use the general public TIN (EI00000000010) or consolidate the month.");
  } else if (inv.customer_tin && !TIN_RE.test(inv.customer_tin)) {
    errors.push("The buyer TIN \"" + inv.customer_tin + "\" is not a recognised format.");
  }

  /* Lines and arithmetic - the most common cause of rejection */
  const items = normaliseItems(inv.items);
  if (!items.length) errors.push("The invoice has no lines.");
  items.forEach((it, i) => {
    const n = "Line " + (i + 1);
    if (!it.description) errors.push(n + " has no description.");
    if (!(Number(it.qty) > 0)) errors.push(n + " has no quantity.");
    if (it.unit_price === undefined || it.unit_price === null || Number.isNaN(Number(it.unit_price))) errors.push(n + " has no unit price.");
    if (Number(it.unit_price) < 0) errors.push(n + " has a negative unit price — use a credit note instead.");
  });

  const lineSum = r2(items.reduce((t, it) => t + r2(Number(it.qty || 0) * Number(it.unit_price || 0)), 0));
  const subtotal = inv.subtotal !== undefined ? r2(inv.subtotal) : lineSum;
  const tax = r2(inv.tax || 0);
  const total = inv.total !== undefined ? r2(inv.total) : r2(subtotal + tax);

  if (Math.abs(lineSum - subtotal) >= 0.01) errors.push("The lines add to " + money(lineSum) + " but the subtotal says " + money(subtotal) + ".");
  if (Math.abs(r2(subtotal + tax) - total) >= 0.01) errors.push("Subtotal plus tax is " + money(subtotal + tax) + " but the total says " + money(total) + ".");
  if (total <= 0 && !isConsolidated) errors.push("The invoice total is not positive.");

  if (inv.currency && inv.currency !== "MYR" && !inv.fx_rate) {
    errors.push("A foreign-currency invoice needs an exchange rate to ringgit.");
  }

  /* Timing: LHDN validates against submission time, and a stale document is refused.
     The submission window is unconfirmed, so it is not checked here yet. */

  return { ok: errors.length === 0, errors, warnings, subtotal, tax, total, lineSum, items };
}

/* ---------- document building ---------- */

const addr = (a?: Address) => {
  const x = a || {};
  return {
    CityName: [{ _: x.city || "" }],
    PostalZone: [{ _: x.postcode || "" }],
    CountrySubentityCode: [{ _: x.state || "17" }], /* 17 = not applicable in LHDN's state list */
    AddressLine: [x.line1, x.line2, x.line3].filter(Boolean).map((l) => ({ Line: [{ _: l }] })),
    Country: [{ IdentificationCode: [{ _: x.country || "MYS", listID: "ISO3166-1", listAgencyID: "6" }] }]
  };
};

const party = (p: Supplier, isSupplier: boolean) => {
  const o: Record<string, unknown> & { PartyIdentification: { ID: { _: string; schemeID: string }[] }[] } = {
    PartyIdentification: [
      { ID: [{ _: p.tin || "", schemeID: "TIN" }] },
      { ID: [{ _: p.brn || "NA", schemeID: p.idType || "BRN" }] }
    ],
    PostalAddress: [addr(p.address)],
    PartyLegalEntity: [{ RegistrationName: [{ _: p.name || "" }] }]
  };
  if (isSupplier) {
    o.IndustryClassificationCode = [{ _: p.msic || MSIC_DEFAULT, name: p.msicName || "Not Applicable" }];
    o.PartyIdentification.push({ ID: [{ _: p.sstNo || "NA", schemeID: "SST" }] });
  }
  return o;
};

export type BuiltEInvoice =
  | { ok: false; document: null; validation: Validation; summary: null }
  | { ok: true; document: Record<string, unknown>; validation: Validation; summary: { number: string; date: string; type: string; typeCode: string; buyer: string; buyerTin: string; subtotal: number; tax: number; total: number; currency: string; lines: number } };

/** Build the MyInvois UBL 2.1 JSON document. Never throws on bad input. */
export function build(inv: EInvoiceInput, supplier: Supplier, opts?: { type?: keyof typeof DOC_TYPES; now?: string | number | Date }): BuiltEInvoice {
  const o = opts || {};
  const v = validate(inv, supplier);
  if (!v.ok) return { ok: false, document: null, validation: v, summary: null };

  const s = supplier;
  const type = DOC_TYPES[o.type || "invoice"] || DOC_TYPES.invoice;
  const currency = inv.currency || "MYR";
  const taxType = (inv.tax || 0) > 0 ? TAX_TYPES.service : TAX_TYPES.not_applicable;
  const issuedAt = o.now ? new Date(o.now) : new Date();

  const rate = inv.tax_rate !== undefined ? Number(inv.tax_rate) : (v.subtotal > 0 ? r2((v.tax / v.subtotal) * 100) : 0);
  const taxScheme = [{ ID: [{ _: "OTH", schemeID: "UN/ECE 5153", schemeAgencyID: "6" }] }];
  const lines = v.items.map((it, i) => {
    const amount = r2(Number(it.qty) * Number(it.unit_price));
    const share = v.subtotal > 0 ? amount / v.subtotal : 0;
    const lineTax = r2(v.tax * share);
    return {
      ID: [{ _: String(i + 1) }],
      InvoicedQuantity: [{ _: Number(it.qty), unitCode: it.uom }],
      LineExtensionAmount: [{ _: amount, currencyID: currency }],
      Item: [{
        Description: [{ _: it.description }],
        CommodityClassification: [{ ItemClassificationCode: [{ _: CLASSIFICATION[it.category || ""] || CLASSIFICATION.default, listID: "CLASS" }] }]
      }],
      Price: [{ PriceAmount: [{ _: r2(Number(it.unit_price)), currencyID: currency }] }],
      ItemPriceExtension: [{ Amount: [{ _: amount, currencyID: currency }] }],
      TaxTotal: [{
        TaxAmount: [{ _: lineTax, currencyID: currency }],
        TaxSubtotal: [{
          TaxableAmount: [{ _: amount, currencyID: currency }],
          TaxAmount: [{ _: lineTax, currencyID: currency }],
          TaxCategory: [{ ID: [{ _: taxType }], Percent: [{ _: rate }], TaxScheme: taxScheme }]
        }]
      }]
    };
  });

  const buyer = { name: inv.customer || "", tin: inv.customer_tin || "EI00000000010", brn: inv.customer_brn || "NA", address: inv.customer_address };
  const invoice: Record<string, unknown> = {
    ID: [{ _: inv.number }],
    IssueDate: [{ _: inv.date }],
    IssueTime: [{ _: issuedAt.toISOString().slice(11, 19) + "Z" }],
    InvoiceTypeCode: [{ _: type.code, listVersionID: SPEC.version }],
    DocumentCurrencyCode: [{ _: currency }],
    TaxCurrencyCode: [{ _: "MYR" }],
    AccountingSupplierParty: [{ Party: [party(s, true)], AdditionalAccountID: [{ _: s.msic || MSIC_DEFAULT, schemeAgencyName: "CertEX" }] }],
    AccountingCustomerParty: [{ Party: [party(buyer, false)] }],
    Delivery: [{ DeliveryParty: [party(buyer, false)] }],
    TaxTotal: [{
      TaxAmount: [{ _: v.tax, currencyID: currency }],
      TaxSubtotal: [{
        TaxableAmount: [{ _: v.subtotal, currencyID: currency }],
        TaxAmount: [{ _: v.tax, currencyID: currency }],
        TaxCategory: [{ ID: [{ _: taxType }], Percent: [{ _: rate }], TaxScheme: taxScheme }]
      }]
    }],
    LegalMonetaryTotal: [{
      LineExtensionAmount: [{ _: v.subtotal, currencyID: currency }],
      TaxExclusiveAmount: [{ _: v.subtotal, currencyID: currency }],
      TaxInclusiveAmount: [{ _: v.total, currencyID: currency }],
      PayableAmount: [{ _: v.total, currencyID: currency }]
    }],
    InvoiceLine: lines
  };
  if (inv.payment_means) invoice.PaymentMeans = [{ PaymentMeansCode: [{ _: inv.payment_means }] }];
  if (inv.terms) invoice.PaymentTerms = [{ Note: [{ _: inv.terms }] }];
  if (currency !== "MYR" && inv.fx_rate) {
    invoice.TaxExchangeRate = [{
      SourceCurrencyCode: [{ _: currency }],
      TargetCurrencyCode: [{ _: "MYR" }],
      CalculationRate: [{ _: Number(inv.fx_rate) }]
    }];
  }

  const document = {
    _D: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    _A: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    _B: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    Invoice: [invoice]
  };

  return {
    ok: true,
    document,
    validation: v,
    summary: {
      number: inv.number as string, date: inv.date as string, type: type.name, typeCode: type.code,
      buyer: inv.customer || "", buyerTin: inv.customer_tin || "EI00000000010 (general public)",
      subtotal: v.subtotal, tax: v.tax, total: v.total, currency, lines: lines.length
    }
  };
}

function base64Utf8(text: string) {
  if (typeof Buffer !== "undefined") return Buffer.from(text, "utf8").toString("base64");
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

/** The submission envelope: base64 document, its SHA-256, and the code number. */
export function envelope(built: BuiltEInvoice | null, hashFn?: (json: string) => string) {
  if (!built || !built.ok) return null;
  const json = JSON.stringify(built.document);
  return {
    format: "JSON",
    document: base64Utf8(json),
    documentHash: hashFn ? hashFn(json) : null, /* SHA-256 hex; supply the platform's own */
    codeNumber: built.summary.number
  };
}

/** The QR link printed on the PDF, which a recipient scans to see LHDN's own copy. */
export function validationLink(uuid: string, longId: string, base?: string) {
  if (!uuid || !longId) return null;
  return (base || "https://myinvois.hasil.gov.my") + "/" + encodeURIComponent(uuid) + "/share/" + encodeURIComponent(longId);
}

/* ---------- submission client skeleton ----------
   Wired to nothing. It holds the call shapes, the token handling and the backoff so the
   credentials are the only thing missing when they arrive. */

export const ENDPOINTS = {
  /* Confirm both against the SDK before use - the sandbox host was not verified. */
  production: { auth: "https://api.myinvois.hasil.gov.my/connect/token", api: "https://api.myinvois.hasil.gov.my/api/v1.0" },
  sandbox: { auth: "https://preprod-api.myinvois.hasil.gov.my/connect/token", api: "https://preprod-api.myinvois.hasil.gov.my/api/v1.0" }
};

type ClientConfig = { env?: keyof typeof ENDPOINTS; maxRetries?: number; onBehalfOf?: string | null; clientId?: string; clientSecret?: string; fetch?: typeof fetch };

export function createClient(config?: ClientConfig) {
  const cfg = { env: "sandbox" as keyof typeof ENDPOINTS, maxRetries: 3, onBehalfOf: null as string | null, ...(config || {}) };
  const host = ENDPOINTS[cfg.env] || ENDPOINTS.sandbox;
  let token: string | null = null;
  let tokenExpiry = 0;

  const need = (what: string): never => { throw new Error("MyInvois " + what + " is not configured. This client is a skeleton — supply clientId, clientSecret and a fetch implementation."); };

  async function authenticate() {
    if (!cfg.clientId || !cfg.clientSecret) need("credentials");
    const transport = cfg.fetch || need("transport");
    if (token && Date.now() < tokenExpiry - 30000) return token;
    const body = new URLSearchParams({
      client_id: cfg.clientId as string, client_secret: cfg.clientSecret as string,
      grant_type: "client_credentials", scope: "InvoicingAPI"
    });
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (cfg.onBehalfOf) headers.onbehalfof = cfg.onBehalfOf; /* intermediary acting for a taxpayer */
    const res = await transport(host.auth, { method: "POST", headers, body: body.toString() });
    if (!res.ok) throw new Error("MyInvois authentication failed: " + res.status);
    const json = await res.json() as { access_token: string; expires_in?: number };
    token = json.access_token;
    tokenExpiry = Date.now() + (json.expires_in || 3600) * 1000;
    return token;
  }

  async function call(path: string, init: RequestInit, attempt = 0): Promise<Response> {
    const t = await authenticate();
    const transport = cfg.fetch || need("transport");
    const res = await transport(host.api + path, {
      ...init,
      headers: { Authorization: "Bearer " + t, "Content-Type": "application/json", ...((init.headers as Record<string, string>) || {}) }
    });
    /* 429 and 5xx are worth retrying; 4xx is a document problem and is not. */
    if ((res.status === 429 || res.status >= 500) && attempt < cfg.maxRetries) {
      const wait = Math.min(30000, 1000 * Math.pow(2, attempt)) + Math.random() * 400;
      await new Promise((r) => setTimeout(r, wait));
      return call(path, init, attempt + 1);
    }
    return res;
  }

  return {
    config: cfg,
    endpoints: host,
    authenticate,
    /* Up to 100 documents per submission per the SDK; check the current limit. */
    submit: (envelopes: unknown[]) => call("/documentsubmissions", { method: "POST", body: JSON.stringify({ documents: envelopes }) }),
    status: (submissionUid: string) => call("/documentsubmissions/" + encodeURIComponent(submissionUid), { method: "GET" }),
    getDocument: (uuid: string) => call("/documents/" + encodeURIComponent(uuid) + "/raw", { method: "GET" }),
    /* The issuer cancels; the recipient rejects. Both are time-limited - confirm the window. */
    cancel: (uuid: string, reason: string) => call("/documents/state/" + encodeURIComponent(uuid) + "/state", { method: "PUT", body: JSON.stringify({ status: "cancelled", reason }) }),
    reject: (uuid: string, reason: string) => call("/documents/state/" + encodeURIComponent(uuid) + "/state", { method: "PUT", body: JSON.stringify({ status: "rejected", reason }) }),
    searchTin: (tin: string, idType: string, idValue: string) => call("/taxpayer/validate/" + encodeURIComponent(tin) + "?idType=" + encodeURIComponent(idType) + "&idValue=" + encodeURIComponent(idValue), { method: "GET" })
  };
}

/* ---------- who has to do this, and when ---------- */

export const THRESHOLD = 3000000; /* raised from RM1m, effective 1 September 2026 */
const RELAXATION_ENDS = "2027-12-31";
const PENALTIES_FROM = "2028-01-01";

/**
 * Is this company mandated today? The carve-outs matter more than the headline number:
 * the exemption dies if a non-individual shareholder, holding company or related company
 * or JV is at or above the threshold.
 */
export function obligation(company: { annualTurnover?: number; groupTurnoverAtThreshold?: boolean; nonIndividualShareholderAtThreshold?: boolean }, asAt?: string) {
  const c = company || {};
  const today = asAt || new Date().toISOString().slice(0, 10);
  const turnover = Number(c.annualTurnover || 0);
  const reasons: string[] = [];
  let mandated = turnover >= THRESHOLD;
  if (mandated) reasons.push("Annual turnover of RM" + turnover.toLocaleString("en-US") + " is at or above the RM3m threshold.");
  if (c.groupTurnoverAtThreshold) { mandated = true; reasons.push("A holding company, related company or JV is at the threshold, so the exemption does not apply."); }
  if (c.nonIndividualShareholderAtThreshold) { mandated = true; reasons.push("A non-individual shareholder is at the threshold, so the exemption does not apply."); }
  if (!mandated) reasons.push("Below RM3m with no group carve-out. Issuing can stop immediately — no application to LHDN is needed.");
  return {
    mandated,
    reasons,
    threshold: THRESHOLD,
    relaxationEnds: RELAXATION_ENDS,
    penaltiesFrom: PENALTIES_FROM,
    inRelaxation: today <= RELAXATION_ENDS,
    note: today <= RELAXATION_ENDS
      ? "Phase 4 relaxation runs to " + RELAXATION_ENDS + "; penalties start " + PENALTIES_FROM + "."
      : "The relaxation period has ended."
  };
}
