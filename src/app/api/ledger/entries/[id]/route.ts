import { NextResponse } from "next/server";
import { z } from "zod";
import { requireEntitledWorkspace, requireWriter } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { audit } from "@/lib/ledger-server";
import { decideSchema } from "@/lib/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/* Approve or reject a draft - the bank-statement lines wait here for a named person. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireEntitledWorkspace();
    requireWriter(context);
    const id = z.uuid().parse((await params).id);
    const input = decideSchema.parse(await request.json());
    const supabase = await createServerSupabaseClient();

    const { data: draft, error: readError } = await supabase.from("ledger_entries")
      .select("id, status, lines, entity_id").eq("id", id).eq("workspace_id", context.workspaceId).maybeSingle();
    if (readError) throw readError;
    if (!draft) throw new Response("Entry not found", { status: 404, statusText: "Entry not found" });
    if (draft.status !== "draft") throw new Response("Only a draft can be decided", { status: 409, statusText: "Only a draft can be decided" });

    const lines = (draft.lines || []) as { dr: number; cr: number }[];
    const dr = lines.reduce((s, l) => s + Number(l.dr || 0), 0);
    const cr = lines.reduce((s, l) => s + Number(l.cr || 0), 0);
    if (input.decision === "posted" && (!lines.length || Math.abs(dr - cr) >= 0.005)) {
      throw new Response("This draft does not balance", { status: 422, statusText: "This draft does not balance" });
    }

    const { error } = await supabase.from("ledger_entries").update({
      status: input.decision, approver_name: input.approver, approved_by: context.user.id, approved_at: new Date().toISOString()
    }).eq("id", id).eq("status", "draft");
    if (error) throw error;
    await audit(supabase, context.workspaceId, context.user.id, "ledger_entry." + input.decision, "ledger_entry", id, { entity_id: draft.entity_id, approver_name: input.approver, from: "draft" });
    return NextResponse.json({ id });
  } catch (error) { return jsonError(error); }
}
