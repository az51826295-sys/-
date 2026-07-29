-- AI Workforce - Day 18: Workforce Planning
-- Run this in the Supabase SQL editor after schema_day17.sql.

-- A way of getting the company through what is coming.
--
-- Day 17 says what is wrong. This says what could be done about it, and offers
-- more than one answer — because "hire someone" and "move the work" are both
-- valid responses to the same backlog, and which one is right depends on things
-- only the manager knows.
create table if not exists workforce_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  title text not null,
  summary text not null default '',

  -- What the plan was looking at. Kept so a plan read next week can be
  -- recognised as answering last week's situation.
  situation_json jsonb not null default '{}'::jsonb,

  status text not null default 'recommended'
    check (status in ('draft', 'recommended', 'approved', 'implemented', 'dismissed')),

  -- Which option the manager chose, once they choose one.
  chosen_option_id uuid,

  signal_key text not null,

  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, signal_key)
);

create index if not exists workforce_plans_company_idx
  on workforce_plans (company_id, status, created_at desc);

-- One way of solving it.
--
-- Options within a plan are alternatives, not a checklist: taking one usually
-- means not taking the others. Ordered by what it costs the company, which puts
-- hiring last on purpose.
create table if not exists staffing_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  workforce_plan_id uuid not null references workforce_plans (id) on delete cascade,

  option_type text not null check (option_type in (
    'redistribute_work',
    'cross_department_support',
    'playbook_improvement',
    'schedule_optimization',
    'hire_employee'
  )),

  summary text not null,
  reasoning text not null default '',

  -- Arithmetic on the numbers as they stand, never a prediction. Stored with
  -- the figures it was derived from so the manager can check the sum rather
  -- than trust a percentage.
  estimated_impact text not null default '',
  impact_json jsonb not null default '{}'::jsonb,

  priority integer not null default 50,

  created_at timestamptz not null default now()
);

create index if not exists staffing_options_plan_idx
  on staffing_options (workforce_plan_id, priority);

-- What a department could take on, at a moment.
--
-- Kept as a series rather than overwritten: the useful question about capacity
-- is whether it is getting worse, and that needs yesterday's reading.
create table if not exists department_capacity_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  department_id uuid not null references departments (id) on delete cascade,

  -- Percentage of the department's people who cannot take new work right now.
  -- Not a productivity measure: an employee here does one thing at a time, so
  -- this is a count of who is occupied, which is a fact rather than a judgement.
  capacity_used integer not null default 0,
  queue_size integer not null default 0,
  member_count integer not null default 0,
  free_count integer not null default 0,
  /** Work expected to arrive in the next 30 days, counted from schedules. */
  forecast_load integer not null default 0,

  captured_at timestamptz not null default now()
);

create index if not exists department_capacity_snapshots_idx
  on department_capacity_snapshots (department_id, captured_at desc);

create table if not exists employee_capacity_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,

  capacity_used integer not null default 0,
  active_assignments integer not null default 0,
  awaiting_review integer not null default 0,

  captured_at timestamptz not null default now()
);

create index if not exists employee_capacity_snapshots_idx
  on employee_capacity_snapshots (company_employee_id, captured_at desc);

alter table workforce_plans enable row level security;
alter table staffing_options enable row level security;
alter table department_capacity_snapshots enable row level security;
alter table employee_capacity_snapshots enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'workforce_plans',
    'staffing_options',
    'department_capacity_snapshots',
    'employee_capacity_snapshots'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_select_own', t);
    execute format(
      'create policy %I on %I for select using (exists (select 1 from companies where companies.id = %I.company_id and companies.owner_id = auth.uid()))',
      t || '_select_own', t, t);

    execute format('drop policy if exists %I on %I', t || '_insert_own', t);
    execute format(
      'create policy %I on %I for insert with check (exists (select 1 from companies where companies.id = %I.company_id and companies.owner_id = auth.uid()))',
      t || '_insert_own', t, t);

    execute format('drop policy if exists %I on %I', t || '_update_own', t);
    execute format(
      'create policy %I on %I for update using (exists (select 1 from companies where companies.id = %I.company_id and companies.owner_id = auth.uid()))',
      t || '_update_own', t, t);

    execute format('drop policy if exists %I on %I', t || '_delete_own', t);
    execute format(
      'create policy %I on %I for delete using (exists (select 1 from companies where companies.id = %I.company_id and companies.owner_id = auth.uid()))',
      t || '_delete_own', t, t);
  end loop;
end $$;
