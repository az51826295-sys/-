-- AI Workforce - Day 10 schema (Autonomous Initiative & Opportunity Detection)
-- Run this in the Supabase SQL editor after schema_day9.sql.

-- One round of an employee looking around. Separate from work_executions
-- because nothing is produced here: the employee is deciding whether there is
-- anything worth proposing, not doing the work.
create table if not exists initiative_detection_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,

  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  error_code text,
  error_message text,

  observations_reviewed integer not null default 0,
  proposals_made integer not null default 0,
  initiatives_created integer not null default 0,
  duplicates_suppressed integer not null default 0,

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now()
);

-- The pages an employee actually read while looking around.
--
-- research_sources can't be reused: it requires an assignment and an execution,
-- and an observation predates both. Storing these separately is also what lets
-- the model cite ids instead of writing URLs — a proposal whose evidence points
-- at a page nobody fetched is not evidence.
create table if not exists initiative_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  detection_run_id uuid not null
    references initiative_detection_runs (id) on delete cascade,

  title text not null,
  url text not null,
  normalized_url text not null,
  domain text not null,
  snippet text,
  content_text text,
  published_at timestamptz,
  accessed_at timestamptz,
  created_at timestamptz not null default now(),

  unique (detection_run_id, normalized_url)
);

create index if not exists initiative_observations_run_idx
  on initiative_observations (detection_run_id);

-- A proposal, not a task. Nothing here runs until a manager says so, which is
-- the whole point: an employee that started work on its own judgement would be
-- spending the company's money on its own opinion.
create table if not exists initiatives (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,
  detection_run_id uuid references initiative_detection_runs (id) on delete set null,

  title text not null,
  summary text not null,
  recommendation text not null,
  reasoning text not null,

  status text not null default 'new'
    check (status in ('new', 'approved', 'dismissed', 'expired', 'completed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high')),
  confidence_score integer not null default 0,

  -- Rendered server-side from real observations, so every URL here was fetched.
  evidence_json jsonb not null default '[]'::jsonb,

  -- The assignment this would become, frozen at proposal time. The manager
  -- approves what they read, not whatever the employee might think later.
  assignment_snapshot jsonb not null,
  role_input_json jsonb,
  role_input_schema_id text,

  -- Identifies the underlying event rather than the wording, so the same launch
  -- described differently next week is still the same proposal.
  dedupe_key text not null,

  assignment_id uuid references assignments (id) on delete set null,
  expires_at timestamptz,
  approved_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists initiatives_inbox_idx
  on initiatives (company_id, status, created_at desc);

-- Suppresses re-proposing something still open. A dismissed proposal is held
-- back by date instead, so the employee may raise it again much later if the
-- situation genuinely changes.
create unique index if not exists initiatives_one_open_per_signal
  on initiatives (company_employee_id, dedupe_key)
  where status = 'new';

create index if not exists initiatives_dedupe_idx
  on initiatives (company_employee_id, dedupe_key, created_at desc);

-- Which observation supports which proposal. Kept alongside evidence_json so a
-- proposal can still be traced to the exact page after the JSON is rendered.
create table if not exists initiative_evidence (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  observation_id uuid not null
    references initiative_observations (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (initiative_id, observation_id)
);

-- Assignments can now begin three ways: a person asked, a schedule fired, or
-- the manager approved a proposal.
alter table assignments
  add column if not exists initiative_id uuid
    references initiatives (id) on delete set null;

alter table initiative_detection_runs enable row level security;
alter table initiative_observations enable row level security;
alter table initiatives enable row level security;
alter table initiative_evidence enable row level security;

drop policy if exists "detection_runs_select_own" on initiative_detection_runs;
create policy "detection_runs_select_own" on initiative_detection_runs
  for select using (
    exists (select 1 from companies
            where companies.id = initiative_detection_runs.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "observations_select_own" on initiative_observations;
create policy "observations_select_own" on initiative_observations
  for select using (
    exists (select 1 from companies
            where companies.id = initiative_observations.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "initiatives_select_own" on initiatives;
create policy "initiatives_select_own" on initiatives
  for select using (
    exists (select 1 from companies
            where companies.id = initiatives.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "initiatives_update_own" on initiatives;
create policy "initiatives_update_own" on initiatives
  for update using (
    exists (select 1 from companies
            where companies.id = initiatives.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "initiative_evidence_select_own" on initiative_evidence;
create policy "initiative_evidence_select_own" on initiative_evidence
  for select using (
    exists (
      select 1 from initiatives i
      join companies on companies.id = i.company_id
      where i.id = initiative_evidence.initiative_id
      and companies.owner_id = auth.uid()
    )
  );
