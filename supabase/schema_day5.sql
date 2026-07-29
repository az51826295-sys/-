-- AI Workforce - Day 5 schema (Real AI Work & Evidence-Based Deliverable)
-- Run this in the Supabase SQL editor after schema_day4.sql.

-- assignments: queued while an execution is pending, failed when it gives up
alter table assignments drop constraint if exists assignments_status_check;
alter table assignments add constraint assignments_status_check
  check (status in (
    'draft', 'assigned', 'queued', 'working', 'submitted',
    'needs_changes', 'completed', 'failed', 'cancelled'
  ));

alter table assignments
  add column if not exists last_execution_id uuid,
  add column if not exists failure_reason text;

-- A failed assignment still occupies its employee — the user retries it rather
-- than assigning new work, so it stays in the active set.
drop index if exists assignments_one_active_per_employee;
create unique index assignments_one_active_per_employee
  on assignments (company_employee_id)
  where status in ('assigned', 'queued', 'working', 'submitted', 'needs_changes', 'failed');

-- company_employees: blocked means "this assignment hit a problem", not "fired"
alter table company_employees drop constraint if exists company_employees_work_status_check;
alter table company_employees add constraint company_employees_work_status_check
  check (work_status in ('ready', 'assigned', 'working', 'awaiting_review', 'blocked'));

create table if not exists work_executions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  assignment_id uuid not null references assignments (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  current_step text,
  attempt_number integer not null default 1,
  model_provider text,
  model_name text,
  -- The context as it stood at run time, so a later change to company
  -- knowledge doesn't rewrite the history of why this deliverable says what it says.
  input_snapshot jsonb,
  research_plan_json jsonb,
  error_code text,
  error_message text,
  input_tokens integer,
  output_tokens integer,
  search_request_count integer not null default 0,
  source_fetch_count integer not null default 0,
  estimated_cost_minor integer,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live execution per assignment; retries are new rows, not overwrites.
create unique index if not exists work_executions_one_active_per_assignment
  on work_executions (assignment_id)
  where status in ('queued', 'running');

create index if not exists work_executions_assignment_idx on work_executions (assignment_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assignments_last_execution_fkey'
  ) then
    alter table assignments
      add constraint assignments_last_execution_fkey
      foreign key (last_execution_id) references work_executions (id) on delete set null;
  end if;
end $$;

create table if not exists research_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  assignment_id uuid not null references assignments (id) on delete cascade,
  work_execution_id uuid not null references work_executions (id) on delete cascade,
  title text not null,
  url text not null,
  normalized_url text not null,
  domain text not null,
  source_type text,
  snippet text,
  content_text text,
  author text,
  published_at timestamptz,
  accessed_at timestamptz,
  fetch_status text not null default 'discovered'
    check (fetch_status in ('discovered', 'fetching', 'fetched', 'failed', 'blocked')),
  relevance_score integer not null default 0,
  trust_score integer not null default 0,
  selected_for_deliverable boolean not null default false,
  created_at timestamptz not null default now(),
  -- Normalized URLs are deduped per execution, not globally: two runs may
  -- legitimately cite the same page.
  unique (work_execution_id, normalized_url)
);

create index if not exists research_sources_execution_idx on research_sources (work_execution_id);

create table if not exists deliverable_sources (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables (id) on delete cascade,
  research_source_id uuid not null references research_sources (id) on delete cascade,
  citation_number integer not null,
  created_at timestamptz not null default now(),
  unique (deliverable_id, research_source_id),
  unique (deliverable_id, citation_number)
);

alter table deliverables
  add column if not exists work_execution_id uuid references work_executions (id) on delete set null,
  add column if not exists content_json jsonb,
  add column if not exists source_count integer not null default 0,
  add column if not exists generation_model text,
  add column if not exists generation_completed_at timestamptz;

-- A given execution submits at most one deliverable, however many times the
-- save path is retried.
create unique index if not exists deliverables_one_per_execution
  on deliverables (work_execution_id)
  where work_execution_id is not null;

alter table work_executions enable row level security;
alter table research_sources enable row level security;
alter table deliverable_sources enable row level security;

create policy "work_executions_select_own" on work_executions
  for select using (
    exists (select 1 from companies
            where companies.id = work_executions.company_id
            and companies.owner_id = auth.uid())
  );

create policy "work_executions_insert_own" on work_executions
  for insert with check (
    exists (select 1 from companies
            where companies.id = work_executions.company_id
            and companies.owner_id = auth.uid())
  );

create policy "work_executions_update_own" on work_executions
  for update using (
    exists (select 1 from companies
            where companies.id = work_executions.company_id
            and companies.owner_id = auth.uid())
  );

create policy "research_sources_select_own" on research_sources
  for select using (
    exists (select 1 from companies
            where companies.id = research_sources.company_id
            and companies.owner_id = auth.uid())
  );

create policy "research_sources_insert_own" on research_sources
  for insert with check (
    exists (select 1 from companies
            where companies.id = research_sources.company_id
            and companies.owner_id = auth.uid())
  );

create policy "research_sources_update_own" on research_sources
  for update using (
    exists (select 1 from companies
            where companies.id = research_sources.company_id
            and companies.owner_id = auth.uid())
  );

create policy "deliverable_sources_select_own" on deliverable_sources
  for select using (
    exists (
      select 1 from deliverables
      join companies on companies.id = deliverables.company_id
      where deliverables.id = deliverable_sources.deliverable_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "deliverable_sources_insert_own" on deliverable_sources
  for insert with check (
    exists (
      select 1 from deliverables
      join companies on companies.id = deliverables.company_id
      where deliverables.id = deliverable_sources.deliverable_id
      and companies.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Submission is one transaction: deliverable + citations + execution +
-- assignment + employee + progress trail move together or not at all.
-- ---------------------------------------------------------------------------
create or replace function submit_generated_deliverable(
  p_execution_id uuid,
  p_title text,
  p_deliverable_type text,
  p_content_markdown text,
  p_content_json jsonb,
  p_generation_model text,
  p_citations jsonb
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_execution work_executions%rowtype;
  v_existing deliverables%rowtype;
  v_deliverable_id uuid;
  v_now timestamptz := now();
  v_citation jsonb;
  v_source_count integer := 0;
begin
  select * into v_execution from work_executions where id = p_execution_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'execution_not_found');
  end if;

  select * into v_existing from deliverables where work_execution_id = p_execution_id;
  if found then
    return jsonb_build_object(
      'ok', false, 'reason', 'already_submitted', 'deliverableId', v_existing.id
    );
  end if;

  insert into deliverables (
    company_id, assignment_id, company_employee_id, work_execution_id,
    title, deliverable_type, content_markdown, content_json,
    status, version, submitted_at, source_count,
    generation_model, generation_completed_at
  )
  values (
    v_execution.company_id, v_execution.assignment_id, v_execution.company_employee_id,
    p_execution_id, p_title, p_deliverable_type, p_content_markdown, p_content_json,
    'submitted', 1, v_now, 0, p_generation_model, v_now
  )
  returning id into v_deliverable_id;

  for v_citation in select * from jsonb_array_elements(p_citations)
  loop
    insert into deliverable_sources (deliverable_id, research_source_id, citation_number)
    values (
      v_deliverable_id,
      (v_citation ->> 'sourceId')::uuid,
      (v_citation ->> 'citationNumber')::integer
    );
    v_source_count := v_source_count + 1;
  end loop;

  update deliverables set source_count = v_source_count where id = v_deliverable_id;

  update work_executions
  set status = 'completed', current_step = 'completed', completed_at = v_now, updated_at = v_now
  where id = p_execution_id;

  update assignments
  set status = 'submitted',
      submitted_at = v_now,
      current_progress_step = 'deliverable_submitted',
      failure_reason = null,
      updated_at = v_now
  where id = v_execution.assignment_id;

  update company_employees
  set work_status = 'awaiting_review'
  where id = v_execution.company_employee_id;

  update assignment_progress_events
  set status = 'completed', completed_at = v_now
  where assignment_id = v_execution.assignment_id
    and event_type in ('research_started', 'findings_organized', 'deliverable_prepared')
    and status <> 'completed';

  insert into assignment_progress_events (
    assignment_id, event_type, title, status, sequence, completed_at
  )
  values (
    v_execution.assignment_id, 'deliverable_submitted', 'Deliverable submitted',
    'completed', 5, v_now
  )
  on conflict (assignment_id, event_type) do nothing;

  return jsonb_build_object('ok', true, 'deliverableId', v_deliverable_id);
end;
$$;

-- Failure leaves the assignment attached to its employee so it can be retried.
create or replace function fail_work_execution(
  p_execution_id uuid,
  p_error_code text,
  p_error_message text
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_execution work_executions%rowtype;
  v_now timestamptz := now();
begin
  update work_executions
  set status = 'failed', error_code = p_error_code, error_message = p_error_message,
      failed_at = v_now, updated_at = v_now
  where id = p_execution_id and status in ('queued', 'running')
  returning * into v_execution;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_running');
  end if;

  update assignments
  set status = 'failed', failure_reason = p_error_code, updated_at = v_now
  where id = v_execution.assignment_id;

  update company_employees
  set work_status = 'blocked'
  where id = v_execution.company_employee_id;

  return jsonb_build_object('ok', true);
end;
$$;
