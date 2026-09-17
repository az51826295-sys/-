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
