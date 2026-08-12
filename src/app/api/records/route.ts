import { NextResponse } from "next/server";
import { requireEntitledWorkspace } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { saveRecordSchema } from "@/lib/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const context = await requireEntitledWorkspace();
    const supabase = await createServerSupabaseClient();
    const [{ data: invoices }, { data: expenses }] = await Promise.all([
      supabase.from("invoices").select("id, description, total, currency, issue_date, status, customers(name)").eq("workspace_id", context.workspaceId).order("created_at", { ascending: false }).limit(20),
      supabase.from("expenses").select("id, merchant, description, amount, currency, expense_date, deduction_review").eq("workspace_id", context.workspaceId).order("created_at", { ascending: false }).limit(20)
    ]);

    const records = [
      ...(invoices || []).map((item) => ({ id: item.id, kind: "invoice", party: item.customers?.[0]?.name || "Customer", description: item.description, amount: Number(item.total), currency: item.currency, date: item.issue_date, status: item.status })),
      ...(expenses || []).map((item) => ({ id: item.id, kind: "expense", party: item.merchant, description: item.description, amount: Number(item.amount), currency: item.currency, date: item.expense_date, status: item.deduction_review }))
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25);

    return NextResponse.json({ records });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireEntitledWorkspace();
    if (context.role === "viewer") throw new Response("View-only account", { status: 403, statusText: "View-only account" });
    const input = saveRecordSchema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    const approvedAt = new Date().toISOString();

    if (input.kind === "invoice") {
      const { data: existing } = await supabase.from("customers").select("id").eq("workspace_id", context.workspaceId).ilike("name", input.party).limit(1).maybeSingle();
      let customerId = existing?.id;
      if (!customerId) {
        const { data: customer, error } = await supabase.from("customers").insert({ workspace_id: context.workspaceId, name: input.party, created_by: context.user.id }).select("id").single();
        if (error) throw error;
        customerId = customer.id;
      }
      const invoiceNumber = `INV-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-8)}`;
      const { data: record, error } = await supabase.from("invoices").insert({
        workspace_id: context.workspaceId, customer_id: customerId, invoice_number: invoiceNumber,
        country: input.country, currency: input.currency, status: "sent", issue_date: input.issueDate,
        due_date: input.dueDate, subtotal: input.amount, tax_total: 0, total: input.amount,
        description: input.description, source_transcript: input.sourceTranscript,
        approved_by: context.user.id, approved_at: approvedAt, created_by: context.user.id
      }).select("id").single();
      if (error) throw error;
      await supabase.from("audit_logs").insert({ workspace_id: context.workspaceId, actor_user_id: context.user.id, action: "invoice.approved", entity_type: "invoice", entity_id: record.id, metadata: { invoice_number: invoiceNumber } });
      return NextResponse.json({ id: record.id, invoiceNumber }, { status: 201 });
    }

    const { data: record, error } = await supabase.from("expenses").insert({
      workspace_id: context.workspaceId, merchant: input.party, expense_date: input.expenseDate,
      country: input.country, currency: input.currency, amount: input.amount, category: input.category,
      business_use_percent: input.businessUsePercent, deduction_review: "review", description: input.description,
      source_transcript: input.sourceTranscript, approved_by: context.user.id, approved_at: approvedAt, created_by: context.user.id
    }).select("id").single();
    if (error) throw error;
    await supabase.from("audit_logs").insert({ workspace_id: context.workspaceId, actor_user_id: context.user.id, action: "expense.approved", entity_type: "expense", entity_id: record.id, metadata: { deduction_review: "review" } });
    return NextResponse.json({ id: record.id }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
