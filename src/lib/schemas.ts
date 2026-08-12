import { z } from "zod";

export const countrySchema = z.enum(["MY", "SG", "AU", "ID"]);
export const currencySchema = z.enum(["MYR", "SGD", "AUD", "IDR"]);

export const extractRequestSchema = z.object({
  transcript: z.string().trim().min(3).max(4000),
  country: countrySchema
});

export const financeDraftSchema = z.object({
  kind: z.enum(["invoice", "expense"]),
  party: z.string().max(160),
  description: z.string().max(1000),
  amount: z.number().nonnegative().max(1_000_000_000),
  currency: currencySchema,
  transactionDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  category: z.string().max(100),
  businessUsePercent: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().max(300)).max(10)
});

export const saveRecordSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("invoice"),
    party: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1000),
    amount: z.number().nonnegative().max(1_000_000_000),
    currency: currencySchema,
    country: countrySchema,
    issueDate: z.iso.date(),
    dueDate: z.iso.date().nullable(),
    sourceTranscript: z.string().max(4000).nullable()
  }),
  z.object({
    kind: z.literal("expense"),
    party: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1000),
    amount: z.number().nonnegative().max(1_000_000_000),
    currency: currencySchema,
    country: countrySchema,
    expenseDate: z.iso.date(),
    category: z.string().trim().min(1).max(100),
    businessUsePercent: z.number().min(0).max(100),
    deductionReview: z.enum(["likely", "review", "unlikely"]),
    sourceTranscript: z.string().max(4000).nullable()
  })
]);
