-- 도트 채팅 (09-09). 2D 이상형과 대화하는 앱.
--
-- 이 회사의 다른 표와 성격이 다르다. 여기엔 **직원도 업무도 없다** — 사용자 한 명과
-- 캐릭터 한 명 사이의 대화, 그리고 그 사이가 얼마나 가까워졌는지가 전부다.
--
-- ## 친밀도를 왜 표에 두는가
--
-- 친밀도는 **규칙이 세고 표가 기억한다.** 모델한테 "얼마나 친해졌니" 를 묻지 않는다.
-- 물으면 회차마다 답이 흔들리고, 흔들리는 숫자로 화면(표정)과 말투가 갈리면
-- 사용자는 이유를 알 수 없는 변덕을 겪는다. 이 회사에서 모델한테 채점을 맡겼다가
-- 헛돈 적이 여러 번이라 처음부터 그렇게 안 짓는다.
--
-- ## 하루 제한을 왜 따로 세는가
--
-- 메시지 표를 세면 되지 않느냐 — 안 된다. 메시지는 지울 수 있고, 재시도로 두 번
-- 들어갈 수 있다. **돈을 쓰는 횟수**와 **남은 대화 수**는 같은 것을 세야 하므로
-- 모델을 부르기 **전에** 여기서 하나 올리고, 실패하면 되돌린다.

-- ── 캐릭터 ──────────────────────────────────────────────────────────
create table if not exists dot_characters (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  -- 고르는 화면에 한 줄로 뜨는 소개.
  tagline text not null default '',
  -- 성격·설정. 시스템 프롬프트에 그대로 들어간다.
  persona text not null,
  -- 말투·말버릇. 단계와 무관한 그 사람의 고정된 버릇.
  speech text not null default '',
  -- 처음 열었을 때 먼저 하는 말.
  greeting text not null default '안녕!',
  -- 표정 그림. { "neutral": "<storage path>", "happy": ..., } 여섯 칸.
  -- **한 장에 여섯 칸을 그려서 잘라 넣는다** — 따로 주문하면 여섯 명이 나온다.
  sprites jsonb not null default '{}'::jsonb,
  -- 다 만들어져서 고르는 화면에 내보내도 되는가.
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── 사이(친밀도) ────────────────────────────────────────────────────
create table if not exists dot_bonds (
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references dot_characters(id) on delete cascade,
  points int not null default 0,
  -- 1~5. points 로부터 계산되지만, 화면이 매번 다시 계산하지 않게 여기 적어 둔다.
  stage int not null default 1,
  streak_days int not null default 0,
  last_talked_on date,
  -- 캐릭터가 기억하는 것. 짧은 문장 목록(최대 12개). 사용자가 말한 사실만.
  memo jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, character_id)
);

-- ── 주고받은 말 ─────────────────────────────────────────────────────
create table if not exists dot_messages (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references dot_characters(id) on delete cascade,
  role text not null check (role in ('user', 'character')),
  content text not null,
  -- 캐릭터 말일 때만. 여섯 표정 중 하나 — 화면의 도트가 이걸로 바뀐다.
  emotion text check (emotion in ('neutral', 'happy', 'shy', 'sad', 'angry', 'surprised')),
  created_at timestamptz not null default now()
);
create index if not exists dot_messages_recent on dot_messages (user_id, character_id, id desc);

-- ── 하루에 몇 번 ────────────────────────────────────────────────────
create table if not exists dot_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 한국 시간 기준 날짜. UTC 로 세면 아침 9시에 초기화된다.
  day date not null,
  turns int not null default 0,
  -- 하루에 이 사람에게 쓴 토큰. 회사 원장(usage_events)은 직원·업무 단위라 여기 맞지
  -- 않는다 — 소비자 앱에서 봐야 하는 것은 **사람 한 명이 하루에 얼마를 쓰는가**다.
  -- 무료 한도를 얼마로 둘지가 여기서 나온다.
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, day)
);

-- ── 누가 무엇을 볼 수 있나 ──────────────────────────────────────────
alter table dot_characters enable row level security;
alter table dot_bonds      enable row level security;
alter table dot_messages   enable row level security;
alter table dot_usage      enable row level security;

drop policy if exists dot_characters_read on dot_characters;
create policy dot_characters_read on dot_characters
  for select using (is_public = true);

drop policy if exists dot_bonds_own on dot_bonds;
create policy dot_bonds_own on dot_bonds
  for select using (auth.uid() = user_id);

drop policy if exists dot_messages_own on dot_messages;
create policy dot_messages_own on dot_messages
  for select using (auth.uid() = user_id);

drop policy if exists dot_usage_own on dot_usage;
create policy dot_usage_own on dot_usage
  for select using (auth.uid() = user_id);

-- 쓰기는 정책을 안 연다. 사용자가 자기 친밀도를 직접 올릴 수 있으면
-- 친밀도라는 것이 없어진다 — 서버(비밀 열쇠)만 쓴다.

-- ── 대화 한 턴을 한 번에 세기 ───────────────────────────────────────
--
-- 모델을 부르기 전에 부른다. 한도를 넘으면 0 을 돌려주고, 그러면 부르지 않는다.
-- 두 창을 동시에 열어 놓아도 두 번 세지 않게 표에서 센다(코드에서 읽고 더하면
-- 사이에 다른 요청이 끼어든다).
create or replace function dot_take_turn(p_user uuid, p_day date, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turns int;
begin
  insert into dot_usage (user_id, day, turns)
  values (p_user, p_day, 1)
  on conflict (user_id, day) do update
    set turns = dot_usage.turns + 1
    where dot_usage.turns < p_limit
  returning turns into v_turns;

  -- 갱신 조건에 걸려 아무 줄도 안 바뀌면 v_turns 가 null 이다 = 한도 초과.
  return coalesce(v_turns, 0);
end;
$$;

-- 모델 호출이 실패했을 때 되돌린다. 안 쓴 턴을 세면 사용자가 손해를 본다.
create or replace function dot_give_back_turn(p_user uuid, p_day date)
returns void
language sql
security definer
set search_path = public
as $$
  update dot_usage set turns = greatest(0, turns - 1)
  where user_id = p_user and day = p_day;
$$;

-- 한 턴에 쓴 토큰을 하루치에 얹는다.
create or replace function dot_add_tokens(p_user uuid, p_day date, p_in bigint, p_out bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update dot_usage set input_tokens = input_tokens + p_in, output_tokens = output_tokens + p_out
  where user_id = p_user and day = p_day;
$$;

-- 그림 주문용 겉모습(영어). tagline 은 목록에 뜨는 한국어 한 줄이다. (09-09 갈랐다; 09-11 이주 때 스키마에 빠져 있던 것을 발견)
alter table dot_characters add column if not exists look text not null default '';

-- 첫 화면에서 누를 수 있는 말 몇 마디(09-11). 빈 입력창 앞에서 뭘 말할지 모르는 첫 순간을 없앤다.
alter table dot_characters add column if not exists chips jsonb not null default '[]'::jsonb;

-- 처음부터 반말인 인물(소꿉친구 린). 단계 말투 규칙(1단계 존댓말)을 이 인물엔 안 건다.
alter table dot_characters add column if not exists formal_start boolean not null default true;

-- 모델이 neutral 을 냈을 때 대신 보여 줄 표정(09-11 67회차). 시큰둥이 기본인 인물(린)은 neutral 이 그 얼굴이 아니다. 기본은 neutral(=안 바꿈).
alter table dot_characters add column if not exists default_emotion text not null default 'neutral';

-- 프로필용 얼굴 크롭(96px) 주소들 { neutral: url, ... } (09-11 68회차). 흉상을 CSS 로 확대해 자르던 것을 그림 쪽에서 잘라 준다.
alter table dot_characters add column if not exists faces jsonb not null default '{}'::jsonb;

-- 개인 스냅사진(카톡 프로필 사진) [{url, caption}] (09-11). 프로필·목록은 이걸, 말풍선 옆 작은 얼굴만 표정.
alter table dot_characters add column if not exists photos jsonb not null default '[]'::jsonb;

-- ── 멘헤라 모드 (09-11, 75회차) ──────────────────────────────────────
-- 사장님 "집착 버프도 팔 거니까" → 이름은 "멘헤라 모드". 사이마다 켜고 끈다(나중에 유료).
-- 켜면: 말이 길어지고 매달리며, 먼저 말 걸기가 하루 3번까지(답이 없으면 또).
alter table dot_bonds add column if not exists mode text not null default 'normal' check (mode in ('normal', 'menhera'));
alter table dot_bonds add column if not exists pings_today int not null default 0;
alter table dot_bonds add column if not exists last_pinged_at timestamptz;

-- ── 유료 자격 (09-11) ─────────────────────────────────────────────────
-- 멘헤라 모드는 돈 내고 쓴다. 스토어 결제가 붙기 전엔 사장님이 dot_grant_menhera.mts 로 준다.
create table if not exists dot_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  menhera_until timestamptz,
  updated_at timestamptz not null default now()
);

-- 86회차 09-12: 카톡의 안 읽은 수. 방을 열면 지금 시각을 적고, 그 뒤에 온 캐릭터 말 수가 배지다.
alter table dot_bonds add column if not exists last_seen_at timestamptz;

-- 89회차 09-12: 카톡 이모티콘처럼 캐릭터가 가끔 **표정 스티커**를 보낸다. content 는 빈 줄, sticker 에 표정 키.
alter table dot_messages add column if not exists sticker text;
