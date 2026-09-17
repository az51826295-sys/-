-- Rookery — 충전식 크레딧 (100회차 09-13, 사장님 "웹에서 수익모델까지" · 사업자등록 없음 → Paddle 판매 대행)
-- Run after schema_spend_limit.sql.
--
-- 두 가지 회사가 있다.
--   billing_mode = 'limit'   옛 방식. spend_limit_usd 를 지난 N일 동안 쓸 수 있다(운영자·베타 회사).
--   billing_mode = 'prepaid' 새 방식. 원장(credit_ledger)에 들어온 돈 − credits_started_at 이후 쓴 원가 = 잔고.
-- 기본값은 'limit' — 이 파일을 적용해도 지금 있는 회사는 아무것도 바뀌지 않는다.
-- 새 회사가 'prepaid' 로 태어나는 것은 앱의 BILLING_OPEN=1 이 켜진 뒤다.

alter table companies
  add column if not exists billing_mode text not null default 'limit',
  add column if not exists credits_started_at timestamptz;

do $$ begin
  alter table companies add constraint companies_billing_mode_chk check (billing_mode in ('limit', 'prepaid'));
exception when duplicate_object then null; end $$;

-- 돈이 들어오고 나간 기록. 지우거나 고치지 않는다 — 환불도 음수 한 줄로 남긴다.
create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  -- 원가 기준 달러. 화면의 "크레딧"은 이것 × CREDITS_PER_USD (src/lib/billing/plans.ts).
  delta_usd numeric not null,
  kind text not null check (kind in ('purchase', 'trial', 'grant', 'refund')),
  sku text,
  provider text,
  -- 결제사 거래 번호(Paddle txn_…). 같은 거래가 두 번 들어와도 한 번만 쌓이게 unique.
  ref text unique,
  amount_paid text,
  currency text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_company_idx on credit_ledger (company_id, created_at);

alter table credit_ledger enable row level security;

-- 주인은 자기 회사 원장을 읽을 수 있다. 쓰기 정책은 일부러 없다 — 서비스 키(웹훅·운영 도구)만 쓴다.
do $$ begin
  create policy credit_ledger_owner_read on credit_ledger for select
    using (exists (select 1 from companies c where c.id = credit_ledger.company_id and c.owner_id = auth.uid()));
exception when duplicate_object then null; end $$;
