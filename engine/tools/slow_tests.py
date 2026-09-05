"""느린 테스트 등록부 — **잰 값으로만** 만든다.

왜 이 도구가 있나(2026-08-26, 사장님 결정): 스위트가 길어지면 사람이 전체를
안 돌리기 시작한다. 그렇다고 상시 게이트를 줄이면 그 위험을 **제도화**하는 것이다.
그래서 둘을 나눈다.

    상시 게이트  = 전체 스위트 (줄이지 않는다)
    안쪽 반복용  = pytest -m "not slow"  (사람이 명시적으로 골라야 빠져나간다)

`-m "not slow"`는 기본값이 아니다. `pyproject.toml`의 addopts에 넣지 않았고,
그걸 넣지 못하게 막는 테스트가 있다(tests/test_slow_registry.py).

느림의 기준은 **20초**다. 한 번 도는 데 20초를 넘는 테스트 하나면 안쪽 반복이
그 테스트에 끌려간다. 이 숫자는 개발 도구의 정책값이고 판정 문턱이 아니다.

  python -X utf8 tools/slow_tests.py --from-log data/suite_xdist_0826.log
  python -X utf8 tools/slow_tests.py --show
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(ROOT, "data", "slow_tests.json")
SLOW_SECONDS = 20.0

_LINE = re.compile(r"^\s*([\d.]+)s\s+call\s+(\S+)\s*$")


def parse_durations(text: str) -> list:
    """pytest --durations 출력에서 (초, nodeid)를 뽑는다. call 단계만 센다."""
    rows = []
    for line in text.splitlines():
        m = _LINE.match(line)
        if m:
            rows.append((float(m.group(1)), m.group(2).replace("\\", "/")))
    return sorted(rows, reverse=True)


def build(rows: list, source: str, threshold: float = SLOW_SECONDS) -> dict:
    slow = [{"nodeid": nid, "seconds": sec}
            for sec, nid in rows if sec >= threshold]
    return {
        "note": ("잰 값으로만 채운다. 손으로 추가하지 말 것 - 추측으로 넣으면 "
                 "빠른 부분집합이 거짓말을 한다."),
        "threshold_seconds": threshold,
        "measured_from": source,
        "measured_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "gate_is_full_suite": True,
        "tests": slow,
    }


def load(path: str = REGISTRY) -> dict:
    if not os.path.isfile(path):
        return {"tests": [], "threshold_seconds": SLOW_SECONDS}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="느린 테스트 등록부")
    ap.add_argument("--from-log", help="pytest --durations 출력이 담긴 로그")
    ap.add_argument("--threshold", type=float, default=SLOW_SECONDS)
    ap.add_argument("--out", default=REGISTRY)
    ap.add_argument("--show", action="store_true")
    a = ap.parse_args(argv)

    if a.show or not a.from_log:
        doc = load(a.out)
        total = sum(t["seconds"] for t in doc["tests"])
        print(f'등록된 느린 테스트 {len(doc["tests"])}건 '
              f'(문턱 {doc.get("threshold_seconds")}초, 합계 {total:.0f}초)')
        for t in doc["tests"]:
            print(f'  {t["seconds"]:7.1f}s  {t["nodeid"]}')
        return 0

    with open(a.from_log, encoding="utf-8", errors="replace") as f:
        rows = parse_durations(f.read())
    if not rows:
        print("durations 줄을 못 찾았다 - --durations=N 으로 돌린 로그인가?")
        return 2
    doc = build(rows, os.path.relpath(a.from_log, ROOT), a.threshold)
    with open(a.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print(f'{len(doc["tests"])}건 기록: {a.out}')
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
