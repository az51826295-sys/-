-- AI Workforce - Day 12 (v2): Projects, Workforce Planning & Coordination
--
-- Replaces the first Day 12 tables. The earlier shape treated a project as a
-- flat list of assignments; this one gives the work items an identity of their
-- own, because dependencies, queueing and per-item retry all need something to
-- hang off that is not the assignment.

drop table if exists project_deliverables cascade;
drop table if exists project_assignments cascade;

-- A goal the manager stated, planned and carried out by several employees.
alter table projects
  add column if not exists expected_outcome text,
  add column if not exists current_phase text,
  add column if not exists plan_json jsonb,
  add column if not exists plan_schema_version integer default 1,
  add column if not exists plan_validation_json jsonb,
  add column if not exists final_deliverable_title text,
  add column if not exists final_deliverable_type text default 'project_brief',
  add column if not exists final_deliverable_id uuid references deliverables (id) on delete set null,
  add column if not exists progress_percentage integer not null default 0,
  add column if not exists planning_started_at timestamptz,
  add column if not exists planned_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists cancelled_at timestamptz;

-- The plan is prepared and read before anything starts, so "draft" and
-- "plan_ready" are real resting states rather than moments in a single run.
alter table projects drop constraint if exists projects_status_check;
alter table projects add constraint projects_status_check check (status in (
  'draft', 'planning', 'plan_ready', 'working',
  'preparing_final_deliverable', 'awaiting_review', 'needs_changes',
  'completed', 'failed', 'cancelled'
));

alter table projects alter column status set default 'draft';

-- One person's piece of a project.
--
-- Separate from the assignment it eventually creates: a work item exists while
-- it is still blocked, may be queued behind that employee's other work, and can
-- be retried into a fresh assignment without losing its place in the graph.
create table if not exists project_work_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,

  -- The id the plan used before any of these rows existed, which is how
  -- dependencies can be expressed at planning time.
  plan_client_id text not null,

  title text not null,
  objective text not null,
  expected_outcome text,

  required_skill_id text not null,
  company_employee_id uuid not null references company_employees (id) on delete cascade,

  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'planned' check (status in (
    'planned', 'ready', 'blocked', 'queued', 'working',
    'awaiting_internal_review', 'completed', 'failed', 'cancelled', 'skipped'
  )),
  execution_mode text not null default 'parallel'
    check (execution_mode in ('parallel', 'after_dependencies')),
  -- An optional item may fail without failing the project; the brief says so.
  required_for_project_completion boolean not null default true,

  role_input_json jsonb not null default '{}'::jsonb,
  role_input_schema_version integer default 1,

  assignment_id uuid references assignments (id) on delete set null,
  latest_deliverable_id uuid references deliverables (id) on delete set null,

  sequence_order integer not null default 0,

  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,

  failure_code text,
  failure_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Starting a project twice must not double the work.
  unique (project_id, plan_client_id)
);

create index if not exists project_work_items_project_idx
  on project_work_items (project_id, sequence_order);
create index if not exists project_work_items_employee_idx
  on project_work_items (company_employee_id, status);

-- One assignment per work item, enforced rather than assumed.
create unique index if not exists project_work_items_one_assignment
  on project_work_items (assignment_id)
  where assignment_id is not null;

create table if not exists project_work_item_dependencies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,

  work_item_id uuid not null references project_work_items (id) on delete cascade,
  depends_on_work_item_id uuid not null references project_work_items (id) on delete cascade,

  input_type text not null default 'deliverable_summary' check (input_type in (
    'deliverable_summary', 'structured_output', 'source_list', 'selected_items'
  )),
  input_description text,
  is_required boolean not null default true,

  created_at timestamptz not null default now(),

  unique (work_item_id, depends_on_work_item_id),
  -- Nothing waits for itself. Cycles of length one are cheap to catch here;
  -- longer ones are caught in the planner's sort.
  constraint project_dependency_not_self check (work_item_id <> depends_on_work_item_id)
);

create index if not exists project_dependencies_work_item_idx
  on project_work_item_dependencies (work_item_id);
create index if not exists project_dependencies_source_idx
  on project_work_item_dependencies (depends_on_work_item_id);

-- What one work item actually handed to the next.
--
-- Frozen at the moment the dependent assignment is created. If the earlier
-- deliverable is later revised, the work already started keeps the input it was
-- given — otherwise an employee's finished reasoning would silently rest on
-- facts that changed underneath it.
create table if not exists project_work_item_inputs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  work_item_id uuid not null references project_work_items (id) on delete cascade,

  source_work_item_id uuid not null references project_work_items (id) on delete cascade,
  source_deliverable_id uuid references deliverables (id) on delete set null,

  input_type text not null,
  input_json jsonb,
  input_text text,

  created_at timestamptz not null default now(),

  unique (work_item_id, source_work_item_id, source_deliverable_id, input_type)
);

create index if not exists project_work_item_inputs_item_idx
  on project_work_item_inputs (work_item_id);

-- Each contribution reduced to what the merge needs.
--
-- The brief is written from these rather than from whole deliverables: three
-- reports concatenated is not a merged result, and the value the manager is
-- paying for is somebody having read all of it.
create table if not exists project_work_item_summaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  project_work_item_id uuid not null references project_work_items (id) on delete cascade,
  deliverable_id uuid references deliverables (id) on delete set null,

  summary_json jsonb not null,
  summary_schema_version integer not null default 1,

  created_at timestamptz not null default now(),

  unique (project_work_item_id, deliverable_id)
);

-- Which of the members' sources the project's own result stands on.
create table if not exists project_deliverable_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  project_deliverable_id uuid not null references deliverables (id) on delete cascade,

  source_deliverable_id uuid references deliverables (id) on delete set null,
  research_source_id uuid not null references research_sources (id) on delete cascade,

  usage_type text not null default 'cited'
    check (usage_type in ('inherited', 'selected', 'cited')),

  created_at timestamptz not null default now(),

  unique (project_deliverable_id, research_source_id)
);

create index if not exists project_deliverable_sources_deliverable_idx
  on project_deliverable_sources (project_deliverable_id);

-- The project's result lives in the deliverables table like any other, so it
-- inherits review, feedback and versioning rather than reimplementing them.
alter table deliverables
  add column if not exists deliverable_scope text not null default 'assignment',
  add column if not exists project_id uuid references projects (id) on delete cascade;

create index if not exists deliverables_project_idx
  on deliverables (project_id, version desc);

-- Assignments gain the same three-way scope the rest of the system already
-- uses, so every manager-facing list keeps working unchanged.
alter table assignments
  add column if not exists assignment_scope text not null default 'manager',
  add column if not exists project_work_item_id uuid
    references project_work_items (id) on delete set null;

-- Backfills the new column from the one Day 11 introduced, so existing rows
-- keep their meaning.
update assignments
set assignment_scope = assignment_type
where assignment_scope = 'manager' and assignment_type <> 'manager';

create unique index if not exists assignments_one_per_work_item
  on assignments (project_work_item_id)
  where project_work_item_id is not null;

create table if not exists project_revision_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  project_deliverable_id uuid not null references deliverables (id) on delete cascade,
  deliverable_review_id uuid,

  feedback text not null,

  -- Whether the members' work was wrong, or only the way it was brought
  -- together. Re-running several employees is expensive, so the two are told
  -- apart before anything restarts.
  revision_scope text not null default 'final_merge_only'
    check (revision_scope in ('final_merge_only', 'work_items_and_merge')),
  affected_work_item_ids uuid[] not null default '{}',

  status text not null default 'pending' check (status in (
    'pending', 'analyzing', 'working', 'merging', 'completed', 'failed', 'cancelled'
  )),

  analysis_json jsonb,
  validation_json jsonb,

  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists project_revision_requests_project_idx
  on project_revision_requests (project_id, created_at desc);

alter table project_work_items enable row level security;
alter table project_work_item_dependencies enable row level security;
alter table project_work_item_inputs enable row level security;
alter table project_work_item_summaries enable row level security;
alter table project_deliverable_sources enable row level security;
alter table project_revision_requests enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'project_work_items',
    'project_work_item_dependencies',
    'project_work_item_inputs',
    'project_work_item_summaries',
    'project_deliverable_sources',
    'project_revision_requests'
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
  end loop;
end $$;
