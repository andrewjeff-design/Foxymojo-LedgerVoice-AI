import { NextResponse } from "next/server";
import { requireEntitledWorkspace } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { FX_RATES, malaysiaToday } from "@/lib/ledger/catalog";
import { withPostedTurnover } from "@/lib/ledger/entries";
import { buildAskPack } from "@/lib/ledger/modules";
import { askInstructions } from "@/lib/ledger/prompts";
import { findEntity, loadEntities, loadEntries } from "@/lib/ledger-server";
import { openai } from "@/lib/openai";
import { enforceRateLimit } from "@/lib/rate-limit";
import { askSchema } from "@/lib/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/* The server foots the figures from the posted journals itself, then asks the model only to
   put them into sentences. */
export async function POST(request: Request) {
  try {
    const context = await requireEntitledWorkspace();
    await enforceRateLimit("ai-ask", context.user.id, 20);
    const input = askSchema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    const entities = await loadEntities(supabase, context.workspaceId);
    findEntity(entities, input.entityId);
    const entries = await loadEntries(supabase, context.workspaceId, entities, input.entityId);
    const today = malaysiaToday();
    const entity = withPostedTurnover({ entityId: input.entityId, entities, fx: FX_RATES }, entries).entities.find((e) => e.id === input.entityId)!;
    const pack = buildAskPack(entries, entity, today);

    const response = await openai().responses.create({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5-mini",
      input: [
        { role: "system", content: askInstructions(today, pack) },
        { role: "user", content: input.question }
      ]
    });
    if (!response.output_text) return NextResponse.json({ error: "No answer came back." }, { status: 422 });
    return NextResponse.json({ text: response.output_text });
  } catch (error) { return jsonError(error); }
}
