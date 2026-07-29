-- The ledger learns to count things that are not tokens.
--
-- Every column here assumed a language model: tokens in, tokens out. An image
-- service charges per picture and a music service per second, so those calls
-- would have landed with zero tokens — and a spend limit that adds up token
-- costs would have read them as free while the money left.
--
-- Existing rows are all token-billed, which is why the default is safe.

alter table model_usage
  add column if not exists unit text not null default 'tokens';

alter table model_usage
  drop constraint if exists model_usage_unit_check;
alter table model_usage
  add constraint model_usage_unit_check
  check (unit in ('tokens', 'images', 'seconds'));

-- How many pictures, how many seconds. Null for token-billed calls, which
-- already say what they used in input_tokens and output_tokens.
alter table model_usage
  add column if not exists quantity numeric;

-- A non-token call has to say how much it bought, or its cost is unexplainable
-- after the fact. Token calls are exempt because their own columns carry it.
alter table model_usage
  drop constraint if exists model_usage_quantity_present;
alter table model_usage
  add constraint model_usage_quantity_present
  check (unit = 'tokens' or quantity is not null);
