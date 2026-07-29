-- AI Workforce - Day 19: Workforce Evolution
-- Run this in the Supabase SQL editor after schema_day18.sql.

-- Work this company keeps needing and has nobody to do.
--
-- Drawn only from occasions the company actually tried: a plan that could not
-- be made for want of a skill, a request that found nobody, a department that
-- owns work no member can do. Guessing at a gap from the subjects of past
-- assignments would invent roles nobody asked for, and the manager would be
-- reading a hiring suggestion built on the system's imagination.
create table if not exists role_gaps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  title text not null,
  -- What was actually observed, in the manager's terms.
  reason text not null,

  -- The skill nobody can cover, where the gap names one. Ties the gap to the
  -- registry so a proposal can reuse a role that already exists rather than
  -- inventing a job title.
  skill_id text,
  department_id uuid references departments (id) on delete set null,

  -- How many times this was actually hit. A gap seen once is a bad afternoon.
  occurrences integer not null default 1,

  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high')),

  status text not null default 'open'
    check (status in ('open', 'planned', 'closed', 'dismissed')),

  signal_key text not null,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (company_id, signal_key)
);

create index if not exists role_gaps_company_idx
  on role_gaps (company_id, status, last_seen_at desc);

-- How the organisation would change to close the gaps.
--
-- Not a hiring plan. A company that answers every gap by hiring ends up with
-- more people doing the same badly-arranged work — sometimes the answer is a
-- department that does not exist yet, or a method nobody has written.
create table if not exists workforce_evolution_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  title text not null,
  summary text not null default '',
  situation_json jsonb not null default '{}'::jsonb,

  status text not null default 'recommended'
    check (status in ('draft', 'recommended', 'approved', 'implemented', 'cancelled')),

  signal_key text not null,

  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, signal_key)
);

create index if not exists workforce_evolution_plans_company_idx
  on workforce_evolution_plans (company_id, status, created_at desc);

-- One change to the shape of the company.
create table if not exists evolution_changes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  plan_id uuid not null references workforce_evolution_plans (id) on delete cascade,
  role_gap_id uuid references role_gaps (id) on delete set null,

  change_type text not null check (change_type in (
    'hire_employee',
    'create_department',
    'split_department',
    'merge_department',
    'create_playbook',
    'expand_role'
  )),

  summary text not null,
  reasoning text not null default '',
  -- Arithmetic on today's numbers, held with the figures it came from.
  expected_effect text not null default '',
  effect_json jsonb not null default '{}'::jsonb,

  -- Lower is sooner. Ordering is the substance here: which change first is the
  -- question a manager cannot answer from a list.
  order_index integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists evolution_changes_plan_idx
  on evolution_changes (plan_id, order_index);

-- Who to hire, in what order, and why that one first.
--
-- Separate from the changes because a roadmap is the part the manager reads
-- when deciding what this quarter looks like, and burying it among department
-- reshuffles would lose it.
create table if not exists hiring_roadmap_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  plan_id uuid not null references workforce_evolution_plans (id) on delete cascade,
  role_gap_id uuid references role_gaps (id) on delete set null,

  order_index integer not null default 0,
  role_name text not null,
  -- The role in the registry this would be, where one already exists. Reusing
  -- a defined role means the new hire arrives with a skill and a method rather
  -- than as a job title nobody has taught.
  employee_slug text,
  reason text not null,

  created_at timestamptz not null default now()
);

create index if not exists hiring_roadmap_items_plan_idx
  on hiring_roadmap_items (plan_id, order_index);

alter table role_gaps enable row level security;
alter table workforce_evolution_plans enable row level security;
alter table evolution_changes enable row level security;
alter table hiring_roadmap_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'role_gaps',
    'workforce_evolution_plans',
    'evolution_changes',
    'hiring_roadmap_items'
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
