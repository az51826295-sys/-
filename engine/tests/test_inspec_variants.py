"""인-스펙 변이 시험 — 설계: docs/inspec-metamorphic-v0-design.md.

이 통제의 값어치는 **합법성이 연산자로 증명된다**는 데 있다. 그래서 여기서
고정하는 것은 "심판이 통과시켰다"가 아니라 **연산자가 실제로 보존한다고 주장한
것을 보존하는가**다. 그게 깨지면 통제 전체가 거짓말이 된다.
"""
import glob
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from genesis import icon_lane                             # noqa: E402
from genesis import inspec_variants as iv                 # noqa: E402
from tools import icon_judge as ij                        # noqa: E402

ASSETS = sorted(glob.glob(os.path.join(ROOT, "out", "icons",
                                       "rpg-ui-v1-strict", "*.svg")))


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def test_there_are_assets_to_vary():
    assert len(ASSETS) >= 4


@pytest.mark.parametrize("path", ASSETS, ids=[os.path.basename(p)
                                              for p in ASSETS])
def test_every_made_variant_stays_on_the_grid(path):
    """격자를 깨면 그건 '합법 영역 안'이 아니다 - 통제의 전제가 무너진다."""
    for v in iv.variants(read(path)):
        if v["svg"] is None:
            continue
        m = icon_lane.measure(v["svg"], snap=iv.SNAP)
        assert m["error"] is None, (path, v["op"])
        assert m["off_grid"] == [], (v["op"], m["off_grid"])
        assert m["min_padding"] >= iv.PADDING_MIN, (v["op"], m["min_padding"])


@pytest.mark.parametrize("path", ASSETS, ids=[os.path.basename(p)
                                              for p in ASSETS])
def test_counts_that_the_design_calls_preserved_are_preserved(path):
    """설계 §2 표의 '보존이 증명되는' 칸을 실제로 지키는지."""
    svg = read(path)
    base = icon_lane.measure(svg, snap=iv.SNAP)
    for v in iv.variants(svg):
        if v["svg"] is None:
            continue
        m = icon_lane.measure(v["svg"], snap=iv.SNAP)
        assert m["stroke_widths"] == base["stroke_widths"], v["op"]
        assert m["fills"] == base["fills"], v["op"]
        assert m["colors"] == base["colors"], v["op"]
        assert m["linecaps"] == base["linecaps"], v["op"]
        assert m["linejoins"] == base["linejoins"], v["op"]
        # 표기를 바꾸는 두 연산은 path·명령 수가 바뀐다(설계 §2·§8).
        # 그림·획·색·끝모양·도형 수는 그래도 보존돼야 한다.
        if v["op"] not in ("line→path 치환", "요소→path"):
            assert m["path_count"] == base["path_count"], v["op"]
            assert m["command_count"] == base["command_count"], v["op"]
        assert m["shape_count"] == base["shape_count"], v["op"]


def test_reencoding_draws_exactly_the_same_picture():
    """가장 강한 검사: 재표기본과 원본을 **그려서** 대조한다."""
    from genesis import svg_raster as sr
    if not sr.available():
        pytest.skip("래스터 경로 미설치")
    for path in ASSETS:
        svg = read(path)
        again = iv.reencode_absolute(svg)
        if again["svg"] is None:
            continue
        diff = sr.coverage_diff(svg, again["svg"])
        assert diff is not None and diff <= 0.001, (path, diff)


def test_mirror_keeps_the_ink_and_moves_it():
    """미러는 강체 운동이라 잉크 양이 같아야 하고, 그림은 달라야 한다."""
    from genesis import svg_raster as sr
    if not sr.available():
        pytest.skip("래스터 경로 미설치")
    for path in ASSETS:
        svg = read(path)
        m = iv.mirror(svg)
        if m["svg"] is None:
            continue
        assert sr.optical_weight(m["svg"]) == pytest.approx(
            sr.optical_weight(svg), abs=0.01), path
        moved = sr.coverage_diff(svg, m["svg"])
        if moved <= 0.001:
            # 좌우 대칭인 아이콘은 미러가 **자기 자신**이다. 그건 변이가 죽은
            # 게 아니라 그림이 대칭인 것이므로, 대칭임을 직접 확인하고 넘어간다.
            # (v0.1에서 원호를 다루기 시작하자 이런 자산이 처음 들어왔다.)
            cov = sr.render_coverage(svg)
            px = len(cov)
            flipped = [list(reversed(row)) for row in cov]
            sym = sum(abs(cov[y][x] - flipped[y][x])
                      for y in range(px) for x in range(px)) / (px * px)
            assert sym <= 0.02, f"{path}: 대칭도 아닌데 그림이 안 움직였다"
        else:
            assert moved > 0.001, path


def test_skipped_variants_carry_a_reason():
    """조용히 빼지 않는다 - 못 만든 이유가 붙어야 한다(설계 §6)."""
    made = skipped = 0
    for path in ASSETS:
        for v in iv.variants(read(path)):
            if v["svg"] is None:
                skipped += 1
                assert v["why"], v["op"]
            else:
                made += 1
                assert v["why"] is None
    assert made >= 20      # 설계 §3의 최소 표본
    assert skipped > 0     # 조건을 못 채우는 조합이 실제로 있다


def test_arcs_are_handled_now_not_refused():
    """v0.1(설계 §7): 원호도 미러·회전한다. sweep 플래그가 뒤집혀야 한다.

    v0에서는 이 자산을 거절했다(그때는 처리 규칙이 없었다). 기하가 실제로
    보존되는지는 렌더러가 답한다 — tests/test_inspec_arcs.py.
    """
    arc = ('<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" '
           'stroke-linecap="round" stroke-linejoin="round" fill="none">'
           '<path d="M6 12A6 6 0 0 1 18 12"/></svg>')
    assert iv._has_arc(arc) is True
    flipped = iv.mirror(arc)["svg"]
    assert flipped is not None
    assert "0 0 0" in flipped          # sweep 1 → 0
    turned = iv.rotate90(arc)["svg"]
    assert turned is not None


def test_the_judge_accepts_every_in_spec_variant():
    """이 통제의 본문: 합법인 것을 떨어뜨리면 심판이 과보수다."""
    doc = ij.load_spec()
    failures = []
    for path in ASSETS:
        for v in iv.variants(read(path)):
            if v["svg"] is None:
                continue
            r = ij.judge_svg(v["svg"], doc)
            if r["verdict"] != "PASS":
                bad = [x["rule"] for x in r["rules"] if x["ok"] is not True]
                failures.append((os.path.basename(path), v["op"], bad))
    assert not failures, failures


def test_golden_counts_the_new_control():
    from tools import golden_bench as gb
    assert gb.THRESHOLDS["inspec"] == 1.0      # 비율이 아니라 전부다
    assert gb.N_MIN["inspec"] == 20
