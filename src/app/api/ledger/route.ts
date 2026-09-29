import { NextResponse } from "next/server";
import { requireEntitledWorkspace } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { malaysiaToday } from "@/lib/ledger/catalog";
import { loadClose, loadEntities, loadEntries } from "@/lib/ledger-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const context = await requireEntitledWorkspace();
    const supabase = await createServerSupabaseClient();
    const entities = await loadEntities(supabase, context.workspaceId);
    const [entries, close] = await Promise.all([loadEntries(supabase, context.workspaceId, entities), loadClose(supabase, context.workspaceId)]);
    return NextResponse.json({ entities, entries, close, today: malaysiaToday() });
  } catch (error) { return jsonError(error); }
}
