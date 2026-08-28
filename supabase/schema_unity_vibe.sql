-- 유니티와 도는 바이브 코딩 세션.
--
-- `unity/build` 는 한 번 만들어 주고 끝난다. 사람이 붙이고, 오류가 나면 다른
-- 창으로 옮겨 붙여야 한다. 그건 협업이 아니라 창구다.
--
-- 세션은 **여러 판을 기억한다.** 무엇을 만들려 했는지, 지금까지 무슨 파일을
-- 냈는지, 어떤 오류가 돌아왔는지. 그게 있어야 다음 판에서 "아까 그 오류"를
-- 알아보고, 같은 실수를 반복하는지 판정할 수 있다.
create table if not exists unity_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  -- 무엇을 만들려는지. 판이 바뀌어도 이건 안 바뀐다.
  want text not null,
  -- 파일을 쓸 수 있는 우리 안. 이 밖으로는 못 쓴다.
  scope text not null default 'Assets/Rookery/',
  -- 코드보다 먼저 쓴 합격 기준. 컴파일은 유니티가, 이건 사람이 본다.
  criteria jsonb not null default '[]'::jsonb,
  round int not null default 0,
  -- running | compiled | stuck | stopped
  status text not null default 'running',
  -- 왜 끝났는지. "됐다"와 "포기했다"를 구분해서 남긴다.
  ended_why text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 판마다 한 줄. 무엇을 냈고 무엇이 돌아왔는지가 여기 다 남는다.
-- 이 표가 없으면 "몇 판 만에 됐나"를 나중에 셀 수 없고, 세지 못하면
-- 이 엔진이 쓸모 있는지도 말할 수 없다.
create table if not exists unity_rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references unity_sessions (id) on delete cascade,
  round int not null,
  -- 이 판에 낸 파일들 [{path, purpose}]. 내용은 무거워 따로 안 쌓는다.
  files jsonb not null default '[]'::jsonb,
  -- 이 판 뒤 유니티가 돌려준 컴파일 오류.
  errors jsonb not null default '[]'::jsonb,
  -- 이 판에 무엇을 왜 바꿨는지 한 줄.
  note text,
  created_at timestamptz not null default now()
);

create index if not exists unity_sessions_company_idx
  on unity_sessions (company_id, updated_at desc);
create index if not exists unity_rounds_session_idx
  on unity_rounds (session_id, round);

-- 이 표들은 유니티 열쇠로만 닿는다(서비스 롤). 브라우저에서 직접 읽을 일이
-- 없으므로 정책을 열지 않는다 — 열어 둘 이유가 없는 문은 닫아 둔다.
alter table unity_sessions enable row level security;
alter table unity_rounds enable row level security;

-- 씬을 짓는 정적 메서드의 이름. 스크립트만 컴파일되면 게임이 되지 않는다 —
-- 씬에 물체가 없으면 켜도 검은 화면이라, 씬도 코드가 지어야 한다.
alter table unity_sessions add column if not exists scene_method text;
