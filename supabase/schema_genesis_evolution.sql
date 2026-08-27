-- 채택된 예측 유전자.
--
-- 예측 원장(work_predictions)은 수정 불가지만 이 표는 다르다 — 규칙은 바뀌라고
-- 있는 것이다. 대신 **덮어쓰지 않고 쌓는다**: 언제 무엇이 왜 바뀌었는지가 남아야
-- 나중에 "그때부터 나빠졌다"를 되짚을 수 있다.
create table if not exists prediction_genomes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  genome jsonb not null,
  -- 무엇을 바꿨는지. 헌법상 한 번에 유전자 하나이므로 한 줄로 적힌다.
  gene text not null,
  -- 채택 근거. 사람이 읽고 납득하거나 반박할 수 있어야 한다.
  base_brier double precision not null,
  new_brier double precision not null,
  decided_count integer not null,
  folds integer not null,
  adopted_at timestamptz not null default now()
);

create index if not exists prediction_genomes_company_idx
  on prediction_genomes (company_id, adopted_at desc);

alter table prediction_genomes enable row level security;

drop policy if exists "prediction_genomes_select_own" on prediction_genomes;
create policy "prediction_genomes_select_own" on prediction_genomes
  for select using (
    company_id in (select id from companies where owner_id = auth.uid())
  );
