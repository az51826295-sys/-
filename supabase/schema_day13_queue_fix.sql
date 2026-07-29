-- A partial unique index cannot be named in ON CONFLICT — Postgres will not
-- infer it, so every upsert against it errors. The queue writes were failing
-- silently as a result, which made every department look like it had nothing
-- waiting.
--
-- Replaced with a plain unique constraint. The column is nullable, and Postgres
-- treats NULLs as distinct, so rows queued against an assignment rather than a
-- work item are still unconstrained — the same behaviour the partial index was
-- reaching for, in a form ON CONFLICT can actually use.
drop index if exists department_work_queue_one_per_work_item;

alter table department_work_queue
  drop constraint if exists department_work_queue_one_per_work_item;

alter table department_work_queue
  add constraint department_work_queue_one_per_work_item
  unique (project_work_item_id);
