import { z } from "zod";
import { TX_CATEGORIES } from "@/lib/ledger/rules";
import { CLOSE_ITEMS } from "@/lib/ledger/modules";

const text = (max: number) => z.string().trim().max(max);
const money = z.number().finite().min(0).max(1_000_000_000);
const isoDate = z.iso.date();

/* The fields the model (or a person) extracted. The server re-runs the rule engine on them;
   nothing here is trusted as accounting. */
export const txInputSchema = z.object({
  date: isoDate.nullable().optional(),
  direction: z.enum(["spend", "receive"]),
  category: z.enum(TX_CATEGORIES as [string, ...string[]]),
  amount: money,
  currency: z.enum(["MYR", "SGD", "USD", "IDR", "EUR", "GBP"]).optional(),
  amount_includes_tax: z.boolean().nullable().optional(),
  counterparty: text(160).optional(),
  counterparty_type: z.enum(["customer", "supplier", "director", "shareholder", "related_entity", "related_party", "staff", "bank", "unknown"]).optional(),
  counterparty_country: text(8).optional(),
  description: text(1000).optional(),
  payment_method: z.enum(["bank", "cash", "card", "unknown"]).optional(),
  doc_ref: text(80).nullable().optional(),
  settled: z.boolean().optional(),
  lease_months: z.number().int().min(0).max(1200).nullable().optional(),
  applies: text(80).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(["bank_statement"]).optional(),
  bank_line: z.number().int().optional(),
  needsReview: z.boolean().optional()
});

export const invoiceInputSchema = z.object({
  customer: text(160).nullable().optional(),
  customer_tin: text(20).nullable().optional(),
  customer_country: text(8).optional(),
  customer_type: z.enum(["customer", "related_entity"]).optional(),
  date: isoDate.nullable().optional(),
  terms_days: z.number().int().min(0).max(365).optional(),
  currency: z.enum(["MYR", "SGD", "USD"]).optional(),
  items: z.array(z.object({
    description: text(300),
    qty: z.number().positive().max(1_000_000),
    unit_price: money,
    category: z.enum(["sales_services", "sales_goods"]).optional()
  })).min(1).max(50),
  confidence: z.number().min(0).max(1).optional()
});

const approverName = z.string().trim().min(1, "Type a name first — nothing posts anonymously.").max(120);

export const postEntrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tx"), entityId: z.uuid(), input: txInputSchema, utterance: text(4000), approver: approverName, decision: z.enum(["posted", "rejected"]) }),
  z.object({ kind: z.literal("invoice"), entityId: z.uuid(), input: invoiceInputSchema, utterance: text(4000), approver: approverName, decision: z.enum(["posted", "rejected"]) })
]);

export const draftsSchema = z.object({
  entityId: z.uuid(),
  rows: z.array(txInputSchema.extend({ source: z.literal("bank_statement") })).min(1).max(200),
  utterances: z.array(text(600)).max(200)
});

export const decideSchema = z.object({ approver: approverName, decision: z.enum(["posted", "rejected"]) });

export const closeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["tick", "untick"]), entityId: z.uuid(), month: z.string().regex(/^\d{4}-\d{2}$/), item: z.enum(CLOSE_ITEMS) }),
  z.object({ action: z.literal("signoff"), entityId: z.uuid(), month: z.string().regex(/^\d{4}-\d{2}$/), name: approverName }),
  z.object({ action: z.literal("reopen"), entityId: z.uuid(), month: z.string().regex(/^\d{4}-\d{2}$/) })
]);

export const entitySchema = z.object({
  name: z.string().trim().min(1, "The registered name is needed.").max(160),
  ssm: text(40).optional().default(""),
  entityType: text(60).optional().default("Sdn Bhd"),
  fye: text(40).optional().default("31 December"),
  base: z.enum(["MYR", "SGD", "USD"]).optional().default("MYR"),
  sstRegistered: z.boolean(),
  sstNo: text(40).optional().default(""),
  sstGroup: z.enum(["professional", "digital", "construction", "financial", "wellness", "rental", "logistics", "fnb", "none"]).optional().default("professional"),
  annualTurnover: money,
  tin: text(20).optional().default(""),
  capPolicy: money.optional().default(2000),
  approvalLimit: money.optional().default(5000),
  approver: text(120).optional().default(""),
  approverRole: text(60).optional().default(""),
  langs: z.array(z.enum(["en", "ms", "zh"])).min(1).optional().default(["en", "ms", "zh"]),
  msic: text(10).optional().default(""),
  address: z.object({ line1: text(160).optional(), city: text(80).optional(), postcode: text(10).optional(), state: text(4).optional() }).optional().default({})
}).refine((v) => !v.sstRegistered || v.sstNo.length > 0, { message: "Add the SST registration number, or untick registration.", path: ["sstNo"] });

export const extractRequestSchema = z.object({
  mode: z.enum(["tx", "invoice"]),
  text: z.string().trim().min(3).max(4000),
  entityId: z.uuid()
});

export const askSchema = z.object({ question: z.string().trim().min(3).max(1000), entityId: z.uuid() });

export const commentarySchema = z.object({ entityId: z.uuid(), from: isoDate.nullable(), to: isoDate, label: text(80) });

export const inviteSchema = z.object({ email: z.email().max(200), role: z.enum(["Approver", "Recorder", "Viewer", "External accountant"]) });

export const goLiveSchema = z.object({ item: z.string().regex(/^gl\d{1,2}$/), done: z.boolean() });
