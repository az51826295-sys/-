-- AI Workforce - Day 12 schema (Workforce Manager & Project Coordination)
-- Run this in the Supabase SQL editor after schema_day11.sql.

-- A goal the manager stated and the organisation broke down for itself.
--
-- Above assignments, not beside them: a project owns several people's work and
-- hands back one thing. The manager never sees the pieces.
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  title text not null,
  goal text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),

  status text not null default 'planning' check (status in (
    'planning', 'working', 'merging', 'reviewing', 'completed', 'failed', 'cancelled'
  )),
  -- How the work was divided, in the manager's own words rather than as a plan
  -- object. This is what the detail page explains the project with.
  manager_summary text,
  failure_code text,
  failure_message text,

  -- Where a project came from, when it wasn't typed in: an approved
  -- recommendation or a schedule.
  initiative_id uuid references initiatives (id) on delete set null,
  recurring_assignment_id uuid references recurring_assignments (id) on delete set null,

  created_by_user_id uuid references auth.users (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_company_idx on projects (company_id, status);

-- One person's piece of a project, and what it waits for.
create table if not exists project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  assignment_id uuid not null references assignments (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,

  -- Which task in the plan this is, so dependencies can be expressed before the
  -- assignments exist.
  task_key text not null,
  depends_on_task_key text,
  -- Depth in the dependency graph. Everything at the same depth may run at the
  -- same time, as long as it is not the same person twice.
  wave integer not null default 0,

  status text not null default 'pending' check (status in (
    'pending', 'working', 'completed', 'failed', 'skipped'
  )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (project_id, task_key),
  unique (assignment_id)
);

create index if not exists project_assignments_project_idx
  on project_assignments (project_id, wave);

-- The one thing the manager reads. Everything the members produced fed into it.
create table if not exists project_deliverables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,

  title text not null,
  content_markdown text not null,
  content_json jsonb,
  -- Who contributed what, so the manager can see the shape of the work behind
  -- a single document.
  contributions_json jsonb not null default '[]'::jsonb,

  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'needs_changes')),
  feedback text,
  version integer not null default 1,

  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_deliverables_project_idx
  on project_deliverables (project_id, version desc);

-- Only one version of a project's result may be awaiting review at a time.
create unique index if not exists project_deliverables_one_open
  on project_deliverables (project_id)
  where status = 'submitted';

-- A third kind of assignment. "project" work is real work with a real
-- deliverable, but the manager reviews the project's result rather than each
-- member's piece — so every manager-facing list already excludes it by
-- filtering on assignment_type = 'manager'.
alter table assignments
  add column if not exists project_id uuid references projects (id) on delete set null;

alter table projects enable row level security;
alter table project_assignments enable row level security;
alter table project_deliverables enable row level security;

drop policy if exists "projects_select_own" on projects;
create policy "projects_select_own" on projects
  for select using (
    exists (select 1 from companies
            where companies.id = projects.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "projects_insert_own" on projects;
create policy "projects_insert_own" on projects
  for insert with check (
    exists (select 1 from companies
            where companies.id = projects.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "projects_update_own" on projects;
create policy "projects_update_own" on projects
  for update using (
    exists (select 1 from companies
            where companies.id = projects.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "project_assignments_select_own" on project_assignments;
create policy "project_assignments_select_own" on project_assignments
  for select using (
    exists (
      select 1 from projects p join companies on companies.id = p.company_id
      where p.id = project_assignments.project_id and companies.owner_id = auth.uid()
    )
  );

drop policy if exists "project_assignments_insert_own" on project_assignments;
create policy "project_assignments_insert_own" on project_assignments
  for insert with check (
    exists (
      select 1 from projects p join companies on companies.id = p.company_id
      where p.id = project_assignments.project_id and companies.owner_id = auth.uid()
    )
  );

drop policy if exists "project_assignments_update_own" on project_assignments;
create policy "project_assignments_update_own" on project_assignments
  for update using (
    exists (
      select 1 from projects p join companies on companies.id = p.company_id
      where p.id = project_assignments.project_id and companies.owner_id = auth.uid()
    )
  );

drop policy if exists "project_deliverables_select_own" on project_deliverables;
create policy "project_deliverables_select_own" on project_deliverables
  for select using (
    exists (select 1 from companies
            where companies.id = project_deliverables.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "project_deliverables_insert_own" on project_deliverables;
create policy "project_deliverables_insert_own" on project_deliverables
  for insert with check (
    exists (select 1 from companies
            where companies.id = project_deliverables.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "project_deliverables_update_own" on project_deliverables;
create policy "project_deliverables_update_own" on project_deliverables
  for update using (
    exists (select 1 from companies
            where companies.id = project_deliverables.company_id
            and companies.owner_id = auth.uid())
  );
