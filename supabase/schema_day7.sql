-- AI Workforce - Day 7 schema (Employee Memory & Learning From Work)
-- Run this in the Supabase SQL editor after schema_day6.sql.

-- What an employee has learned on the job, as distinct from what it was taught
-- during onboarding (employee_knowledge_profiles). Scoped to the hire, because
-- two employees at the same company should not inherit each other's lessons.
create table if not exists employee_memories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,
  category text not null check (category in (
    'company_fact', 'manager_preference', 'work_pattern', 'research_insight'
  )),
  title text not null,
  content text not null,
  status text not null default 'pending_review'
    check (status in ('active', 'pending_review', 'archived', 'rejected')),
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high')),
  source_type text,
  conflict_type text,
  conflict_reason text,
  first_learned_at timestamptz not null default now(),
  last_confirmed_at timestamptz,
  -- Facts about a moving market go stale; preferences and work habits do not.
  valid_until timestamptz,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_memories_hire_idx
  on employee_memories (company_employee_id, status);

create table if not exists employee_learning_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,
  assignment_id uuid not null references assignments (id) on delete cascade,
  deliverable_id uuid not null references deliverables (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  input_snapshot jsonb,
  candidate_count integer not null default 0,
  accepted_count integer not null default 0,
  rejected_count integer not null default 0,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One successful learning run per deliverable: approving twice, or retrying
-- after success, must not mint the same lessons again.
create unique index if not exists learning_sessions_one_completed_per_deliverable
  on employee_learning_sessions (deliverable_id)
  where status = 'completed';

create unique index if not exists learning_sessions_one_active_per_deliverable
  on employee_learning_sessions (deliverable_id)
  where status in ('pending', 'running');

-- Everything the model proposed, including what was thrown away and why.
create table if not exists employee_memory_candidates (
  id uuid primary key default gen_random_uuid(),
  learning_session_id uuid not null references employee_learning_sessions (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,
  category text not null,
  title text not null,
  content text not null,
  reason text,
  confidence text,
  source_type text,
  source_references_json jsonb,
  decision text not null
    check (decision in ('created', 'merged', 'pending_review', 'rejected')),
  matched_memory_id uuid references employee_memories (id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now()
);

-- A lesson can be confirmed again by later work, so evidence is many-to-one.
create table if not exists employee_memory_sources (
  id uuid primary key default gen_random_uuid(),
  employee_memory_id uuid not null references employee_memories (id) on delete cascade,
  source_type text not null check (source_type in (
    'deliverable', 'deliverable_review', 'research_source', 'revision_request'
  )),
  source_id uuid not null,
  learning_session_id uuid references employee_learning_sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_memory_id, source_type, source_id)
);

create table if not exists work_execution_memories (
  id uuid primary key default gen_random_uuid(),
  work_execution_id uuid not null references work_executions (id) on delete cascade,
  employee_memory_id uuid not null references employee_memories (id) on delete cascade,
  relevance_score integer not null default 0,
  usage_type text not null default 'included_in_context'
    check (usage_type in ('retrieved', 'included_in_context', 'applied')),
  created_at timestamptz not null default now(),
  -- Keeps a retried execution from inflating a memory's usage count.
  unique (work_execution_id, employee_memory_id)
);

alter table work_executions
  add column if not exists memory_count integer not null default 0,
  -- Frozen copy of what was in context, so an archived memory doesn't rewrite
  -- the record of why a past deliverable said what it said.
  add column if not exists memory_context_snapshot jsonb;

alter table deliverables
  add column if not exists applied_memory_ids jsonb;

alter table employee_memories enable row level security;
alter table employee_learning_sessions enable row level security;
alter table employee_memory_candidates enable row level security;
alter table employee_memory_sources enable row level security;
alter table work_execution_memories enable row level security;

create policy "employee_memories_select_own" on employee_memories
  for select using (
    exists (select 1 from companies
            where companies.id = employee_memories.company_id
            and companies.owner_id = auth.uid())
  );

create policy "employee_memories_insert_own" on employee_memories
  for insert with check (
    exists (select 1 from companies
            where companies.id = employee_memories.company_id
            and companies.owner_id = auth.uid())
  );

create policy "employee_memories_update_own" on employee_memories
  for update using (
    exists (select 1 from companies
            where companies.id = employee_memories.company_id
            and companies.owner_id = auth.uid())
  );

create policy "learning_sessions_select_own" on employee_learning_sessions
  for select using (
    exists (select 1 from companies
            where companies.id = employee_learning_sessions.company_id
            and companies.owner_id = auth.uid())
  );

create policy "learning_sessions_insert_own" on employee_learning_sessions
  for insert with check (
    exists (select 1 from companies
            where companies.id = employee_learning_sessions.company_id
            and companies.owner_id = auth.uid())
  );

create policy "learning_sessions_update_own" on employee_learning_sessions
  for update using (
    exists (select 1 from companies
            where companies.id = employee_learning_sessions.company_id
            and companies.owner_id = auth.uid())
  );

create policy "memory_candidates_select_own" on employee_memory_candidates
  for select using (
    exists (
      select 1 from employee_learning_sessions s
      join companies on companies.id = s.company_id
      where s.id = employee_memory_candidates.learning_session_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "memory_candidates_insert_own" on employee_memory_candidates
  for insert with check (
    exists (
      select 1 from employee_learning_sessions s
      join companies on companies.id = s.company_id
      where s.id = employee_memory_candidates.learning_session_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "memory_sources_select_own" on employee_memory_sources
  for select using (
    exists (
      select 1 from employee_memories m
      join companies on companies.id = m.company_id
      where m.id = employee_memory_sources.employee_memory_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "memory_sources_insert_own" on employee_memory_sources
  for insert with check (
    exists (
      select 1 from employee_memories m
      join companies on companies.id = m.company_id
      where m.id = employee_memory_sources.employee_memory_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "execution_memories_select_own" on work_execution_memories
  for select using (
    exists (
      select 1 from work_executions w
      join companies on companies.id = w.company_id
      where w.id = work_execution_memories.work_execution_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "execution_memories_insert_own" on work_execution_memories
  for insert with check (
    exists (
      select 1 from work_executions w
      join companies on companies.id = w.company_id
      where w.id = work_execution_memories.work_execution_id
      and companies.owner_id = auth.uid()
    )
  );
