<!-- provenance: {"source_id": "docs/live-intake-repos.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-08-20T21:17:01", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# 실전 투입 (a) — 대상 저장소·스캔 프로토콜 등록 (2026-08-20 동결)

> live-intake-filter.md(동결본)가 요구하는 착수 시점 등록.
> 이슈 내용을 보기 전에 기준을 박는다.

## 저장소 선정 기준 (기계적)

1. Python, pytest 스위트가 py3.12 로컬에서 실행됨이 **기실증**된
   저장소만 — 즉 채굴 시절 검증된 7개 클론을 그대로 쓴다. 새
   저장소 추가는 환경 실증 후에만.
2. 허용적 라이선스 (MIT/BSD/Apache 계열).
3. 공개 이슈 트래커 보유.

**동결 목록 (7)**: mahmoud/boltons · dateutil/dateutil ·
marshmallow-code/marshmallow · more-itertools/more-itertools ·
grantjenks/python-sortedcontainers · msiemens/tinydb · pytoolz/toolz

## 스캔 프로토콜 (1단계 — 분류만, 실행 없음)

- 저장소당 **최신 open 이슈 50건** (PR 제외). API 무인증 read.
- 제외 라벨: enhancement / feature request / documentation /
  question (소문자 부분일치).
- 분류 (본문 기준 — 1단계는 코멘트 미포함, 한계로 기록):
  - **A 동봉형 후보**: 파이썬 코드 블록에 `def test_` 또는
    assert+실패 신호(Traceback/Error) 동반
  - **B 유도 후보**: 재현용 파이썬 코드 블록 존재 (A 아님)
  - **C 부적격**: 코드 블록 없음 또는 제외 라벨
- **1단계 수율 = (A+B) / 스캔 총수** — (a)의 첫 관측치.

## 2단계 (별도 실행 — 이 문서 범위 밖)

A·B 후보에 대해서만: 클론 fetch로 현행 HEAD 갱신 → 테스트
추출/유도 → **HEAD에서 실제 실패 기계 확인** → 수용. 유도에
모델 호출을 쓰더라도 수용 판정은 실행에서만 나온다 (필터 원문).
2단계 수율 = 수용 / (A+B).
