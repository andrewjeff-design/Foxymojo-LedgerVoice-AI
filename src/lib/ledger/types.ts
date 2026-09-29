/* Shared shapes for the Ledger VoiceAI engine, the stores and the UI. */

export type FlagLevel = "stop" | "warn";
export type Flag = { level: FlagLevel; text: string };
export type AppliedRule = { pack: string; id: string; text: string; cite: string };

export type JournalLine = { code: string; account: string; dr: number; cr: number };

export type Address = { line1?: string; line2?: string; line3?: string; city?: string; postcode?: string; state?: string; country?: string };

export type Entity = {
  id: string;
  name: string;
  base: string;
  demo?: boolean;
  sstRegistered: boolean;
  /* rolling twelve-month taxable turnover before anything posted in the app */
  taxableTurnover12m: number;
  annualTurnover: number;
  capPolicy: number;
  approvalLimit: number;
  sstNo?: string;
  sstGroup?: string;
  tin?: string;
  brn?: string;
  ssm?: string;
  msic?: string;
  entityType?: string;
  fye?: string;
  approver?: string;
  approverRole?: string;
  langs?: string[];
  address?: Address;
};

export type RuleContext = {
  entityId: string;
  entities: Entity[];
  fx: Record<string, number>;
  nextInvoiceNo?: () => string;
  today?: string;
};

export type Direction = "spend" | "receive";

export type TxInput = {
  entity_id?: string;
  date?: string | null;
  direction?: Direction;
  category?: string;
  amount?: number;
  currency?: string;
  amount_includes_tax?: boolean | null;
  counterparty?: string;
  counterparty_type?: string;
  counterparty_country?: string;
  counterparty_entity_id?: string;
  description?: string;
  payment_method?: string;
  doc_ref?: string | null;
  settled?: boolean;
  lease_months?: number | null;
  confidence?: number;
  applies?: string | null;
  source?: string;
  bank_line?: number;
  needsReview?: boolean;
};

export type InvoiceItemInput = { description?: string; qty?: number; unit_price?: number; category?: string };

export type InvoiceInput = {
  entity_id?: string;
  number?: string;
  customer?: string | null;
  customer_tin?: string | null;
  customer_country?: string;
  customer_type?: string;
  date?: string | null;
  terms_days?: number;
  currency?: string;
  items?: InvoiceItemInput[];
  amount?: number;
  description?: string;
  category?: string;
  confidence?: number;
};

export type Approval = { required: boolean; reasons: string[]; blocked: boolean };

export type TxProposal = {
  kind: "tx";
  version: string;
  verified: string;
  entity: string;
  entityId: string;
  base: string;
  date: string | null;
  description: string;
  currency: string;
  fx: number | null;
  gross: number;
  tax: { group: string; rate: number; base: number; amount: number; reverseCharge: boolean; label: string };
  capitalise: boolean;
  related: boolean;
  mirror: { entity: string; note: string } | null;
  lines: JournalLine[];
  totalDr: number;
  totalCr: number;
  balanced: boolean;
  flags: Flag[];
  notes: string[];
  rules: AppliedRule[];
  ask: string[];
  approval: Approval;
};

export type InvoiceItem = {
  description: string;
  qty: number;
  unit: number;
  amount: number;
  category: string;
  group: string;
  rate: number;
  tax: number;
  acc: string;
  label: string;
  cite: string;
};

export type InvoiceProposal = {
  kind: "invoice";
  version: string;
  verified: string;
  entity: string;
  entityId: string;
  base: string;
  currency: string;
  fx: number | null;
  number: string;
  date: string;
  due: string;
  terms: number;
  customer: string | null;
  customer_tin: string | null;
  customer_country: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  grossTotal: number;
  einvoice: boolean;
  lines: JournalLine[];
  totalDr: number;
  totalCr: number;
  balanced: boolean;
  flags: Flag[];
  rules: AppliedRule[];
  notes: string[];
  ask: string[];
  mirror?: null;
  approval: Approval;
};

export type Proposal = TxProposal | InvoiceProposal;

export type InvoiceRecord = {
  number: string;
  customer: string | null;
  customer_tin?: string | null;
  date?: string;
  due: string;
  total: number;
  tax: number;
  group: string;
  currency?: string;
  items?: { description: string; qty: number; unit_price: number; category?: string }[];
};

export type EntryStatus = "posted" | "draft" | "rejected";
export type EntryType = "opening" | "transaction" | "settlement" | "invoice";

/* A journal as stored: one approved (or rejected, or waiting) event in one entity. */
export type Entry = {
  id: string;
  at?: string;
  date: string;
  entityId: string;
  entity: string;
  type: EntryType;
  desc: string;
  amount: number;
  base?: string;
  taxAmount: number;
  taxGroup?: string | null;
  docRef?: string | null;
  counterparty?: string | null;
  applies?: string | null;
  inv?: InvoiceRecord | null;
  lines: JournalLine[];
  approver: string;
  status: EntryStatus;
  utterance: string;
  version: string;
  revenueBase: number;
  badges: string[];
  source?: string | null;
};

export type CloseState = {
  ticks: Record<string, Record<string, boolean>>;
  signoffs: Record<string, Record<string, { by: string; on: string }>>;
};
