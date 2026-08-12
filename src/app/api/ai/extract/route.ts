import { NextResponse } from "next/server";
import { requireEntitledWorkspace } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { openai } from "@/lib/openai";
import { enforceRateLimit } from "@/lib/rate-limit";
import { extractRequestSchema, financeDraftSchema } from "@/lib/schemas";

export const runtime = "nodejs";

const currencies = { MY: "MYR", SG: "SGD", AU: "AUD", ID: "IDR" } as const;

export async function POST(request: Request) {
  try {
    const context = await requireEntitledWorkspace();
    await enforceRateLimit("ai-extract", context.user.id, 20);
    const input = extractRequestSchema.parse(await request.json());
    const currentDate = new Date().toISOString().slice(0, 10);

    const response = await openai().responses.create({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5-mini",
      input: [
        {
          role: "system",
          content: [
            "You convert a small-business voice transcript into a reviewable finance draft.",
            "Never save, approve, file, pay, submit, or execute anything.",
            "Extract only facts supported by the transcript. Put ambiguities in warnings.",
            "Use ISO dates (YYYY-MM-DD). A missing date must be null.",
            "Do not decide whether an expense is tax deductible and do not give tax advice.",
            `Today is ${currentDate}. Jurisdiction is ${input.country}; default currency is ${currencies[input.country]}.`
          ].join(" ")
        },
        { role: "user", content: input.transcript }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "finance_draft",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "party", "description", "amount", "currency", "transactionDate", "dueDate", "category", "businessUsePercent", "confidence", "warnings"],
            properties: {
              kind: { type: "string", enum: ["invoice", "expense"] },
              party: { type: "string" },
              description: { type: "string" },
              amount: { type: "number", minimum: 0 },
              currency: { type: "string", enum: ["MYR", "SGD", "AUD", "IDR"] },
              transactionDate: { type: ["string", "null"] },
              dueDate: { type: ["string", "null"] },
              category: { type: "string" },
              businessUsePercent: { type: "number", minimum: 0, maximum: 100 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              warnings: { type: "array", maxItems: 10, items: { type: "string" } }
            }
          }
        }
      }
    });

    if (!response.output_text) return NextResponse.json({ error: "The command could not be structured safely." }, { status: 422 });
    return NextResponse.json({ draft: financeDraftSchema.parse(JSON.parse(response.output_text)) });
  } catch (error) {
    return jsonError(error);
  }
}
