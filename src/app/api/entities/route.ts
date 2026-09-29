import { NextResponse } from "next/server";
import { z } from "zod";
import { isEntitled, requireAdmin, requireWorkspaceContext } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { planById } from "@/lib/ledger/catalog";
import { audit } from "@/lib/ledger-server";
import { entitySchema } from "@/lib/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type EntityInput = z.infer<typeof entitySchema>;

/* The company profile is what teaches the engine: registration decides whether tax is
   charged, turnover decides e-Invoice, and the two thresholds decide what waits for a person. */
function toRow(v: EntityInput) {
  return {
    name: v.name, ssm: v.ssm || null, entity_type: v.entityType, fye: v.fye, base_currency: v.base,
    sst_registered: v.sstRegistered, sst_no: v.sstRegistered ? v.sstNo : null, sst_group: v.sstRegistered ? v.sstGroup : "none",
    annual_turnover: v.annualTurnover,
    /* a registered company's threshold no longer matters; an unregistered one starts from its turnover */
    taxable_turnover_12m: v.sstRegistered ? 0 : v.annualTurnover,
    tin: v.tin || null, brn: v.ssm || null, cap_policy: v.capPolicy, approval_limit: v.approvalLimit,
    approver: v.approver || null, approver_role: v.approverRole || null, langs: v.langs,
    msic: v.msic || null, address: { ...v.address, country: "MYS" }
  };
}

export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    requireAdmin(context);
    const input = entitySchema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    const { count } = await supabase.from("ledger_entities").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId);
    const existing = count || 0;

    if (existing > 0) {
      /* the first company is set up during onboarding; more need a plan that allows them */
      if (!isEntitled(context.subscriptionStatus)) throw new Response("Active subscription required", { status: 402, statusText: "Active subscription required" });
      const plan = planById(context.plan);
      if (plan && plan.entities !== "Unlimited" && existing >= plan.entities) {
        throw new Response("Plan limit", { status: 403, statusText: plan.name + " covers " + plan.entities + " compan" + (plan.entities === 1 ? "y" : "ies") + ". Change plan to add another." });
      }
    }

    const { data, error } = await supabase.from("ledger_entities").insert({ ...toRow(input), workspace_id: context.workspaceId, created_by: context.user.id }).select("id").single();
    if (error) throw error;
    if (existing === 0) await supabase.from("workspaces").update({ name: input.name }).eq("id", context.workspaceId);
    await audit(supabase, context.workspaceId, context.user.id, "entity.created", "ledger_entity", data.id, { name: input.name, sst_registered: input.sstRegistered, annual_turnover: input.annualTurnover });
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    requireAdmin(context);
    const body = await request.json();
    const id = z.uuid().parse(body?.id);
    const input = entitySchema.parse(body);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.from("ledger_entities").update(toRow(input)).eq("id", id).eq("workspace_id", context.workspaceId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Response("Company not found", { status: 404, statusText: "Company not found" });
    await audit(supabase, context.workspaceId, context.user.id, "entity.updated", "ledger_entity", id, { name: input.name, sst_registered: input.sstRegistered, annual_turnover: input.annualTurnover, cap_policy: input.capPolicy, approval_limit: input.approvalLimit });
    return NextResponse.json({ id });
  } catch (error) { return jsonError(error); }
}
