-- 과제 — 대화를 묶는 단위.
--
-- 대화가 하나씩 흩어져 있으면, 같은 일로 나눈 이야기가 목록에서 서로 남남이
-- 된다. "그때 그 스프라이트 얘기" 를 찾으려면 제목을 하나씩 열어 봐야 한다.
--
-- 과제는 그 묶음이다. 과제 하나가 곧 일 하나이고, 그 안의 대화는 전부 그 일에
-- 대한 것이다.
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  -- 무엇을 하려는 과제인지. 나중에 대화를 이어 갈 때 맥락으로 실린다.
  goal text,
  status text not null default 'open' check (status in ('open', 'done', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 대화가 어느 과제에 속하는가. 비어 있어도 된다 — 지나가는 질문까지 과제로
-- 만들게 하면, 정리하려고 만든 것이 정리할 거리를 늘린다.
alter table conversations
  add column if not exists task_id uuid references tasks (id) on delete set null;

create index if not exists tasks_owner_idx on tasks (owner_id, updated_at desc);
create index if not exists conversations_task_idx on conversations (task_id);

alter table tasks enable row level security;

drop policy if exists "tasks_own" on tasks;
create policy "tasks_own" on tasks
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
