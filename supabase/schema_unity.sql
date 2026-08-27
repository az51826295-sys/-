-- 유니티가 쓰는 읽기 전용 열쇠.
--
-- 게임 엔진은 브라우저 쿠키가 없으므로 헤더로 받는다. 회사당 하나이고, 이
-- 열쇠로는 **읽기만** 된다 — 만들거나 지우는 경로에는 붙지 않는다.
alter table companies
  add column if not exists unity_key text unique;

update companies
set unity_key = 'rk_' || replace(gen_random_uuid()::text, '-', '')
where unity_key is null;
