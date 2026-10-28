-- 2026-10-28 · 두근도트 · 사장님 "크레딧없는데 선물줄 수 있는거 고쳐"
--
-- 이 파일은 **이미 돌렸다**(Supabase SQL 편집기, dugeun-dot-2). 다시 돌려도 안전하다.
-- 저장소에 두는 까닭: 다음에 프로젝트를 옮길 때 **표만 옮기면 또 이 자리가 빈다.**
--
-- ── 고친 것 둘 ────────────────────────────────────────────────────────
--
-- ① `dot_spend_credits` 가 아예 없었다. 10-24 이사가 표는 옮기고 **함수는 안 옮겼다.**
--    그래서 크레딧이 있는 사람도 선물을 못 했고, 화면엔 "잠깐 문제가 생겼어요" 만 떴다.
--
-- ② 복원이 줄을 넣으면서 **번호표(시퀀스)를 안 올렸다.** 새 줄의 id 가 기존 id 와 부딪쳐
--    `dot_turns`(대화 기록)와 `dot_purchases`(선물 장부)가 계속 실패하고 있었다.
--    선물은 장부가 실패하면 통째로 되돌아가서, 크레딧이 있어도 선물이 안 갔다.

-- ── ① 크레딧 쓰기 ────────────────────────────────────────────────────
--
-- 계약(부르는 쪽 src/lib/dot/turn.ts):
--   돌려주는 값 = 쓰고 남은 크레딧. **모자라면 음수**를 돌려주고 **아무것도 안 뺀다.**
--   코드가 `Number(남음) < 0` 으로 거절하므로, 모자랄 때 0 을 돌려주면 공짜로 준 게 된다.
create or replace function public.dot_spend_credits(
  p_user uuid,
  p_amount integer,
  p_sku text
) returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  remaining integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception '쓰는 크레딧은 1 이상이어야 한다 (받은 값: %)', p_amount;
  end if;

  -- **줄 수 있을 때만 뺀다.** 조건을 update 안에 두는 것이 핵심이다 —
  -- 읽고 나서 빼면 두 번 눌렀을 때 둘 다 통과한다.
  -- 지갑 줄이 아예 없는 사람도 여기서 걸린다(없으면 0 크레딧인 것이다).
  update public.dot_wallet
     set credits = credits - p_amount,
         updated_at = now()
   where user_id = p_user
     and credits >= p_amount
  returning credits into remaining;

  if remaining is null then
    return -1;                 -- 모자람. 아무것도 안 뺐다.
  end if;

  -- 장부에 남긴다. **음수**로 적어야 dot_grant 가 적는 줄과 같은 표에서 합이 맞는다.
  insert into public.dot_purchases (user_id, sku, credits, menhera_days, source, ref)
  values (p_user, p_sku, -p_amount, 0, 'spend', null);

  return remaining;
end;
$fn$;

revoke all on function public.dot_spend_credits(uuid, integer, text) from public;
grant execute on function public.dot_spend_credits(uuid, integer, text) to service_role;

-- ── ② 번호표 맞추기 ──────────────────────────────────────────────────
--
-- 표 이름을 손으로 적지 않는다 — `dot_post_likes` 에는 id 가 없어서 한 번 깨졌다.
-- **번호표가 달린 칸을 DB 에서 찾아** 전부 맞춘다.
do $do$
declare
  r record;
  m bigint;
begin
  for r in
    select c.relname as 표, a.attname as 칸, pg_get_serial_sequence('public.' || c.relname, a.attname) as 번호표
      from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'dot\_%'
       and pg_get_serial_sequence('public.' || c.relname, a.attname) is not null
  loop
    execute format('select coalesce(max(%I), 0) from public.%I', r.칸, r.표) into m;
    perform setval(r.번호표, greatest(m, 1), m > 0);
    raise notice '% .% : 가장 큰 값 % -> 다음 %', r.표, r.칸, m, m + 1;
  end loop;
end
$do$;

select sequencename as 번호표, last_value as 지금값
  from pg_sequences where schemaname = 'public' and sequencename like 'dot%' order by 1;
