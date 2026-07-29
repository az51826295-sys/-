-- AI Workforce - Day 15: Company Policies & Standards
-- Run this in the Supabase SQL editor after schema_day14.sql.

-- How this company works, as distinct from what any one employee knows.
--
-- Training belongs to a person and is learned once. A policy belongs to the
-- company: changing it changes how everyone works from the next assignment on,
-- without re-teaching anybody.
create table if not exists company_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  name text not null,
  category text not null check (category in (
    'brand', 'sales', 'research', 'review', 'security', 'operations', 'custom'
  )),
  description text not null default '',

  status text not null default 'active'
    check (status in ('active', 'draft', 'archived')),

  -- Bumped by any change to the policy or its rules, so work can record which
  -- version of the standard it was actually held to.
  version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_policies_company_idx
  on company_policies (company_id, status);

-- Two policies with the same name would make "which one applies" unanswerable
-- on the review screen.
create unique index if not exists company_policies_unique_name
  on company_policies (company_id, lower(name));

-- One standing instruction inside a policy.
--
-- The instruction is written for the employee to follow. Where a rule can also
-- be checked without spending anything, it names a check — the checks are a
-- registry in the code, and a rule that names none is one only a person can
-- judge.
create table if not exists policy_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  policy_id uuid not null references company_policies (id) on delete cascade,

  title text not null,
  instruction text not null,

  priority text not null default 'recommended'
    check (priority in ('required', 'recommended', 'optional')),
  enabled boolean not null default true,

  check_id text,
  check_config jsonb not null default '{}'::jsonb,

  position integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists policy_rules_policy_idx
  on policy_rules (policy_id, position);

-- What the policy said at each version.
--
-- Kept whole rather than as a diff: the question a manager asks months later is
-- "what standard was this work held to", and that has to be answerable without
-- replaying every edit since.
create table if not exists policy_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  policy_id uuid not null references company_policies (id) on delete cascade,

  version integer not null,
  name text not null,
  description text not null default '',
  status text not null,
  rules_json jsonb not null default '[]'::jsonb,

  -- What changed, in the manager's terms.
  change_summary text not null default '',

  created_at timestamptz not null default now(),

  unique (policy_id, version)
);

create index if not exists policy_versions_policy_idx
  on policy_versions (policy_id, version desc);

-- Which departments a policy applies to. No rows means the whole company.
--
-- A sales standard should not constrain how market research is written, and the
-- absence of rows is the common case, so company-wide costs nothing to express.
create table if not exists policy_departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  policy_id uuid not null references company_policies (id) on delete cascade,
  department_id uuid not null references departments (id) on delete cascade,

  created_at timestamptz not null default now(),

  unique (policy_id, department_id)
);

-- The standard this assignment was actually held to.
--
-- Resolved once, when the work starts. Editing a policy mid-run must not change
-- the rules the employee was given halfway through, and must not change what
-- the deliverable is judged against afterwards.
create table if not exists assignment_policy_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  assignment_id uuid not null references assignments (id) on delete cascade,

  policy_snapshot_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  unique (assignment_id)
);

-- Where a deliverable did not meet the standard.
--
-- A finding is a review item, never an edit. The system does not rewrite work
-- to fit a policy: it tells the manager what to look at, and a required rule
-- that failed a check stands between the work and approval.
create table if not exists deliverable_policy_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  deliverable_id uuid not null references deliverables (id) on delete cascade,

  -- Recorded by value as well as by id: the finding has to stay readable after
  -- the rule that produced it is renamed or deleted.
  policy_id uuid references company_policies (id) on delete set null,
  policy_name text not null,
  rule_id uuid references policy_rules (id) on delete set null,
  rule_title text not null,
  priority text not null,

  severity text not null check (severity in ('blocking', 'warning', 'note', 'manual')),
  detail text not null default '',

  created_at timestamptz not null default now()
);

create index if not exists deliverable_policy_findings_deliverable_idx
  on deliverable_policy_findings (deliverable_id, severity);

alter table company_policies enable row level security;
alter table policy_rules enable row level security;
alter table policy_versions enable row level security;
alter table policy_departments enable row level security;
alter table assignment_policy_snapshots enable row level security;
alter table deliverable_policy_findings enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'company_policies',
    'policy_rules',
    'policy_versions',
    'policy_departments',
    'assignment_policy_snapshots',
    'deliverable_policy_findings'
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
