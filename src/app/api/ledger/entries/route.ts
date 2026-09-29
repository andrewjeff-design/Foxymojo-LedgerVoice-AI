import { NextResponse } from "next/server";
import { requireEntitledWorkspace, requireWriter } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { malaysiaToday } from "@/lib/ledger/catalog";
import { entryFromInvoice, entryFromTx, nextInvoiceNo } from "@/lib/ledger/entries";
import { propose, proposeInvoice } from "@/lib/ledger/rules";
import { audit, entryToRow, findEntity, loadEntities, loadEntries, ruleContext } from "@/lib/ledger-server";
import { postEntrySchema } from "@/lib/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/* Post (or reject) one captured entry. The browser sends the fields it read and the name of
   the person approving; the server re-runs the rule engine and stores what the engine says. */
export async function POST(request: Request) {
  try {
    const context = await requireEntitledWorkspace();
    requireWriter(context);
    const input = postEntrySchema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    const entities = await loadEntities(supabase, context.workspaceId);
    const entity = findEntity(entities, input.entityId);
    const entries = await loadEntries(supabase, context.workspaceId, entities, entity.id);
    const today = malaysiaToday();
    const common = { id: "", at: new Date().toISOString(), today, entityId: entity.id, approver: input.approver, status: input.decision, utterance: input.utterance };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ctx = { ...ruleContext(entities, entity.id, entries), nextInvoiceNo: () => nextInvoiceNo(entries, entity.id) };
      const entry = input.kind === "tx"
        ? (() => {
          const res = propose({ ...input.input, entity_id: entity.id }, ctx);
          if (input.decision === "posted" && res.approval.blocked) throw new Response("The rule engine blocked this entry", { status: 422, statusText: "The rule engine blocked this entry: " + res.approval.reasons.join(", ") });
          return entryFromTx(res, input.input, common);
        })()
        : (() => {
          const res = proposeInvoice({ ...input.input, entity_id: entity.id }, ctx);
          if (input.decision === "posted" && res.approval.blocked) throw new Response("The rule engine blocked this invoice", { status: 422, statusText: "The rule engine blocked this invoice: " + res.approval.reasons.join(", ") });
          return entryFromInvoice(res, input.input, common);
        })();

      const { data, error } = await supabase.from("ledger_entries").insert(entryToRow(entry, context.workspaceId, context.user.id)).select("id").single();
      /* two people issuing at once can race for an invoice number; take the next one */
      if (error?.code === "23505" && input.kind === "invoice") {
        entries.push({ ...entry, id: "taken-" + attempt });
        continue;
      }
      if (error) throw error;
      await audit(supabase, context.workspaceId, context.user.id, "ledger_entry." + input.decision, "ledger_entry", data.id, {
        entity_id: entity.id, kind: input.kind, amount: entry.amount, rule_version: entry.version, approver_name: input.approver
      });
      return NextResponse.json({ id: data.id }, { status: 201 });
    }
    throw new Response("Could not allocate an invoice number", { status: 409, statusText: "Could not allocate an invoice number, try again" });
  } catch (error) { return jsonError(error); }
}
