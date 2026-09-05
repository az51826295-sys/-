"""순응 비용 v0 — 사전 등록 문서와 코드가 어긋나지 않게 막는다.

핵심 이빨 둘:
1. **스펙이 규제하는 축으로 재면 순환**이다. `color_count`·`opaque_ratio`가
   거리에 들어오는 순간 "양자화했더니 색이 바뀌었다"는 동어반복을 재게 된다.
2. **분모를 지어내지 않는다.** 그룹에 원본이 하나뿐이면 자(尺)가 없고, 그건
   0도 1도 아니라 미정의다.
"""
import os

from genesis import image_taste_features as itf
from tools import conformance_cost as cc

DESIGN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "docs", "conformance-cost-q2-v0-design.md")


def _rows(n_per_group: int, groups=("g1", "g2")):
    rows = []
    for g in groups:
        for i in range(n_per_group):
            rows.append({"group": g, "profile": "tile",
                         "source": f"{g}/src{i}.png",
                         "fixed_path": f"{g}/fix{i}.png",
                         "raw_verdict": "FAIL", "verdict": "PASS",
                         "violations": [], "measured": {}})
    return rows


def _vec_fn(shift: float):
    """원본은 i만큼 흩어져 있고, 후처리본은 원본에서 shift만큼 밀린 것."""
    def fn(path, root=None):
        i = int(path.split("src")[-1].split("fix")[-1].split(".")[0])
        base = [float(i)] + [0.0] * (len(cc.AXES) - 1)
        if "fix" in path:
            base[1] = shift
        return base, None
    return fn


def test_regulated_axes_are_excluded():
    assert "color_count" not in cc.AXES
    assert "opaque_ratio" not in cc.AXES
    assert set(cc.AXES) < set(itf.FEATURES)      # 새 특징을 만들지 않았다
    assert len(cc.AXES) == 8


def test_identical_pairs_are_encoding_only():
    res = cc.conformance(_rows(12), vec_fn=_vec_fn(0.0))
    assert res["sample"]["gate_ok"] is True
    assert res["verdict"] == "encoding_only"
    assert res["median_r"] == 0.0


def test_large_shift_is_content_loss():
    res = cc.conformance(_rows(12), vec_fn=_vec_fn(50.0))
    assert res["verdict"] == "content_loss"
    assert res["median_r"] > cc.CONTENT_LOSS_LOWER


def test_group_without_a_scale_is_undefined_not_zero():
    """원본이 하나뿐인 그룹은 자가 없다 → 그 자산은 비율을 안 만든다."""
    rows = _rows(12) + _rows(1, groups=("lonely",))
    res = cc.conformance(rows, vec_fn=_vec_fn(0.0))
    lonely = [a for a in res["assets"] if a["group"] == "lonely"]
    assert lonely and lonely[0]["r"] is None
    assert lonely[0]["why"] == "no_scale_in_group"


def test_sample_gate_downgrades_to_undefined():
    res = cc.conformance(_rows(3), vec_fn=_vec_fn(0.0))
    assert res["sample"]["gate_ok"] is False
    assert res["verdict"] == "undefined" and res["why"] == "sample_gate"


def test_unmeasurable_assets_are_skipped_with_reason():
    def fn(path, root=None):
        if path.endswith("src0.png"):
            return None, "불투명 픽셀 0 - 잴 것이 없다"
        return _vec_fn(0.0)(path, root)
    res = cc.conformance(_rows(12), vec_fn=fn)
    assert len(res["skipped"]) == 2
    assert all(s["reason"] for s in res["skipped"])


def test_thresholds_match_the_registered_design():
    text = open(DESIGN, encoding="utf-8").read()
    assert cc.ENCODING_ONLY_UPPER == 0.25 and "0.25" in text
    assert cc.CONTENT_LOSS_LOWER == 0.50 and "0.50" in text
    assert cc.MIN_ASSETS == 20 and "유효 자산 ≥ 20" in text
    assert cc.MIN_GROUPS == 2 and "그룹 ≥ 2" in text


def test_binding_counts_originals_not_the_fixed_records():
    """개정 §6: 기록된 violations를 세면 24건이 비어 거짓 표가 된다."""
    rows = cc.load_rows()
    assert len(rows) == 26
    assert sum(1 for r in rows if not r["violations"]) >= 24
    # 원본 재채점 경로가 실제로 원본 파일을 본다
    assert all(r["source"].startswith("audition/") for r in rows)


def test_binding_records_errors_instead_of_inventing_rates():
    out = cc.binding([{"group": "g", "profile": "tile",
                       "source": "nope/missing.png", "fixed_path": "x",
                       "raw_verdict": "FAIL", "verdict": "PASS",
                       "violations": [], "measured": {}}])
    assert out["_meta"]["judged"] == 0
    assert out["_meta"]["errors"][0]["reason"] == "파일 없음"
