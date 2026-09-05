"""세트 층(그림) — 초안 §3 layer_set.image

핵심 주장: "일관되는가"는 취향이 아니라 **분산**이라 기계가 잰다. 다만
① 표본이 5개 미만이면 판정하지 않고(E6), ② 문턱이 없으면 undefined,
③ 이상치는 탈락이 아니라 격리 후보 순위로만 낸다.
"""

import os

import pytest
import yaml

from genesis import asset_set as aset
from tools import artifact_adapter as aa
from tools import judge_bench as jb

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES = os.path.join(ROOT, "data", "asset_specs", "asset_judge_v0.rules.yaml")


def rules():
    with open(RULES, encoding="utf-8") as f:
        return yaml.safe_load(f)


def icon(path, rgb=(30, 60, 120), thickness=4, size=64):
    """알파 배경 위에 두께 지정 십자 획을 그린 아이콘 비슷한 이미지."""
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    mid = size // 2
    d.line([(8, mid), (size - 8, mid)], fill=rgb + (255,), width=thickness)
    d.line([(mid, 8), (mid, size - 8)], fill=rgb + (255,), width=thickness)
    img.save(path)
    return str(path)


def make_set(tmp_path, n=5, rgb=(30, 60, 120), thickness=4):
    return [icon(tmp_path / f"{i}.png", rgb=rgb, thickness=thickness)
            for i in range(n)]


# ---------------------------------------------------------------- 낱개 특징

def test_asset_features_are_measured_from_opaque_pixels(tmp_path):
    a = aset.measure_asset(icon(tmp_path / "a.png", rgb=(30, 60, 120)))
    assert a["error"] is None
    assert 0.0 <= a["dominant_hue"] <= 1.0
    assert a["median_value"] > 0 and a["median_saturation"] > 0
    assert a["visible_pixels"] > 0
    assert a["stroke_thickness"] is not None


def test_thicker_stroke_measures_thicker(tmp_path):
    thin = aset.measure_asset(icon(tmp_path / "t.png", thickness=2))
    thick = aset.measure_asset(icon(tmp_path / "k.png", thickness=8))
    assert thick["stroke_thickness"] > thin["stroke_thickness"]


def test_fully_opaque_image_has_no_stroke_measure(tmp_path):
    from PIL import Image
    p = tmp_path / "full.png"
    Image.new("RGBA", (32, 32), (10, 10, 10, 255)).save(p)
    a = aset.measure_asset(str(p))
    assert a["stroke_thickness"] is None      # 꽉 찬 그림엔 '획'이 없다


# ---------------------------------------------------------------- 세트 지표

def test_consistent_set_has_low_dispersion(tmp_path):
    res = aset.measure_set(make_set(tmp_path, n=5),
                           value_tolerance=0.1, saturation_tolerance=0.1)
    assert res["eligible"] is True
    assert res["hue_dispersion"] < 0.01
    assert res["value_outside_ratio"] == 0.0
    assert res["saturation_outside_ratio"] == 0.0
    assert res["thickness_cv"] < 0.01


def test_mixed_hues_raise_dispersion(tmp_path):
    paths = [icon(tmp_path / "a.png", rgb=(200, 30, 30)),
             icon(tmp_path / "b.png", rgb=(30, 200, 30)),
             icon(tmp_path / "c.png", rgb=(30, 30, 200)),
             icon(tmp_path / "d.png", rgb=(200, 200, 30)),
             icon(tmp_path / "e.png", rgb=(200, 30, 200))]
    res = aset.measure_set(paths)
    assert res["hue_dispersion"] > 0.3       # 색이 제각각이면 분산이 오른다


def test_one_odd_asset_ranks_as_outlier(tmp_path):
    paths = make_set(tmp_path, n=5)
    odd = icon(tmp_path / "odd.png", rgb=(250, 240, 10))
    res = aset.measure_set(paths + [odd])
    # 격리 후보 1위가 그 자산이어야 한다(탈락이 아니라 순위)
    assert res["outlier_ranking"][0]["path"] == odd


def test_stroke_variation_shows_in_cv(tmp_path):
    paths = [icon(tmp_path / f"{i}.png", thickness=t)
             for i, t in enumerate([2, 3, 4, 8, 12])]
    res = aset.measure_set(paths)
    assert res["thickness_cv"] > 0.3


def test_tolerance_is_required_for_outside_ratios(tmp_path):
    res = aset.measure_set(make_set(tmp_path, n=5))
    # '이탈'의 폭이 동결되지 않으면 비율을 만들지 않는다
    assert res["value_outside_ratio"] is None
    assert res["saturation_outside_ratio"] is None


def test_small_set_is_ineligible_not_judged(tmp_path):
    res = aset.measure_set(make_set(tmp_path, n=3), value_tolerance=0.1)
    assert res["eligible"] is False
    assert res["hue_dispersion"] is None
    assert "E6" in res["ineligible_reason"]


def test_broken_files_are_listed_not_silently_dropped(tmp_path):
    paths = make_set(tmp_path, n=5)
    bad = tmp_path / "bad.png"
    bad.write_bytes(b"\x89PNG\r\n\x1a\n nope")
    res = aset.measure_set(paths + [str(bad)])
    assert str(bad) in res["errors"]
    assert res["n"] == 6 and res["n_measured"] == 5


# ---------------------------------------------------------------- 심판 연결

def set_atom():
    r = rules()
    b = r["image_set_bench"]
    return {"id": "asset_image_set", "verdict": "real",
            "judge": {"kind": "spec_conformance",
                      "params": {"rules": r["image_set_rules"]},
                      "positive": b["positive"], "negatives": b["negatives"]}}


def test_set_rules_have_teeth():
    r = jb.bench_atom(set_atom())
    assert r["verdict"] == "teeth" and r["teeth"] >= 4
    assert r["evidence"] == "measured"


def test_set_thresholds_are_still_unfrozen():
    t = rules()["set_thresholds"]
    assert all(v is None for v in t.values()), t


def test_set_judgement_is_undefined_until_frozen(tmp_path):
    paths = make_set(tmp_path, n=5)
    res = aa.judge_artifacts(set_atom(), {
        "adapter": "image_set",
        "params": {"paths": paths, "value_tolerance": 0.1,
                   "saturation_tolerance": 0.1},
        "spec": {"hue_dispersion_max": None, "value_outside_max": None,
                 "saturation_outside_max": None, "thickness_cv_max": None}})
    assert res["verdict"] == "undefined" and "문턱 미동결" in res["reason"]


def test_frozen_set_thresholds_pass_a_consistent_set(tmp_path):
    frozen = {"hue_dispersion_max": 0.25, "value_outside_max": 0.2,
              "saturation_outside_max": 0.2, "thickness_cv_max": 0.3}
    good = aa.judge_artifacts(set_atom(), {
        "adapter": "image_set",
        "params": {"paths": make_set(tmp_path, n=5),
                   "value_tolerance": 0.1, "saturation_tolerance": 0.1},
        "spec": frozen})
    assert good["verdict"] == "passed", good["reason"]


def test_frozen_set_thresholds_reject_an_inconsistent_set(tmp_path):
    frozen = {"hue_dispersion_max": 0.25, "value_outside_max": 0.2,
              "saturation_outside_max": 0.2, "thickness_cv_max": 0.3}
    paths = [icon(tmp_path / "a.png", rgb=(200, 30, 30), thickness=2),
             icon(tmp_path / "b.png", rgb=(30, 200, 30), thickness=3),
             icon(tmp_path / "c.png", rgb=(30, 30, 200), thickness=10),
             icon(tmp_path / "d.png", rgb=(200, 200, 30), thickness=4),
             icon(tmp_path / "e.png", rgb=(200, 30, 200), thickness=12)]
    bad = aa.judge_artifacts(set_atom(), {
        "adapter": "image_set",
        "params": {"paths": paths, "value_tolerance": 0.1,
                   "saturation_tolerance": 0.1},
        "spec": frozen})
    assert bad["verdict"] == "failed"


def test_small_set_stays_undefined_even_when_frozen(tmp_path):
    """E6: 표본 미달은 탈락이 아니라 미정의다."""
    frozen = {"hue_dispersion_max": 0.25, "value_outside_max": 0.2,
              "saturation_outside_max": 0.2, "thickness_cv_max": 0.3}
    res = aa.judge_artifacts(set_atom(), {
        "adapter": "image_set",
        "params": {"paths": make_set(tmp_path, n=3), "value_tolerance": 0.1,
                   "saturation_tolerance": 0.1},
        "spec": frozen})
    assert res["verdict"] == "undefined" and "측정 없음" in res["reason"]


def test_adapter_can_take_a_directory(tmp_path):
    make_set(tmp_path, n=5)
    sample = aa.build_sample({"adapter": "image_set",
                              "params": {"dir": str(tmp_path)}})
    assert sample["measured"]["n"] == 5 and sample["measured"]["eligible"]
