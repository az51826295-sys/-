-- AI Workforce - Day 3 schema (First Assignment & Work Execution)
-- Run this in the Supabase SQL editor after schema_day2.sql.

-- company_employees: track what the employee is currently working on
alter table company_employees
  add column if not exists work_status text not null default 'ready'
    check (work_status in ('ready', 'assigned', 'working', 'awaiting_review')),
  add column if not exists current_assignment_id uuid;

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,
  title text not null,
  description text not null,
  expected_outcome text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'assigned'
    check (status in ('draft', 'assigned', 'working', 'submitted', 'completed', 'cancelled')),
  current_progress_step text,
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- An employee can hold only one active assignment at a time. Enforced in the
-- database so a double-submit can't slip past the application-level check.
create unique index if not exists assignments_one_active_per_employee
  on assignments (company_employee_id)
  where status in ('assigned', 'working', 'submitted');

create index if not exists assignments_company_id_idx on assignments (company_id);

-- Deferred so the column can be added before the table exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'company_employees_current_assignment_fkey'
  ) then
    alter table company_employees
      add constraint company_employees_current_assignment_fkey
      foreign key (current_assignment_id) references assignments (id) on delete set null;
  end if;
end $$;

create table if not exists assignment_progress_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments (id) on delete cascade,
  event_type text not null check (event_type in (
    'assignment_received',
    'company_context_reviewed',
    'research_started',
    'findings_organized',
    'deliverable_prepared'
  )),
  title text not null,
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'completed', 'failed')),
  sequence integer not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (assignment_id, event_type)
);

alter table assignments enable row level security;
alter table assignment_progress_events enable row level security;

-- assignments: scoped to the owner's company
create policy "assignments_select_own" on assignments
  for select using (
    exists (
      select 1 from companies
      where companies.id = assignments.company_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "assignments_insert_own" on assignments
  for insert with check (
    exists (
      select 1 from companies
      where companies.id = assignments.company_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "assignments_update_own" on assignments
  for update using (
    exists (
      select 1 from companies
      where companies.id = assignments.company_id
      and companies.owner_id = auth.uid()
    )
  );

-- progress events: scoped through the parent assignment
create policy "progress_events_select_own" on assignment_progress_events
  for select using (
    exists (
      select 1 from assignments
      join companies on companies.id = assignments.company_id
      where assignments.id = assignment_progress_events.assignment_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "progress_events_insert_own" on assignment_progress_events
  for insert with check (
    exists (
      select 1 from assignments
      join companies on companies.id = assignments.company_id
      where assignments.id = assignment_progress_events.assignment_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "progress_events_update_own" on assignment_progress_events
  for update using (
    exists (
      select 1 from assignments
      join companies on companies.id = assignments.company_id
      where assignments.id = assignment_progress_events.assignment_id
      and companies.owner_id = auth.uid()
    )
  );

-- Employees who already finished onboarding are ready for work.
update company_employees
set work_status = 'ready'
where onboarding_status = 'completed' and work_status is distinct from 'ready';
