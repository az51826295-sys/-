-- AI Workforce - Day 11 schema (Employee Collaboration & Internal Requests)
-- Run this in the Supabase SQL editor after schema_day10.sql.

-- One employee asking another for something they can't do themselves.
--
-- Deliberately not an assignment: an assignment is work the manager asked for
-- and will review, and this is work one employee needs in order to finish
-- theirs. The manager sees the outcome, not the errand.
create table if not exists internal_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  requester_company_employee_id uuid not null
    references company_employees (id) on delete cascade,
  assignee_company_employee_id uuid not null
    references company_employees (id) on delete cascade,

  parent_assignment_id uuid not null references assignments (id) on delete cascade,
  child_assignment_id uuid references assignments (id) on delete set null,

  title text not null,
  description text not null,
  -- What the requester needs, named as a capability rather than an employee, so
  -- routing stays a question of who can do this rather than who we know.
  requested_capability text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),

  status text not null default 'pending' check (status in (
    'pending', 'working', 'completed', 'failed', 'cancelled', 'declined'
  )),
  decline_reason text,
  failure_code text,
  failure_message text,

  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- An employee cannot ask themselves for help.
  constraint internal_requests_not_self
    check (requester_company_employee_id <> assignee_company_employee_id)
);

create index if not exists internal_requests_parent_idx
  on internal_requests (parent_assignment_id);

create index if not exists internal_requests_open_idx
  on internal_requests (company_id, status);

-- One outstanding request per capability per parent assignment, so a retried or
-- duplicated run can't ask the same colleague for the same thing twice.
create unique index if not exists internal_requests_one_open_per_need
  on internal_requests (parent_assignment_id, requested_capability)
  where status in ('pending', 'working');

-- Work done for a colleague rather than for the manager. Same table, same
-- execution, same deliverable machinery — only the audience differs.
alter table assignments
  add column if not exists assignment_type text not null default 'manager',
  add column if not exists parent_assignment_id uuid
    references assignments (id) on delete cascade,
  add column if not exists internal_request_id uuid
    references internal_requests (id) on delete set null;

-- Every manager-facing list filters on this. Indexed because it is now the most
-- common predicate in the product.
create index if not exists assignments_manager_facing_idx
  on assignments (company_id, assignment_type, status);

alter table internal_requests enable row level security;

drop policy if exists "internal_requests_select_own" on internal_requests;
create policy "internal_requests_select_own" on internal_requests
  for select using (
    exists (select 1 from companies
            where companies.id = internal_requests.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "internal_requests_insert_own" on internal_requests;
create policy "internal_requests_insert_own" on internal_requests
  for insert with check (
    exists (select 1 from companies
            where companies.id = internal_requests.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "internal_requests_update_own" on internal_requests;
create policy "internal_requests_update_own" on internal_requests
  for update using (
    exists (select 1 from companies
            where companies.id = internal_requests.company_id
            and companies.owner_id = auth.uid())
  );
