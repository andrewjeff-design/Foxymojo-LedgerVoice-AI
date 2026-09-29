import { NextResponse } from "next/server";
import { requireEntitledWorkspace } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { commentaryInstructions } from "@/lib/ledger/prompts";
import { analysis } from "@/lib/ledger/reports";
import { findEntity, loadEntities, loadEntries } from "@/lib/ledger-server";
import { openai } from "@/lib/openai";
import { enforceRateLimit } from "@/lib/rate-limit";
import { commentarySchema } from "@/lib/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = await requireEntitledWorkspace();
    await enforceRateLimit("ai-commentary", context.user.id, 10);
    const input = commentarySchema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    const entities = await loadEntities(supabase, context.workspaceId);
    findEntity(entities, input.entityId);
    const entries = await loadEntries(supabase, context.workspaceId, entities, input.entityId);
    const an = analysis(entries, input.from, input.to);

    const response = await openai().responses.create({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5-mini",
      input: [{ role: "user", content: commentaryInstructions(input.label, an) }]
    });
    if (!response.output_text) return NextResponse.json({ error: "No commentary came back." }, { status: 422 });
    return NextResponse.json({ text: response.output_text });
  } catch (error) { return jsonError(error); }
}
