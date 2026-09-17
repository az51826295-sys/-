-- 두근도트 — 먼저 말 걸기 (09-10).
--
-- 사장님 09-09: "일정 시간마다 랜덤 알람 보내기." 이런 앱이 사람을 붙잡는 힘은
-- 대화 품질이 아니라 **먼저 말 거는 것**에서 나온다(카톡이 울리면 연다).
--
-- ## 구독
-- 브라우저(또는 TWA 안의 크롬)가 준 푸시 주소. 사람 하나가 기기 여럿일 수 있다.
create table if not exists dot_push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  -- 보냈는데 410/404 가 오면 죽은 주소. 지우지 않고 표시만 한다 — 왜 안 오는지 볼 수 있게.
  dead_at timestamptz
);
create index if not exists dot_push_subs_user on dot_push_subs (user_id);

-- ## 오늘 말 걸었나
-- 하루 한 번만, 정해진 창(한국 시간) 안에서, 사람마다 **다른** 시각에.
-- 같은 시각에 다 보내면 서버가 몰리고, 사람은 "봇이 정해진 시간에 보내는구나" 를 안다.
alter table dot_bonds add column if not exists last_pinged_on date;
-- 오늘 이 사람에게 말 걸 시각(한국 시간 분 단위, 0~1439). 워커가 아침에 정하고, 그 시각이 지나면 보낸다.
alter table dot_bonds add column if not exists ping_minute int;
alter table dot_bonds add column if not exists ping_day date;

alter table dot_push_subs enable row level security;
drop policy if exists dot_push_subs_own on dot_push_subs;
create policy dot_push_subs_own on dot_push_subs for select using (auth.uid() = user_id);
