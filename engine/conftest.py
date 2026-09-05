"""느린 테스트에 `slow` 표식을 붙인다 — 목록은 **잰 값**에서 온다.

`data/slow_tests.json`(생성: `tools/slow_tests.py`)에 적힌 nodeid에만 표식이
붙는다. 손으로 데코레이터를 다는 방식을 안 쓰는 이유: 사람이 "느릴 것 같다"고
붙이기 시작하면 빠른 부분집합이 측정이 아니라 인상이 된다.

**상시 게이트는 여전히 전체 스위트다.** `-m "not slow"`는 기본값이 아니고
(pyproject의 addopts에 없다) 안쪽 반복에서 사람이 명시적으로 골라야 한다.
그 성질을 tests/test_slow_registry.py가 지킨다.
"""
import json
import os

import pytest

_REGISTRY = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "data", "slow_tests.json")


def slow_nodeids(path: str = _REGISTRY) -> set:
    if not os.path.isfile(path):
        return set()
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)
    return {t["nodeid"].replace("\\", "/") for t in doc.get("tests", [])}


def pytest_collection_modifyitems(config, items):
    ids = slow_nodeids()
    if not ids:
        return
    for item in items:
        if item.nodeid.replace("\\", "/") in ids:
            item.add_marker(pytest.mark.slow)


# ── 옮겨 오지 않은 폴더를 읽는 시험 ─────────────────────────────
#
# 2026-09-05 에 엔진을 genesis-project 에서 로키 저장소(`engine/`)로 옮기면서
# 게임(`game/`, Godot)·실험 산출물(`out/`)·오디션 그림(`audition/`)·받아 둔 저장소
# (`data/repos/`)는 안 가져왔다 — 엔진이 아니다. 그 폴더를 읽는 시험 30개가
# 옮긴 자리에서 "떨어짐"으로 찍혔다(1:20 걸려서). 떨어진 것이 아니라 **잴 대상이
# 여기 없는 것**이라, 그렇게 적고 건너뛴다.
#
# 목록은 `data/absent_folder_tests.json` — 손으로 고른 것이 아니라 옮긴 뒤 한 번
# 돌려서 **떨어진 것만** 적은 것이다(모듈 통째로 건너뛰면 멀쩡한 73개까지 숨는다).
# 각 시험이 어느 폴더에 기대는지도 거기 있고, 그 폴더가 생기면 다시 돈다.
_ABSENT = os.path.join(_HERE_DIR := os.path.dirname(os.path.abspath(__file__)),
                       "data", "absent_folder_tests.json")


def _absent_folder_tests(path: str = _ABSENT) -> dict:
    if not os.path.isfile(path):
        return {}
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)
    return {t["nodeid"].replace("\\", "/"): t["needs"] for t in doc.get("tests", [])}


def _skip_when_folder_missing(items):
    needs = _absent_folder_tests()
    if not needs:
        return
    for item in items:
        folder = needs.get(item.nodeid.replace("\\", "/"))
        if folder and not os.path.isdir(os.path.join(_HERE_DIR, folder)):
            item.add_marker(pytest.mark.skip(
                reason=f"'{folder}/' 폴더가 이 저장소에 없다 — 엔진을 옮길 때 안 가져온 것"))


_orig_modify = pytest_collection_modifyitems


def pytest_collection_modifyitems(config, items):  # noqa: F811
    _orig_modify(config, items)
    _skip_when_folder_missing(items)
