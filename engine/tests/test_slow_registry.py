"""느린 테스트 등록부 시험 — 빠른 부분집합이 **게이트를 갉아먹지 않게** 지킨다.

사장님 결정(2026-08-26): 스위트가 길어져 사람이 전체를 안 돌리는 것이 진짜
위험이다. 그렇다고 상시 게이트를 줄이면 그 위험을 제도화하는 것이다. 그래서
`-m "not slow"`는 **사람이 명시적으로 고를 때만** 적용된다. 이 파일이 그
성질을 고정한다.
"""
import json
import os
import subprocess
import sys

import tomllib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from tools import slow_tests as st                       # noqa: E402


def _pytest_config() -> dict:
    with open(os.path.join(ROOT, "pyproject.toml"), "rb") as f:
        return tomllib.load(f)["tool"]["pytest"]["ini_options"]


def test_default_run_does_not_deselect_slow_tests():
    """기본값이 전체다. addopts로 조용히 줄이는 것을 막는다."""
    cfg = _pytest_config()
    addopts = cfg.get("addopts", "")
    if isinstance(addopts, list):
        addopts = " ".join(addopts)
    assert "not slow" not in addopts
    assert " -m" not in f" {addopts}"


def test_marker_is_registered():
    markers = " ".join(_pytest_config().get("markers", []))
    assert markers.startswith("slow:")


def test_registry_is_measured_not_hand_written():
    doc = st.load()
    assert doc["measured_from"]                       # 어느 주행에서 왔나
    assert doc["measured_at"]
    assert doc["gate_is_full_suite"] is True
    assert doc["threshold_seconds"] == st.SLOW_SECONDS
    assert doc["tests"], "등록부가 비어 있다"
    for t in doc["tests"]:
        assert t["seconds"] >= doc["threshold_seconds"]


def test_registry_has_no_stale_entries():
    """이름이 바뀐 테스트가 남아 있으면 부분집합이 거짓말을 한다."""
    for t in st.load()["tests"]:
        path, _sep, name = t["nodeid"].partition("::")
        full = os.path.join(ROOT, path)
        assert os.path.isfile(full), f"없는 파일: {path}"
        base = name.split("[")[0]
        with open(full, encoding="utf-8") as f:
            assert f"def {base}(" in f.read(), f"없는 테스트: {t['nodeid']}"


def test_slow_marker_actually_deselects(tmp_path):
    """표식이 실제로 붙는지 - 등록부의 첫 항목이 -m "not slow"에서 빠지는가."""
    doc = st.load()
    nodeid = doc["tests"][0]["nodeid"]
    path = nodeid.split("::")[0]
    r = subprocess.run(
        [sys.executable, "-X", "utf8", "-m", "pytest", path,
         "--collect-only", "-q", "-m", "not slow"],
        cwd=ROOT, capture_output=True, text=True, timeout=300)
    assert r.returncode in (0, 5), r.stdout[-500:]
    assert "deselected" in r.stdout
    assert nodeid.split("::")[1] not in r.stdout


def test_durations_parser_reads_pytest_output():
    text = ("============ slowest 20 durations ============\n"
            "184.13s call     tests/test_mine.py::test_known_positive\n"
            "  0.30s setup    tests/test_x.py::test_y\n"
            "22.75s call     tests/test_mission5.py::test_curve\n")
    rows = st.parse_durations(text)
    assert rows == [(184.13, "tests/test_mine.py::test_known_positive"),
                    (22.75, "tests/test_mission5.py::test_curve")]


def test_build_keeps_only_measured_slow_ones():
    rows = [(30.0, "a::x"), (19.9, "b::y")]
    doc = st.build(rows, "log", threshold=20.0)
    assert [t["nodeid"] for t in doc["tests"]] == ["a::x"]
    assert doc["gate_is_full_suite"] is True
