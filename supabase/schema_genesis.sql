-- Rookery — Genesis 예측 원장
-- Run after schema_spend_limit.sql.
--
-- 이 파일이 하는 일은 하나다. 직원이 일을 시작하기 **전에**, 그 일이
-- 매니저의 수정 요청 없이 승인될 확률을 적어 두게 한다.
--
-- 지금까지 Rookery는 결과를 본 뒤에 교훈을 뽑았다. 그건 회고지 예측이
-- 아니다. 예측이 없으면 "얼마나 틀렸는가"를 잴 수 없고, 틀린 정도를
-- 재지 못하면 나아지고 있는지도 알 수 없다.
--
-- 결과 테이블은 일부러 만들지 않았다. 판정은 이미 deliverable_reviews
-- 에 있고, 그건 매니저만 쓸 수 있는 표다. 예측과 결과를 각각 적으면
-- 둘이 어긋날 수 있지만, 결과를 조인해 오면 어긋날 것이 없다.

create table if not exists work_predictions (
  id uuid primary key default gen_random_uuid(),

  -- 삭제가 눈에 보이도록. 행을 지우면 번호에 구멍이 남는다.
  seq bigserial not null,

  company_id uuid not null references companies (id) on delete cascade,
  assignment_id uuid not null references assignments (id) on delete cascade,
  work_execution_id uuid not null references work_executions (id) on delete cascade,
  company_employee_id uuid not null references company_employees (id) on delete cascade,

  -- 누가 아니라 어떤 일인가로 기록한다. 직원 이름으로 분기하지 않는
  -- 이 앱의 규칙이 여기에도 적용된다.
  skill_id text not null,

  -- 매니저가 수정 요청 없이 승인할 확률. 0과 1은 허용하지 않는다 —
  -- 확신은 캘리브레이션의 적이고, 절대 확신은 측정 자체를 망친다.
  p_approved numeric not null check (p_approved > 0 and p_approved < 1),

  -- 이 확률이 어디서 나왔는지. 사후 분석용이며 채점에는 쓰이지 않는다.
  basis jsonb not null default '{}'::jsonb,

  -- 서버 시각. 애플리케이션이 보내는 값이 아니다.
  committed_at timestamptz not null default now(),

  -- 실행 한 건에 예측 한 건. 재시도는 새 실행이므로 새 예측을 받는다.
  unique (work_execution_id)
);

create index if not exists work_predictions_company_idx
  on work_predictions (company_id, committed_at desc);
create index if not exists work_predictions_assignment_idx
  on work_predictions (assignment_id);

-- ── 예측 잠금 ──────────────────────────────────────────────────────
--
-- Genesis 전체가 이 한 조각 위에 서 있다. 결과를 본 뒤에 예측을 고칠
-- 수 있는 시스템에서 "예측 오차"는 아무 의미도 없는 숫자다.
--
-- 그래서 앱 코드의 약속이 아니라 DB 제약으로 막는다. 코드는 언젠가
-- 잊는다.
--
-- UPDATE 만 막고 DELETE 는 막지 않는 이유: 회사 삭제 같은 정당한
-- 정리에 cascade 가 필요하기 때문이다. 삭제는 증거를 지울 수 있지만
-- 없는 성적을 만들어내지는 못하고, seq 에 구멍이 남아 눈에 띈다.
-- 조작을 진짜로 가능하게 만드는 것은 수정 쪽이다.
create or replace function reject_prediction_update()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'work_predictions is append-only: a committed prediction cannot be changed';
end;
$$;

drop trigger if exists work_predictions_no_update on work_predictions;
create trigger work_predictions_no_update
  before update on work_predictions
  for each row execute function reject_prediction_update();

-- ── 채점 ───────────────────────────────────────────────────────────
--
-- 예측에 결과를 붙인다. 붙이는 것이 아니라 조인한다는 점이 중요하다 —
-- 결과의 출처는 언제나 매니저가 누른 버튼이고, 이 뷰는 그것을 읽기만
-- 한다. 자기 채점이 구조적으로 불가능하다.
--
-- 첫 판정만 센다. 수정 요청 후 다시 제출해 승인받은 것은 "한 번에
-- 통과했다"가 아니다.
create or replace view work_prediction_scores as
select
  p.id                as prediction_id,
  p.seq,
  p.company_id,
  p.assignment_id,
  p.company_employee_id,
  p.skill_id,
  p.p_approved,
  p.basis,
  p.committed_at,
  r.decision,
  r.created_at        as decided_at,
  (r.decision = 'approved')::int as approved,
  -- |예측 − 실제|. 이것이 성장의 원료다.
  abs(p.p_approved - (r.decision = 'approved')::int) as abs_error,
  -- Brier. 자신 있게 틀리는 것에 더 큰 벌을 준다.
  power(p.p_approved - (r.decision = 'approved')::int, 2) as brier
from work_predictions p
join deliverables d
  on d.assignment_id = p.assignment_id
join lateral (
  select dr.decision, dr.created_at
  from deliverable_reviews dr
  where dr.deliverable_id = d.id
  order by dr.created_at asc
  limit 1
) r on true;

-- ── 접근 제어 ──────────────────────────────────────────────────────
--
-- 다른 표와 같은 규칙: 회사 소유자만 자기 회사의 행을 본다.
alter table work_predictions enable row level security;

drop policy if exists "work_predictions_select_own" on work_predictions;
create policy "work_predictions_select_own" on work_predictions
  for select using (
    exists (
      select 1 from companies
      where companies.id = work_predictions.company_id
        and companies.owner_id = auth.uid()
    )
  );

-- 쓰기는 실행 경로(서비스 클라이언트)만 한다. 사용자 세션으로는
-- 예측을 만들 수 없다 — 매니저가 자기 직원의 예측을 대신 적는 일은
-- 있어서는 안 된다.
drop policy if exists "work_predictions_insert_none" on work_predictions;
create policy "work_predictions_insert_none" on work_predictions
  for insert with check (false);
