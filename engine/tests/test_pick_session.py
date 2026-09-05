"""선별 세션 테스트 — 사람의 선택을 기록하는 규율. 지출 0.

지키는 것:
1. **보여준 것 전부**를 남긴다. 안 고른 것이 반례가 되려면 기록에 있어야 한다.
2. 보여주지 않은 번호는 고를 수 없다(사후 표집 금지).
3. 번호는 파일 이름 순서로 고정된다 — 사람이 본 번호와 기록이 같아야 한다.
4. 기존 기록을 덮어쓰지 않는다.
"""
from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools import icon_judge as ij                       # noqa: E402
from tools import pick_session as ps                     # noqa: E402

HEAD = ('<svg viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" '
        'fill="none" stroke-linecap="round" stroke-linejoin="round">')


def pool(tmp_path, groups):
    """groups = {개념: [d, ...]} → <root>/candidates/<개념>/cNN.svg"""
    for concept, ds in groups.items():
        gdir = tmp_path / "candidates" / concept
        gdir.mkdir(parents=True)
        for k, d in enumerate(ds, 1):
            (gdir / f"c{k:02d}.svg").write_text(
                HEAD + f'<path d="{d}"/></svg>', encoding="utf-8")
    return str(tmp_path)


def test_numbers_follow_file_order(tmp_path):
    root = pool(tmp_path, {"01_save": ["M 4 4 L 8 8", "M 4 4 L 12 12",
                                       "M 4 4 L 16 16"]})
    groups = ps.load_pool(root)
    assert [it["no"] for it in groups[0]["items"]] == [1, 2, 3]
    assert groups[0]["items"][1]["path"].endswith("c02.svg")


def test_everything_shown_is_recorded_not_just_the_pick(tmp_path):
    root = pool(tmp_path, {"01_save": ["M 4 4 L 8 8", "M 4 4 L 12 12",
                                       "M 4 4 L 16 16"]})
    s = ps.record_picks(ps.load_pool(root), {"01_save": 2}, "사장님", "t")
    assert s["shown_total"] == 3
    assert len(s["picked"]) == 1 and len(s["rejected"]) == 2
    assert [r["picked"] for r in s["groups"][0]["shown"]] == [False, True,
                                                             False]


def test_a_number_that_was_not_shown_cannot_be_picked(tmp_path):
    root = pool(tmp_path, {"01_save": ["M 4 4 L 8 8"]})
    with pytest.raises(ValueError, match="보여주지 않은"):
        ps.record_picks(ps.load_pool(root), {"01_save": 9}, "사장님", "t")


def test_a_concept_can_be_left_undecided(tmp_path):
    root = pool(tmp_path, {"01_save": ["M 4 4 L 8 8"],
                           "02_map": ["M 4 4 L 12 12"]})
    s = ps.record_picks(ps.load_pool(root), {"01_save": 1}, "사장님", "t")
    assert s["undecided_groups"] == ["02_map"]
    # 아무도 고르지 않은 자리는 **거절이 아니라 미판정**이다.
    # 참고용 그룹의 후보를 반례로 세면 기록이 거짓말이 된다.
    assert s["rejected"] == []
    assert len(s["undecided_items"]) == 1

def test_record_keeps_provenance(tmp_path):
    root = pool(tmp_path, {"01_save": ["M 4 4 L 8 8"]})
    s = ps.record_picks(ps.load_pool(root), {"01_save": 1}, "사장님", "sess",
                        note="첫 세션")
    assert s["by"] == "사장님" and s["note"] == "첫 세션" and s["ts"]
    assert s["groups"][0]["shown"][0]["sha1"]


def test_sheet_shows_the_machine_verdict_and_the_numbers(tmp_path):
    root = pool(tmp_path, {"01_save": ["M 4 4 L 20 4 L 20 20 L 4 20 Z"]})
    html = ps.build_sheet(ps.load_pool(root), "t", ij.load_spec())
    assert "01_save #1" in html and "PASS" in html
    assert "사장님이 고르십니다" in html


def test_multi_pick_is_allowed_where_the_question_allows_it(tmp_path):
    """타일처럼 '골라 담는' 자리는 여러 개 고를 수 있다."""
    root = pool(tmp_path, {"01_tiles": ["M 4 4 L 8 8", "M 4 4 L 12 12",
                                        "M 4 4 L 16 16"]})
    s = ps.record_picks(ps.load_pool(root), {"01_tiles": [1, 3]}, "사장님", "t")
    assert len(s["picked"]) == 2 and len(s["rejected"]) == 1
    assert s["groups"][0]["picked_nos"] == [1, 3]
    assert s["groups"][0]["picked_no"] is None      # 하나가 아니면 top-1 불가


def test_picking_everything_leaves_no_counterexample(tmp_path):
    """전부 고르면 반례가 0이다 — 기록은 되지만 심판 재료로는 못 쓴다."""
    root = pool(tmp_path, {"01_tiles": ["M 4 4 L 8 8", "M 4 4 L 12 12"]})
    s = ps.record_picks(ps.load_pool(root), {"01_tiles": [1, 2]}, "사장님", "t")
    assert len(s["picked"]) == 2 and s["rejected"] == []


def test_pool_takes_images_too(tmp_path):
    """풍경(PNG)도 같은 절차를 탄다 — 매체가 바뀌어도 고르는 방식은 하나다."""
    from PIL import Image
    gdir = tmp_path / "candidates" / "01_village"
    gdir.mkdir(parents=True)
    for k in (1, 2):
        Image.new("RGBA", (64, 36), (10 * k, 20, 30, 255)).save(
            gdir / f"c{k:02d}.png")
    groups = ps.load_pool(str(tmp_path))
    assert [it["kind"] for it in groups[0]["items"]] == ["png", "png"]
    html = ps.build_sheet(groups, "bg", ij.load_spec())
    assert "data:image/png;base64," in html
    assert "image-rendering: pixelated" in html    # 도트를 뭉개지 않는다
    s = ps.record_picks(groups, {"01_village": 2}, "사장님", "bg")
    assert len(s["picked"]) == 1 and len(s["rejected"]) == 1


def test_cli_does_not_overwrite_an_existing_record(tmp_path, capsys):
    root = pool(tmp_path, {"01_save": ["M 4 4 L 8 8"]})
    out = tmp_path / "rec.json"
    assert ps.main(["record", "--root", root, "--pick", "01_save=1",
                    "--out", str(out)]) == 0
    before = json.loads(out.read_text(encoding="utf-8"))
    assert ps.main(["record", "--root", root, "--pick", "01_save=1",
                    "--out", str(out)]) == 2
    assert json.loads(out.read_text(encoding="utf-8")) == before
    assert "덮어쓰지 않는다" in capsys.readouterr().out
