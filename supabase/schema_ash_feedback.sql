-- 잿빛 테스터 의견 (10-26)
--
-- 프로덕션 신청이 반려돼 비공개 테스트 14일을 다시 채운다. 지난 신청에서 제일 약했던 칸이
-- "테스터 의견이 많지 않았다" 였는데, 까닭은 **모을 길이 아예 없었기** 때문이다.
--
-- 로그인을 안 받으므로 `user_id` 가 없다. 테스터에게 계정을 만들라고 하면 아무도 안 쓴다.

create table if not exists ash_feedback (
  id          bigint generated always as identity primary key,
  body        text not null,
  -- 어디서 썼는지. 막힌 층이 어디인지 보려고 같이 받는다.
  floor       int,
  best_floor  int,
  lang        text not null default 'ko',
  ua          text,
  created_at  timestamptz not null default now()
);

create index if not exists ash_feedback_recent on ash_feedback (id desc);

-- **밖에서는 못 읽는다.** 서버가 service 열쇠로만 쓰고 읽는다 —
-- 남이 쓴 의견이 anon 으로 읽히면 안 된다.
alter table ash_feedback enable row level security;
