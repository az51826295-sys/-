-- AI Workforce - Day 2 schema (Employee Onboarding & Company Training)
-- Run this in the Supabase SQL editor after schema.sql.

-- employees: give each catalog employee a stable slug so onboarding
-- question definitions (in code) can be looked up without depending on ids.
alter table employees add column if not exists slug text;
update employees set slug = lower(name) where slug is null;
alter table employees alter column slug set not null;
create unique index if not exists employees_slug_key on employees (slug);

-- company_employees: extend Hired -> Onboarding -> Ready lifecycle
alter table company_employees
  add column if not exists employment_status text not null default 'active'
    check (employment_status in ('active', 'inactive', 'terminated')),
  add column if not exists onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started', 'in_progress', 'completed')),
  add column if not exists onboarding_started_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists current_question_id text;

create table if not exists employee_onboarding_answers (
  id uuid primary key default gen_random_uuid(),
  company_employee_id uuid not null references company_employees (id) on delete cascade,
  question_id text not null,
  question_category text not null check (question_category in ('company', 'role')),
  answer_text text,
  answer_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_employee_id, question_id)
);

create table if not exists employee_knowledge_profiles (
  id uuid primary key default gen_random_uuid(),
  company_employee_id uuid not null unique references company_employees (id) on delete cascade,
  company_summary text,
  customer_summary text,
  problem_summary text,
  differentiation_summary text,
  competitors jsonb not null default '[]',
  priorities jsonb not null default '[]',
  additional_context text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table employee_onboarding_answers enable row level security;
alter table employee_knowledge_profiles enable row level security;

-- company_employees: owners can update their own hires (onboarding status etc.)
drop policy if exists "company_employees_update_own" on company_employees;
create policy "company_employees_update_own" on company_employees
  for update using (
    exists (
      select 1 from companies
      where companies.id = company_employees.company_id
      and companies.owner_id = auth.uid()
    )
  );

-- employee_onboarding_answers: scoped through company_employees -> companies.owner_id
create policy "onboarding_answers_select_own" on employee_onboarding_answers
  for select using (
    exists (
      select 1 from company_employees
      join companies on companies.id = company_employees.company_id
      where company_employees.id = employee_onboarding_answers.company_employee_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "onboarding_answers_insert_own" on employee_onboarding_answers
  for insert with check (
    exists (
      select 1 from company_employees
      join companies on companies.id = company_employees.company_id
      where company_employees.id = employee_onboarding_answers.company_employee_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "onboarding_answers_update_own" on employee_onboarding_answers
  for update using (
    exists (
      select 1 from company_employees
      join companies on companies.id = company_employees.company_id
      where company_employees.id = employee_onboarding_answers.company_employee_id
      and companies.owner_id = auth.uid()
    )
  );

-- employee_knowledge_profiles: same ownership scoping
create policy "knowledge_profiles_select_own" on employee_knowledge_profiles
  for select using (
    exists (
      select 1 from company_employees
      join companies on companies.id = company_employees.company_id
      where company_employees.id = employee_knowledge_profiles.company_employee_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "knowledge_profiles_insert_own" on employee_knowledge_profiles
  for insert with check (
    exists (
      select 1 from company_employees
      join companies on companies.id = company_employees.company_id
      where company_employees.id = employee_knowledge_profiles.company_employee_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "knowledge_profiles_update_own" on employee_knowledge_profiles
  for update using (
    exists (
      select 1 from company_employees
      join companies on companies.id = company_employees.company_id
      where company_employees.id = employee_knowledge_profiles.company_employee_id
      and companies.owner_id = auth.uid()
    )
  );
