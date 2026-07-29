-- AI Workforce - Day 14: Workforce Operating System
-- Run this in the Supabase SQL editor after schema_day13.sql.

-- The period the company is currently working through.
--
-- Projects stop being the top of the tree: a company is always operating, and
-- a finished project is a step in that rather than the end of anything.
create table if not exists operating_cycles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  name text not null,
  objective text not null,

  status text not null default 'planning' check (status in (
    'planning', 'active', 'review', 'completed', 'archived'
  )),

  started_at timestamptz,
  ended_at timestamptz,
  created_by_user_id uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operating_cycles_company_idx
  on operating_cycles (company_id, status);

-- A company operates in one direction at a time. Two active cycles would mean
-- two answers to "what are we working on", and every recommendation would have
-- to guess which one it belonged to.
create unique index if not exists operating_cycles_one_active
  on operating_cycles (company_id)
  where status in ('planning', 'active', 'review');

-- How the cycle's objective breaks into phases of work.
--
-- Versioned rather than edited: a review can revise the plan, and what the
-- manager approved earlier should stay readable next to what replaced it.
create table if not exists operating_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  operating_cycle_id uuid not null references operating_cycles (id) on delete cascade,

  summary text not null,
  plan_json jsonb not null default '{}'::jsonb,

  status text not null default 'active'
    check (status in ('active', 'superseded')),
  version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (operating_cycle_id, version)
);

-- Only one plan is the current one.
create unique index if not exists operating_plans_one_active
  on operating_plans (operating_cycle_id)
  where status = 'active';

-- What the Workforce Manager makes of where things stand.
--
-- A review produces recommendations and stops. Nothing here starts work: a
-- project costs the company real money, so committing to one is the manager's
-- click, not a consequence of the system having an opinion.
create table if not exists operating_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  operating_cycle_id uuid not null references operating_cycles (id) on delete cascade,

  summary text not null,
  recommendations_json jsonb not null default '[]'::jsonb,
  -- What the review was looking at when it formed its view, so a stale
  -- recommendation can be recognised as stale.
  state_snapshot_json jsonb,

  status text not null default 'ready'
    check (status in ('pending', 'ready', 'approved', 'dismissed')),

  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operating_reviews_cycle_idx
  on operating_reviews (operating_cycle_id, created_at desc);

-- Only one review waits on the manager at a time; a second would make it
-- ambiguous which recommendation they were answering.
create unique index if not exists operating_reviews_one_open
  on operating_reviews (operating_cycle_id)
  where status = 'ready';

-- Which projects belong to this cycle, and in what order.
create table if not exists operating_project_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  operating_cycle_id uuid not null references operating_cycles (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,

  -- Which recommendation put it here, when one did. Null for a project the
  -- manager started themselves.
  operating_review_id uuid references operating_reviews (id) on delete set null,

  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  position integer not null default 0,

  status text not null default 'queued' check (status in (
    'queued', 'active', 'completed', 'cancelled'
  )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (operating_cycle_id, project_id)
);

create index if not exists operating_project_queue_cycle_idx
  on operating_project_queue (operating_cycle_id, position);

-- A project knows which cycle it serves, so a finished one can be read as a
-- step rather than an isolated result.
alter table projects
  add column if not exists operating_cycle_id uuid
    references operating_cycles (id) on delete set null;

create index if not exists projects_operating_cycle_idx
  on projects (operating_cycle_id);

alter table operating_cycles enable row level security;
alter table operating_plans enable row level security;
alter table operating_reviews enable row level security;
alter table operating_project_queue enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'operating_cycles',
    'operating_plans',
    'operating_reviews',
    'operating_project_queue'
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
