"""인-스펙 변이 — **합법 영역 안에서만** 자산을 움직인다.

사전 등록: `docs/inspec-metamorphic-v0-design.md`.

`golden_bench.mutations()`가 자산을 스펙 **밖으로** 밀어내는 변이(반드시 탈락
해야 한다)라면, 여기는 그 쌍대다: **반드시 통과해야 하는** 변이.

핵심은 합법성이 **연산자에 의해 증명**된다는 것이다. 우리 심판이 "합법"이라고
말해서 합법인 게 아니라, 좌표를 0.5 배수 위에서만 옮기고 요소를 재배열할 뿐이라
합법이다. 그래서 파일이 우리 안에서 나왔어도 **순환이 아니다.**

적용 조건(`path 수 + 1 <= 6` 같은 것)은 판정이 아니라 **산수**다. 조건을 못
채우면 그 변이를 만들지 않고, 몇 건을 건너뛰었는지 남긴다.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET

from genesis import icon_lane

VIEWBOX = 24.0                 # 골든 자산의 뷰박스 한 변(정사각)
SNAP = 0.5
TRANSLATIONS = (0.5, -0.5, 1.0, -1.0)
PADDING_MIN = 2.0
MAX_BYTES = 2048
MAX_PATHS = 6
MAX_COMMANDS = 60


def _fmt(v: float) -> str:
    return f"{v:g}"


def _has_arc(svg: str) -> bool:
    """원호(A) 명령이 있으면 미러·회전은 sweep 플래그를 뒤집어야 한다 - v0에서는
    적용하지 않는다(설계 §6)."""
    for el in ET.fromstring(svg).iter():
        if icon_lane._local(el.tag) == "path":
            if any(c.upper() == "A"
                   for c, _ in icon_lane.parse_path(el.attrib.get("d", ""))):
                return True
    return False


def to_absolute(d: str) -> str | None:
    """상대 명령과 H/V를 **같은 그림의 절대 표기**로 바꾼다.

    기하는 한 점도 안 움직인다 — 표기만 바꾼다. 명령 수도 그대로다(h 하나가
    L 하나가 된다). 시작점이 격자 위면 결과도 격자 위다(델타도 격자 배수).

    이것 자체가 하나의 인-스펙 변이다("재표기"): 같은 그림, 다른 인코딩.
    심판이 인코딩을 보고 떨어뜨리면 그건 과보수다.
    """
    out = []
    cx = cy = 0.0
    start_x = start_y = 0.0
    for cmd, args in icon_lane.parse_path(d or ""):
        up, rel = cmd.upper(), cmd.islower()
        if up == "Z":
            out.append("Z")
            cx, cy = start_x, start_y
            continue
        if up == "H":
            cx = cx + args[0] if rel else args[0]
            out.append(f"L {_fmt(cx)} {_fmt(cy)}")
            continue
        if up == "V":
            cy = cy + args[0] if rel else args[0]
            out.append(f"L {_fmt(cx)} {_fmt(cy)}")
            continue
        pairs = icon_lane._CMD[up][1]
        vals = list(args)
        for xi, yi in pairs:
            if rel:
                vals[xi] = cx + vals[xi]
                vals[yi] = cy + vals[yi]
        if pairs:
            lx, ly = pairs[-1]
            cx, cy = vals[lx], vals[ly]
        if up == "M":
            start_x, start_y = cx, cy
        out.append(up + " " + " ".join(_fmt(v) for v in vals))
    return " ".join(out)


# 원호(A) 매개변수 처리 — 설계 §7(v0.1)에 등록된 표 그대로.
# 미러는 방향을 뒤집는 반사라 sweep이 반전되고, 회전은 방향을 보존한다.
# 둘 다 등거리라 rx·ry는 손대지 않는다.
ARC_RULES = {
    None:     lambda rx, ry, phi, laf, sf: (rx, ry, phi, laf, sf),
    "mirror": lambda rx, ry, phi, laf, sf: (rx, ry, (180 - phi) % 180,
                                            laf, 1 - int(sf)),
    "rot90":  lambda rx, ry, phi, laf, sf: (rx, ry, (phi - 90) % 180, laf, sf),
}


def _map_arc(args: list, arc: str | None) -> list:
    """A 명령의 앞 다섯 인수(rx ry φ large-arc sweep)를 변환에 맞춰 고친다."""
    rx, ry, phi, laf, sf = args[:5]
    rx, ry, phi, laf, sf = ARC_RULES[arc](rx, ry, phi, laf, sf)
    return [rx, ry, phi, laf, sf] + list(args[5:])


def _map_path_coords(d: str, fn, arc: str | None = None) -> str:
    """path 데이터의 좌표쌍에 fn을 먹인다. 먼저 절대 표기로 눕힌다.

    `arc`는 원호 매개변수를 어떻게 고칠지다(None·"mirror"·"rot90").
    평행이동은 원호를 건드리지 않으므로 None이다.
    """
    absolute = to_absolute(d)
    if absolute is None:
        return None
    out = []
    for cmd, args in icon_lane.parse_path(absolute):
        up = cmd.upper()
        if up == "Z":
            out.append(cmd)
            continue
        pairs = icon_lane._CMD[up][1]
        args = list(args)
        for xi, yi in pairs:
            args[xi], args[yi] = fn(args[xi], args[yi])
        if up == "A":
            args = _map_arc(args, arc)
        out.append(cmd + " " + " ".join(_fmt(a) for a in args))
    return " ".join(out)


def _map_svg(svg: str, fn, arc: str | None = None) -> str | None:
    """모든 도형의 좌표에 fn(x, y) -> (x', y')를 먹인다. 못 다루면 None.

    `arc`는 원호 매개변수 규칙(설계 §7). 원이나 사각형에는 해당이 없다.
    """
    root = ET.fromstring(svg)
    for el in root.iter():
        tag = icon_lane._local(el.tag)
        a = el.attrib
        if tag == "path":
            new_d = _map_path_coords(a.get("d", ""), fn, arc)
            if new_d is None:
                return None
            el.set("d", new_d)
        elif tag == "circle":
            cx, cy = fn(float(a.get("cx", 0)), float(a.get("cy", 0)))
            el.set("cx", _fmt(cx))
            el.set("cy", _fmt(cy))
        elif tag == "rect":
            x, y = float(a.get("x", 0)), float(a.get("y", 0))
            w, h = float(a.get("width", 0)), float(a.get("height", 0))
            # 네 모서리를 옮긴 뒤 다시 좌상단·크기로 되돌린다(회전에서 w/h가 바뀐다)
            corners = [fn(x, y), fn(x + w, y), fn(x, y + h), fn(x + w, y + h)]
            xs = [c[0] for c in corners]
            ys = [c[1] for c in corners]
            el.set("x", _fmt(min(xs)))
            el.set("y", _fmt(min(ys)))
            el.set("width", _fmt(max(xs) - min(xs)))
            el.set("height", _fmt(max(ys) - min(ys)))
        elif tag in ("line",):
            x1, y1 = fn(float(a.get("x1", 0)), float(a.get("y1", 0)))
            x2, y2 = fn(float(a.get("x2", 0)), float(a.get("y2", 0)))
            for k, v in (("x1", x1), ("y1", y1), ("x2", x2), ("y2", y2)):
                el.set(k, _fmt(v))
        elif tag in ("polyline", "polygon"):
            nums = icon_lane._floats(a.get("points", ""))
            pts = []
            for i in range(0, len(nums) - 1, 2):
                px, py = fn(nums[i], nums[i + 1])
                pts.append(f"{_fmt(px)},{_fmt(py)}")
            el.set("points", " ".join(pts))
    return ET.tostring(root, encoding="unicode")


def _on_grid(svg: str) -> bool:
    """좌표가 전부 0.5 배수인가 — 연산자가 격자를 깼는지 **산수로** 확인한다."""
    return not icon_lane.measure(svg, snap=SNAP)["off_grid"]


def _legal_geometry(svg: str) -> bool:
    """여백·바이트·격자만 본다(판정이 아니라 적용 조건, 설계 §2)."""
    m = icon_lane.measure(svg, snap=SNAP)
    if m["error"] or m["off_grid"]:
        return False
    if m["min_padding"] is None or m["min_padding"] < PADDING_MIN:
        return False
    return m["bytes"] <= MAX_BYTES


def translations(svg: str) -> list:
    out = []
    for delta in TRANSLATIONS:
        for axis in ("x", "y"):
            fn = ((lambda x, y, d=delta: (x + d, y)) if axis == "x"
                  else (lambda x, y, d=delta: (x, y + d)))
            moved = _map_svg(svg, fn)
            name = f"평행이동 {axis}{delta:+g}"
            if moved is None:
                out.append({"op": name, "svg": None,
                            "why": "상대 좌표·H/V 명령이 있어 v0에서 안 다룬다"})
            elif not _legal_geometry(moved):
                out.append({"op": name, "svg": None,
                            "why": "이동 후 여백·격자·바이트 조건을 못 채운다"})
            else:
                out.append({"op": name, "svg": moved, "why": None})
    return out


def _as_path_d(tag: str, a: dict) -> str | None:
    """도형 하나를 같은 그림의 path 데이터로. 좌표는 한 점도 안 움직인다(설계 §8)."""
    if tag == "circle":
        cx, cy, r = (float(a.get(k, 0)) for k in ("cx", "cy", "r"))
        if r <= 0:
            return None
        return ("M {} {} A {} {} 0 1 0 {} {} A {} {} 0 1 0 {} {} Z".format(
            _fmt(cx - r), _fmt(cy), _fmt(r), _fmt(r), _fmt(cx + r), _fmt(cy),
            _fmt(r), _fmt(r), _fmt(cx - r), _fmt(cy)))
    if tag == "rect":
        x, y = float(a.get("x", 0)), float(a.get("y", 0))
        w, h = float(a.get("width", 0)), float(a.get("height", 0))
        if w <= 0 or h <= 0:
            return None
        return "M {} {} L {} {} L {} {} L {} {} Z".format(
            _fmt(x), _fmt(y), _fmt(x + w), _fmt(y), _fmt(x + w), _fmt(y + h),
            _fmt(x), _fmt(y + h))
    if tag == "line":
        x1, y1, x2, y2 = (float(a.get(k, 0))
                          for k in ("x1", "y1", "x2", "y2"))
        return "M {} {} L {} {}".format(_fmt(x1), _fmt(y1), _fmt(x2), _fmt(y2))
    if tag == "polyline":
        nums = icon_lane._floats(a.get("points", ""))
        pts = list(zip(nums[0::2], nums[1::2]))
        if len(pts) < 2:
            return None
        head = "M {} {}".format(_fmt(pts[0][0]), _fmt(pts[0][1]))
        return head + "".join(" L {} {}".format(_fmt(x), _fmt(y))
                              for x, y in pts[1:])
    return None


def to_path(svg: str) -> dict:
    """circle·rect·line·polyline을 같은 그림의 path로 바꾼다(설계 §8).

    그림은 한 점도 안 움직이고 요소 이름만 바뀐다. 심판이 이걸 떨어뜨리면
    그림이 아니라 표기를 재고 있다는 뜻이다.
    """
    root = ET.fromstring(svg)
    converted = 0
    for parent in root.iter():
        for el in list(parent):
            tag = icon_lane._local(el.tag)
            if tag not in ("circle", "rect", "line", "polyline"):
                continue
            d = _as_path_d(tag, el.attrib)
            if d is None:
                return {"op": "요소→path", "svg": None,
                        "why": "바꿀 수 없는 도형이 있다(크기 0 등)"}
            keep = {k: v for k, v in el.attrib.items()
                    if icon_lane._local(k) not in
                    ("cx", "cy", "r", "x", "y", "width", "height",
                     "x1", "y1", "x2", "y2", "points")}
            idx = list(parent).index(el)
            parent.remove(el)
            new = ET.Element("path", {**keep, "d": d})
            parent.insert(idx, new)
            converted += 1
    if not converted:
        return {"op": "요소→path", "svg": None,
                "why": "바꿀 도형이 없다(path뿐인 자산)"}
    out = ET.tostring(root, encoding="unicode")
    m = icon_lane.measure(out, snap=SNAP)
    if m["error"] or m["path_count"] > MAX_PATHS             or m["command_count"] > MAX_COMMANDS:
        return {"op": "요소→path", "svg": None,
                "why": "바꾸면 path 수·명령 수 상한을 넘는다"}
    if not _legal_geometry(out):
        return {"op": "요소→path", "svg": None,
                "why": "바꾼 뒤 격자·여백·바이트 조건을 못 채운다"}
    return {"op": "요소→path", "svg": out, "why": None}


def mirror(svg: str) -> dict:
    """좌우 미러. 원호는 설계 §7의 규칙으로 sweep을 뒤집고 φ를 반사한다."""
    flipped = _map_svg(svg, lambda x, y: (VIEWBOX - x, y), arc="mirror")
    if flipped is None or not _legal_geometry(flipped):
        return {"op": "좌우 미러", "svg": None, "why": "다룰 수 없는 명령이 있다"}
    return {"op": "좌우 미러", "svg": flipped, "why": None}


def rotate90(svg: str) -> dict:
    """90도 회전. 방향을 보존하므로 플래그는 그대로, φ만 90도 돈다(§7)."""
    turned = _map_svg(svg, lambda x, y: (y, VIEWBOX - x), arc="rot90")
    if turned is None or not _legal_geometry(turned):
        return {"op": "90도 회전", "svg": None, "why": "다룰 수 없는 명령이 있다"}
    return {"op": "90도 회전", "svg": turned, "why": None}


def reorder_paths(svg: str) -> dict:
    """path 요소의 순서만 뒤집는다. 기하량은 **전부** 그대로다."""
    root = ET.fromstring(svg)
    paths = [el for el in list(root) if icon_lane._local(el.tag) == "path"]
    if len(paths) < 2:
        return {"op": "path 순서 뒤집기", "svg": None, "why": "path가 2개 미만"}
    positions = [i for i, el in enumerate(list(root))
                 if icon_lane._local(el.tag) == "path"]
    children = list(root)
    for pos, el in zip(positions, reversed(paths)):
        children[pos] = el
    for el in list(root):
        root.remove(el)
    for el in children:
        root.append(el)
    return {"op": "path 순서 뒤집기",
            "svg": ET.tostring(root, encoding="unicode"), "why": None}


def line_to_path(svg: str) -> dict:
    """`line` 하나를 등가 `path M/L`로 바꾼다. path 수 +1, 명령 +2."""
    root = ET.fromstring(svg)
    m = icon_lane.measure(svg, snap=SNAP)
    target = next((el for el in root.iter()
                   if icon_lane._local(el.tag) == "line"), None)
    if target is None:
        return {"op": "line→path 치환", "svg": None, "why": "line 요소가 없다"}
    if m["path_count"] + 1 > MAX_PATHS or m["command_count"] + 2 > MAX_COMMANDS:
        return {"op": "line→path 치환", "svg": None,
                "why": "치환하면 path·명령 상한을 넘는다"}
    a = target.attrib
    d = (f'M {_fmt(float(a.get("x1", 0)))} {_fmt(float(a.get("y1", 0)))} '
         f'L {_fmt(float(a.get("x2", 0)))} {_fmt(float(a.get("y2", 0)))}')
    parent = next(p for p in root.iter() if target in list(p))
    idx = list(parent).index(target)
    new = ET.Element("path")
    for k, v in a.items():
        if k not in ("x1", "y1", "x2", "y2"):
            new.set(k, v)
    new.set("d", d)
    parent.remove(target)
    parent.insert(idx, new)
    return {"op": "line→path 치환",
            "svg": ET.tostring(root, encoding="unicode"), "why": None}


def reencode_absolute(svg: str) -> dict:
    """상대·H/V 표기를 절대 표기로. **같은 그림, 다른 인코딩**(설계 §2 재표기)."""
    again = _map_svg(svg, lambda x, y: (x, y))     # 좌표는 그대로, 표기만 눕는다
    if again is None or not _legal_geometry(again):
        return {"op": "절대좌표 재표기", "svg": None, "why": "다룰 수 없는 명령"}
    return {"op": "절대좌표 재표기", "svg": again, "why": None}


def variants(svg: str) -> list:
    """이 자산에서 만들 수 있는 인-스펙 변이 전부. 못 만든 것도 사유와 함께."""
    try:
        ET.fromstring(svg)
    except ET.ParseError as exc:
        return [{"op": "(파싱)", "svg": None, "why": f"원본을 못 읽는다: {exc}"}]
    return (translations(svg) + [mirror(svg), rotate90(svg),
                                 reorder_paths(svg), line_to_path(svg),
                                 to_path(svg), reencode_absolute(svg)])
