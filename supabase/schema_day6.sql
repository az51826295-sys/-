-- AI Workforce - Day 6 schema (Feedback, Revision & Deliverable Versioning)
-- Run this in the Supabase SQL editor after schema_day5.sql.

-- assignments: a revision is queued, then running
alter table assignments drop constraint if exists assignments_status_check;
alter table assignments add constraint assignments_status_check
  check (status in (
    'draft', 'assigned', 'queued', 'working', 'submitted', 'needs_changes',
    'revision_queued', 'revising', 'completed', 'failed', 'cancelled'
  ));

drop index if exists assignments_one_active_per_employee;
create unique index assignments_one_active_per_employee
  on assignments (company_employee_id)
  where status in (
    'assigned', 'queued', 'working', 'submitted', 'needs_changes',
    'revision_queued', 'revising', 'failed'
  );

-- progress events: the revision half of the trail
alter table assignment_progress_events drop constraint if exists assignment_progress_events_event_type_check;
alter table assignment_progress_events add constraint assignment_progress_events_event_type_check
  check (event_type in (
    'assignment_received',
    'company_context_reviewed',
    'research_started',
    'findings_organized',
    'deliverable_prepared',
    'deliverable_submitted',
    'review_approved',
    'revision_requested',
    'revision_started',
    'revision_plan_created',
    'additional_evidence_reviewed',
    'requested_changes_checked',
    'revised_deliverable_submitted',
    'assignment_completed'
  ));

create table if not exists revision_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  assignment_id uuid not null references assignments (id) on delete cascade,
  source_deliverable_id uuid not null references deliverables (id) on delete cascade,
  deliverable_review_id uuid references deliverable_reviews (id) on delete set null,
  company_employee_id uuid not null references company_employees (id) on delete cascade,
  feedback text not null,
  status text not null default 'pending'
    check (status in ('pending', 'queued', 'in_progress', 'completed', 'failed', 'cancelled')),
  target_version integer not null,
  requested_by_user_id uuid not null references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live revision per deliverable; a second Needs Changes on the same
-- version cannot fork the work.
create unique index if not exists revision_requests_one_active_per_deliverable
  on revision_requests (source_deliverable_id)
  where status in ('pending', 'queued', 'in_progress');

create index if not exists revision_requests_assignment_idx on revision_requests (assignment_id);

-- work_executions: lineage so a revision knows what it is revising
alter table work_executions
  add column if not exists execution_type text not null default 'initial'
    check (execution_type in ('initial', 'revision', 'retry')),
  add column if not exists revision_request_id uuid references revision_requests (id) on delete set null,
  add column if not exists parent_execution_id uuid references work_executions (id) on delete set null,
  add column if not exists source_deliverable_id uuid references deliverables (id) on delete set null,
  add column if not exists target_version integer not null default 1,
  add column if not exists feedback_analysis_json jsonb,
  add column if not exists revision_validation_json jsonb;

-- deliverables: version lineage
alter table deliverables
  add column if not exists parent_deliverable_id uuid references deliverables (id) on delete set null,
  add column if not exists revision_request_id uuid references revision_requests (id) on delete set null,
  add column if not exists revision_summary_json jsonb,
  add column if not exists superseded_at timestamptz;

-- A source can be used by many executions, so the relationship is its own table
-- rather than a column on research_sources.
create table if not exists work_execution_sources (
  id uuid primary key default gen_random_uuid(),
  work_execution_id uuid not null references work_executions (id) on delete cascade,
  research_source_id uuid not null references research_sources (id) on delete cascade,
  usage_type text not null default 'selected'
    check (usage_type in ('discovered', 'selected', 'reused', 'cited')),
  created_at timestamptz not null default now(),
  unique (work_execution_id, research_source_id)
);

alter table revision_requests enable row level security;
alter table work_execution_sources enable row level security;

create policy "revision_requests_select_own" on revision_requests
  for select using (
    exists (select 1 from companies
            where companies.id = revision_requests.company_id
            and companies.owner_id = auth.uid())
  );

create policy "revision_requests_insert_own" on revision_requests
  for insert with check (
    exists (select 1 from companies
            where companies.id = revision_requests.company_id
            and companies.owner_id = auth.uid())
  );

create policy "revision_requests_update_own" on revision_requests
  for update using (
    exists (select 1 from companies
            where companies.id = revision_requests.company_id
            and companies.owner_id = auth.uid())
  );

create policy "work_execution_sources_select_own" on work_execution_sources
  for select using (
    exists (
      select 1 from work_executions
      join companies on companies.id = work_executions.company_id
      where work_executions.id = work_execution_sources.work_execution_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "work_execution_sources_insert_own" on work_execution_sources
  for insert with check (
    exists (
      select 1 from work_executions
      join companies on companies.id = work_executions.company_id
      where work_executions.id = work_execution_sources.work_execution_id
      and companies.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Needs Changes now also opens a revision. Version numbers are decided here,
-- never by the client, and the revision limit is enforced server-side.
-- ---------------------------------------------------------------------------
create or replace function request_deliverable_changes_v2(
  p_deliverable_id uuid,
  p_feedback text,
  p_max_revisions integer
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_deliverable deliverables%rowtype;
  v_latest_version integer;
  v_review_id uuid;
  v_revision_id uuid;
  v_now timestamptz := now();
begin
  if coalesce(length(trim(p_feedback)), 0) < 10 then
    return jsonb_build_object('ok', false, 'reason', 'feedback_too_short');
  end if;

  select * into v_deliverable from deliverables where id = p_deliverable_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select max(version) into v_latest_version
  from deliverables where assignment_id = v_deliverable.assignment_id;

  -- Reviewing an older version would branch the history; refuse and point at
  -- the current one.
  if v_deliverable.version < v_latest_version then
    return jsonb_build_object(
      'ok', false, 'reason', 'not_latest_version',
      'latestVersion', v_latest_version
    );
  end if;

  -- version 1 plus p_max_revisions is the ceiling.
  if v_latest_version >= p_max_revisions + 1 then
    return jsonb_build_object('ok', false, 'reason', 'revision_limit_reached');
  end if;

  update deliverables
  set status = 'needs_changes', reviewed_at = v_now, updated_at = v_now
  where id = p_deliverable_id and status = 'submitted';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_reviewable');
  end if;

  insert into deliverable_reviews (
    company_id, deliverable_id, reviewer_user_id, decision, feedback
  )
  values (
    v_deliverable.company_id, v_deliverable.id, auth.uid(), 'needs_changes', trim(p_feedback)
  )
  returning id into v_review_id;

  insert into revision_requests (
    company_id, assignment_id, source_deliverable_id, deliverable_review_id,
    company_employee_id, feedback, status, target_version, requested_by_user_id
  )
  values (
    v_deliverable.company_id, v_deliverable.assignment_id, v_deliverable.id, v_review_id,
    v_deliverable.company_employee_id, trim(p_feedback), 'pending', v_latest_version + 1, auth.uid()
  )
  returning id into v_revision_id;

  update assignments
  set status = 'needs_changes',
      current_progress_step = 'revision_requested',
      updated_at = v_now
  where id = v_deliverable.assignment_id;

  update company_employees
  set work_status = 'working'
  where id = v_deliverable.company_employee_id;

  -- Each revision drives its own trail, so clear the previous round's markers
  -- rather than leaving stale completions from an earlier revision.
  delete from assignment_progress_events
  where assignment_id = v_deliverable.assignment_id
    and event_type in (
      'revision_plan_created', 'additional_evidence_reviewed',
      'requested_changes_checked', 'revised_deliverable_submitted'
    );

  insert into assignment_progress_events (
    assignment_id, event_type, title, status, sequence, completed_at
  )
  values
    (v_deliverable.assignment_id, 'revision_requested', 'Manager feedback received', 'completed', 6, v_now),
    (v_deliverable.assignment_id, 'revision_started', 'Revising the deliverable', 'active', 7, null),
    (v_deliverable.assignment_id, 'revision_plan_created', 'Revision plan created', 'pending', 8, null),
    (v_deliverable.assignment_id, 'additional_evidence_reviewed', 'Additional evidence reviewed', 'pending', 9, null),
    (v_deliverable.assignment_id, 'requested_changes_checked', 'Requested changes checked', 'pending', 10, null),
    (v_deliverable.assignment_id, 'revised_deliverable_submitted', 'Revised deliverable submitted', 'pending', 11, null)
  on conflict (assignment_id, event_type) do update
    set status = excluded.status, completed_at = excluded.completed_at;

  return jsonb_build_object(
    'ok', true, 'revisionRequestId', v_revision_id, 'targetVersion', v_latest_version + 1
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Resubmission: the new version, its citations, the superseded predecessor,
-- the revision request, the execution, the assignment and the employee all
-- move in one transaction.
-- ---------------------------------------------------------------------------
create or replace function submit_revised_deliverable(
  p_execution_id uuid,
  p_title text,
  p_deliverable_type text,
  p_content_markdown text,
  p_content_json jsonb,
  p_revision_summary_json jsonb,
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
  v_next_version integer;
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

  -- The server owns version numbering; a retry that already produced a version
  -- cannot mint a second one because of the unique (assignment_id, version).
  select coalesce(max(version), 0) + 1 into v_next_version
  from deliverables where assignment_id = v_execution.assignment_id;

  insert into deliverables (
    company_id, assignment_id, company_employee_id, work_execution_id,
    parent_deliverable_id, revision_request_id,
    title, deliverable_type, content_markdown, content_json, revision_summary_json,
    status, version, submitted_at, source_count,
    generation_model, generation_completed_at
  )
  values (
    v_execution.company_id, v_execution.assignment_id, v_execution.company_employee_id,
    p_execution_id, v_execution.source_deliverable_id, v_execution.revision_request_id,
    p_title, p_deliverable_type, p_content_markdown, p_content_json, p_revision_summary_json,
    'submitted', v_next_version, v_now, 0, p_generation_model, v_now
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

  -- The predecessor keeps its content, sources and review; only its standing changes.
  update deliverables
  set status = 'superseded', superseded_at = v_now, updated_at = v_now
  where id = v_execution.source_deliverable_id;

  update revision_requests
  set status = 'completed', completed_at = v_now, updated_at = v_now
  where id = v_execution.revision_request_id;

  update work_executions
  set status = 'completed', current_step = 'completed', completed_at = v_now, updated_at = v_now
  where id = p_execution_id;

  update assignments
  set status = 'submitted',
      submitted_at = v_now,
      current_progress_step = 'revised_deliverable_submitted',
      failure_reason = null,
      updated_at = v_now
  where id = v_execution.assignment_id;

  update company_employees
  set work_status = 'awaiting_review'
  where id = v_execution.company_employee_id;

  update assignment_progress_events
  set status = 'completed', completed_at = v_now
  where assignment_id = v_execution.assignment_id
    and event_type in (
      'revision_started', 'revision_plan_created',
      'additional_evidence_reviewed', 'requested_changes_checked',
      'revised_deliverable_submitted'
    )
    and status <> 'completed';

  return jsonb_build_object(
    'ok', true, 'deliverableId', v_deliverable_id, 'version', v_next_version
  );
end;
$$;

-- A failed revision leaves the previous version and the feedback untouched.
create or replace function fail_revision_execution(
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

  update revision_requests
  set status = 'failed', failed_at = v_now, updated_at = v_now
  where id = v_execution.revision_request_id;

  update assignments
  set status = 'failed', failure_reason = p_error_code, updated_at = v_now
  where id = v_execution.assignment_id;

  update company_employees
  set work_status = 'blocked'
  where id = v_execution.company_employee_id;

  return jsonb_build_object('ok', true);
end;
$$;
