"""취향 시험대 테스트 — 사전 등록(docs/taste-judge-v0-design.md)의 집행. 지출 0.

지키는 것:
1. 특징 목록은 **동결**이다(선택을 본 뒤 늘리면 과적합).
2. 분할은 개념 단위다 — 같은 개념이 훈련·시험에 섞이면 새는 것이다.
3. 동점 top-1은 **실패**로 센다(후하게 세지 않는다).
4. 관문 넷 중 하나라도 미달이면 승격 없음.
5. 순열 검정은 씨앗이 고정돼 재현된다.
"""
from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from genesis import taste_features as tf                 # noqa: E402
from tools import taste_bench as tb                      # noqa: E402

HEAD = ('<svg viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" '
        'fill="none" stroke-linecap="round" stroke-linejoin="round">')


def icon(d: str) -> str:
    return HEAD + f'<path d="{d}"/></svg>'


def session(tmp_path, groups) -> str:
    """groups = [(개념, [(d, picked), ...]), ...] → 선별 기록 파일 경로."""
    rows = []
    for gi, (concept, items) in enumerate(groups, 1):
        shown = []
        picked_no = None
        for k, (d, picked) in enumerate(items, 1):
            p = tmp_path / f"{gi}_{k}.svg"
            p.write_text(icon(d), encoding="utf-8")
            shown.append({"no": k, "path": p.name, "sha1": "x",
                          "structure_hash": "y", "picked": picked})
            if picked:
                picked_no = k
        rows.append({"group": concept, "shown": shown, "picked_no": picked_no})
    path = tmp_path / "picks.json"
    path.write_text(json.dumps({"id": "t", "groups": rows},
                               ensure_ascii=False), encoding="utf-8")
    return str(path)


# ------------------------------------------------------------- 특징

def test_feature_list_is_frozen():
    assert tf.FEATURES == (
        "path_count", "shape_count", "command_count", "bytes", "min_padding",
        "bbox_fill_ratio", "curve_ratio", "symmetry_x", "distinct_elements",
        "ink_length")


def test_features_are_measured_not_invented():
    f = tf.measure(icon("M 4 4 L 20 4 L 20 20 L 4 20 Z"))
    assert f["path_count"] == 1 and f["shape_count"] == 1
    assert f["command_count"] == 5 and f["curve_ratio"] == 0.0
    assert 0 < f["bbox_fill_ratio"] <= 1 and f["ink_length"] > 0


def test_broken_svg_gives_none_not_zero():
    f = tf.measure("<svg><path d=")
    assert f["bbox_fill_ratio"] is None and f["symmetry_x"] is None


def test_symmetry_sees_a_mirrored_shape():
    sym = tf.measure(icon("M 4 4 L 20 4 L 20 20 L 4 20 Z"))["symmetry_x"]
    skew = tf.measure(icon("M 4 4 L 9 4 L 9 9 L 4 9 Z"))["symmetry_x"]
    assert sym == 1.0 and skew < 1.0


# ------------------------------------------------------------- 분할·집계

def test_holdout_concept_is_never_in_training(tmp_path, monkeypatch):
    seen = []
    real_fit = tb.fit

    def spy(groups, rules=None):
        seen.append({g["concept"] for g in groups})
        return real_fit(groups, rules)

    monkeypatch.setattr(tb, "fit", spy)
    groups = tb.load_session(session(tmp_path, [
        ("a", [("M 4 4 L 20 20", True), ("M 4 4 L 8 8", False)]),
        ("b", [("M 4 4 L 20 20 L 4 20", True), ("M 4 4 L 6 6", False)]),
    ]), root=str(tmp_path))
    out = tb.loco(groups)
    for row, train in zip(out["rows"], seen):
        assert row["concept"] not in train


def test_a_tie_at_the_top_counts_as_a_miss():
    group = {"concept": "a", "items": [
        {"picked": True, "features": {"path_count": 1}},
        {"picked": False, "features": {"path_count": 1}}]}
    rule = {"feature": "path_count", "op": ">=", "threshold": 0.5}
    assert tb.top1_hit(rule, group) is False      # 동점은 적중이 아니다


def test_baseline_is_the_random_expectation():
    groups = [{"items": [1, 2, 3, 4]}, {"items": [1, 2]}]
    assert tb.baseline(groups) == round((0.25 + 0.5) / 2, 6)


# ------------------------------------------------------------- 관문

def test_small_sample_cannot_promote(tmp_path):
    res = tb.run(session(tmp_path, [
        ("a", [("M 4 4 L 20 20 L 20 4 L 4 20", True), ("M 4 4 L 8 8", False)]),
        ("b", [("M 4 4 L 20 20 L 20 4 L 4 20", True), ("M 4 4 L 8 8", False)]),
    ]), permutations=20, root=str(tmp_path))
    assert res["gates"]["sample"]["ok"] is False
    assert res["verdict"] == "no-promote"
    assert "human_gate" in res["note"]


def test_unregistered_media_is_not_measured(tmp_path):
    """PNG는 사전 등록된 특징이 없다 — 숫자를 만들지 않고 not-measured를 낸다."""
    from PIL import Image
    gdir = tmp_path / "candidates" / "01_cat"
    gdir.mkdir(parents=True)
    shown = []
    for k in (1, 2):
        p = tmp_path / f"c{k}.png"
        Image.new("RGBA", (16, 16), (10 * k, 20, 30, 255)).save(p)
        shown.append({"no": k, "path": p.name, "sha1": "x",
                      "structure_hash": "y", "picked": k == 1})
    path = tmp_path / "picks.json"
    path.write_text(json.dumps({"id": "t", "groups": [
        {"group": "01_cat", "shown": shown, "picked_no": 1,
         "picked_nos": [1]}]}, ensure_ascii=False), encoding="utf-8")
    res = tb.run(str(path), permutations=5, root=str(tmp_path))
    assert res["verdict"] == "not-measured"
    assert "SVG용뿐" in res["skipped"][0]["why"]


def test_multi_pick_group_is_excluded_but_recorded(tmp_path):
    """여러 개 고른 자리는 top-1로 못 잰다 — 빼되 뺐다고 적는다."""
    path = session(tmp_path, [
        ("a", [("M 4 4 L 20 20", True), ("M 4 4 L 8 8", True)]),
    ])
    data = json.loads(open(path, encoding="utf-8").read())
    data["groups"][0]["picked_nos"] = [1, 2]
    data["groups"][0]["picked_no"] = None
    open(path, "w", encoding="utf-8").write(json.dumps(data,
                                                       ensure_ascii=False))
    res = tb.run(path, permutations=5, root=str(tmp_path))
    assert res["verdict"] == "not-measured"
    assert res["skipped"][0]["why"].startswith("다중 선택")


def test_gates_are_the_registered_numbers():
    assert tb.GATES["min_concepts"] == 8
    assert tb.GATES["min_candidates"] == 40
    assert tb.GATES["min_accuracy"] == 0.75
    assert tb.GATES["max_p"] == 0.05


def test_permutation_is_reproducible(tmp_path):
    path = session(tmp_path, [
        ("a", [("M 4 4 L 20 20", True), ("M 4 4 L 8 8", False)]),
        ("b", [("M 4 4 L 20 20 L 4 20", True), ("M 4 4 L 6 6", False)]),
    ])
    groups = tb.load_session(path, root=str(tmp_path))
    obs = tb.loco(groups)["accuracy"]
    first = tb.permutation_p(groups, obs, 30)
    assert first == tb.permutation_p(groups, obs, 30)


def test_rule_shape_is_a_single_feature_threshold(tmp_path):
    groups = tb.load_session(session(tmp_path, [
        ("a", [("M 4 4 L 20 20", True), ("M 4 4 L 8 8", False)]),
    ]), root=str(tmp_path))
    rule = tb.fit(groups)
    assert set(rule) == {"feature", "op", "threshold", "train_accuracy"}
    assert rule["op"] in (">=", "<=")


def test_real_session_records_a_no_promote():
    """오늘의 실제 선별(pick-v1)은 관문 미달이다 - 이 사실을 잠가 둔다."""
    path = os.path.join(tb.ROOT, "data", "picks", "pick-v1.json")
    if not os.path.isfile(path):
        pytest.skip("선별 기록이 없다")
    res = tb.run(path, permutations=20)
    assert res["verdict"] == "no-promote"
    assert res["gates"]["sample"]["concepts"] == 4
