"""합법 영역 샘플링 시험 — 설계: docs/legal-sampling-v0-design.md.

이 통제의 전제는 **합법성이 구성으로 증명된다**는 것이다. 그래서 여기서
고정하는 것은 "심판이 통과시켰다"가 아니라 **생성기가 스펙 안에서만 뽑는가**다.
그게 깨지면 통과율 1.0이 아무 뜻도 없어진다.
"""
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from genesis import icon_lane                             # noqa: E402
from genesis import legal_sampler as ls                   # noqa: E402
from tools import icon_judge as ij                        # noqa: E402

SAMPLES = ls.sample(60)


def test_frozen_seed_and_bounds():
    assert ls.SEED == 20260826
    assert ls.MAX_PATHS == 6 and ls.MAX_COMMANDS == 60
    assert min(ls._COORDS) == ls.PADDING_MIN
    assert max(ls._COORDS) == ls.VIEWBOX - ls.PADDING_MIN


def test_same_seed_same_samples():
    """씨앗을 바꿔가며 통과 표본을 찾는 일이 없도록 재현이 고정돼야 한다."""
    assert ls.sample(20) == ls.sample(20)
    assert ls.sample(20, seed=1) != ls.sample(20)


@pytest.mark.parametrize("i", range(0, 60, 7))
def test_every_sample_is_legal_by_construction(i):
    """구성이 보장한다고 적은 것들을 실제로 지키는지 - 심판과 무관하게 잰다."""
    m = icon_lane.measure(SAMPLES[i], snap=ls.SNAP)
    assert m["error"] is None
    assert m["off_grid"] == []
    assert m["min_padding"] >= ls.PADDING_MIN
    assert m["path_count"] <= ls.MAX_PATHS
    assert m["command_count"] <= ls.MAX_COMMANDS
    assert m["bytes"] <= ls.MAX_BYTES
    assert m["stroke_widths"] == [ls.STROKE_WIDTH]
    assert m["fills"] == ["none"]
    assert m["colors"] == []                    # currentColor뿐이라 색이 없다
    assert set(m["elements"]) <= {"svg", "path"}


def test_the_judge_has_no_hidden_condition():
    """본문: 합법인데 떨어지면 스펙에 없는 조건이 있다는 직접 증거다."""
    doc = ij.load_spec()
    failures = []
    for svg in SAMPLES:
        r = ij.judge_svg(svg, doc)
        if r["verdict"] != "PASS":
            failures.append((r["verdict"],
                             [x["rule"] for x in r["rules"]
                              if x["ok"] is not True], svg[:120]))
    assert not failures, failures[:3]


def test_coverage_names_what_it_did_not_touch():
    """안 건드린 축을 안 적으면 커버리지를 부풀리게 된다."""
    cov = ls.coverage(SAMPLES)
    assert cov["n"] == len(SAMPLES)
    assert cov["axes"]["elements"].get("path") == len(SAMPLES)
    assert set(cov["axes"]["commands_used"]) <= {"M", "L", "C", "Q"}
    assert len(cov["not_exercised"]) >= 3
    assert any("circle" in x for x in cov["not_exercised"])


def test_samples_are_not_all_the_same_shape():
    """전부 같은 모양이면 200건이 1건과 같다."""
    cov = ls.coverage(SAMPLES)
    assert len(cov["axes"]["path_count"]) >= 4      # path 수가 여러 값
    hashes = {icon_lane.structure_hash(s, snap=ls.SNAP) for s in SAMPLES}
    assert len(hashes) == len(SAMPLES)              # 전부 다른 구조


def test_golden_counts_the_new_control():
    from tools import golden_bench as gb
    assert gb.THRESHOLDS["legal"] == 1.0
    assert gb.N_MIN["legal"] == 200
