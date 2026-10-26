-- **앱에서 시키면 내 컴퓨터의 클로드 코드가 일한다** (10-26)
--
-- 사장님: "앱이랑 내 노트북에 있는 클로드 코드랑 연결 됨?" → 그 방향을 여는 칸.
--
-- 왜 새 칸인가: `project_work_items` 는 프로젝트·직원·기술이 있어야 한 줄이 생긴다.
-- 이건 그 셋이 없다 — 사장님 한마디가 그대로 주문이고, 일하는 쪽은 사장님 클로드다.
-- 억지로 끼우면 가짜 프로젝트·가짜 직원을 만들어야 해서 따로 둔다.
--
-- 돈이 로키에서 안 나간다. 만드는 값은 사장님 클로드 구독에서 나가고,
-- 로키는 주문을 넘기고 결과를 받아 재는 쪽만 한다.
--
-- **칸 이름은 ASCII 로 둔다.** 처음에 한글로 적었더니 Supabase 의 select 파서가
-- "Expected identifier at `주문, 폴더`" 로 거부했다 — 10-25 에 export 이름에서
-- 당한 것과 같은 함정이 DB 칸에도 있다. 한글은 주석과 화면에만 쓴다.

create table if not exists laptop_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,

  -- 주문: 사장님이 앱에서 적은 그대로. 해석해서 저장하지 않는다
  -- (09-25: 여러 줄이 첫 줄만 저장돼 판이 지시문 없이 돌았다).
  prompt text not null,
  -- 폴더: 노트북에서 어느 폴더에서 돌릴지. 비면 듣는 쪽이 자기 뿌리를 쓴다.
  -- **듣는 쪽은 이 값을 그대로 믿지 않는다** — 허락한 뿌리 안일 때만 따른다.
  folder text,

  status text not null default 'queued'
    check (status in ('queued', 'taken', 'done', 'failed')),

  -- 결과: 클로드 코드가 찍은 것
  result text,
  -- 탈: 왜 못 했나. '못 잼'과 '실패'를 가르려고 따로 둔다.
  error_text text,

  created_at timestamptz not null default now(),
  taken_at timestamptz,
  done_at timestamptz,
  -- 걸린초 · 집은횟수. 숫자 없이 적으면 나중에 못 고친다.
  took_seconds integer,
  taken_count integer not null default 0
);

-- 듣는 쪽은 "내 회사의 queued 중 가장 오래된 것" 만 본다.
create index if not exists laptop_jobs_queue_idx
  on laptop_jobs (company_id, status, created_at);

alter table laptop_jobs enable row level security;

-- 서비스 열쇠로만 드나든다(듣는 쪽은 x-rookery-key 로 서버를 거친다).
-- 브라우저가 직접 읽을 일이 없으므로 정책을 열지 않는다.
