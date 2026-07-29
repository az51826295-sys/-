-- A queue behind each employee.
--
-- Until now an employee could hold exactly one piece of work, and assigning a
-- second returned "Alex is already working on an assignment". That made the
-- manager the scheduler: they had to come back later, remember what they
-- wanted, and type it again. The point of hiring somebody is not having to do
-- that.
--
-- "waiting" is work the manager has committed to that has not started. It is
-- deliberately outside the one-active-per-employee index — that index exists
-- so two things never run at once, which stays true — and outside every status
-- the app treats as occupying the employee.

alter table assignments drop constraint if exists assignments_status_check;
alter table assignments add constraint assignments_status_check
  check (status in (
    'draft', 'waiting', 'assigned', 'queued', 'working', 'submitted',
    'needs_changes', 'revision_queued', 'revising', 'completed', 'failed',
    'cancelled'
  ));

-- Unchanged in meaning, restated here so the file is self-contained: one
-- running piece of work per person. "waiting" is absent on purpose.
drop index if exists assignments_one_active_per_employee;
create unique index assignments_one_active_per_employee
  on assignments (company_employee_id)
  where status in (
    'assigned', 'queued', 'working', 'submitted', 'needs_changes',
    'revision_queued', 'revising', 'failed'
  );

-- The queue is read by employee, oldest first, every time somebody finishes.
create index if not exists assignments_waiting_per_employee
  on assignments (company_employee_id, assigned_at)
  where status = 'waiting';
