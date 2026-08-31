-- 무엇을 물었고 뭐라 답했는가.
--
-- 원장(`model_usage`)에는 토큰 수만 있고 **글자가 없다.** 유니티 세션에 몇 만
-- 자짜리 프롬프트를 실어 보냈는데 그 쌍이 하나도 안 남았다. 그래서 지금은
-- "무엇이 잘 되고 무엇이 안 되는지"를 물어볼 자료 자체가 없다 — 나중에 우리
-- 모델을 만들든 안 만들든, 답을 고치려면 무엇을 물었는지부터 있어야 한다.
--
-- ## 원장과 무엇이 다른가
--
-- 계측기를 두 벌 만드는 것이 아니다. **두 표는 서로 다른 질문에 답한다.**
--
--   `model_usage`      — 돈. 얼마 썼나. **호출을 세는 곳은 여전히 여기다.**
--   `model_exchanges`  — 글. 무엇을 물었고 뭐라 답했나.
--
-- 그래서 이 표에 줄이 없는 것을 "그 호출이 없었다"로 읽으면 안 된다. 기록에
-- 실패해도 일은 그대로 나가고(장부가 일을 막으면 안 된다), 그때 원장에는
-- 있고 여기에는 없는 줄이 생긴다. 세는 것은 원장이다.
--
-- ## 실패한 호출도 남는다
--
-- 원장은 성공한 호출 뒤에만 쓰인다. 그래서 08-28 부터 사흘 동안 Anthropic 이
-- 판단 등급을 전부 거절하고 있었는데 **원장에 한 줄도 안 남았다** — 옆 벤더가
-- 대신 한 줄만 있었다. 돈이 안 나갔으니 원장에 없는 것은 맞지만, 그러면
-- 벤더가 죽은 사건 자체가 어디에도 없다. 여기는 `ok = false` 로 남긴다.
--
-- ## 사람의 글이 쌓이는 표다
--
-- 지금은 사용자가 사장님 한 분이라 문제가 안 되지만, 사람이 늘면 이 표는
-- **남의 대화**가 된다. 학습에 쓰려면 약관과 동의가 먼저다. 그 전까지는
-- "무엇이 잘못됐나"를 우리가 들여다보는 자료로만 쓴다.
create table if not exists model_exchanges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  -- 부른 쪽이 이 일을 무엇이라고 불렀는지(`schemaName`)와 어느 등급이었는지.
  purpose text not null,
  tier text,
  routing text,

  -- 실제로 돈 모델. 실패한 줄에서는 **부르려던** 벤더 이름이 들어간다.
  model text,

  ok boolean not null,
  -- 왜 실패했는지를 몇 가지로 묶는다. 원문은 아래에 그대로 남기고, 이 칸은
  -- "잔액이 떨어진 날이 며칠이었나" 같은 것을 셀 수 있게 하려고 둔다.
  error_kind text,
  error_message text,

  -- 주고받은 글. 프롬프트가 커서 잘린 줄은 `truncated` 로 표시한다 —
  -- 잘린 것을 온전한 것과 같게 두면, 나중에 이 표로 무엇을 하든 조용히 틀린다.
  system_instructions text,
  input text,
  output jsonb,
  truncated boolean not null default false,
  -- 같이 보낸 그림 장수. 그림 자체는 안 남긴다(원장이 아니라 창고가 된다).
  images integer not null default 0,

  input_tokens integer,
  output_tokens integer,
  ms integer,

  -- **아직 아무도 안 쓴다.** 이 답이 좋았는지를 적을 자리다. 지금 그것을 아는
  -- 것은 사람뿐이고, 기계 심판이 생기면 여기에 적는다. 비어 있는 것이 곧
  -- "안 재 봤다" 이고, 그렇게 읽혀야 한다.
  grade text,
  graded_by text,

  work_execution_id uuid references work_executions (id) on delete set null,
  project_id uuid references projects (id) on delete set null,
  company_employee_id uuid references company_employees (id) on delete set null,

  created_at timestamptz not null default now()
);

-- 이 표에 물어볼 질문은 둘이다: 이 회사의 최근 것, 그리고 실패한 것.
create index if not exists model_exchanges_company_idx
  on model_exchanges (company_id, created_at desc);
create index if not exists model_exchanges_failed_idx
  on model_exchanges (company_id, created_at desc)
  where ok = false;

alter table model_exchanges enable row level security;

drop policy if exists model_exchanges_select on model_exchanges;
create policy model_exchanges_select on model_exchanges
  for select using (
    exists (select 1 from companies
            where companies.id = model_exchanges.company_id
            and companies.owner_id = auth.uid())
  );

drop policy if exists model_exchanges_insert on model_exchanges;
create policy model_exchanges_insert on model_exchanges
  for insert with check (
    exists (select 1 from companies
            where companies.id = model_exchanges.company_id
            and companies.owner_id = auth.uid())
  );
