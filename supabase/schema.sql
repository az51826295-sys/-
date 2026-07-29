-- AI Workforce - Day 1 schema
-- Run this in the Supabase SQL editor (or `supabase db push`).

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  website text,
  created_at timestamptz not null default now()
);

create unique index if not exists companies_owner_id_key on companies (owner_id);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  description text not null,
  responsibilities text[] not null default '{}',
  salary text not null,
  status text not null default 'coming_soon' check (status in ('available', 'coming_soon')),
  created_at timestamptz not null default now()
);

create table if not exists company_employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  hired_at timestamptz not null default now(),
  unique (company_id, employee_id)
);

alter table companies enable row level security;
alter table employees enable row level security;
alter table company_employees enable row level security;

-- companies: a user can only see and manage their own company
create policy "companies_select_own" on companies
  for select using (auth.uid() = owner_id);

create policy "companies_insert_own" on companies
  for insert with check (auth.uid() = owner_id);

create policy "companies_update_own" on companies
  for update using (auth.uid() = owner_id);

-- employees: public catalog, readable by any signed-in user
create policy "employees_select_authenticated" on employees
  for select to authenticated using (true);

-- company_employees: a user can only see/hire into their own company
create policy "company_employees_select_own" on company_employees
  for select using (
    exists (
      select 1 from companies
      where companies.id = company_employees.company_id
      and companies.owner_id = auth.uid()
    )
  );

create policy "company_employees_insert_own" on company_employees
  for insert with check (
    exists (
      select 1 from companies
      where companies.id = company_employees.company_id
      and companies.owner_id = auth.uid()
    )
  );

insert into employees (name, role, description, responsibilities, salary, status)
values
  (
    'Alex',
    'Market Research Analyst',
    'Alex tracks your market, competitors, and customers so you always know what''s happening before it becomes a problem.',
    array['Competitor monitoring', 'Market trend reports', 'Customer insight summaries'],
    '$2,000/mo',
    'available'
  ),
  (
    'Emma',
    'Content Marketer',
    'Emma will plan and write content that grows your audience.',
    array[]::text[],
    '$2,000/mo',
    'coming_soon'
  ),
  (
    'Maya',
    'Sales Development Rep',
    'Maya will find and qualify leads for your sales pipeline.',
    array[]::text[],
    '$2,000/mo',
    'coming_soon'
  )
on conflict do nothing;
