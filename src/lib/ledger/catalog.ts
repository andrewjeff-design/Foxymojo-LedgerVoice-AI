/* Plans, add-ons, the go-live list, the demo companies and the rates on file. */

import type { Entity } from "./types";

export type PlanId = "starter" | "business" | "group";
export type BillingPeriod = "monthly" | "annual";

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  popular?: boolean;
  entities: number | "Unlimited";
  users: number | "Unlimited";
  items: number;
  blurb: string;
  features: string[];
};

export const PLANS: Plan[] = [
  { id: "starter", name: "Starter", price: 249, entities: 1, users: 2, items: 500,
    blurb: "One company doing its own books, with an accountant reviewing at month end.",
    features: ["Voice and text capture in English, Bahasa Melayu and 中文", "The full Malaysian rule pack: MPERS, SST, e-Invoice", "Invoices with tax, terms and the journal behind them", "Trial balance, P&L, balance sheet and cash flow", "Audit trail and CSV export"] },
  { id: "business", name: "Business", price: 690, popular: true, entities: 3, users: 10, items: 3000,
    blurb: "A finance team that bills customers, files SST and closes every month.",
    features: ["Everything in Starter", "SST return working and threshold watch", "MyInvois submission and self-billed invoices", "Approval rules by amount, by type and by person", "WhatsApp and email capture", "Month-end close checklist"] },
  { id: "group", name: "Group", price: 1890, entities: "Unlimited", users: "Unlimited", items: 12000,
    blurb: "More than one company, or one company heading for a listing.",
    features: ["Everything in Business", "Intercompany mirror entries and eliminations", "FX translation to your reporting currency", "Bursa diligence pack and related-party register", "API access and single sign-on", "Named onboarding and a quarterly review"] }
];

export const planById = (id?: string | null) => PLANS.find((p) => p.id === id) || null;
/* annual billing is ten months for twelve */
export const annualPrice = (p: Plan) => p.price * 10;

export const ADDONS: [string, string][] = [
  ["Extra entity", "RM 120 / month"], ["Extra 1,000 documents", "RM 180 / month"], ["Extra user seat", "RM 45 / month"],
  ["Data migration and opening balances", "RM 2,500 one-off"], ["Monthly review by a chartered accountant", "RM 1,200 / month"],
  ["On-premise or in-country data handling", "+35% on the plan"]
];

export const GO_LIVE = [
  "Real authentication with MFA, and password reset that works",
  "Payment gateway and recurring billing in ringgit (Billplz, Stripe or iPay88)",
  "MyInvois client credentials, plus the TIN and MSIC codes of every customer",
  "Bank feed or statement import, with a reconciliation screen",
  "Data hosted in Malaysia or Singapore, with a signed data-processing note (PDPA)",
  "Daily backups and a tested restore",
  "Support channel with a response time you can promise",
  "A dated rule pack with a re-verification routine every quarter"
];

export const DEMO_TODAY = "2026-09-24";

export const DEMO_ENTITIES: Entity[] = [
  { id: "acme", name: "Acme Trading Sdn Bhd", demo: true, base: "MYR", sstRegistered: true, taxableTurnover12m: 780000, annualTurnover: 4200000, capPolicy: 2000, approvalLimit: 5000,
    tin: "C12345678900", brn: "202301012345", msic: "62010", sstNo: "W10-1808-32000123",
    address: { line1: "Level 12, Menara Acme", city: "Kuala Lumpur", postcode: "50400", state: "14", country: "MYS" } },
  { id: "mawar", name: "Mawar Services Sdn Bhd", demo: true, base: "MYR", sstRegistered: false, taxableTurnover12m: 470000, annualTurnover: 1200000, capPolicy: 2000, approvalLimit: 5000 },
  { id: "logistics", name: "Acme Logistics Sdn Bhd", demo: true, base: "MYR", sstRegistered: true, taxableTurnover12m: 2100000, annualTurnover: 6000000, capPolicy: 2000, approvalLimit: 5000 }
];

/* Rates on file. The engine refuses to post a currency it has no rate for; production should
   load the Bank Negara reference rate for the transaction date instead of this table. */
export const FX_RATES: Record<string, number> = { "SGD/MYR": 3.2, "USD/MYR": 4.08, "IDR/MYR": 0.00025 };

export const SST_GROUP_OPTIONS: [string, string][] = [
  ["professional", "Professional · 8%"],
  ["digital", "Digital / software · 8%"],
  ["construction", "Construction works · 8%"],
  ["financial", "Financial · 8%"],
  ["wellness", "Wellness and beauty · 8%"],
  ["rental", "Rental or leasing · 6%"],
  ["logistics", "Logistics · 6%"],
  ["fnb", "Food and beverage · 6%"],
  ["none", "Not a taxable service"]
];

/* Today's date in Malaysia, which is what the books are kept in. */
export function malaysiaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/* Whole days of trial left, counted from today's date in Malaysia. */
export function trialDaysLeft(trialEndsAt: string | null, today: string) {
  if (!trialEndsAt) return null;
  return Math.max(0, Math.round((new Date(trialEndsAt).getTime() - new Date(today + "T00:00:00+08:00").getTime()) / 86400000));
}
