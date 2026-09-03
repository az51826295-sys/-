-- 프로토타입을 **사람이 봤다**는 기록.
--
-- 09-01 에 사장님이 순서를 이렇게 정하셨다:
--
--     설계 → 프로토타입(도형) → 사람이 본다 → **승인** → 그림을 넣는다
--
-- 그런데 "사람이 본다" 와 "승인" 을 적어 둘 자리가 없었다. 화면은 컴파일이
-- 끝나면 "합격 기준 N개는 아직 확인되지 않았습니다" 라고 말하고 거기서 끝났고,
-- 사장님이 켜 보고 좋다고 하셔도 그 말이 아무 데도 안 남았다. 남지 않으면
-- 다음 단계(그림 발주)가 무엇을 근거로 열리는지 말할 수 없다.
--
-- ## 이 칸이 "합격" 이 아닌 이유
--
-- `human_verdict` 는 **사람이 무엇을 보고 무엇이라 했는지**만 적는다. 합격
-- 기준이 통과했다는 뜻이 아니다. 기계가 잰 것은 따로 있고(컴파일·PlayMode·
-- 기준 표), 이 칸은 그것과 겹치지 않는다.
--
-- 둘을 한 칸에 넣으면 "승인했으니 다 됐다" 가 되고, 그러면 못 잰 것이 사람의
-- 도장 뒤로 숨는다. 이 저장소가 계속 경계하는 모양이다.

alter table unity_sessions
  -- 'approved' | 'rejected'. null 이면 **아직 안 봤다** — 못 봤다는 것과
  -- 안 좋다는 것을 구분한다.
  add column if not exists human_verdict text,
  -- 무엇을 보고 그렇게 정했는지. 빈 칸이어도 되지만, 반려에는 적어 두면
  -- 다음 판이 그것을 읽는다.
  add column if not exists human_note text,
  add column if not exists human_at timestamptz;

-- 아무 글자나 들어가면 화면과 API 가 서로 다른 말을 하게 된다.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'unity_sessions_human_verdict_check'
  ) then
    alter table unity_sessions
      add constraint unity_sessions_human_verdict_check
      check (human_verdict is null or human_verdict in ('approved', 'rejected'));
  end if;
end $$;
