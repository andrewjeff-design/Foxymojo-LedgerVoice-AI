-- Ledger VoiceAI: companies, double-entry journals, month-end close and invites.
-- Run after 0001_initial.sql. Journals are written by the server after it re-runs the
-- Malaysian rule engine; the browser never supplies the accounting.

create table public.ledger_entities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  ssm text,
  entity_type text,
  fye text,
  base_currency text not null default 'MYR' check (base_currency in ('MYR', 'SGD', 'USD')),
  sst_registered boolean not null default false,
  sst_no text,
  sst_group text not null default 'professional',
  annual_turnover numeric(18,2) not null default 0 check (annual_turnover >= 0),
  -- rolling twelve-month taxable turnover before anything posted in the app
  taxable_turnover_12m numeric(18,2) not null default 0 check (taxable_turnover_12m >= 0),
  tin text,
  brn text,
  msic text,
  address jsonb not null default '{}'::jsonb,
  cap_policy numeric(18,2) not null default 2000 check (cap_policy >= 0),
  approval_limit numeric(18,2) not null default 5000 check (approval_limit >= 0),
  approver text,
  approver_role text,
  langs text[] not null default array['en', 'ms', 'zh'],
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_id uuid not null references public.ledger_entities(id) on delete cascade,
  entry_date date not null,
  entry_type text not null check (entry_type in ('opening', 'transaction', 'settlement', 'invoice')),
  description text not null check (char_length(description) <= 1000),
  amount numeric(18,2) not null,
  base_currency text not null default 'MYR',
  tax_amount numeric(18,2) not null default 0,
  tax_group text,
  doc_ref text,
  counterparty text,
  applies text,
  invoice jsonb,
  lines jsonb not null default '[]'::jsonb,
  status text not null check (status in ('posted', 'draft', 'rejected')),
  approver_name text not null default '',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  utterance text not null default '' check (char_length(utterance) <= 4000),
  rule_version text not null,
  revenue_base numeric(18,2) not null default 0,
  badges text[] not null default '{}',
  source text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One invoice number per company.
create unique index ledger_entries_invoice_no_idx on public.ledger_entries (entity_id, (invoice->>'number')) where invoice is not null;
create index ledger_entries_entity_date_idx on public.ledger_entries (entity_id, entry_date desc);
create index ledger_entries_workspace_idx on public.ledger_entries (workspace_id, created_at desc);
create index ledger_entities_workspace_idx on public.ledger_entities (workspace_id, created_at);

-- Month-end close: ticks a person gave and the sign-off. The agent's own checks are recomputed, never stored.
create table public.ledger_close_marks (
  entity_id uuid not null references public.ledger_entities(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  item text not null check (item in ('entries', 'bank', 'related', 'director', 'ar', 'depn', 'sst', 'reports')),
  ticked_by uuid not null references auth.users(id),
  ticked_at timestamptz not null default now(),
  primary key (entity_id, month, item)
);

create table public.ledger_close_signoffs (
  entity_id uuid not null references public.ledger_entities(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  signed_by_name text not null check (char_length(signed_by_name) between 1 and 120),
  signed_by uuid not null references auth.users(id),
  signed_on date not null,
  primary key (entity_id, month)
);

-- People asked to join. Nobody is emailed yet; an admin adds them once they have an account.
create table public.workspace_invites (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('Approver', 'Recorder', 'Viewer', 'External accountant')),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, email)
);

alter table public.workspaces add column if not exists go_live jsonb not null default '{}'::jsonb;

create trigger ledger_entities_updated_at before update on public.ledger_entities for each row execute function public.set_updated_at();
create trigger ledger_entries_updated_at before update on public.ledger_entries for each row execute function public.set_updated_at();

-- A posted or rejected entry is the audit record. It cannot be edited, only a draft can be decided.
create or replace function public.ledger_entries_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status <> 'draft' then
    raise exception 'Posted and rejected entries are immutable';
  end if;
  if new.lines is distinct from old.lines or new.entry_date is distinct from old.entry_date
     or new.amount is distinct from old.amount or new.entity_id is distinct from old.entity_id then
    raise exception 'A draft can be approved or rejected, not rewritten';
  end if;
  return new;
end;
$$;

create trigger ledger_entries_immutable before update on public.ledger_entries for each row execute function public.ledger_entries_guard();

alter table public.ledger_entities enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.ledger_close_marks enable row level security;
alter table public.ledger_close_signoffs enable row level security;
alter table public.workspace_invites enable row level security;

create policy ledger_entities_member_select on public.ledger_entities for select using (public.is_workspace_member(workspace_id));
create policy ledger_entities_admin_insert on public.ledger_entities for insert with check (public.is_workspace_admin(workspace_id) and created_by = auth.uid());
create policy ledger_entities_admin_update on public.ledger_entities for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

create policy ledger_entries_member_select on public.ledger_entries for select using (public.is_workspace_member(workspace_id));
create policy ledger_entries_writer_insert on public.ledger_entries for insert with check (
  public.can_workspace_write(workspace_id) and created_by = auth.uid()
  and exists (select 1 from public.ledger_entities e where e.id = entity_id and e.workspace_id = ledger_entries.workspace_id)
);
create policy ledger_entries_writer_update on public.ledger_entries for update using (public.can_workspace_write(workspace_id) and status = 'draft') with check (public.can_workspace_write(workspace_id));
-- No delete policy: journals are never deleted by a user.

create policy close_marks_member_select on public.ledger_close_marks for select using (public.is_workspace_member(workspace_id));
create policy close_marks_writer_insert on public.ledger_close_marks for insert with check (
  public.can_workspace_write(workspace_id) and ticked_by = auth.uid()
  and exists (select 1 from public.ledger_entities e where e.id = entity_id and e.workspace_id = ledger_close_marks.workspace_id)
);
create policy close_marks_writer_delete on public.ledger_close_marks for delete using (public.can_workspace_write(workspace_id));

create policy close_signoffs_member_select on public.ledger_close_signoffs for select using (public.is_workspace_member(workspace_id));
create policy close_signoffs_writer_insert on public.ledger_close_signoffs for insert with check (
  public.can_workspace_write(workspace_id) and signed_by = auth.uid()
  and exists (select 1 from public.ledger_entities e where e.id = entity_id and e.workspace_id = ledger_close_signoffs.workspace_id)
);
create policy close_signoffs_writer_delete on public.ledger_close_signoffs for delete using (public.can_workspace_write(workspace_id));

create policy invites_member_select on public.workspace_invites for select using (public.is_workspace_member(workspace_id));
create policy invites_admin_insert on public.workspace_invites for insert with check (public.is_workspace_admin(workspace_id) and invited_by = auth.uid());
create policy invites_admin_delete on public.workspace_invites for delete using (public.is_workspace_admin(workspace_id));

comment on table public.ledger_entries is 'Double-entry journals. Lines are produced server-side by the rule engine; posted and rejected rows are immutable.';
