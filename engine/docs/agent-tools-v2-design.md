<!-- provenance: {"source_id": "docs/agent-tools-v2-design.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-08-22T19:20:57", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# 에이전트 도구 v2 — 읽기 절단·탐색 부재의 수리 (2026-08-22 등록, 구현·측정은 48h 드라이런 후)

## 근거 (실패 41시도 부검, 재검증 B·A 원장, `data/failed_attempts_0822.json`)

| 관측 | 값 |
|---|---|
| 전체 스텝 중 `read_file` | **238 / 477 (50%)** |
| 같은 파일을 2회 이상 읽은 시도 | **38 / 41** |
| 읽힌 대상 파일 크기 | 전부 22k~77k 바이트 (functoolz 31k×25회, funcutils 41k×24회, table 30k×22회, setutils 35k×20회, iterutils 61k, urlutils 59k, fields 77k) |
| 탐색·덤프용 스크래치 스크립트를 쓴 시도 | **19 / 41** (`find_*`, `probe_*`, `dump_helper`, `debug_*`, 가짜 `conftest.py`·`test_*.py`) |
| 12스텝 소진 | 41 중 39 |

메커니즘: `read_file`은 앞 **20,000자만** 돌려주고 offset이 없다. 대상 파일은
예외 없이 그보다 크다. 에이전트는 같은 파일을 다시 읽어도 같은 앞부분만 보고,
나머지를 보려고 (a) 덤프 스크립트를 써서 `run_tests`로 돌리는 편법(가짜
테스트 파일 — 위생 규칙이 채택 전에 지운다), (b) 정규식 "마커" 편집으로
위치를 더듬는 행동(310 2차: 7회 연속 edit)을 보였다. 검색(grep)·디렉터리
나열 도구도 없다. 스텝의 절반이 "보지 못하는 것을 보려는" 데 쓰였다.

## 설계 (기계 도구 추가, 프롬프트 지시 없음)

1. `read_file(path, start_line=1, max_lines=200)` — 줄 범위 읽기. 응답 머리에
   `총 L줄, 이번 1~200줄` 을 붙여 다음 호출을 유도한다. 절단을 "조용히"
   하지 않는다(지금은 20,000자에서 말없이 잘린다).
2. `search(pattern, path_glob="**/*.py", max_hits=50)` — 작업공간 안에서
   정규식 검색, `파일:줄: 내용` 반환. **파이썬 구현**(서브프로세스 없음) —
   `python -c` 실행 도구는 넣지 않는다: argv 검사만으로는 스니펫의 디스크
   접근을 가둘 수 없어 격리 제도와 충돌한다.
3. `list_dir(path=".", depth=1)` — 저장소 지도는 이미 프롬프트에 주지만
   150항목에서 잘린다; 필요할 때 부분 지도를 더 보게.
4. `edit_file`·`write_file`·`run_tests`·`done`은 그대로. MAX_STEPS 12 유지
   (도구가 스텝을 아끼는지가 측정 대상이므로 상한을 늘리지 않는다).
5. 위생 규칙(I6·커밋 전 청소)·테스트 파일 금지·격리 containment는 전부
   새 도구에도 그대로 적용(search·list_dir는 읽기 전용, resolve() 경유).

## 측정 (사전 등록 — 숫자 보기 전 동결)

- 코퍼스: 재검증에서 **양팔 모두 실패한 9건**(boltons 439·310·301·280·201·
  141, marshmallow 1566, tinydb 629, toolz 481). 같은 HEAD, 같은 사다리
  (fast→smart, 2시도), 새 원장 `live_tools2`. 예상 지출 ≈ 9 × $1.3 ≈ **$12**.
- 1차 지표: **해결 수**. 2차: read 스텝 비율, 스크래치 스크립트를 쓴 시도
  비율, 첫 편집까지의 스텝.
- 판정표: 해결 **≥2** → 도구 결함이 병목이었다(v2 상시 편입). 해결 0~1이고
  read 비율 < 30%로 떨어졌다 → 도구는 고쳤으나 능력 대역(후세대 코퍼스로
  보존). read 비율이 안 떨어졌다 → 설계 미달, 부검.
- 실행은 운영자 승인(지출) + 드라이런 종료 후(엔진 `agentic.py` 변경).

## 구현 상태 (08-22 밤)

도구 세 개와 `exec_tool()` 디스패치를 **별도 모듈** `genesis/rookery/engine/agent_tools.py`
로 구현·테스트 완료(4건: 페이징·절단 고지·검색·깊이·격리·인자 누락). 엔진에는
아직 연결하지 않았다 — `agentic.py`의 TOOLS에 `agent_tools.TOOL_SCHEMAS`를 넣고
`_exec_tool` 첫 줄에서 `agent_tools.exec_tool(ws, name, args)`가 None이 아니면
그 결과를 돌려주면 된다(read_file v1 분기 대체). 드라이런 종료 후.

## 연결 완료 (2026-08-24)

드라이런 종료 후 `tools/post_dryrun_wiring.py`로 연결됨: agentic.TOOLS에
`agent_tools.TOOL_SCHEMAS`(read_file 줄 범위·search·list_dir) 편입, `_exec_tool`
첫 줄에서 `agent_tools.exec_tool`이 v2 도구를 처리. 인박스 소비·Goodhart 일일
편입도 같이. 테스트 38건 통과(목 모드 불변식 타이밍 독립화 1건 포함).
**측정($12, 9건 재시도)은 여전히 파일럿/수요 답 뒤로 게이트.**
