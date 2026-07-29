-- Files a deliverable is made of.
--
-- Everything this product has produced so far has been markdown: a report is
-- text, a lead list is text. A music team's work is not, and neither is an
-- artist's. This is the piece that has to exist before any of them can.
--
-- Two decisions worth naming.
--
-- The bucket is private. What a company's employees produce is that company's
-- property — a game's soundtrack sitting on a guessable public URL is not a
-- storage detail, it is giving the work away. Reads go through short-lived
-- signed URLs instead.
--
-- The path carries the company id as its first segment, because that is what
-- makes isolation enforceable in the storage layer at all. Postgres RLS on a
-- normal table can join to companies; a storage policy can only look at the
-- object's name. Putting the id first turns the path into the thing the policy
-- checks, so a file cannot be read across companies even if its id leaks.
--
--   {company_id}/{deliverable_id}/{filename}

insert into storage.buckets (id, name, public)
values ('deliverable-files', 'deliverable-files', false)
on conflict (id) do update set public = false;

-- The manager may read their own company's files, and nothing else. Written as
-- four separate policies rather than one "for all" so a mistake in one verb
-- cannot silently widen the others.
do $$
declare
  verb text;
begin
  foreach verb in array array['select', 'insert', 'update', 'delete'] loop
    execute format(
      'drop policy if exists %I on storage.objects',
      'deliverable_files_' || verb || '_own');
  end loop;
end $$;

create policy deliverable_files_select_own on storage.objects
  for select using (
    bucket_id = 'deliverable-files'
    and exists (
      select 1 from companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_id = auth.uid()
    )
  );

create policy deliverable_files_insert_own on storage.objects
  for insert with check (
    bucket_id = 'deliverable-files'
    and exists (
      select 1 from companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_id = auth.uid()
    )
  );

create policy deliverable_files_update_own on storage.objects
  for update using (
    bucket_id = 'deliverable-files'
    and exists (
      select 1 from companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_id = auth.uid()
    )
  );

create policy deliverable_files_delete_own on storage.objects
  for delete using (
    bucket_id = 'deliverable-files'
    and exists (
      select 1 from companies
      where companies.id::text = (storage.foldername(name))[1]
        and companies.owner_id = auth.uid()
    )
  );

-- What the file is, in the database.
--
-- Kept as rows rather than read from the bucket, because a deliverable needs to
-- say what it is made of without listing a directory — and because a file that
-- failed to upload should be an absent row, not a silent gap the viewer
-- discovers later.
create table if not exists deliverable_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  deliverable_id uuid not null references deliverables (id) on delete cascade,

  -- Path inside the bucket. Unique so a retry cannot leave two rows pointing at
  -- one object, which would double-count and delete wrongly.
  storage_path text not null unique,

  -- What the manager is looking at, as the renderer needs it.
  kind text not null check (kind in ('audio', 'image', 'archive', 'document')),
  mime_type text not null,
  size_bytes bigint not null,

  -- The employee's own name for it — "Main theme, 90s loop" rather than the
  -- filename, which is generated.
  title text not null,
  description text,

  -- What produced it, so a cost can be traced to a file the same way it can be
  -- traced to a report.
  produced_by_backend text,

  created_at timestamptz not null default now()
);

create index if not exists deliverable_files_deliverable_idx
  on deliverable_files (deliverable_id, created_at);

alter table deliverable_files enable row level security;

drop policy if exists deliverable_files_select_own on deliverable_files;
create policy deliverable_files_select_own on deliverable_files
  for select using (exists (
    select 1 from companies
    where companies.id = deliverable_files.company_id
      and companies.owner_id = auth.uid()
  ));

drop policy if exists deliverable_files_insert_own on deliverable_files;
create policy deliverable_files_insert_own on deliverable_files
  for insert with check (exists (
    select 1 from companies
    where companies.id = deliverable_files.company_id
      and companies.owner_id = auth.uid()
  ));

drop policy if exists deliverable_files_update_own on deliverable_files;
create policy deliverable_files_update_own on deliverable_files
  for update using (exists (
    select 1 from companies
    where companies.id = deliverable_files.company_id
      and companies.owner_id = auth.uid()
  ));

drop policy if exists deliverable_files_delete_own on deliverable_files;
create policy deliverable_files_delete_own on deliverable_files
  for delete using (exists (
    select 1 from companies
    where companies.id = deliverable_files.company_id
      and companies.owner_id = auth.uid()
  ));
