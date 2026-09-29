import { NextResponse } from "next/server";
import { requireEntitledWorkspace } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { malaysiaToday } from "@/lib/ledger/catalog";
import { INVOICE_SCHEMA, invoiceInstructions, TX_SCHEMA, txInstructions } from "@/lib/ledger/prompts";
import { findEntity, loadEntities } from "@/lib/ledger-server";
import { openai } from "@/lib/openai";
import { enforceRateLimit } from "@/lib/rate-limit";
import { extractRequestSchema, invoiceInputSchema, txInputSchema } from "@/lib/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/* Words in, fields out. The model never sees the rule engine's decisions and never posts. */
export async function POST(request: Request) {
  try {
    const context = await requireEntitledWorkspace();
    await enforceRateLimit("ai-extract", context.user.id, 20);
    const input = extractRequestSchema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    const entities = await loadEntities(supabase, context.workspaceId);
    const entity = findEntity(entities, input.entityId);
    const company = { name: entity.name, base: entity.base, others: entities.filter((e) => e.id !== entity.id).map((e) => e.name) };
    const today = malaysiaToday();
    const isTx = input.mode === "tx";

    const response = await openai().responses.create({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5-mini",
      input: [
        { role: "system", content: isTx ? txInstructions(today, company) : invoiceInstructions(today, company) },
        { role: "user", content: input.text }
      ],
      text: { format: { type: "json_schema", name: isTx ? "ledger_transaction" : "sales_invoice", strict: true, schema: isTx ? TX_SCHEMA : INVOICE_SCHEMA } }
    });

    if (!response.output_text) return NextResponse.json({ error: "That came back empty. Say it again, a little more plainly." }, { status: 422 });
    const raw = JSON.parse(response.output_text) as Record<string, unknown>;
    const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0));
    const fields = isTx ? txInputSchema.safeParse({ ...raw, confidence }) : invoiceInputSchema.safeParse({ ...raw, confidence });
    if (!fields.success) return NextResponse.json({ error: "That came back garbled. Say it again, a little more plainly." }, { status: 422 });
    return NextResponse.json({ fields: fields.data });
  } catch (error) {
    return jsonError(error);
  }
}
