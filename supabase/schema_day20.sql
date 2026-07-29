-- AI Workforce - Day 20: Continuous Company Evolution
-- Run this in the Supabase SQL editor after schema_day19.sql.

-- Day 14 already built operating_cycles: the period a company is working
-- through, with its plan, its reviews and its projects. This extends that
-- rather than creating a second one. Two tables both answering "what are we
-- working on" would give the company two answers, and every screen would have
-- to pick.
alter table operating_cycles
  add column if not exists cycle_type text not null default 'objective'
    check (cycle_type in ('objective', 'weekly', 'monthly', 'quarterly'));

-- Everything the company could improve, in one place.
--
-- Deliberately an index rather than a generator. Learning proposes, the
-- diagnosis proposes, planning proposes, evolution proposes — a fifth thing
-- inventing its own suggestions would compete with the four that already have
-- evidence behind them. This gives the manager one queue and keeps each item
-- pointing back at where it came from.
create table if not exists improvement_opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  category text not null check (category in (
    'learning', 'method', 'capacity', 'organisation', 'quality', 'review'
  )),

  title text not null,
  detail text not null default '',

  -- Which system raised it, and its id there. Kept as a pair rather than as
  -- five nullable foreign keys, so adding a sixth source later is data.
  source text not null check (source in (
    'learning_candidate',
    'playbook_draft',
    'workforce_recommendation',
    'workforce_plan',
    'evolution_plan'
  )),
  source_id uuid not null,

  priority integer not null default 50,

  status text not null default 'detected' check (status in (
    'detected', 'proposed', 'approved', 'implemented', 'measured', 'completed', 'dismissed'
  )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, source, source_id)
);

create index if not exists improvement_opportunities_company_idx
  on improvement_opportunities (company_id, status, priority);

-- What actually changed after the company did something about it.
--
-- The "before" is captured when the manager approves, not worked out
-- afterwards — by the time anyone asks whether it helped, the state it was
-- meant to improve has already moved, and reconstructing it would be guessing.
create table if not exists change_impacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  improvement_id uuid references improvement_opportunities (id) on delete cascade,

  metric text not null,
  subject text not null default '',

  before_value numeric not null,
  after_value numeric,
  -- Left null until measured. A change with no after-reading yet is honest;
  -- one with an invented after-reading is not.
  measured_at timestamptz,

  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists change_impacts_company_idx
  on change_impacts (company_id, created_at desc);

alter table improvement_opportunities enable row level security;
alter table change_impacts enable row level security;

do $$
declare t text;
begin
  foreach t in array array['improvement_opportunities', 'change_impacts'] loop
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
