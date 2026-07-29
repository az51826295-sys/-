-- AI Workforce - Day 13: Organization & Departments
-- Run this in the Supabase SQL editor after schema_day12_v2.sql.

-- The company's organisational units.
--
-- Work is addressed to a department before it is addressed to a person: that
-- is what makes this an organisation rather than a list of employees. A
-- department can be short-staffed and still be the right place to send work.
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  name text not null,
  description text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Two departments with the same name would make every routing decision
-- ambiguous to the person reading it.
create unique index if not exists departments_unique_name
  on departments (company_id, lower(name));

create index if not exists departments_company_idx on departments (company_id);

-- What a department is responsible for.
--
-- One department owns a given skill, enforced rather than assumed: "which
-- department does this work belong to" has to have exactly one answer, or
-- routing becomes a guess and the same request lands in different places on
-- different days.
create table if not exists department_skills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  department_id uuid not null references departments (id) on delete cascade,

  skill_id text not null,

  created_at timestamptz not null default now(),

  unique (company_id, skill_id)
);

create index if not exists department_skills_department_idx
  on department_skills (department_id);

-- Where each employee works.
--
-- Exactly one department each. An employee in two places belongs to neither
-- when it comes to answering "who is free in Sales".
create table if not exists department_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  department_id uuid not null references departments (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,

  joined_at timestamptz not null default now(),

  unique (company_employee_id)
);

create index if not exists department_members_department_idx
  on department_members (department_id);

-- Work that has reached a department but not yet a person.
--
-- The gap this fills is real: when every employee in a department is busy, the
-- work is not blocked on any one of them — it is the department's, and whoever
-- frees up first takes it.
create table if not exists department_work_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  department_id uuid not null references departments (id) on delete cascade,

  -- Set once the work becomes a real assignment; null while it is still only
  -- queued against the department.
  assignment_id uuid references assignments (id) on delete cascade,
  project_work_item_id uuid references project_work_items (id) on delete cascade,

  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'queued'
    check (status in ('queued', 'assigned', 'completed', 'cancelled')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists department_work_queue_department_idx
  on department_work_queue (department_id, status);

-- A queued item must point at something, or it is a row about nothing.
alter table department_work_queue drop constraint if exists department_work_queue_target;
alter table department_work_queue add constraint department_work_queue_target check (
  assignment_id is not null or project_work_item_id is not null
);

create unique index if not exists department_work_queue_one_per_work_item
  on department_work_queue (project_work_item_id)
  where project_work_item_id is not null;

-- Work carries the department it belongs to, so a report can be attributed to
-- Marketing even after the person who wrote it has moved on.
alter table assignments
  add column if not exists department_id uuid references departments (id) on delete set null;

alter table project_work_items
  add column if not exists department_id uuid references departments (id) on delete set null;

alter table projects
  add column if not exists primary_department_id uuid references departments (id) on delete set null;

alter table departments enable row level security;
alter table department_skills enable row level security;
alter table department_members enable row level security;
alter table department_work_queue enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'departments',
    'department_skills',
    'department_members',
    'department_work_queue'
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
