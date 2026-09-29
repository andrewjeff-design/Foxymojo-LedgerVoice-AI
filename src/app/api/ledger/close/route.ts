import { NextResponse } from "next/server";
import { requireEntitledWorkspace, requireWriter } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { malaysiaToday } from "@/lib/ledger/catalog";
import { closeStatus } from "@/lib/ledger/modules";
import { audit, findEntity, loadClose, loadEntities, loadEntries } from "@/lib/ledger-server";
import { closeSchema } from "@/lib/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const context = await requireEntitledWorkspace();
    requireWriter(context);
    const input = closeSchema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    const entities = await loadEntities(supabase, context.workspaceId);
    const entity = findEntity(entities, input.entityId);
    const key = { entity_id: entity.id, workspace_id: context.workspaceId, month: input.month };

    const { data: signed } = await supabase.from("ledger_close_signoffs").select("month").eq("entity_id", entity.id).eq("month", input.month).maybeSingle();

    if (input.action === "tick" || input.action === "untick") {
      if (signed) throw new Response("The month is signed off", { status: 409, statusText: "The month is signed off; reopen it first" });
      const { error } = input.action === "tick"
        ? await supabase.from("ledger_close_marks").insert({ ...key, item: input.item, ticked_by: context.user.id })
        : await supabase.from("ledger_close_marks").delete().eq("entity_id", entity.id).eq("month", input.month).eq("item", input.item);
      /* ticking twice is not an error */
      if (error && error.code !== "23505") throw error;
    } else if (input.action === "signoff") {
      if (signed) throw new Response("Already signed off", { status: 409, statusText: "Already signed off" });
      /* the server checks readiness itself; a month is never signed off with items open */
      const [entries, close] = await Promise.all([loadEntries(supabase, context.workspaceId, entities, entity.id), loadClose(supabase, context.workspaceId)]);
      const cs = closeStatus(entries, input.month, { ticks: close.ticks[entity.id] || {}, sstRegistered: entity.sstRegistered });
      if (!cs.ready) throw new Response("Items are still open", { status: 422, statusText: (cs.total - cs.done) + " close items are still open" });
      const { error } = await supabase.from("ledger_close_signoffs").insert({ ...key, signed_by_name: input.name, signed_by: context.user.id, signed_on: malaysiaToday() });
      if (error) throw error;
    } else {
      const { error } = await supabase.from("ledger_close_signoffs").delete().eq("entity_id", entity.id).eq("month", input.month);
      if (error) throw error;
    }
    await audit(supabase, context.workspaceId, context.user.id, "close." + input.action, "ledger_entity", entity.id, { month: input.month, item: "item" in input ? input.item : null });
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
