-- 두근도트 — 턴마다 걸린 시간·토큰·표정 (09-11, 35회차 운영 자가진단의 그릇).
--
-- 지금까지 "모델 1002ms 저장 531ms" 는 로그에만 찍혔다. 로그는 아무도 안 본다(사흘 $18 이 그렇게 샜다).
-- 표에 있어야 자가 잰다: 첫 글자까지 p50/p95, 사람당 원가, 표정 분포, 답 길이.
create table if not exists dot_turns (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references dot_characters(id) on delete cascade,
  model text not null,
  routing text,
  ms_prepare int not null default 0,
  ms_first_token int,            -- 흘려보낸 턴만. 한 통 턴은 null(못 잼).
  ms_model int not null default 0,
  ms_save int not null default 0,
  ms_total int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  emotion text,
  reply_chars int not null default 0,
  stage int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists dot_turns_recent on dot_turns (created_at desc);
alter table dot_turns enable row level security;
-- 사용자에게 열지 않는다. 서버(비밀 열쇠)만 쓴다.

-- 09-11 돈 계산: DeepSeek 는 앞부분(시스템·지난 대화)을 캐시하면 입력값이 1/31 이다(0.44 → 0.014 $/M). 몇 %가 캐시에 맞았는지 남긴다.
alter table dot_turns add column if not exists cached_tokens int not null default 0;
