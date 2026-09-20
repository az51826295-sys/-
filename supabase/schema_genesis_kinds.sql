-- 200회차 09-20: genesis_runs.kind 를 늘린다.
--
-- 원래 `check (kind in ('daily'))` 뿐이라 `weekly`·`unattended` insert 가 **조용히 실패**했다.
-- weekly 는 잠금을 다른 자리(conversation_messages.attachments.weekly)로 옮겨 마이그레이션 없이 고쳤지만,
-- 무인 판(unattended)은 **로키가 읽어야 하는 깃발**이라 DB 에 자리가 있어야 한다.
alter table genesis_runs drop constraint if exists genesis_runs_kind_check;
alter table genesis_runs add constraint genesis_runs_kind_check
  check (kind in ('daily', 'weekly', 'unattended'));
