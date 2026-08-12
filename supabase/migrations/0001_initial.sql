-- LedgerVoice AI production schema
-- Run once in a new Supabase project. Review in a non-production project first.

create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.subscription_status as enum ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused');
create type public.record_status as enum ('draft', 'approved', 'void');
create type public.invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'void');
create type public.deduction_review as enum ('likely', 'review', 'unlikely');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  default_country text not null default 'MY' check (default_country in ('MY', 'SG', 'AU', 'ID')),
  default_currency text not null default 'MYR' check (default_currency in ('MYR', 'SGD', 'AUD', 'IDR')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  email text,
  tax_id text,
  billing_address text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_number text not null,
  country text not null check (country in ('MY', 'SG', 'AU', 'ID')),
  currency text not null check (currency in ('MYR', 'SGD', 'AUD', 'IDR')),
  status public.invoice_status not null default 'draft',
  issue_date date not null,
  due_date date,
  subtotal numeric(18,2) not null check (subtotal >= 0),
  tax_total numeric(18,2) not null default 0 check (tax_total >= 0),
  total numeric(18,2) not null check (total >= 0),
  description text not null,
  notes text,
  source_transcript text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, invoice_number)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  merchant text not null check (char_length(merchant) between 1 and 160),
  expense_date date not null,
  country text not null check (country in ('MY', 'SG', 'AU', 'ID')),
  currency text not null check (currency in ('MYR', 'SGD', 'AUD', 'IDR')),
  amount numeric(18,2) not null check (amount >= 0),
  category text not null,
  business_use_percent numeric(5,2) not null default 100 check (business_use_percent between 0 and 100),
  deduction_review public.deduction_review not null default 'review',
  description text not null,
  source_transcript text,
  receipt_path text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.voice_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('invoice', 'expense')),
  transcript text not null,
  parsed_payload jsonb not null,
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  status public.record_status not null default 'draft',
  approved_record_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status public.subscription_status not null default 'incomplete',
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.tax_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  country text not null check (country in ('MY', 'SG', 'AU', 'ID')),
  entity_type text not null,
  tax_year text not null,
  tax_residency text,
  indirect_tax_registered boolean not null default false,
  notes text,
  confirmed_by_professional boolean not null default false,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.tax_rule_sets (
  id uuid primary key default gen_random_uuid(),
  country text not null check (country in ('MY', 'SG', 'AU', 'ID')),
  entity_type text not null,
  tax_year text not null,
  version integer not null,
  effective_from date not null,
  effective_to date,
  rules jsonb not null,
  official_source_urls jsonb not null default '[]'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (country, entity_type, tax_year, version)
);

create table public.tax_estimates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  country text not null check (country in ('MY', 'SG', 'AU', 'ID')),
  tax_year text not null,
  rule_set_id uuid references public.tax_rule_sets(id),
  accounting_profit numeric(18,2) not null,
  deductible_expenses numeric(18,2) not null default 0,
  non_deductible_adjustments numeric(18,2) not null default 0,
  taxable_profit numeric(18,2) not null,
  user_confirmed_rate numeric(7,4) check (user_confirmed_rate between 0 and 100),
  estimated_tax numeric(18,2),
  assumptions jsonb not null default '{}'::jsonb,
  professional_review_required boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Server-only operational tables. No authenticated-user policies are created.
create table public.stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create table public.api_rate_limits (
  rate_key text primary key,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0)
);

create index workspace_members_user_idx on public.workspace_members(user_id, workspace_id);
create index customers_workspace_idx on public.customers(workspace_id, created_at desc);
create index invoices_workspace_date_idx on public.invoices(workspace_id, issue_date desc);
create index invoices_workspace_status_idx on public.invoices(workspace_id, status);
create index expenses_workspace_date_idx on public.expenses(workspace_id, expense_date desc);
create index expenses_workspace_category_idx on public.expenses(workspace_id, category);
create index voice_drafts_workspace_idx on public.voice_drafts(workspace_id, created_at desc);
create index audit_logs_workspace_idx on public.audit_logs(workspace_id, created_at desc);
create index tax_estimates_workspace_idx on public.tax_estimates(workspace_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger workspaces_updated_at before update on public.workspaces for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();
create trigger expenses_updated_at before update on public.expenses for each row execute function public.set_updated_at();
create trigger voice_drafts_updated_at before update on public.voice_drafts for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger tax_profiles_updated_at before update on public.tax_profiles for each row execute function public.set_updated_at();

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_admin(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.can_workspace_write(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'member')
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.is_workspace_admin(uuid) from public;
revoke all on function public.can_workspace_write(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_admin(uuid) to authenticated;
grant execute on function public.can_workspace_write(uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
  workspace_name text;
begin
  workspace_name := coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)) || '''s Business';

  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data->>'full_name', ''));

  insert into public.workspaces (name, created_by)
  values (workspace_name, new.id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  insert into public.subscriptions (workspace_id, status)
  values (new_workspace_id, 'incomplete');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.expenses enable row level security;
alter table public.voice_drafts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.tax_profiles enable row level security;
alter table public.tax_rule_sets enable row level security;
alter table public.tax_estimates enable row level security;
alter table public.audit_logs enable row level security;
alter table public.stripe_events enable row level security;
alter table public.api_rate_limits enable row level security;

create policy profiles_select_self on public.profiles for select using (id = auth.uid());
create policy profiles_update_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy workspaces_select_member on public.workspaces for select using (public.is_workspace_member(id));
create policy workspaces_update_admin on public.workspaces for update using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));

create policy members_select_member on public.workspace_members for select using (public.is_workspace_member(workspace_id));
create policy members_insert_admin on public.workspace_members for insert with check (public.is_workspace_admin(workspace_id));
create policy members_update_admin on public.workspace_members for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy members_delete_admin on public.workspace_members for delete using (public.is_workspace_admin(workspace_id) and role <> 'owner');

create policy customers_member_select on public.customers for select using (public.is_workspace_member(workspace_id));
create policy customers_writer_insert on public.customers for insert with check (public.can_workspace_write(workspace_id) and created_by = auth.uid());
create policy customers_writer_update on public.customers for update using (public.can_workspace_write(workspace_id)) with check (public.can_workspace_write(workspace_id));
create policy customers_admin_delete on public.customers for delete using (public.is_workspace_admin(workspace_id));

create policy invoices_member_select on public.invoices for select using (public.is_workspace_member(workspace_id));
create policy invoices_writer_insert on public.invoices for insert with check (public.can_workspace_write(workspace_id) and created_by = auth.uid());
create policy invoices_writer_update on public.invoices for update using (public.can_workspace_write(workspace_id)) with check (public.can_workspace_write(workspace_id));
create policy invoices_admin_delete on public.invoices for delete using (public.is_workspace_admin(workspace_id));

create policy expenses_member_select on public.expenses for select using (public.is_workspace_member(workspace_id));
create policy expenses_writer_insert on public.expenses for insert with check (public.can_workspace_write(workspace_id) and created_by = auth.uid());
create policy expenses_writer_update on public.expenses for update using (public.can_workspace_write(workspace_id)) with check (public.can_workspace_write(workspace_id));
create policy expenses_admin_delete on public.expenses for delete using (public.is_workspace_admin(workspace_id));

create policy drafts_member_select on public.voice_drafts for select using (public.is_workspace_member(workspace_id));
create policy drafts_writer_insert on public.voice_drafts for insert with check (public.can_workspace_write(workspace_id) and created_by = auth.uid());
create policy drafts_writer_update on public.voice_drafts for update using (public.can_workspace_write(workspace_id)) with check (public.can_workspace_write(workspace_id));
create policy drafts_admin_delete on public.voice_drafts for delete using (public.is_workspace_admin(workspace_id));

create policy subscriptions_select_member on public.subscriptions for select using (public.is_workspace_member(workspace_id));

create policy tax_profiles_member_select on public.tax_profiles for select using (public.is_workspace_member(workspace_id));
create policy tax_profiles_writer_insert on public.tax_profiles for insert with check (public.can_workspace_write(workspace_id) and updated_by = auth.uid());
create policy tax_profiles_writer_update on public.tax_profiles for update using (public.can_workspace_write(workspace_id)) with check (public.can_workspace_write(workspace_id) and updated_by = auth.uid());

create policy tax_rules_authenticated_select on public.tax_rule_sets for select to authenticated using (is_active = true);

create policy tax_estimates_member_select on public.tax_estimates for select using (public.is_workspace_member(workspace_id));
create policy tax_estimates_writer_insert on public.tax_estimates for insert with check (public.can_workspace_write(workspace_id) and created_by = auth.uid());

create policy audit_member_select on public.audit_logs for select using (public.is_workspace_member(workspace_id));
create policy audit_writer_insert on public.audit_logs for insert with check (public.can_workspace_write(workspace_id) and actor_user_id = auth.uid());

-- Seed jurisdiction shells. Keep inactive until a qualified reviewer validates the rules and sources.
insert into public.tax_rule_sets (country, entity_type, tax_year, version, effective_from, rules, official_source_urls, is_active)
values
  ('MY', 'company', 'CONFIGURE', 1, current_date, '{"status":"professional_configuration_required"}', '["https://www.hasil.gov.my/"]', false),
  ('SG', 'company', 'CONFIGURE', 1, current_date, '{"status":"professional_configuration_required"}', '["https://www.iras.gov.sg/"]', false),
  ('AU', 'company', 'CONFIGURE', 1, current_date, '{"status":"professional_configuration_required"}', '["https://www.ato.gov.au/"]', false),
  ('ID', 'company', 'CONFIGURE', 1, current_date, '{"status":"professional_configuration_required"}', '["https://pajak.go.id/"]', false);

comment on table public.tax_rule_sets is 'Versioned tax rules. Never activate without qualified review for the jurisdiction, entity type, and tax year.';
comment on table public.tax_estimates is 'Planning estimates only; professional_review_required defaults to true.';
