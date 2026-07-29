-- AI Workforce - model usage ledger
-- Run this in the Supabase SQL editor after schema_day12.sql.

-- One row per model call.
--
-- A ledger rather than counters on the run: counters can only answer "what did
-- this cost", and the question that actually matters when the bill looks wrong
-- is "which call cost that". Rows also never contend — several employees can
-- be working at once without two writes racing over the same total.
create table if not exists model_usage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  model text not null,
  -- What the call was for, taken from the schema each call already names, so
  -- adding a new kind of model call records itself without anyone remembering
  -- to add a label.
  purpose text not null,

  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  -- Priced at the moment of the call and stored, not derived on read. Rates
  -- change; what this run actually cost does not, and a historical figure that
  -- silently re-prices itself is worse than no figure at all.
  cost_usd numeric(12, 6) not null default 0,

  -- Whichever of these applies. A call made while planning a project belongs to
  -- the project but to no single execution.
  work_execution_id uuid references work_executions (id) on delete set null,
  project_id uuid references projects (id) on delete set null,
  company_employee_id uuid references company_employees (id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists model_usage_company_idx
  on model_usage (company_id, created_at desc);
create index if not exists model_usage_execution_idx
  on model_usage (work_execution_id);
create index if not exists model_usage_project_idx
  on model_usage (project_id);

alter table model_usage enable row level security;

drop policy if exists "model_usage_select_own" on model_usage;
create policy "model_usage_select_own" on model_usage
  for select using (
    exists (select 1 from companies
            where companies.id = model_usage.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "model_usage_insert_own" on model_usage;
create policy "model_usage_insert_own" on model_usage
  for insert with check (
    exists (select 1 from companies
            where companies.id = model_usage.company_id
            and companies.owner_id = auth.uid())
  );
