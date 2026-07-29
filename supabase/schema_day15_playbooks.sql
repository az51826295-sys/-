-- AI Workforce - Day 15: Company Playbooks
-- Run this in the Supabase SQL editor after schema_day15.sql.

-- How this company does a particular kind of work.
--
-- Training gives an employee knowledge; a playbook gives them the company's
-- method. Two companies with the same market analyst get different work out of
-- them because the order they work in, and what they consider finished, differ.
--
-- Owned by a department rather than by a person: the method outlasts whoever
-- happens to be doing it this month.
create table if not exists playbooks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  department_id uuid references departments (id) on delete set null,

  -- Which kind of work this is the method for. Null means the department picks
  -- it by hand rather than it being matched to a skill automatically.
  skill_id text,

  name text not null,
  description text not null default '',

  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),

  -- Only bumped on publish. Editing a draft is not a new version of the
  -- company's method — it is somebody still writing one.
  version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists playbooks_company_idx
  on playbooks (company_id, status);

create index if not exists playbooks_department_idx
  on playbooks (department_id);

-- One active method per kind of work per department. Two would make "how do we
-- do this here" a question with two answers, which is the thing a playbook
-- exists to prevent.
create unique index if not exists playbooks_one_active_per_skill
  on playbooks (company_id, department_id, skill_id)
  where status = 'active' and skill_id is not null;

create unique index if not exists playbooks_unique_name
  on playbooks (company_id, lower(name));

-- The phases of the method, in order.
create table if not exists playbook_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  playbook_id uuid not null references playbooks (id) on delete cascade,

  title text not null,
  intent text not null default '',
  order_index integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists playbook_stages_playbook_idx
  on playbook_stages (playbook_id, order_index);

-- What is actually done in a stage, and what it should produce.
--
-- expected_output is the part that makes a step checkable by a person: an
-- instruction with no stated result is advice, and the employee can believe
-- they followed it while producing nothing.
create table if not exists playbook_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  stage_id uuid not null references playbook_stages (id) on delete cascade,

  instruction text not null,
  expected_output text not null default '',
  required boolean not null default true,
  order_index integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists playbook_steps_stage_idx
  on playbook_steps (stage_id, order_index);

-- What this method considers finished.
--
-- check_id points at the same free check registry the company's standards use.
-- A second checking mechanism would drift from the first, and the manager would
-- have two places to look for the same kind of answer.
create table if not exists playbook_quality_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  playbook_id uuid not null references playbooks (id) on delete cascade,

  title text not null,
  description text not null default '',

  check_id text,
  check_config jsonb not null default '{}'::jsonb,

  order_index integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists playbook_quality_checks_playbook_idx
  on playbook_quality_checks (playbook_id, order_index);

-- What the method said at each published version.
create table if not exists playbook_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  playbook_id uuid not null references playbooks (id) on delete cascade,

  version integer not null,
  name text not null,
  description text not null default '',
  -- Stages, steps and quality checks as they stood, whole.
  body_json jsonb not null default '{}'::jsonb,
  change_summary text not null default '',

  created_at timestamptz not null default now(),

  unique (playbook_id, version)
);

create index if not exists playbook_versions_playbook_idx
  on playbook_versions (playbook_id, version desc);

-- The method this assignment was actually worked to.
--
-- Same reasoning as the policy snapshot: publishing a new version while
-- somebody is midway through must not change the steps they were given, and
-- must not change what the deliverable is read against afterwards.
create table if not exists assignment_playbook_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  assignment_id uuid not null references assignments (id) on delete cascade,

  playbook_id uuid references playbooks (id) on delete set null,
  -- Recorded by value too, so "which method produced this" survives the
  -- playbook being renamed or deleted.
  playbook_name text not null,
  playbook_version integer not null,
  playbook_snapshot_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  unique (assignment_id)
);

alter table playbooks enable row level security;
alter table playbook_stages enable row level security;
alter table playbook_steps enable row level security;
alter table playbook_quality_checks enable row level security;
alter table playbook_versions enable row level security;
alter table assignment_playbook_snapshots enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'playbooks',
    'playbook_stages',
    'playbook_steps',
    'playbook_quality_checks',
    'playbook_versions',
    'assignment_playbook_snapshots'
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
