"""후처리 스냅 (docs/snap-fix-v0-design.md §2).

격자·끝모양·굵기·채움·팔레트를 **우리가 고친다**. 여백·개수·바이트·금지 요소는
고치지 않는다 — 그건 표기가 아니라 구조이고, 고치면 다른 그림이 된다.

이 파일은 고치기만 한다. 판정은 tools/icon_judge.py가, 실험은
tools/snap_experiment.py가 한다.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET

from genesis import icon_lane

SNAP = 0.5
VIEWBOX = "0 0 24 24"
ROOT_FORCE = {"stroke-width": "1.5", "stroke-linecap": "round",
              "stroke-linejoin": "round", "fill": "none",
              "stroke": "currentColor"}
# 요소에 붙어 루트 값을 덮는 속성들. 스냅은 이것을 **걷어낸다**.
DROP_ON_ELEMENTS = tuple(ROOT_FORCE)

NUM = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")


def _snap(v: float) -> float:
    return round(round(float(v) / SNAP) * SNAP, 6)


def _fmt(v: float) -> str:
    return f"{_snap(v):g}"


def _snap_path(d: str) -> str:
    """path 데이터의 좌표를 격자에 올린다. 원호의 반지름·플래그는 건드리지 않는다."""
    out = []
    for cmd, args in icon_lane.parse_path(d or ""):
        up = cmd.upper()
        if up == "Z":
            out.append(cmd)
            continue
        vals = list(args)
        if up == "A" and len(vals) >= 7:
            # rx ry φ large-arc sweep x y — 반지름·각도·플래그는 그대로,
            # 끝점만 격자에 올린다(플래그를 반올림하면 그림이 뒤집힌다).
            vals = [vals[0], vals[1], vals[2], vals[3], vals[4],
                    _snap(vals[5]), _snap(vals[6])]
        else:
            vals = [_snap(v) for v in vals]
        out.append(cmd + " " + " ".join(f"{v:g}" for v in vals))
    return " ".join(out)


def snap(svg: str) -> dict:
    """스냅본을 만든다. 못 하면 사유와 함께 None."""
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as exc:
        return {"svg": None, "why": f"원본을 못 읽는다: {exc}", "changed": []}
    if (root.attrib.get("viewBox") or "").strip() != VIEWBOX:
        return {"svg": None, "why": "viewBox가 24 격자가 아니다 — 크기 변환은 "
                                    "스냅이 아니다", "changed": []}
    changed = []
    for k, v in ROOT_FORCE.items():
        if root.attrib.get(k) != v:
            changed.append(f"root:{k}")
        root.set(k, v)
    for el in root.iter():
        tag = icon_lane._local(el.tag)
        if el is root:
            continue
        for k in DROP_ON_ELEMENTS:
            if k in el.attrib:
                del el.attrib[k]
                changed.append(f"{tag}:{k}")
        if tag == "path" and "d" in el.attrib:
            new = _snap_path(el.attrib["d"])
            if new != el.attrib["d"]:
                changed.append("path:d")
            el.set("d", new)
        elif tag == "circle":
            for k in ("cx", "cy", "r"):
                if k in el.attrib:
                    el.set(k, _fmt(el.attrib[k]))
        elif tag == "rect":
            for k in ("x", "y", "width", "height"):
                if k in el.attrib:
                    el.set(k, _fmt(el.attrib[k]))
        elif tag == "line":
            for k in ("x1", "y1", "x2", "y2"):
                if k in el.attrib:
                    el.set(k, _fmt(el.attrib[k]))
        elif tag in ("polyline", "polygon") and "points" in el.attrib:
            nums = [float(m.group()) for m in NUM.finditer(el.attrib["points"])]
            el.set("points", " ".join(
                f"{_fmt(nums[i])},{_fmt(nums[i + 1])}"
                for i in range(0, len(nums) - 1, 2)))
    return {"svg": ET.tostring(root, encoding="unicode"),
            "why": None, "changed": sorted(set(changed))}
