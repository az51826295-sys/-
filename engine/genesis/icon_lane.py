"""아이콘 레인 Validator J — SVG를 재는 순수 함수. 설계: docs/icon-lane-design.md

설계 문서의 결정 그대로: **생성은 외부 LLM(교체 가능), 심판은 우리 계산.**
이 모듈에는 모델 호출이 없다. SVG 문자열을 받아 스펙 항목을 **직접 잰다**.

  measure(svg)              SVG → 잰 사실들(measured.*)
  structure_hash(svg)       구조 서명(중복 후보 거부용, 프롬프트에 주지 않는다)
  set_consistency(list)     세트 내 획 굵기 편차

정직 조항:
- bbox는 좌표·제어점의 볼록껍질로 잡는다. 곡선은 제어점 껍질 밖으로 못 나가므로
  여백(padding)은 **보수적으로(작게) 잡힌다** — 통과를 부풀리지 않는 방향.
- 획 두께로 커지는 시각적 bbox는 세지 않는다(기하 여백만).
- hidden 항목 중 contrast·roundtrip은 여기서 재지 않는다: currentColor는 문서
  바깥 색 문맥이 있어야 대비를 계산할 수 있고, 왕복오차는 래스터라이저가 필요하다.
  **못 재는 것을 잰 척하지 않는다** — 어댑터 결합 검사에 no_tool로 남는다.
"""
from __future__ import annotations

import hashlib
import re
import xml.etree.ElementTree as ET

SVG_NS = "http://www.w3.org/2000/svg"

# 명령 → 인자 개수, 그리고 그 인자들 중 좌표인 것의 (x,y) 인덱스 쌍
_CMD = {
    "M": (2, [(0, 1)]), "L": (2, [(0, 1)]), "T": (2, [(0, 1)]),
    "H": (1, []), "V": (1, []),
    "C": (6, [(0, 1), (2, 3), (4, 5)]),
    "S": (4, [(0, 1), (2, 3)]),
    "Q": (4, [(0, 1), (2, 3)]),
    "A": (7, [(5, 6)]),          # rx ry rot large sweep x y — 좌표는 끝점뿐
    "Z": (0, []),
}
_SHAPE_TAGS = ("path", "circle", "rect", "line", "polyline", "polygon")

_NUM = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")
_TOKEN = re.compile(r"([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d*\.\d+|\d+\.?)"
                    r"(?:[eE][-+]?\d+)?)")


def _local(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def _floats(text: str) -> list:
    return [float(m.group()) for m in _NUM.finditer(text or "")]


def parse_path(d: str) -> list:
    """path 데이터를 (명령, 인자들) 목록으로 쪼갠다. 반복 인자군도 편다."""
    toks, out = [], []
    for m in _TOKEN.finditer(d or ""):
        toks.append(m.group(1) or float(m.group(2)))
    i, cmd = 0, None
    while i < len(toks):
        if isinstance(toks[i], str):
            cmd = toks[i]
            i += 1
            if cmd.upper() == "Z":
                out.append((cmd, []))
                continue
        if cmd is None:
            break                       # 명령 없이 숫자로 시작 - 망가진 d
        n = _CMD[cmd.upper()][0]
        args = toks[i:i + n]
        if len(args) < n or any(isinstance(a, str) for a in args):
            break                       # 인자가 모자라다 - 여기서 멈춘다
        out.append((cmd, [float(a) for a in args]))
        i += n
        if cmd.upper() == "M":          # M 뒤의 여분 좌표쌍은 L로 이어진다
            cmd = "L" if cmd.isupper() else "l"
    return out


def _path_points(d: str) -> tuple:
    """(모든 좌표 수, 절대 좌표점 목록). 좌표 수는 격자 검사용,
    점 목록은 bbox용(제어점 포함 = 보수적 껍질)."""
    coords, points = [], []
    cx = cy = 0.0
    for cmd, args in parse_path(d):
        up, rel = cmd.upper(), cmd.islower()
        if up == "Z":
            continue
        if up == "H":
            coords.append(args[0])
            cx = cx + args[0] if rel else args[0]
            points.append((cx, cy))
            continue
        if up == "V":
            coords.append(args[0])
            cy = cy + args[0] if rel else args[0]
            points.append((cx, cy))
            continue
        pairs = _CMD[up][1]
        for xi, yi in pairs:
            coords += [args[xi], args[yi]]
            px = cx + args[xi] if rel else args[xi]
            py = cy + args[yi] if rel else args[yi]
            points.append((px, py))
        if pairs:                        # 마지막 좌표쌍이 새 현재점
            xi, yi = pairs[-1]
            cx = cx + args[xi] if rel else args[xi]
            cy = cy + args[yi] if rel else args[yi]
    return coords, points


def _is_off_grid(v: float, snap: float) -> bool:
    q = v / snap
    return abs(q - round(q)) > 1e-9


def measure(svg: str, snap: float = 0.5) -> dict:
    """SVG 문자열 → 잰 사실들. 파싱 실패는 숨기지 않고 error로 돌려준다."""
    raw = svg or ""
    out = {
        "bytes": len(raw.encode("utf-8")),
        "elements": [], "path_count": 0, "shape_count": 0,
        "command_count": 0,
        "stroke_widths": [], "fills": [], "colors": [],
        "off_grid": [], "viewbox": "", "min_padding": None,
        "linecaps": [], "linejoins": [], "error": None,
    }
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        out["error"] = f"SVG 파싱 실패: {exc}"
        return out

    elements, xs, ys = [], [], []
    stroke_w, fills, colors, caps, joins, off = [], [], [], [], [], []

    def note_color(val: str) -> None:
        v = (val or "").strip()
        if v and v.lower() not in ("none", "currentcolor"):
            colors.append(v)

    def note_coords(vals: list) -> None:
        for v in vals:
            if _is_off_grid(v, snap):
                off.append(v)

    for el in root.iter():
        tag = _local(el.tag)
        elements.append(tag)
        if tag in _SHAPE_TAGS:              # 도형 총량(G3) - path만 세지 않는다
            out["shape_count"] += 1
        a = el.attrib
        if "stroke-width" in a:
            stroke_w += _floats(a["stroke-width"])
        if "fill" in a:
            fills.append(a["fill"].strip())
            note_color(a["fill"])
        if "stroke" in a:
            note_color(a["stroke"])
        if "stroke-linecap" in a:
            caps.append(a["stroke-linecap"].strip())
        if "stroke-linejoin" in a:
            joins.append(a["stroke-linejoin"].strip())
        if tag == "svg":
            out["viewbox"] = a.get("viewBox", "").strip()
        elif tag == "path":
            out["path_count"] += 1
            cmds = parse_path(a.get("d", ""))
            out["command_count"] += len(cmds)
            coords, pts = _path_points(a.get("d", ""))
            note_coords(coords)
            xs += [p[0] for p in pts]
            ys += [p[1] for p in pts]
        elif tag == "circle":
            c = [float(a.get(k, 0)) for k in ("cx", "cy", "r")]
            note_coords(c)
            xs += [c[0] - c[2], c[0] + c[2]]
            ys += [c[1] - c[2], c[1] + c[2]]
        elif tag == "rect":
            r = [float(a.get(k, 0)) for k in ("x", "y", "width", "height")]
            note_coords(r)
            xs += [r[0], r[0] + r[2]]
            ys += [r[1], r[1] + r[3]]
        elif tag == "line":
            ln = [float(a.get(k, 0)) for k in ("x1", "y1", "x2", "y2")]
            note_coords(ln)
            xs += [ln[0], ln[2]]
            ys += [ln[1], ln[3]]
        elif tag == "polyline" or tag == "polygon":
            nums = _floats(a.get("points", ""))
            note_coords(nums)
            xs += nums[0::2]
            ys += nums[1::2]

    out["elements"] = sorted(set(elements))
    out["stroke_widths"] = sorted(set(stroke_w))
    out["fills"] = sorted(set(fills))
    out["colors"] = sorted(set(colors))
    out["linecaps"] = sorted(set(caps))
    out["linejoins"] = sorted(set(joins))
    out["off_grid"] = off

    vb = _floats(out["viewbox"])
    if xs and ys and len(vb) == 4:
        out["min_padding"] = round(min(min(xs) - vb[0], min(ys) - vb[1],
                                       (vb[0] + vb[2]) - max(xs),
                                       (vb[1] + vb[3]) - max(ys)), 6)
    return out


def structure_hash(svg: str, snap: float = 0.5) -> str:
    """구조 서명 — 요소 시퀀스 + 정규화 좌표. 회전·반전은 다른 구조로 본다.

    설계 §6: 이 값을 프롬프트에 주지 않는다(모방을 유도한다). 필터로만 쓴다.
    """
    try:
        root = ET.fromstring(svg or "")
    except ET.ParseError:
        return "unparseable"
    parts = []
    for el in root.iter():
        tag = _local(el.tag)
        if tag == "path":
            seq = "".join(c.upper() for c, _ in parse_path(el.attrib.get("d", "")))
            coords, _pts = _path_points(el.attrib.get("d", ""))
            parts.append(tag + ":" + seq + ":" +
                         ",".join(f"{round(v / snap):d}" for v in coords))
        else:
            nums = [f"{round(v / snap):d}"
                    for k, v in sorted(el.attrib.items())
                    for v in _floats(v) if k != "viewBox"]
            parts.append(tag + ":" + ",".join(nums))
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]


def set_consistency(svgs: list) -> dict:
    """세트 내 획 굵기가 하나로 통일돼 있나 (hidden.set_consistency의 계산 가능분).

    광학 무게(optical_weight)는 렌더러가 필요해 여기서 재지 않는다 — 미측정.
    """
    widths = sorted({w for s in svgs for w in measure(s)["stroke_widths"]})
    # 광학 무게는 렌더러가 필요해 여기서 재지 않는다. **"미측정"이라고 단정하지도
    # 않는다** — 부르는 쪽(icon_judge)이 래스터가 있으면 채워 넣는다. 여기서
    # 문자열로 못 박아두면 실제로 잰 회차에도 "미측정"이라고 말하게 된다.
    return {"stroke_widths": widths, "variance_zero": len(widths) <= 1,
            "optical_weight": None,
            "optical_weight_note": "이 파서에는 렌더러가 없다 - icon_judge가 채운다"}


def duplicates(svgs: list) -> list:
    """세트 안에서 구조 서명이 겹치는 후보 색인쌍."""
    seen, dup = {}, []
    for i, s in enumerate(svgs):
        h = structure_hash(s)
        if h in seen:
            dup.append((seen[h], i))
        else:
            seen[h] = i
    return dup
