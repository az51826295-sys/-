-- 원장에 **무엇이었어야 하는가**를 같이 적는다.
--
-- 지금까지 원장에는 실제로 부른 모델만 있었다. 그러면 "이 호출이 비쌌다"는
-- 보이지만 "쌌어야 하는데 비쌌다"는 안 보인다 — 무엇이 쌌어야 하는지가 원장에
-- 없기 때문이다.
--
-- 실제로 그 눈이 없어서 놓쳤다. DeepSeek 이 `json_schema` 를 안 받아서 싼 자리로
-- 보낸 일이 **전부 실패하고 비싼 자리로 새고 있었는데**, 돌기는 도니까 화면에는
-- 아무 이상이 없었고 로그에만 남았다. 그 로그는 아무도 안 본다.
alter table model_usage add column if not exists tier text;

-- 그리고 **왜 그 자리에서 돌았는지.** 등급만으로는 새는 것과 원래 그런 것을
-- 구분할 수 없다: 그림이 껴서 일부러 올려 보낸 것도, 싼 벤더가 죽어서 올라간
-- 것도, 원장에서는 똑같이 "싼 등급인데 비싼 모델"로 보인다. 앞의 것은 정상이고
-- 뒤의 것은 고쳐야 할 고장이다.
alter table model_usage add column if not exists routing text;

alter table model_usage drop constraint if exists model_usage_tier_check;
alter table model_usage add constraint model_usage_tier_check
  check (tier is null or tier in (
    'judgment', 'verification', 'conversation', 'routine'
  ));

alter table model_usage drop constraint if exists model_usage_routing_check;
alter table model_usage add constraint model_usage_routing_check
  check (routing is null or routing in (
    'planned', 'no_economy', 'images', 'up', 'sideways'
  ));

-- 새는 자리를 묻는 질문만 빠르면 된다: 이 회사의 싼 등급이 계획대로 안 간 것.
create index if not exists model_usage_tier_idx
  on model_usage (company_id, tier, created_at desc);

-- 옛 줄은 빈 채로 둔다. 지금 와서 등급을 짐작해 채우면 그건 기록이 아니라
-- 추측이고, 추측으로 채운 원장은 틀려도 합계가 계속 나온다.
