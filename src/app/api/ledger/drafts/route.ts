import { NextResponse } from "next/server";
import { requireEntitledWorkspace, requireWriter } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { malaysiaToday } from "@/lib/ledger/catalog";
import { entryFromTx } from "@/lib/ledger/entries";
import { propose } from "@/lib/ledger/rules";
import { audit, entryToRow, findEntity, loadEntities, loadEntries, ruleContext } from "@/lib/ledger-server";
import { draftsSchema } from "@/lib/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/* Bank-statement lines nobody has accounted for become drafts. Nothing here posts. */
export async function POST(request: Request) {
  try {
    const context = await requireEntitledWorkspace();
    requireWriter(context);
    const input = draftsSchema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    const entities = await loadEntities(supabase, context.workspaceId);
    const entity = findEntity(entities, input.entityId);
    const entries = await loadEntries(supabase, context.workspaceId, entities, entity.id);
    const ctx = ruleContext(entities, entity.id, entries);
    const today = malaysiaToday();

    const rows = input.rows.flatMap((tx, i) => {
      const res = propose({ ...tx, entity_id: entity.id }, ctx);
      if (!res.balanced || res.approval.blocked) return [];
      const entry = entryFromTx(res, tx, {
        id: "", at: new Date().toISOString(), today, entityId: entity.id, approver: "", status: "draft",
        utterance: "Imported from the bank statement: \"" + (input.utterances[i] || tx.description || "") + "\""
      });
      entry.badges = res.flags.map((f) => f.text).slice(0, 2);
      return [entryToRow(entry, context.workspaceId, context.user.id)];
    });
    if (rows.length) {
      const { error } = await supabase.from("ledger_entries").insert(rows);
      if (error) throw error;
      await audit(supabase, context.workspaceId, context.user.id, "ledger_entry.drafted", "ledger_entity", entity.id, { count: rows.length, source: "bank_statement" });
    }
    return NextResponse.json({ made: rows.length }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
