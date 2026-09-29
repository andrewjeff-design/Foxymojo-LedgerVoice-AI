import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireWorkspaceContext } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { audit } from "@/lib/ledger-server";
import { inviteSchema } from "@/lib/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/* The list of people asked to join. Nobody is emailed from here yet. */
export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    requireAdmin(context);
    const input = inviteSchema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("workspace_invites").insert({ workspace_id: context.workspaceId, email: input.email.toLowerCase(), role: input.role, invited_by: context.user.id });
    if (error && error.code !== "23505") throw error;
    await audit(supabase, context.workspaceId, context.user.id, "invite.added", "workspace_invite", input.email.toLowerCase(), { role: input.role });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    requireAdmin(context);
    const email = z.email().parse(new URL(request.url).searchParams.get("email"));
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("workspace_invites").delete().eq("workspace_id", context.workspaceId).eq("email", email.toLowerCase());
    if (error) throw error;
    await audit(supabase, context.workspaceId, context.user.id, "invite.removed", "workspace_invite", email.toLowerCase());
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
