-- AI Workforce - Day 8 schema (Second Employee, Role Skills & Structured Deliverables)
-- Run this in the Supabase SQL editor after schema_day7.sql.

-- Role-specific knowledge, kept beside the common company knowledge rather than
-- in place of it. Alex and Emma both need to know what the company does; only
-- Emma needs an ideal customer profile. The schema id records which shape was
-- written, so a later version can be read back safely.
alter table employee_knowledge_profiles
  add column if not exists role_knowledge_json jsonb,
  add column if not exists role_knowledge_schema_id text;

-- Per-assignment role input: Emma's target count and filters. Separate from
-- role knowledge because changing an assignment must never rewrite what the
-- employee was taught during onboarding.
alter table assignments
  add column if not exists role_input_json jsonb,
  add column if not exists role_input_schema_id text;

-- Structured candidates, stored before the deliverable is written. The model
-- then orders and explains rows that already exist rather than being trusted to
-- produce companies, which is what makes an invented lead unrepresentable.
create table if not exists lead_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  assignment_id uuid not null references assignments (id) on delete cascade,
  work_execution_id uuid not null references work_executions (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,

  company_name text not null,
  normalized_company_name text not null,
  website_url text not null,
  domain text not null,

  industry text,
  company_description text,
  employee_range_json jsonb,
  location text,

  fit_reasons_json jsonb not null default '[]'::jsonb,
  buying_signals_json jsonb not null default '[]'::jsonb,
  recommended_buyer_roles_json jsonb not null default '[]'::jsonb,
  -- Only people confirmed on a public professional or company page. Never a
  -- guessed name, and never a personal contact detail.
  verified_contacts_json jsonb not null default '[]'::jsonb,
  -- A general company address published on the company's own site, or null.
  public_contact_email text,

  qualification_status text not null default 'insufficient_information'
    check (qualification_status in (
      'qualified', 'possible_fit', 'not_qualified', 'insufficient_information'
    )),
  qualification_score integer not null default 0,
  qualification_details_json jsonb,

  selected_for_deliverable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One row per company per run: the same company surfaces from several
  -- searches, and the discovery step merges rather than duplicating.
  unique (work_execution_id, domain)
);

create index if not exists lead_candidates_execution_idx
  on lead_candidates (work_execution_id, qualification_status);

-- Which source backs which part of a lead. A lead list is read row by row, so
-- "this company is a fit" and "this company is hiring support agents" have to
-- be traceable separately.
create table if not exists lead_candidate_sources (
  id uuid primary key default gen_random_uuid(),
  lead_candidate_id uuid not null references lead_candidates (id) on delete cascade,
  research_source_id uuid not null references research_sources (id) on delete cascade,
  evidence_type text not null check (evidence_type in (
    'company_identity', 'industry', 'company_size', 'location',
    'buying_signal', 'contact_role', 'public_contact', 'qualification'
  )),
  created_at timestamptz not null default now(),
  unique (lead_candidate_id, research_source_id, evidence_type)
);

alter table lead_candidates enable row level security;
alter table lead_candidate_sources enable row level security;

drop policy if exists "lead_candidates_select_own" on lead_candidates;
create policy "lead_candidates_select_own" on lead_candidates
  for select using (
    exists (select 1 from companies
            where companies.id = lead_candidates.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "lead_candidates_insert_own" on lead_candidates;
create policy "lead_candidates_insert_own" on lead_candidates
  for insert with check (
    exists (select 1 from companies
            where companies.id = lead_candidates.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "lead_candidates_update_own" on lead_candidates;
create policy "lead_candidates_update_own" on lead_candidates
  for update using (
    exists (select 1 from companies
            where companies.id = lead_candidates.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists "lead_candidate_sources_select_own" on lead_candidate_sources;
create policy "lead_candidate_sources_select_own" on lead_candidate_sources
  for select using (
    exists (
      select 1 from lead_candidates c
      join companies on companies.id = c.company_id
      where c.id = lead_candidate_sources.lead_candidate_id
      and companies.owner_id = auth.uid()
    )
  );

drop policy if exists "lead_candidate_sources_insert_own" on lead_candidate_sources;
create policy "lead_candidate_sources_insert_own" on lead_candidate_sources
  for insert with check (
    exists (
      select 1 from lead_candidates c
      join companies on companies.id = c.company_id
      where c.id = lead_candidate_sources.lead_candidate_id
      and companies.owner_id = auth.uid()
    )
  );

-- Emma becomes the Sales Development Representative and opens for hire. She was
-- seeded on Day 1 as a "coming soon" Content Marketer; the row is updated in
-- place rather than replaced, because the slug is what the code registry keys
-- on and any existing hire points at this id.
update employees
set role = 'Sales Development Representative',
    description = 'Emma researches potential customers and prepares qualified prospect lists for your sales team.',
    responsibilities = array[
      'Find companies that match the ideal customer profile',
      'Identify relevant decision-makers',
      'Explain why each company is a fit',
      'Verify important lead information',
      'Organize prospects for sales follow-up'
    ],
    status = 'available'
where slug = 'emma';

-- Maya was the placeholder sales rep. With Emma doing that job, Maya takes over
-- the content role Emma vacated, so the directory doesn't advertise the same
-- job twice.
update employees
set role = 'Content Marketer',
    description = 'Maya will plan and write content that grows your audience.'
where slug = 'maya';

insert into employees (name, role, description, responsibilities, salary, status, slug)
select
  'Emma',
  'Sales Development Representative',
  'Emma researches potential customers and prepares qualified prospect lists for your sales team.',
  array[
    'Find companies that match the ideal customer profile',
    'Identify relevant decision-makers',
    'Explain why each company is a fit',
    'Verify important lead information',
    'Organize prospects for sales follow-up'
  ],
  '$2,000/mo',
  'available',
  'emma'
where not exists (select 1 from employees where slug = 'emma');

-- Per-run counts that differ by role: a report is measured in sources, a lead
-- list in companies found versus companies kept.
alter table work_executions
  add column if not exists metrics_json jsonb;
