-- 대화 저장.
--
-- 로그인한 사람만 남는다. 익명 대화는 브라우저에만 있다 — 남길 주인이 없는
-- 대화를 서버에 쌓으면 지울 사람도 없다.
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- 'everyday' | 'company'. 모드가 다르면 대화의 성격도 다르므로 섞지 않는다.
  mode text not null default 'everyday',
  -- 첫 메시지에서 만든다. 사람이 목록에서 알아볼 수 있을 만큼만.
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- 답에 딸린 것들: 출처, 그린 그림, 올린 사진. 모양이 계속 늘어날 자리라
  -- 열을 늘리는 대신 여기 담는다.
  attachments jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversations_owner_idx
  on conversations (owner_id, updated_at desc);
create index if not exists conversation_messages_conv_idx
  on conversation_messages (conversation_id, created_at asc);

alter table conversations enable row level security;
alter table conversation_messages enable row level security;

drop policy if exists "conversations_own" on conversations;
create policy "conversations_own" on conversations
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "conversation_messages_own" on conversation_messages;
create policy "conversation_messages_own" on conversation_messages
  for all using (
    conversation_id in (select id from conversations where owner_id = auth.uid())
  ) with check (
    conversation_id in (select id from conversations where owner_id = auth.uid())
  );

-- 익명 사용량.
--
-- 로그인 없이 쓰는 대화도 돈을 쓴다. 회사가 없으면 model_usage 의 company_id 가
-- 비어 계량이 통째로 빠지는데, 그러면 **장부에 안 남고 상한도 안 걸린다.**
-- 링크가 새는 순간 무한정이 되는 구멍이라 따로 센다.
create table if not exists anonymous_usage (
  id uuid primary key default gen_random_uuid(),
  -- 브라우저가 들고 다니는 값. 사람을 식별하지 않는다 — 한 사람이 얼마나 썼는지
  -- 대충 세기 위한 것이고, 지우면 초기화된다. 그래서 아래 일일 총량이 진짜 방어다.
  visitor text,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  usd double precision not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists anonymous_usage_day_idx
  on anonymous_usage (created_at desc);
create index if not exists anonymous_usage_visitor_idx
  on anonymous_usage (visitor, created_at desc);

alter table anonymous_usage enable row level security;
-- 아무도 못 읽는다. 서버(service role)만 쓰고 읽는다.
