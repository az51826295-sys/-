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
