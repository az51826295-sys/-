-- AI Workforce - Day 4 schema (First Deliverable & Manager Review)
-- Run this in the Supabase SQL editor after schema_day3.sql.

-- assignments: revision requests are a new resting state
alter table assignments drop constraint if exists assignments_status_check;
alter table assignments add constraint assignments_status_check
  check (status in (
    'draft', 'assigned', 'working', 'submitted', 'needs_changes', 'completed', 'cancelled'
  ));

-- The partial unique index must keep needs_changes occupying the employee too,
-- otherwise a second assignment could be created mid-revision.
drop index if exists assignments_one_active_per_employee;
create unique index assignments_one_active_per_employee
  on assignments (company_employee_id)
  where status in ('assigned', 'working', 'submitted', 'needs_changes');

-- progress events: the review half of the lifecycle
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
    'assignment_completed'
  ));

create table if not exists deliverables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  assignment_id uuid not null references assignments (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,
  title text not null,
  deliverable_type text not null,
  content_markdown text not null,
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'approved', 'needs_changes', 'superseded')),
  version integer not null default 1,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One deliverable per assignment while version stays at 1; later revisions bump it.
  unique (assignment_id, version)
);

create index if not exists deliverables_company_id_idx on deliverables (company_id);

create table if not exists deliverable_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  deliverable_id uuid not null references deliverables (id) on delete cascade,
  reviewer_user_id uuid not null references auth.users (id) on delete cascade,
  decision text not null check (decision in ('approved', 'needs_changes')),
  feedback text,
  created_at timestamptz not null default now(),
  -- needs_changes must carry feedback; approvals may not.
  constraint deliverable_reviews_feedback_required
    check (decision <> 'needs_changes' or coalesce(length(trim(feedback)), 0) >= 10)
);

alter table deliverables enable row level security;
alter table deliverable_reviews enable row level security;

create policy "deliverables_select_own" on deliverables
  for select using (
    exists (
      select 1 from companies
      where companies.id = deliverables.company_id and companies.owner_id = auth.uid()
    )
  );

create policy "deliverables_insert_own" on deliverables
  for insert with check (
    exists (
      select 1 from companies
      where companies.id = deliverables.company_id and companies.owner_id = auth.uid()
    )
  );

create policy "deliverables_update_own" on deliverables
  for update using (
    exists (
      select 1 from companies
      where companies.id = deliverables.company_id and companies.owner_id = auth.uid()
    )
  );

create policy "deliverable_reviews_select_own" on deliverable_reviews
  for select using (
    exists (
      select 1 from companies
      where companies.id = deliverable_reviews.company_id and companies.owner_id = auth.uid()
    )
  );

create policy "deliverable_reviews_insert_own" on deliverable_reviews
  for insert with check (
    exists (
      select 1 from companies
      where companies.id = deliverable_reviews.company_id and companies.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Review transitions run inside plpgsql functions so the deliverable, the
-- assignment, the employee, and the progress trail move together or not at all.
-- Each runs SECURITY INVOKER, so RLS still scopes every row to the caller.
-- The leading conditional UPDATE doubles as an optimistic lock: concurrent
-- approve and request-changes calls race on the same row and only one wins.
-- ---------------------------------------------------------------------------

create or replace function submit_deliverable(
  p_assignment_id uuid,
  p_title text,
  p_deliverable_type text,
  p_content_markdown text
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_assignment assignments%rowtype;
  v_existing deliverables%rowtype;
  v_deliverable_id uuid;
  v_now timestamptz := now();
begin
  select * into v_existing from deliverables
  where assignment_id = p_assignment_id and version = 1;

  if found then
    return jsonb_build_object(
      'ok', false, 'reason', 'already_submitted', 'deliverableId', v_existing.id
    );
  end if;

  update assignments
  set status = 'submitted',
      submitted_at = v_now,
      current_progress_step = 'deliverable_submitted',
      updated_at = v_now
  where id = p_assignment_id and status in ('working', 'needs_changes')
  returning * into v_assignment;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_working');
  end if;

  insert into deliverables (
    company_id, assignment_id, company_employee_id,
    title, deliverable_type, content_markdown, status, version, submitted_at
  )
  values (
    v_assignment.company_id, v_assignment.id, v_assignment.company_employee_id,
    p_title, p_deliverable_type, p_content_markdown, 'submitted', 1, v_now
  )
  returning id into v_deliverable_id;

  update company_employees
  set work_status = 'awaiting_review'
  where id = v_assignment.company_employee_id;

  -- The research steps are done by the time work is handed in.
  update assignment_progress_events
  set status = 'completed', completed_at = v_now
  where assignment_id = v_assignment.id
    and event_type in ('research_started', 'findings_organized', 'deliverable_prepared')
    and status <> 'completed';

  insert into assignment_progress_events (
    assignment_id, event_type, title, status, sequence, completed_at
  )
  values (
    v_assignment.id, 'deliverable_submitted', 'Deliverable submitted', 'completed', 5, v_now
  )
  on conflict (assignment_id, event_type) do nothing;

  return jsonb_build_object('ok', true, 'deliverableId', v_deliverable_id);
end;
$$;

create or replace function approve_deliverable(p_deliverable_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_deliverable deliverables%rowtype;
  v_now timestamptz := now();
begin
  update deliverables
  set status = 'approved', reviewed_at = v_now, approved_at = v_now, updated_at = v_now
  where id = p_deliverable_id and status = 'submitted'
  returning * into v_deliverable;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_reviewable');
  end if;

  insert into deliverable_reviews (company_id, deliverable_id, reviewer_user_id, decision)
  values (v_deliverable.company_id, v_deliverable.id, auth.uid(), 'approved');

  update assignments
  set status = 'completed',
      completed_at = v_now,
      current_progress_step = 'assignment_completed',
      updated_at = v_now
  where id = v_deliverable.assignment_id;

  update company_employees
  set work_status = 'ready', current_assignment_id = null
  where id = v_deliverable.company_employee_id;

  insert into assignment_progress_events (
    assignment_id, event_type, title, status, sequence, completed_at
  )
  values
    (v_deliverable.assignment_id, 'review_approved', 'Manager approved the deliverable', 'completed', 6, v_now),
    (v_deliverable.assignment_id, 'assignment_completed', 'Assignment completed', 'completed', 7, v_now)
  on conflict (assignment_id, event_type) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function request_deliverable_changes(
  p_deliverable_id uuid,
  p_feedback text
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_deliverable deliverables%rowtype;
  v_now timestamptz := now();
begin
  if coalesce(length(trim(p_feedback)), 0) < 10 then
    return jsonb_build_object('ok', false, 'reason', 'feedback_too_short');
  end if;

  update deliverables
  set status = 'needs_changes', reviewed_at = v_now, updated_at = v_now
  where id = p_deliverable_id and status = 'submitted'
  returning * into v_deliverable;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_reviewable');
  end if;

  insert into deliverable_reviews (
    company_id, deliverable_id, reviewer_user_id, decision, feedback
  )
  values (
    v_deliverable.company_id, v_deliverable.id, auth.uid(), 'needs_changes', trim(p_feedback)
  );

  -- The employee keeps the assignment; only the work resumes.
  update assignments
  set status = 'needs_changes',
      current_progress_step = 'revision_started',
      updated_at = v_now
  where id = v_deliverable.assignment_id;

  update company_employees
  set work_status = 'working'
  where id = v_deliverable.company_employee_id;

  insert into assignment_progress_events (
    assignment_id, event_type, title, status, sequence, completed_at
  )
  values
    (v_deliverable.assignment_id, 'revision_requested', 'Manager feedback received', 'completed', 6, v_now),
    (v_deliverable.assignment_id, 'revision_started', 'Revising the deliverable', 'active', 7, null)
  on conflict (assignment_id, event_type) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;
