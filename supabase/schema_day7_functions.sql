-- AI Workforce - Day 7 functions. Run after schema_day7.sql.

-- Counting in SQL rather than read-modify-write in the app: two assignments
-- finishing at once must not lose one of the increments.
create or replace function increment_memory_usage(p_memory_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  update employee_memories
  set usage_count = usage_count + 1,
      last_used_at = now(),
      updated_at = now()
  where id = p_memory_id;
end;
$$;

-- Approval and learning are separate concerns: this only opens a session. A
-- deliverable that has already been learned from, or is being learned from
-- right now, returns null instead of raising — the caller treats that as
-- "nothing to do".
--
-- The already-completed case has to be checked here rather than left to the
-- unique index: a session is inserted as 'pending', which the completed-only
-- index does not cover, so without this a second approval would open a session
-- and pay for a second extraction before colliding at the very end.
create or replace function start_learning_session(p_deliverable_id uuid)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_session_id uuid;
  v_company_id uuid;
  v_hire_id uuid;
  v_assignment_id uuid;
  v_status text;
begin
  select company_id, company_employee_id, assignment_id, status
  into v_company_id, v_hire_id, v_assignment_id, v_status
  from deliverables
  where id = p_deliverable_id;

  if v_company_id is null or v_status is distinct from 'approved' then
    return null;
  end if;

  if exists (
    select 1 from employee_learning_sessions
    where deliverable_id = p_deliverable_id
    and status in ('pending', 'running', 'completed')
  ) then
    return null;
  end if;

  begin
    insert into employee_learning_sessions (
      company_id, company_employee_id, assignment_id, deliverable_id, status
    )
    values (v_company_id, v_hire_id, v_assignment_id, p_deliverable_id, 'pending')
    returning id into v_session_id;
  exception when unique_violation then
    return null;
  end;

  return v_session_id;
end;
$$;
