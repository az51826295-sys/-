-- A project's own result belongs to the project, not to any one assignment or
-- any one employee — it is what several people's work adds up to. Those two
-- columns stay required for assignment-scoped deliverables and are checked
-- below rather than by being NOT NULL for everything.
alter table deliverables alter column assignment_id drop not null;
alter table deliverables alter column company_employee_id drop not null;

alter table deliverables drop constraint if exists deliverables_scope_shape;
alter table deliverables add constraint deliverables_scope_shape check (
  (deliverable_scope = 'assignment'
    and assignment_id is not null
    and company_employee_id is not null
    and project_id is null)
  or
  (deliverable_scope = 'project'
    and project_id is not null
    and assignment_id is null
    and company_employee_id is null)
);
