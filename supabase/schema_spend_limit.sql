-- Rookery - per-company spend limit
-- Run after schema_day20.sql.

-- What this company is allowed to spend on model calls, and over what window.
--
-- Deliberately on the company row and deliberately **not editable from the
-- app**. The person who owns the account is the person whose usage this
-- limits, so a settings page to raise it would protect nobody — during a beta
-- the operator sets these directly, and the account holder only ever sees how
-- much is left.
--
-- The default is small on purpose. A limit that has to be raised before
-- anything expensive happens fails safe; one that has to be lowered does not.
alter table companies
  add column if not exists spend_limit_usd numeric not null default 3.00,
  add column if not exists spend_window_days integer not null default 30;

-- No RLS change: companies already restricts every row to its owner, and the
-- owner may read these. Nothing in the app issues an UPDATE against them.
