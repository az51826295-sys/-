-- AI Workforce - Day 9 schema (Recurring Assignments & Scheduled Work)
-- Run this in the Supabase SQL editor after schema_day8.sql.

-- Schedules are written in the company's own local time ("every Monday at 9am"),
-- so the zone has to be stored to turn that into an instant. IANA names, not
-- offsets: an offset would silently break twice a year.
alter table companies
  add column if not exists timezone text;

update companies set timezone = 'Asia/Seoul' where timezone is null;

-- A standing instruction, not a piece of work. It creates ordinary assignments
-- on a schedule; everything downstream — execution, review, revision, learning —
-- is the same system a manually assigned piece of work goes through.
create table if not exists recurring_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,

  title text not null,
  description text not null,
  expected_outcome text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  role_input_json jsonb,
  role_input_schema_id text,

  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  -- "Every 2 weeks" is weekly with an interval of 2 rather than its own
  -- frequency, so the calculation has one weekly path instead of two.
  interval_count integer not null default 1 check (interval_count between 1 and 2),
  days_of_week text[] not null default '{}',
  day_of_month integer check (day_of_month between 1 and 28),
  local_time time not null,
  timezone text not null,
  start_date date not null,

  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  conflict_policy text not null default 'wait' check (conflict_policy in ('wait', 'skip')),

  -- The instant the next occurrence is due. Null while paused or ended, which
  -- is also what keeps the scheduler's query from picking those up.
  next_run_at timestamptz,
  last_run_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  pause_reason text,

  consecutive_failure_count integer not null default 0,
  last_failure_at timestamptz,

  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The scheduler's only query, so it gets its own index.
create index if not exists recurring_assignments_due_idx
  on recurring_assignments (next_run_at)
  where status = 'active';

create index if not exists recurring_assignments_company_idx
  on recurring_assignments (company_id, status);

-- One row per scheduled turn, kept whether or not it produced work. A skipped
-- or failed turn is part of the history the manager needs to see — silently
-- dropping it would make the schedule look like it ran cleanly.
create table if not exists recurring_assignment_occurrences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  recurring_assignment_id uuid not null
    references recurring_assignments (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,

  -- When it was due, which is not when it ran. Both are kept: work delayed by a
  -- busy employee still belongs to the turn it was scheduled for.
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in (
    'scheduled', 'processing', 'waiting', 'assignment_created',
    'skipped', 'failed', 'cancelled'
  )),
  assignment_id uuid references assignments (id) on delete set null,

  skip_reason text,
  failure_code text,
  failure_message text,

  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now(),

  -- The whole idempotency story: the scheduler may run twice for the same due
  -- time, and this is what makes the second run a no-op.
  unique (recurring_assignment_id, scheduled_for)
);

create index if not exists occurrences_recurring_idx
  on recurring_assignment_occurrences (recurring_assignment_id, scheduled_for desc);

-- At most one waiting turn per schedule. Two schedules may both be waiting on
-- the same employee — they queue, oldest first — but a single schedule must not
-- pile up turns while the employee is busy, or a week away would come back to
-- five identical assignments nobody wanted.
create unique index if not exists occurrences_one_waiting_per_schedule
  on recurring_assignment_occurrences (recurring_assignment_id)
  where status = 'waiting';

-- An occurrence produces at most one assignment.
create unique index if not exists occurrences_one_assignment
  on recurring_assignment_occurrences (assignment_id)
  where assignment_id is not null;

alter table assignments
  add column if not exists source_type text not null default 'manual',
  add column if not exists recurring_assignment_id uuid
    references recurring_assignments (id) on delete set null,
  add column if not exists recurring_occurrence_id uuid
    references recurring_assignment_occurrences (id) on delete set null;

alter table recurring_assignments enable row level security;
alter table recurring_assignment_occurrences enable row level security;

drop policy if exists "recurring_select_own" on recurring_assignments;
create policy "recurring_select_own" on recurring_assignments
  for select using (
    exists (select 1 from companies
            where companies.id = recurring_assignments.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "recurring_insert_own" on recurring_assignments;
create policy "recurring_insert_own" on recurring_assignments
  for insert with check (
    exists (select 1 from companies
            where companies.id = recurring_assignments.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "recurring_update_own" on recurring_assignments;
create policy "recurring_update_own" on recurring_assignments
  for update using (
    exists (select 1 from companies
            where companies.id = recurring_assignments.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "occurrences_select_own" on recurring_assignment_occurrences;
create policy "occurrences_select_own" on recurring_assignment_occurrences
  for select using (
    exists (select 1 from companies
            where companies.id = recurring_assignment_occurrences.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "occurrences_insert_own" on recurring_assignment_occurrences;
create policy "occurrences_insert_own" on recurring_assignment_occurrences
  for insert with check (
    exists (select 1 from companies
            where companies.id = recurring_assignment_occurrences.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "occurrences_update_own" on recurring_assignment_occurrences;
create policy "occurrences_update_own" on recurring_assignment_occurrences
  for update using (
    exists (select 1 from companies
            where companies.id = recurring_assignment_occurrences.company_id
            and companies.owner_id = auth.uid())
  );
