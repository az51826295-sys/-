"""구현 B — 아이콘 공개 스펙을 **YAML만 보고** 집행하는 두 번째 판정기.

사전 등록: docs/dual-implementation-v0-design.md.

규율(§2):
- `icon_lane`·`icon_judge`를 **부르지 않는다.** 파서도 자체 구현이다. 같은
  파서를 공유하면 파서 버그가 두 구현에서 똑같이 틀린다.
- 스펙의 `public` 가지를 **데이터로 순회**한다. 아는 열쇠만 판정하고,
  **모르는 열쇠는 통과가 아니라 `undefined`** 다. 스펙이 늘었는데 B가 조용히
  넘어가면 대조가 죽는다.
- 3값(judge-bench-v1.2 규율 4): 못 재는 것은 fail이 아니라 undefined.

이 파일은 판정만 한다. 대조·스위프는 tools/dual_check.py에 있다.
"""
from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET

NUM = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")
CMD = re.compile(r"([MmLlHhVvCcSsQqTtAaZz])")
SHAPES = ("path", "circle", "rect", "line", "polyline", "polygon")

# 명령별 인수 개수 — SVG 1.1 경로 문법. 스펙이 아니라 표준에서 온다.
ARGC = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2,
        "A": 7, "Z": 0}


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _nums(text: str) -> list:
    return [float(m.group()) for m in NUM.finditer(text or "")]


def parse_path(d: str) -> list:
    """d 문자열 → [(명령, [인수...]), ...]. 묵시 반복도 한 명령으로 센다."""
    out = []
    parts = [p for p in CMD.split(d or "") if p and p.strip()]
    i = 0
    while i < len(parts):
        cmd = parts[i]
        if cmd not in "MmLlHhVvCcSsQqTtAaZz":
            i += 1
            continue
        args = _nums(parts[i + 1]) if i + 1 < len(parts) else []
        n = ARGC[cmd.upper()]
        if n == 0:
            out.append((cmd, []))
        elif not args:
            out.append((cmd, []))
        else:
            for k in range(0, len(args) - n + 1, n):
                out.append((cmd, args[k:k + n]))
                if cmd == "M":          # 묵시 반복은 L
                    cmd = "L"
                elif cmd == "m":
                    cmd = "l"
        i += 2 if (i + 1 < len(parts) and parts[i + 1] not in
                   "MmLlHhVvCcSsQqTtAaZz") else 1
    return out


def path_points(d: str) -> list:
    """경로가 지나는 점(끝점 + 제어점). 원호의 불룩함은 포함하지 않는다 —
    A도 같은 근사를 쓰므로 이 축의 불일치는 이 대조로 못 잡는다(설계 §2 한계)."""
    pts, cx, cy, sx, sy = [], 0.0, 0.0, 0.0, 0.0
    for cmd, args in parse_path(d):
        up = cmd.upper()
        rel = cmd.islower()
        if up == "Z":
            cx, cy = sx, sy
            continue
        if not args:
            continue
        if up == "H":
            cx = cx + args[0] if rel else args[0]
        elif up == "V":
            cy = cy + args[0] if rel else args[0]
        else:
            coords = list(args[:6]) if up in ("C", "S", "Q", "T", "M", "L") \
                else list(args[5:7])          # A는 끝점 둘만
            base_x, base_y = (cx, cy) if rel else (0.0, 0.0)
            for k in range(0, len(coords) - 1, 2):
                px, py = coords[k] + base_x, coords[k + 1] + base_y
                pts.append((px, py))
            if coords:
                cx, cy = pts[-1]
            if up == "M":
                sx, sy = cx, cy
        pts.append((cx, cy))
    return pts


def _element_points(tag: str, a: dict) -> list:
    if tag == "path":
        return path_points(a.get("d", ""))
    if tag == "circle":
        cx, cy, r = (float(a.get(k, 0) or 0) for k in ("cx", "cy", "r"))
        return [(cx - r, cy), (cx + r, cy), (cx, cy - r), (cx, cy + r)]
    if tag == "rect":
        x, y, w, h = (float(a.get(k, 0) or 0)
                      for k in ("x", "y", "width", "height"))
        return [(x, y), (x + w, y + h)]
    if tag == "line":
        x1, y1, x2, y2 = (float(a.get(k, 0) or 0)
                          for k in ("x1", "y1", "x2", "y2"))
        return [(x1, y1), (x2, y2)]
    if tag in ("polyline", "polygon"):
        n = _nums(a.get("points", ""))
        return list(zip(n[0::2], n[1::2]))
    return []


def _coords(tag: str, a: dict) -> list:
    """격자 검사용 좌표 — 점뿐 아니라 반지름·크기도 격자에 놓여야 한다."""
    out = [v for p in _element_points(tag, a) for v in p]
    if tag == "circle":
        out.append(float(a.get("r", 0) or 0))
    if tag == "rect":
        out += [float(a.get("width", 0) or 0), float(a.get("height", 0) or 0)]
    return out


def _scan(svg: str) -> dict:
    """SVG 한 장을 읽어 판정에 필요한 값만 모은다. 판정은 하지 않는다."""
    root = ET.fromstring(svg)
    info = {"view_box": (root.attrib.get("viewBox") or "").strip(),
            "tags": [], "shapes": 0, "paths": 0, "commands": 0,
            "coords": [], "points": [], "stroke_widths": set(),
            "linecaps": set(), "linejoins": set(), "fills": set(),
            "strokes": set(), "other_color_attrs": [],
            "bytes": len(svg.encode("utf-8"))}
    for el in root.iter():
        tag = _local(el.tag)
        a = {_local(k): v for k, v in el.attrib.items()}
        if tag != "svg":
            info["tags"].append(tag)
        if tag in SHAPES:
            info["shapes"] += 1
            info["points"] += _element_points(tag, a)
            info["coords"] += _coords(tag, a)
            if tag == "path":
                info["paths"] += 1
                info["commands"] += len(parse_path(a.get("d", "")))
        if "stroke-width" in a:
            info["stroke_widths"].add(float(a["stroke-width"]))
        if "stroke-linecap" in a:
            info["linecaps"].add(a["stroke-linecap"])
        if "stroke-linejoin" in a:
            info["linejoins"].add(a["stroke-linejoin"])
        if "fill" in a:
            info["fills"].add(a["fill"])
        if "stroke" in a:
            info["strokes"].add(a["stroke"])
        for k, v in a.items():
            if k in ("stop-color", "flood-color", "lighting-color", "color"):
                info["other_color_attrs"].append(v)
        if "style" in a:
            info["other_color_attrs"].append(a["style"])
    return info


# --------------------------------------------------------------- 규칙 표
# 열쇠는 YAML의 경로다. 값은 (스펙값, scan) → (ok, got, want).
# `None`을 돌려주면 undefined다.

def _r_viewbox(want, s):
    return (s["view_box"] == str(want), s["view_box"], want)


def _r_grid_snap(want, s):
    step = float(want)
    bad = [c for c in s["coords"]
           if abs(c / step - round(c / step)) > 1e-9]
    return (not bad, sorted(set(bad))[:5], f"multiple of {step}")


def _r_stroke_width(want, s):
    got = sorted(s["stroke_widths"])
    return (got == [float(want)], got, float(want))


def _r_linecap(want, s):
    got = sorted(s["linecaps"])
    return (got == [str(want)], got, str(want))


def _r_linejoin(want, s):
    got = sorted(s["linejoins"])
    return (got == [str(want)], got, str(want))


def _r_fill(want, s):
    got = sorted(s["fills"])
    return (all(g == str(want) for g in got), got, str(want))


def _r_palette(want, s):
    allowed = {str(w) for w in want}
    got = sorted(s["strokes"])
    ok = all(g in allowed for g in got) and not s["other_color_attrs"]
    return (ok, got + s["other_color_attrs"], sorted(allowed))


def _r_padding_min(want, s):
    if not s["points"]:
        return (None, None, want)
    vb = _nums(s["view_box"])
    if len(vb) != 4:
        return (None, "viewBox 없음", want)
    x0, y0, w, h = vb
    pad = min([p[0] - x0 for p in s["points"]]
              + [p[1] - y0 for p in s["points"]]
              + [x0 + w - p[0] for p in s["points"]]
              + [y0 + h - p[1] for p in s["points"]])
    return (pad >= float(want) - 1e-9, pad, float(want))


def _r_path_max_count(want, s):
    return (s["paths"] <= int(want), s["paths"], int(want))


def _r_path_max_cmds(want, s):
    return (s["commands"] <= int(want), s["commands"], int(want))


def _r_shape_max_count(want, s):
    return (s["shapes"] <= int(want), s["shapes"], int(want))


def _r_allowed(want, s):
    allowed = {str(w) for w in want}
    bad = sorted({t for t in s["tags"] if t not in allowed})
    return (not bad, bad, sorted(allowed))


def _r_forbidden(want, s):
    bad = sorted({t for t in s["tags"] if t in {str(w) for w in want}})
    return (not bad, bad, sorted(str(w) for w in want))


def _r_max_bytes(want, s):
    return (s["bytes"] <= int(want), s["bytes"], int(want))


RULES = {
    "viewBox": _r_viewbox,
    "grid.snap": _r_grid_snap,
    "stroke.width": _r_stroke_width,
    "stroke.linecap": _r_linecap,
    "stroke.linejoin": _r_linejoin,
    "fill": _r_fill,
    "palette": _r_palette,
    "padding.min": _r_padding_min,
    "path.max_count": _r_path_max_count,
    "path.max_total_commands": _r_path_max_cmds,
    "shape.max_count": _r_shape_max_count,
    "allowed_elements": _r_allowed,
    "forbidden_elements": _r_forbidden,
    "size.max_bytes": _r_max_bytes,
}


def _flatten(node, prefix="") -> list:
    """public 가지를 (경로, 값) 목록으로. 잎이 목록이면 그 자체가 값이다."""
    out = []
    if isinstance(node, dict):
        for k, v in node.items():
            out += _flatten(v, f"{prefix}.{k}" if prefix else str(k))
    else:
        out.append((prefix, node))
    return out


def judge(svg: str, public: dict) -> dict:
    """공개 스펙으로 SVG 한 장을 판정한다 → {verdict, rows}."""
    try:
        scan = _scan(svg)
    except ET.ParseError as exc:
        return {"verdict": "FAIL",
                "rows": [{"rule": "parse", "ok": False, "got": str(exc),
                          "want": "well-formed XML"}]}

    rows = []
    for path, want in _flatten(public):
        fn = RULES.get(path)
        if fn is None:
            # 모르는 열쇠를 조용히 통과시키지 않는다 (설계 §2).
            rows.append({"rule": path, "ok": None, "got": "구현 B가 모르는 제약",
                         "want": want})
            continue
        ok, got, w = fn(want, scan)
        if isinstance(got, set):
            got = sorted(got)
        if isinstance(got, float) and math.isnan(got):
            ok, got = None, "nan"
        rows.append({"rule": path, "ok": ok, "got": got, "want": w})

    if any(r["ok"] is None for r in rows):
        verdict = "UNDEFINED"
    elif all(r["ok"] for r in rows):
        verdict = "PASS"
    else:
        verdict = "FAIL"
    return {"verdict": verdict, "rows": rows}
