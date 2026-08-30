-- 유니티 고리가 **밟아 보고 알아낸 것**.
--
-- 낮에 스스로 고친 `Arial.ttf` 오류를 저녁에 똑같이 다시 냈다. 고친 것은
-- 세션 안에만 남고, 세션이 끝나면 사라졌기 때문이다. 판 안에서는 배우고
-- 판을 넘으면 못 배우는 것은 배우는 것이 아니다.
--
-- **회사 지식(`organization_knowledge`)에 넣지 않는다.** 그 표는 모든 직원이
-- 모든 일에 여덟 개까지 읽어 가는 자리다. 유니티 6 에 `Arial.ttf` 가 없다는
-- 사실을 거기 넣으면 글 쓰는 직원도 그걸 읽고, 회사가 실제로 정한 것들을
-- 새것이 밀어낸다. 연장에 대해 아는 것은 그 연장을 쓰는 고리 옆에 둔다.
--
-- **컴파일이 통과한 판에서만 적는다.** 모델이 "고쳤다"고 말한 것은 증거가
-- 아니다. 다음 판에 오류가 0 으로 돌아온 것만 증거다 — 그 아래로 내려가면
-- 이 표는 추측을 사실로 승격시키는 자리가 된다.
create table if not exists unity_lessons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  -- 오류 메시지의 지문. 파일 이름과 줄번호를 뺀 것 — 같은 병이 다른 파일에서
  -- 나도 같은 것으로 본다. 두 번 적지 않기 위한 열쇠이기도 하다.
  signature text not null,
  -- 사람이 읽을 수 있는 원래 증상 한 줄.
  symptom text not null,
  -- 다음에 어떻게 쓰라는 것. 한두 문장.
  lesson text not null,

  -- 유니티 6 에서 참인 것이 2021 에서 거짓일 수 있다. 어디서 데였는지 남긴다.
  unity_version text,
  -- 어느 세션의 몇 판에서 나왔는지. 되짚을 수 있어야 지울 수도 있다.
  session_id uuid references unity_sessions (id) on delete set null,
  round int,

  -- 같은 지문을 다시 밟은 횟수. 올라가고 있다면 적어 둔 교훈이 안 듣는다는
  -- 뜻이고, 그건 지우거나 고쳐 써야 한다는 신호다.
  seen int not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists unity_lessons_unique_signature
  on unity_lessons (company_id, signature);
create index if not exists unity_lessons_company_idx
  on unity_lessons (company_id, seen desc, updated_at desc);

-- 유니티 열쇠(서비스 롤)로만 닿는다. `unity_sessions` 와 같은 이유로 닫아 둔다.
alter table unity_lessons enable row level security;
