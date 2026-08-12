import { NextResponse } from "next/server";
import { requireEntitledWorkspace } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const context = await requireEntitledWorkspace();
    const supabase = await createServerSupabaseClient();
    const [{ data: invoices }, { data: expenses }] = await Promise.all([
      supabase.from("invoices").select("total").eq("workspace_id", context.workspaceId).neq("status", "void"),
      supabase.from("expenses").select("amount").eq("workspace_id", context.workspaceId)
    ]);
    const income = (invoices || []).reduce((sum, item) => sum + Number(item.total), 0);
    const expenseTotal = (expenses || []).reduce((sum, item) => sum + Number(item.amount), 0);
    return NextResponse.json({ income, expenses: expenseTotal, profit: income - expenseTotal, basis: "approved invoice totals less approved expenses" });
  } catch (error) { return jsonError(error); }
}
