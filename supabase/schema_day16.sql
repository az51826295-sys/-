-- AI Workforce - Day 16: Organizational Learning
-- Run this in the Supabase SQL editor after schema_day15_playbooks.sql.

-- Something one employee's work suggests the whole company should know.
--
-- A candidate, not a conclusion. One person doing one good piece of work is not
-- evidence that the company should change how it works — it is a reason to ask
-- the manager whether it should. Nothing here reaches another employee until
-- somebody decides it is true of the company and not just of that afternoon.
create table if not exists learning_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  -- Where it came from, kept so the manager can go and read the work that
  -- produced the claim before agreeing to it.
  deliverable_id uuid references deliverables (id) on delete set null,
  assignment_id uuid references assignments (id) on delete set null,
  company_employee_id uuid references company_employees (id) on delete set null,
  learning_session_id uuid references employee_learning_sessions (id) on delete set null,

  title text not null,
  summary text not null,
  -- Why this is worth the whole company knowing, rather than just the employee.
  reason text not null default '',
  category text not null check (category in (
    'best_practice', 'quality_improvement', 'research_finding', 'process_improvement'
  )),
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high')),

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'needs_revision')),
  -- What the manager said when they sent it back or turned it down.
  manager_note text not null default '',

  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learning_candidates_company_idx
  on learning_candidates (company_id, status, created_at desc);

-- One deliverable should not produce the same proposal twice, however many
-- times learning is run over it.
create unique index if not exists learning_candidates_unique_per_deliverable
  on learning_candidates (deliverable_id, lower(title))
  where deliverable_id is not null;

-- What the company knows, as distinct from what any one employee remembers.
--
-- Above memory in every sense: it reaches every employee including ones hired
-- after it was written, it survives the person whose work produced it, and it
-- only exists because a manager agreed to it.
create table if not exists organization_knowledge (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  title text not null,
  description text not null,
  category text not null check (category in (
    'best_practice', 'quality_improvement', 'research_finding', 'process_improvement'
  )),

  status text not null default 'active'
    check (status in ('draft', 'active', 'deprecated', 'archived')),

  -- Which proposal became this, so the trail runs both ways.
  learning_candidate_id uuid references learning_candidates (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_knowledge_company_idx
  on organization_knowledge (company_id, status);

create unique index if not exists organization_knowledge_unique_title
  on organization_knowledge (company_id, lower(title));

-- The work that stands behind a piece of company knowledge.
--
-- Recorded because "the company believes this" is a claim that should be
-- answerable with "because of this work, reviewed on this date". Knowledge with
-- no traceable source is folklore.
create table if not exists knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  knowledge_id uuid not null references organization_knowledge (id) on delete cascade,

  deliverable_id uuid references deliverables (id) on delete set null,
  review_id uuid references deliverable_reviews (id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists knowledge_sources_knowledge_idx
  on knowledge_sources (knowledge_id);

-- A proposed change to how the company works, drawn from what it has learned.
--
-- A draft, never an edit. A system that rewrote its own methods from one
-- approved deliverable would be changing how everybody works on the strength of
-- a single afternoon, and the manager would find their company drifting without
-- ever having agreed to a step of it.
create table if not exists playbook_improvement_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  playbook_id uuid not null references playbooks (id) on delete cascade,
  knowledge_id uuid references organization_knowledge (id) on delete set null,

  change_summary text not null,
  -- What would actually be added, so applying it is a concrete act rather than
  -- an instruction to the manager to write something themselves.
  proposed_step_instruction text not null default '',
  proposed_step_expected_output text not null default '',
  target_stage_title text not null default '',

  status text not null default 'proposed'
    check (status in ('proposed', 'applied', 'dismissed')),

  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists playbook_improvement_drafts_playbook_idx
  on playbook_improvement_drafts (playbook_id, status);

alter table learning_candidates enable row level security;
alter table organization_knowledge enable row level security;
alter table knowledge_sources enable row level security;
alter table playbook_improvement_drafts enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'learning_candidates',
    'organization_knowledge',
    'knowledge_sources',
    'playbook_improvement_drafts'
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
