"""무인 운영 라우팅 + 게이트 (4개월차 1주차, 실패 역산).

위임 목록은 사람이 상상해서 만들지 않는다 - 원장 4개(라이브 런
1~4, 총 662과제)에서 기본 경로(fast one-shot)가 틀린 유형을 센
결과다 (2026-08-09 집계):

    fix 524 / doc 44 / data 41 / agent_fix 10 : 실패 0
    test_add 43 중 실패 이벤트 9 (retry 8 + final 1)
      - 사유 전원 'validator rejected' (변이 이빨 검증 실패)

따라서 위임 규칙은 정확히 하나: **test_add의 재시도는 smart로
승급한다.** 다른 유형의 재시도는 fast 유지 - 측정에 없는 위임은
없다. 라우팅은 이 규칙표뿐이다: 모델에게 "누구에게 시킬까"를
묻는 호출은 존재하지 않는다 (그 호출이 가장 비싸다).

비가역 행동 목록은 사전 등록이다: 실행 시점에 모델이 판정하지
않고, 이 목록과의 대조만 있다.
"""

from __future__ import annotations

FAST, SMART = "fast", "smart"

# (kind, phase) -> tier. phase "retry" = attempts > 1.
# 항목 추가는 원장 재집계(위 주석의 표 갱신)를 먼저 요구한다.
DELEGATION: dict[tuple[str, str], str] = {
    ("test_add", "retry"): SMART,
}

# 사전 등록된 비가역 행동 - 자동 실행 불가, 승인 큐 전용.
# 실행 시점 판단 없음: 부분 문자열 대조만.
IRREVERSIBLE = (
    "push --force",
    "push -f",
    "branch -D",
    "reset --hard",
    "clean -fdx",          # 작업공간 밖에서
    "pr merge",
    "gh pr merge",
)


def route(kind: str, attempts: int) -> str:
    """규칙 라우팅. 입력은 원장 사실(kind, attempts)뿐이다."""
    if attempts > 1 and (kind, "retry") in DELEGATION:
        return DELEGATION[(kind, "retry")]
    return FAST


def requires_approval(command: str) -> bool:
    """사전 등록 목록과의 기계 대조. 모델 판단 없음.
    원문 그대로 비교한다 - `branch -D`(강제)와 `branch -d`(안전
    삭제)는 대소문자가 곧 의미라 lowercase 정규화가 구분을
    지운다 (테스트가 적발한 결함)."""
    return any(marker in command for marker in IRREVERSIBLE)
