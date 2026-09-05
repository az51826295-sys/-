"""observed.* null 통제 시험 — 통제가 서는가, 그리고 **등록으로 새지 않는가**.

핵심은 두 가지다.
1. 라벨이 쏠린 표본에서 나오는 높은 일치율은 fail이 아니라 undefined다
   (아이콘 골든 null 0.125가 그 그림이었다).
2. 목 실행·미정의·미달은 등록부에 절대 못 올라간다.
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools import extractor_g                            # noqa: E402
from tools import observed_null as on                    # noqa: E402

CHOICES = extractor_g.FIELDS["art_style"]["choices"]      # 5개


def _manifest(labels):
    return {"field": "art_style",
            "assets": [{"id": f"a{i}", "artifact": f"<svg id='{i}'/>",
                        "label": lab} for i, lab in enumerate(labels)]}


def _truthful(labels, k=3):
    """자산마다 제 라벨을 k번 답하는 목 — G가 자산을 제대로 보는 경우."""
    return extractor_g.MockExtractor([lab for lab in labels for _ in range(k)])


def test_distinct_labels_and_truthful_extractor_passes():
    labels = CHOICES[:5]                       # 전부 다른 라벨 → 우연 바닥 0
    res = on.run(_manifest(labels), _truthful(labels))
    assert res["verdict"] == "PASS", res["why"]
    assert res["n_mispairs"] == 20             # 5×4
    assert res["null_pass_rate"] == 0.0
    assert res["self_match_rate"] == 1.0
    assert res["chance_floor"] == 0.0


def test_skewed_labels_are_undefined_not_fail():
    """라벨이 쏠리면 통제 자체가 정의되지 않는다 — 필드를 떨어뜨리지 않는다."""
    labels = ["pixel"] * 5
    res = on.run(_manifest(labels), _truthful(labels))
    assert res["verdict"] == "UNDEFINED"
    assert "쏠림" in res["why"]
    assert res["chance_floor"] == 1.0
    assert res["null_pass_rate"] == 1.0        # 숫자는 감추지 않는다


def test_too_few_mispairs_is_undefined():
    labels = CHOICES[:3]                       # 3×2 = 6쌍 < 20
    res = on.run(_manifest(labels), _truthful(labels))
    assert res["verdict"] == "UNDEFINED"
    assert "최소" in res["why"]


def test_blind_extractor_fails_the_control():
    """자산을 안 보고 늘 같은 답을 하면(=자산과 무관) 어긋난 짝도 맞아버린다.

    이빨 검사다: 통제가 실제로 무언가를 떨어뜨릴 수 있어야 통제다.
    """
    labels = CHOICES[:5]                       # 우연 바닥 0 - 라벨 탓이 아니다
    always = extractor_g.MockExtractor(["pixel"])
    res = on.run(_manifest(labels), always)
    assert res["verdict"] == "FAIL"
    assert res["null_pass_rate"] == 0.2        # 20쌍 중 4쌍
    assert res["chance_floor"] == 0.0
    assert res["self_match_rate"] == 0.2


def test_two_labels_are_undefined_before_fail():
    """우연 바닥이 문턱을 넘으면 판정은 미정의가 **먼저**다 - 표본 탓을
    필드 탓으로 돌리지 않는다."""
    labels = ["pixel", "line", "pixel", "line", "pixel", "line"]
    res = on.run(_manifest(labels), extractor_g.MockExtractor(["pixel"]))
    assert res["n_mispairs"] == 30
    assert res["verdict"] == "UNDEFINED"
    assert res["null_pass_rate"] > res["threshold"]


def test_undecided_rows_are_excluded_not_guessed():
    """표가 갈린 자산은 값이 없다 — 없는 값을 있는 척하지 않는다."""
    labels = CHOICES[:5]
    answers = []
    for i, lab in enumerate(labels):
        answers += ([CHOICES[0], CHOICES[1], CHOICES[2]] if i == 0
                    else [lab, lab, lab])
    res = on.run(_manifest(labels), extractor_g.MockExtractor(answers))
    assert res["n_undecided"] == 1
    assert res["n_decided"] == 4
    assert res["n_mispairs"] == 12             # 4×3
    assert res["verdict"] == "UNDEFINED"       # 12 < 20


def test_mock_run_cannot_register(tmp_path):
    labels = CHOICES[:5]
    res = on.run(_manifest(labels), _truthful(labels))
    assert res["mock"] is True
    with pytest.raises(PermissionError):
        on.register(res, "사장님", str(tmp_path / "controls.json"))


def test_non_pass_cannot_register(tmp_path):
    res = {"mock": False, "verdict": "UNDEFINED", "why": "표본 부족",
           "field": "observed.art_style"}
    with pytest.raises(PermissionError):
        on.register(res, "사장님", str(tmp_path / "controls.json"))


def test_register_writes_full_provenance(tmp_path):
    labels = CHOICES[:5]
    res = on.run(_manifest(labels), _truthful(labels))
    res["mock"] = False                        # 실호출이었다고 치고 절차만 시험
    res["extractor"] = "anthropic"
    path = str(tmp_path / "controls.json")
    on.register(res, "사장님", path)
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)
    rec = doc["fields"]["observed.art_style"]
    assert rec["null_control_passed"] is True
    assert rec["registered_by"] == "사장님"
    assert rec["chance_floor"] == 0.0 and rec["n_mispairs"] == 20
    assert rec["extractor_version"] == extractor_g.EXTRACTOR_VERSION


def test_registered_field_opens_the_judge_gate(tmp_path):
    """등록 전에는 판정 불가, 등록 뒤에는 통과 — 게이트가 실제로 붙어 있나."""
    from tools import judge_bench as jb
    assert jb.observed_gate("observed.art_style", {}) is not None
    labels = CHOICES[:5]
    res = on.run(_manifest(labels), _truthful(labels))
    res["mock"] = False
    path = str(tmp_path / "controls.json")
    doc = on.register(res, "사장님", path)
    assert jb.observed_gate("observed.art_style", doc["fields"]) is None


def test_threshold_comes_from_registry_not_cli(tmp_path):
    path = str(tmp_path / "controls.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "threshold": 0.05, "fields": {}}, f)
    assert on._threshold(path) == 0.05


def test_manifest_rejects_unknown_field_and_missing_labels(tmp_path):
    bad = tmp_path / "m.json"
    bad.write_text(json.dumps({"field": "없는필드", "assets": []}),
                   encoding="utf-8")
    with pytest.raises(KeyError):
        on.load_manifest(str(bad))
    bad.write_text(json.dumps(
        {"field": "art_style",
         "assets": [{"id": "a"}, {"id": "b"}]}), encoding="utf-8")
    with pytest.raises(ValueError):
        on.load_manifest(str(bad))


def test_chance_floor_math():
    assert on.chance_floor(["a", "b", "c"]) == 0.0
    assert on.chance_floor(["a", "a"]) == 1.0
    # a,a,b → 6쌍 중 (a,a) 2쌍이 같다
    assert on.chance_floor(["a", "a", "b"]) == pytest.approx(2 / 6)
