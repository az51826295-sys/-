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
-- 두근도트 돈 (09-11 사장님 "돈 버는 시스템 구축해야 해: 30번 다 쓰고 2번은 광고로 충전, 나머진 충전, 멘헤라 모드도 충전")
--
-- 하루 30번(공짜) → 광고 보면 +10번, 하루 2번까지 → 그 뒤는 **충전(credits)** 에서 한 번에 하나.
-- 멘헤라 모드는 자격(dot_entitlements.menhera_until) — 충전 상품으로 산다.
-- 광고·결제 검증(AdMob SSV, Play Billing)은 앱 쪽 키가 오면 api/dot/ad, api/dot/buy 에 붙는다. 표와 함수는 지금부터 그대로다.

alter table dot_usage add column if not exists bonus_turns int not null default 0;  -- 광고로 오늘 더 얻은 턴
alter table dot_usage add column if not exists ad_refills int not null default 0;   -- 오늘 광고 본 횟수
alter table dot_usage add column if not exists paid_turns int not null default 0;   -- 오늘 충전으로 쓴 턴

create table if not exists dot_wallet (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists dot_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  menhera_until timestamptz,
  updated_at timestamptz not null default now()
);

-- 원장: 뭘 언제 어디서(광고·결제·손) 받았나. 지우지 않는다.
create table if not exists dot_purchases (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text not null,
  credits int not null default 0,
  menhera_days int not null default 0,
  source text not null,          -- 'play' | 'ad' | 'manual'
  ref text,                      -- 결제 토큰·광고 트랜잭션 id
  created_at timestamptz not null default now()
);
create index if not exists dot_purchases_user on dot_purchases (user_id, id desc);

-- 턴 하나 가져가기: 공짜+광고 턴 안이면 그냥, 넘었으면 충전에서 하나. 못 가져가면 0.
create or replace function dot_take_turn(p_user uuid, p_day date, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turns int;
  v_credits int;
begin
  insert into dot_usage (user_id, day, turns)
  values (p_user, p_day, 1)
  on conflict (user_id, day) do update
    set turns = dot_usage.turns + 1
    where dot_usage.turns < p_limit + dot_usage.bonus_turns
  returning turns into v_turns;
  if v_turns is not null then return v_turns; end if;

  -- 공짜·광고 턴이 다 떨어졌다 → 충전에서 하나
  update dot_wallet set credits = credits - 1, updated_at = now()
    where user_id = p_user and credits > 0
  returning credits into v_credits;
  if v_credits is null then return 0; end if;

  update dot_usage set turns = turns + 1, paid_turns = paid_turns + 1
    where user_id = p_user and day = p_day
  returning turns into v_turns;
  return coalesce(v_turns, 0);
end;
$$;

-- 모델이 실패하면 되돌린다. 방금 것이 충전 턴이었으면(한도+광고를 넘어 있었으면) 충전도 돌려준다.
create or replace function dot_give_back_turn(p_user uuid, p_day date, p_limit int default 30)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turns int; v_bonus int; v_paid int;
begin
  select turns, bonus_turns, paid_turns into v_turns, v_bonus, v_paid from dot_usage where user_id = p_user and day = p_day;
  if v_turns is null or v_turns <= 0 then return; end if;
  if v_paid > 0 and v_turns > p_limit + v_bonus then
    update dot_usage set turns = turns - 1, paid_turns = paid_turns - 1 where user_id = p_user and day = p_day;
    update dot_wallet set credits = credits + 1, updated_at = now() where user_id = p_user;
  else
    update dot_usage set turns = turns - 1 where user_id = p_user and day = p_day;
  end if;
end;
$$;

-- 광고 보고 충전: 오늘 p_max 번까지, 한 번에 p_turns. 남은 횟수를 돌려주고, 이미 다 봤으면 -1.
create or replace function dot_ad_refill(p_user uuid, p_day date, p_max int, p_turns int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v int;
begin
  insert into dot_usage (user_id, day, turns, ad_refills, bonus_turns)
  values (p_user, p_day, 0, 1, p_turns)
  on conflict (user_id, day) do update
    set ad_refills = dot_usage.ad_refills + 1, bonus_turns = dot_usage.bonus_turns + p_turns
    where dot_usage.ad_refills < p_max
  returning ad_refills into v;
  if v is null then return -1; end if;
  insert into dot_purchases (user_id, sku, credits, menhera_days, source) values (p_user, 'ad_refill', 0, 0, 'ad');
  return p_max - v;
end;
$$;

-- 상품 주기(결제·손): 충전은 지갑에, 멘헤라는 자격에. 원장에 남긴다.
create or replace function dot_grant(p_user uuid, p_sku text, p_credits int, p_menhera_days int, p_source text, p_ref text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into dot_purchases (user_id, sku, credits, menhera_days, source, ref) values (p_user, p_sku, p_credits, p_menhera_days, p_source, p_ref);
  if p_credits > 0 then
    insert into dot_wallet (user_id, credits) values (p_user, p_credits)
    on conflict (user_id) do update set credits = dot_wallet.credits + p_credits, updated_at = now();
  end if;
  if p_menhera_days > 0 then
    insert into dot_entitlements (user_id, menhera_until) values (p_user, now() + p_menhera_days * interval '1 day')
    on conflict (user_id) do update
      set menhera_until = greatest(coalesce(dot_entitlements.menhera_until, now()), now()) + p_menhera_days * interval '1 day', updated_at = now();
  end if;
end;
$$;
-- 게시물 (78회차 09-11) — 사장님 "카톡 벤치마킹: 캐릭터들이 도트 게시물을 올리고, 팔로우하고, 채팅하는 시스템"
--
-- 캐릭터가 하루 한 장(사진 + 한 줄)을 올린다. 사람은 좋아요(친밀도 +1, 한 번만)와 "답장"(그 게시물을 들고 방으로)을 한다.
-- 팔로우는 따로 표가 없다 — 이야기해 본 사이(dot_bonds)가 곧 팔로우다.

create table if not exists dot_posts (
  id bigserial primary key,
  character_id uuid not null references dot_characters(id) on delete cascade,
  image_url text not null,
  caption text not null,
  published_on date not null,      -- 한국 날짜. 하루 하나.
  likes int not null default 0,
  created_at timestamptz not null default now(),
  unique (character_id, published_on)
);
create index if not exists dot_posts_recent on dot_posts (id desc);

create table if not exists dot_post_likes (
  post_id bigint not null references dot_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 좋아요: 한 번만. 게시물 likes +1, 그 캐릭터와의 사이 +1점. 이미 눌렀으면 -1.
create or replace function dot_like_post(p_user uuid, p_post bigint)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_char uuid; v_likes int;
begin
  insert into dot_post_likes (post_id, user_id) values (p_post, p_user)
  on conflict do nothing;
  if not found then return -1; end if;
  update dot_posts set likes = likes + 1 where id = p_post returning likes, character_id into v_likes, v_char;
  insert into dot_bonds (user_id, character_id, points) values (p_user, v_char, 1)
  on conflict (user_id, character_id) do update set points = dot_bonds.points + 1, updated_at = now();
  return v_likes;
end;
$$;

-- ── 팔로우 (83회차 09-12, 사장님 "게시물·팔로우·메시지 보내기로 전체 점검") ──
-- 팔로우는 이제 표가 있다. 피드 기본은 팔로잉한 캐릭터의 게시물; 이야기하면 자동으로 팔로우된다.
create table if not exists dot_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references dot_characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, character_id)
);
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
