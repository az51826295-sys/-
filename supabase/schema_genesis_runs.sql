-- Rookery — 자가진화 매일 실행 기록 (100회차 09-14, 사장님 "2,3")
-- Run after schema_billing_credits.sql.
--
-- 워커가 하루 한 번 (1) 예측 진화(runEvolution) 와 (2) 검증된 규칙 고리(runRuleLoop) 를 돈다.
-- 워커가 둘이거나 재시작돼도 **하루 한 번만** 돌게, 그날 몫을 이 표에 한 줄 넣어 "자리를 잡는다".
-- unique(kind, run_date) 가 그 자물쇠다 — 먼저 넣은 쪽만 돈다. 결과(회사별 요약)는 result 에 남긴다.
create table if not exists genesis_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('daily')),
  run_date date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  result jsonb not null default '{}'::jsonb,
  unique (kind, run_date)
);

alter table genesis_runs enable row level security;
-- 정책 없음: 서비스 키(워커)만 읽고 쓴다. 화면에는 안 보인다.
