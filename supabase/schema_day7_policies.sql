-- AI Workforce - Day 7 policy corrections. Run after schema_day7.sql.
--
-- The link tables were given select and insert policies only, which silently
-- swallowed two writes: marking a memory as actually applied after the
-- deliverable was written, and re-confirming an existing memory (an upsert is
-- an update when the row already exists). RLS denials are invisible unless the
-- error is checked, so both looked like they had worked.

drop policy if exists "execution_memories_update_own" on work_execution_memories;
create policy "execution_memories_update_own" on work_execution_memories
  for update using (
    exists (
      select 1 from work_executions w
      join companies on companies.id = w.company_id
      where w.id = work_execution_memories.work_execution_id
      and companies.owner_id = auth.uid()
    )
  );

drop policy if exists "memory_sources_update_own" on employee_memory_sources;
create policy "memory_sources_update_own" on employee_memory_sources
  for update using (
    exists (
      select 1 from employee_memories m
      join companies on companies.id = m.company_id
      where m.id = employee_memory_sources.employee_memory_id
      and companies.owner_id = auth.uid()
    )
  );
