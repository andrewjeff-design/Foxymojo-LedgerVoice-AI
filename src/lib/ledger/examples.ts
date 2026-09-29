/* Worked examples, already read, so the demo runs end to end with no model call. */

import { DEMO_TODAY } from "./catalog";
import type { InvoiceInput, TxInput } from "./types";

export type Lang = "en-MY" | "ms-MY" | "zh-CN";
export const LANGS: { lang: Lang; tag: string }[] = [{ lang: "en-MY", tag: "EN" }, { lang: "ms-MY", tag: "BM" }, { lang: "zh-CN", tag: "中文" }];

const TODAY = DEMO_TODAY;

export const TX_EXAMPLES: { lang: Lang; tag: string; text: string; tx: TxInput }[] = [
  { lang: "en-MY", tag: "EN", text: "Paid RM4,500 to Tech Supply for a laptop, invoice TS-2291",
    tx: { date: TODAY, direction: "spend", category: "equipment", amount: 4500, currency: "MYR", counterparty: "Tech Supply Sdn Bhd", counterparty_type: "supplier", counterparty_country: "MY", payment_method: "bank", doc_ref: "TS-2291", description: "Laptop for the office", amount_includes_tax: false, confidence: 0.94 } },
  { lang: "en-MY", tag: "EN", text: "Sing Soft billed us SGD 800 for the annual software licence",
    tx: { date: TODAY, direction: "spend", category: "software_subscription", amount: 800, currency: "SGD", counterparty: "Sing Soft Pte Ltd", counterparty_type: "supplier", counterparty_country: "SG", payment_method: "bank", doc_ref: "SS-4410", description: "Annual software licence", amount_includes_tax: false, confidence: 0.9 } },
  { lang: "ms-MY", tag: "BM", text: "Terima RM12,000 daripada Klinik Mawar untuk yuran perundingan, belum termasuk cukai",
    tx: { date: TODAY, direction: "receive", category: "sales_services", amount: 12000, currency: "MYR", counterparty: "Klinik Mawar", counterparty_type: "customer", counterparty_country: "MY", payment_method: "bank", doc_ref: "INV-0244", description: "Consulting fee", amount_includes_tax: false, confidence: 0.93 } },
  { lang: "ms-MY", tag: "BM", text: "Pengarah Lim bayar sewa pejabat RM3,000 guna akaun peribadi",
    tx: { date: TODAY, direction: "spend", category: "rent", amount: 3000, currency: "MYR", counterparty: "Director Lim", counterparty_type: "director", counterparty_country: "MY", payment_method: "bank", doc_ref: null, description: "Office rent paid personally by the director", amount_includes_tax: null, confidence: 0.88 } },
  { lang: "zh-CN", tag: "中文", text: "我们向 Acme Logistics 收取 25,000 令吉的共享服务费",
    tx: { date: TODAY, direction: "receive", category: "sales_services", amount: 25000, currency: "MYR", counterparty: "Acme Logistics Sdn Bhd", counterparty_type: "related_entity", counterparty_country: "MY", payment_method: "bank", doc_ref: "IC-0087", description: "Shared services charged to Acme Logistics", amount_includes_tax: false, confidence: 0.91 } },
  { lang: "zh-CN", tag: "中文", text: "用现金付了 1,500 令吉的展会费用，没有收据",
    tx: { date: TODAY, direction: "spend", category: "other", amount: 1500, currency: "MYR", counterparty: "Expo organiser", counterparty_type: "supplier", counterparty_country: "MY", payment_method: "cash", doc_ref: null, description: "Exhibition fee paid in cash, no receipt", amount_includes_tax: null, confidence: 0.82 } }
];

export const INV_EXAMPLES: { lang: Lang; tag: string; text: string; inv: InvoiceInput }[] = [
  { lang: "en-MY", tag: "EN", text: "Invoice Klinik Mawar RM8,000 for the September retainer plus two training days at RM750 each, 30 day terms",
    inv: { customer: "Klinik Mawar", customer_tin: "C12345678900", customer_country: "MY", customer_type: "customer", date: TODAY, terms_days: 30,
      items: [{ description: "September retainer", qty: 1, unit_price: 8000, category: "sales_services" }, { description: "Training day", qty: 2, unit_price: 750, category: "sales_services" }], confidence: 0.93 } },
  { lang: "ms-MY", tag: "BM", text: "Buat invois Sunrise Dental RM18,000 yuran bulanan September, bayar dalam 14 hari",
    inv: { customer: "Sunrise Dental Group", customer_tin: "C99887766554", customer_country: "MY", customer_type: "customer", date: TODAY, terms_days: 14,
      items: [{ description: "Yuran bulanan September", qty: 1, unit_price: 18000, category: "sales_services" }], confidence: 0.92 } },
  { lang: "zh-CN", tag: "中文", text: "给 Acme Logistics 开 25,000 令吉的共享服务发票，30 天付款",
    inv: { customer: "Acme Logistics Sdn Bhd", customer_tin: "C55443322110", customer_country: "MY", customer_type: "related_entity", date: TODAY, terms_days: 30,
      items: [{ description: "Shared services — September", qty: 1, unit_price: 25000, category: "sales_services" }], confidence: 0.9 } }
];

export const ASK_EXAMPLES: { lang: Lang; tag: string; text: string }[] = [
  { lang: "en-MY", tag: "EN", text: "Who owes me money and how overdue are they?" },
  { lang: "en-MY", tag: "EN", text: "How much profit did we make and where did the money go?" },
  { lang: "en-MY", tag: "EN", text: "How much service tax will I have to pay, and when?" },
  { lang: "ms-MY", tag: "BM", text: "Siapa yang masih belum bayar saya?" },
  { lang: "ms-MY", tag: "BM", text: "Berapa untung bulan ini dan berapa duit dalam bank?" },
  { lang: "zh-CN", tag: "中文", text: "谁还欠我钱？逾期多久了？" },
  { lang: "zh-CN", tag: "中文", text: "这个月利润多少？银行里还有多少现金？" }
];
