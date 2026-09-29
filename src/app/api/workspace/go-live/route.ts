import { NextResponse } from "next/server";
import { requireAdmin, requireWorkspaceContext } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { goLiveSchema } from "@/lib/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    requireAdmin(context);
    const input = goLiveSchema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    const { data, error: readError } = await supabase.from("workspaces").select("go_live").eq("id", context.workspaceId).single();
    if (readError) throw readError;
    const next = { ...((data?.go_live as Record<string, boolean>) || {}), [input.item]: input.done };
    const { error } = await supabase.from("workspaces").update({ go_live: next }).eq("id", context.workspaceId);
    if (error) throw error;
    return NextResponse.json({ goLive: next });
  } catch (error) { return jsonError(error); }
}
