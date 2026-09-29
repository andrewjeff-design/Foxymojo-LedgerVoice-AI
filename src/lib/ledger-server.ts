import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FX_RATES, malaysiaToday } from "@/lib/ledger/catalog";
import { withPostedTurnover } from "@/lib/ledger/entries";
import type { CloseState, Entity, Entry, JournalLine, RuleContext } from "@/lib/ledger/types";

/* ---------- rows <-> the shapes the engine works on ---------- */

type EntityRow = {
  id: string; name: string; ssm: string | null; entity_type: string | null; fye: string | null; base_currency: string;
  sst_registered: boolean; sst_no: string | null; sst_group: string; annual_turnover: number | string; taxable_turnover_12m: number | string;
  tin: string | null; brn: string | null; msic: string | null; address: Entity["address"] | null;
  cap_policy: number | string; approval_limit: number | string; approver: string | null; approver_role: string | null; langs: string[] | null;
};

export const ENTITY_COLUMNS = "id, name, ssm, entity_type, fye, base_currency, sst_registered, sst_no, sst_group, annual_turnover, taxable_turnover_12m, tin, brn, msic, address, cap_policy, approval_limit, approver, approver_role, langs";

export function rowToEntity(r: EntityRow): Entity {
  return {
    id: r.id, name: r.name, base: r.base_currency, sstRegistered: r.sst_registered,
    taxableTurnover12m: Number(r.taxable_turnover_12m || 0), annualTurnover: Number(r.annual_turnover || 0),
    capPolicy: Number(r.cap_policy || 2000), approvalLimit: Number(r.approval_limit || 5000),
    sstNo: r.sst_no || undefined, sstGroup: r.sst_group, tin: r.tin || undefined, brn: r.brn || r.ssm || undefined,
    ssm: r.ssm || undefined, msic: r.msic || undefined, entityType: r.entity_type || undefined, fye: r.fye || undefined,
    approver: r.approver || undefined, approverRole: r.approver_role || undefined, langs: r.langs || undefined,
    address: r.address || undefined
  };
}

type EntryRow = {
  id: string; entity_id: string; entry_date: string; entry_type: Entry["type"]; description: string; amount: number | string;
  base_currency: string; tax_amount: number | string; tax_group: string | null; doc_ref: string | null; counterparty: string | null;
  applies: string | null; invoice: Entry["inv"]; lines: JournalLine[]; status: Entry["status"]; approver_name: string;
  utterance: string; rule_version: string; revenue_base: number | string; badges: string[] | null; source: string | null; created_at: string;
};

export const ENTRY_COLUMNS = "id, entity_id, entry_date, entry_type, description, amount, base_currency, tax_amount, tax_group, doc_ref, counterparty, applies, invoice, lines, status, approver_name, utterance, rule_version, revenue_base, badges, source, created_at";

export function rowToEntry(r: EntryRow, entityName: string): Entry {
  return {
    id: r.id, at: r.created_at, date: r.entry_date, entityId: r.entity_id, entity: entityName, type: r.entry_type,
    desc: r.description, amount: Number(r.amount), base: r.base_currency, taxAmount: Number(r.tax_amount || 0),
    taxGroup: r.tax_group, docRef: r.doc_ref, counterparty: r.counterparty, applies: r.applies, inv: r.invoice,
    lines: (r.lines || []).map((l) => ({ code: String(l.code), account: String(l.account), dr: Number(l.dr || 0), cr: Number(l.cr || 0) })),
    approver: r.approver_name, status: r.status, utterance: r.utterance, version: r.rule_version,
    revenueBase: Number(r.revenue_base || 0), badges: r.badges || [], source: r.source
  };
}

export function entryToRow(e: Entry, workspaceId: string, userId: string) {
  return {
    workspace_id: workspaceId, entity_id: e.entityId, entry_date: e.date, entry_type: e.type,
    description: e.desc.slice(0, 1000), amount: e.amount, base_currency: e.base || "MYR", tax_amount: e.taxAmount || 0,
    tax_group: e.taxGroup || null, doc_ref: e.docRef || null, counterparty: e.counterparty || null, applies: e.applies || null,
    invoice: e.inv || null, lines: e.lines, status: e.status, approver_name: e.approver,
    approved_by: e.status === "draft" ? null : userId, approved_at: e.status === "draft" ? null : new Date().toISOString(),
    utterance: (e.utterance || "").slice(0, 4000), rule_version: e.version, revenue_base: e.revenueBase || 0,
    badges: e.badges || [], source: e.source || null, created_by: userId
  };
}

/* ---------- loading a workspace's books ---------- */

export async function loadEntities(supabase: SupabaseClient, workspaceId: string) {
  const { data, error } = await supabase.from("ledger_entities").select(ENTITY_COLUMNS).eq("workspace_id", workspaceId).order("created_at");
  if (error) throw error;
  return (data as EntityRow[] || []).map(rowToEntity);
}

export async function loadEntries(supabase: SupabaseClient, workspaceId: string, entities: Entity[], entityId?: string) {
  const names = new Map(entities.map((e) => [e.id, e.name]));
  const rows: EntryRow[] = [];
  /* page through: PostgREST caps a single response */
  for (let from = 0; ; from += 1000) {
    let query = supabase.from("ledger_entries").select(ENTRY_COLUMNS).eq("workspace_id", workspaceId);
    if (entityId) query = query.eq("entity_id", entityId);
    const { data, error } = await query.order("entry_date", { ascending: false }).order("created_at", { ascending: false }).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as EntryRow[] || []));
    if (!data || data.length < 1000) break;
  }
  return rows.map((r) => rowToEntry(r, names.get(r.entity_id) || ""));
}

export async function loadClose(supabase: SupabaseClient, workspaceId: string): Promise<CloseState> {
  const [{ data: marks, error: e1 }, { data: signoffs, error: e2 }] = await Promise.all([
    supabase.from("ledger_close_marks").select("entity_id, month, item").eq("workspace_id", workspaceId),
    supabase.from("ledger_close_signoffs").select("entity_id, month, signed_by_name, signed_on").eq("workspace_id", workspaceId)
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const close: CloseState = { ticks: {}, signoffs: {} };
  (marks || []).forEach((m: { entity_id: string; month: string; item: string }) => {
    (close.ticks[m.entity_id] ||= {})[m.month + ":" + m.item] = true;
  });
  (signoffs || []).forEach((s: { entity_id: string; month: string; signed_by_name: string; signed_on: string }) => {
    (close.signoffs[s.entity_id] ||= {})[s.month] = { by: s.signed_by_name, on: s.signed_on };
  });
  return close;
}

export function ruleContext(entities: Entity[], entityId: string, entries: Entry[]): RuleContext {
  return withPostedTurnover({ entityId, entities, fx: FX_RATES, today: malaysiaToday() }, entries);
}

export function findEntity(entities: Entity[], id: string) {
  const entity = entities.find((e) => e.id === id);
  if (!entity) throw new Response("Company not found", { status: 404, statusText: "Company not found" });
  return entity;
}

export async function audit(supabase: SupabaseClient, workspaceId: string, userId: string, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  const { error } = await supabase.from("audit_logs").insert({ workspace_id: workspaceId, actor_user_id: userId, action, entity_type: entityType, entity_id: entityId, metadata });
  if (error) console.error("Audit log write failed", error);
}
