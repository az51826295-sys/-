"""취향 특징 — 사람 선택을 설명해 볼 후보 지표 10개 (docs/taste-judge-v0-design.md §2).

**동결된 목록이다.** 선택을 본 뒤에 특징을 추가하면 그게 과적합이다. 여기 있는
것은 전부 SVG에서 결정적으로 재는 값이고 모델 호출은 0이다.

특징이 있다고 심판이 되는 것은 아니다 — 이 값들이 사람 선택을 실제로 가르는지는
`tools/taste_bench.py`가 leave-one-concept-out으로 시험하고, 관문을 통과할 때만
심판으로 승격된다.
"""
from __future__ import annotations

import math

from genesis import icon_lane

# 동결: 이 순서가 곧 동률일 때의 우선순위다(설계 §3).
FEATURES = ("path_count", "shape_count", "command_count", "bytes",
            "min_padding", "bbox_fill_ratio", "curve_ratio", "symmetry_x",
            "distinct_elements", "ink_length")

_SHAPES = ("path", "circle", "rect", "line", "polyline", "polygon")
_CURVE_CMDS = set("CSQTA")


def _shape_points(svg: str) -> tuple:
    """(요소별 점 목록, 요소 이름 목록, 곡선 명령 수, 전체 명령 수).

    icon_lane의 파서를 그대로 쓴다 — 같은 파일을 두 벌로 해석하지 않기 위해서다.
    """
    import xml.etree.ElementTree as ET

    try:
        root = ET.fromstring(svg or "")
    except ET.ParseError:
        return [], [], 0, 0
    groups, names, curved, total = [], [], 0, 0
    for el in root.iter():
        tag = icon_lane._local(el.tag)
        a = el.attrib
        if tag == "path":
            cmds = icon_lane.parse_path(a.get("d", ""))
            total += len(cmds)
            curved += sum(1 for c, _ in cmds if c.upper() in _CURVE_CMDS)
            _coords, pts = icon_lane._path_points(a.get("d", ""))
            groups.append(pts)
            names.append(tag)
        elif tag == "circle":
            cx, cy, r = (float(a.get(k, 0)) for k in ("cx", "cy", "r"))
            groups.append([(cx - r, cy), (cx + r, cy), (cx, cy - r),
                           (cx, cy + r)])
            names.append(tag)
        elif tag == "rect":
            x, y, w, h = (float(a.get(k, 0))
                          for k in ("x", "y", "width", "height"))
            groups.append([(x, y), (x + w, y), (x + w, y + h), (x, y + h)])
            names.append(tag)
        elif tag == "line":
            x1, y1, x2, y2 = (float(a.get(k, 0))
                              for k in ("x1", "y1", "x2", "y2"))
            groups.append([(x1, y1), (x2, y2)])
            names.append(tag)
        elif tag in ("polyline", "polygon"):
            nums = icon_lane._floats(a.get("points", ""))
            groups.append(list(zip(nums[0::2], nums[1::2])))
            names.append(tag)
        elif tag != "svg":
            names.append(tag)
    return groups, names, curved, total


def measure(svg: str) -> dict:
    """SVG → 특징 10개. 못 재는 값은 None으로 두고 지어내지 않는다."""
    base = icon_lane.measure(svg)
    out = {k: None for k in FEATURES}
    out["bytes"] = base["bytes"]
    out["path_count"] = base["path_count"]
    out["command_count"] = base["command_count"]
    out["min_padding"] = base["min_padding"]
    if base["error"]:
        return out

    groups, names, curved, total = _shape_points(svg)
    out["shape_count"] = sum(1 for n in names if n in _SHAPES)
    out["distinct_elements"] = len({n for n in names})
    out["curve_ratio"] = round(curved / total, 6) if total else 0.0

    pts = [p for g in groups for p in g]
    vb = icon_lane._floats(base["viewbox"])
    if pts and len(vb) == 4 and vb[2] and vb[3]:
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        area = (max(xs) - min(xs)) * (max(ys) - min(ys))
        out["bbox_fill_ratio"] = round(area / (vb[2] * vb[3]), 6)
        # 좌우 대칭: x를 viewBox 중심으로 뒤집어 같은 점이 있는 비율(0.5 격자 반올림)
        cx2 = 2 * (vb[0] + vb[2] / 2)
        have = {(round(x * 2) / 2, round(y * 2) / 2) for x, y in pts}
        hit = sum(1 for x, y in pts
                  if (round((cx2 - x) * 2) / 2, round(y * 2) / 2) in have)
        out["symmetry_x"] = round(hit / len(pts), 6)

    ink = 0.0
    for g in groups:
        for i in range(1, len(g)):
            ink += math.dist(g[i - 1], g[i])
    out["ink_length"] = round(ink, 4)
    return out
