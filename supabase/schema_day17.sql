-- AI Workforce - Day 17: Workforce Intelligence
-- Run this in the Supabase SQL editor after schema_day16.sql.

-- Something true about how the company is running.
--
-- A measurement, not an opinion. "Marketing has eleven pieces of work waiting"
-- is an insight; "Marketing is overloaded" is a judgement, and judgements
-- belong in a recommendation where the manager can disagree with them.
--
-- Every one of these is arithmetic over work that already happened. Nothing
-- here calls a model: a company that had to pay to find out how it was doing
-- would check rarely, and a diagnosis nobody runs is worth nothing.
create table if not exists workforce_insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  category text not null check (category in (
    'capacity', 'quality', 'throughput', 'review', 'learning'
  )),

  title text not null,
  summary text not null,
  -- The numbers behind it, so the manager can see what was counted rather than
  -- being asked to trust a sentence.
  measurements_json jsonb not null default '{}'::jsonb,

  severity text not null default 'info'
    check (severity in ('info', 'low', 'medium', 'high', 'critical')),

  -- What this insight is about, stable across runs. Lets today's reading of the
  -- same fact replace yesterday's rather than pile up beside it.
  signal_key text not null,

  -- Which department or employee it concerns, when it concerns one.
  subject_type text not null default 'company'
    check (subject_type in ('company', 'department', 'employee', 'playbook')),
  subject_id uuid,

  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (company_id, signal_key)
);

create index if not exists workforce_insights_company_idx
  on workforce_insights (company_id, severity, observed_at desc);

-- What to do about it, phrased so the manager can say yes or no.
--
-- Never executed automatically. The system is allowed to notice that Marketing
-- is drowning; hiring someone is a decision with a monthly cost attached, and
-- that is the manager's.
create table if not exists workforce_recommendations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  insight_id uuid references workforce_insights (id) on delete cascade,

  category text not null check (category in (
    'capacity', 'hiring', 'playbook', 'department', 'project', 'review', 'learning'
  )),

  title text not null,
  description text not null,
  -- Why this one rather than the alternatives, in the manager's terms.
  reasoning text not null default '',

  -- Cheapest first. Hiring is last on purpose: a real company redistributes
  -- work, then borrows from another department, then improves its methods, and
  -- only then adds a salary.
  priority integer not null default 50,

  status text not null default 'new'
    check (status in ('new', 'reviewing', 'approved', 'dismissed', 'completed')),

  signal_key text not null,

  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, signal_key)
);

create index if not exists workforce_recommendations_company_idx
  on workforce_recommendations (company_id, status, priority);

-- Where approving a recommendation actually sends the manager.
--
-- A recommendation that ends at "consider hiring an analyst" makes the manager
-- do the work of turning advice into an action. This is the action.
create table if not exists recommendation_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  recommendation_id uuid not null references workforce_recommendations (id) on delete cascade,

  action_type text not null check (action_type in (
    'open_hiring', 'review_playbook', 'review_queue', 'review_learning',
    'review_deliverables', 'open_department', 'none'
  )),
  -- Where to go and with what selected. Read by the UI, never by the engine.
  payload_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists recommendation_actions_recommendation_idx
  on recommendation_actions (recommendation_id);

alter table workforce_insights enable row level security;
alter table workforce_recommendations enable row level security;
alter table recommendation_actions enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'workforce_insights',
    'workforce_recommendations',
    'recommendation_actions'
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
