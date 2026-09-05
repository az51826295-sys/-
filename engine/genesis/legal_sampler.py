"""합법 영역 직접 샘플링 — 스펙에서 무작위로 만든다.

사전 등록: `docs/legal-sampling-v0-design.md`.

인-스펙 변이는 **기존 통과분의 궤도 위**에서만 움직인다. 여기는 그 밖을 덮는다:
스펙만 보고 좌표를 격자 위에서 뽑아 문법적으로 합법인 SVG를 만든다.

**예쁘지 않다. 그런데 합법이다.** 못생긴 것이 떨어지면 심판이 스펙에 없는
미감을 몰래 쓰고 있다는 증거다.

합법성은 **구성으로 증명된다** — 심판이 통과시켜서가 아니라, 좌표를 여백 안
격자에서만 뽑고 개수·명령 수를 상한 안에서만 세고 속성을 스펙 값으로 박았기
때문이다.
"""
from __future__ import annotations

import random

SEED = 20260826            # 동결. 씨앗을 바꿔가며 통과 표본을 찾지 않는다
VIEWBOX = 24
SNAP = 0.5
PADDING_MIN = 2.0
MAX_PATHS = 6
MAX_COMMANDS = 60
MAX_BYTES = 2048
STROKE_WIDTH = 1.5

# 좌표 후보: 여백을 구성으로 보장한다(2.0 ~ 22.0의 0.5 배수)
_LOW = PADDING_MIN
_HIGH = VIEWBOX - PADDING_MIN
_COORDS = [round(_LOW + i * SNAP, 1)
           for i in range(int((_HIGH - _LOW) / SNAP) + 1)]

HEAD = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
        'fill="none" stroke="currentColor" stroke-width="{w}" '
        'stroke-linecap="round" stroke-linejoin="round">')


def _fmt(v: float) -> str:
    return f"{v:g}"


def _point(rng: random.Random) -> tuple:
    return rng.choice(_COORDS), rng.choice(_COORDS)


def _path_d(rng: random.Random, budget: int) -> tuple:
    """(d 문자열, 쓴 명령 수). budget 안에서만 쓴다."""
    x, y = _point(rng)
    parts = [f"M {_fmt(x)} {_fmt(y)}"]
    used = 1
    n_more = rng.randint(1, min(4, max(1, budget - used)))
    for _ in range(n_more):
        kind = rng.choice(("L", "C", "Q"))
        if kind == "L":
            px, py = _point(rng)
            parts.append(f"L {_fmt(px)} {_fmt(py)}")
        elif kind == "Q":
            (cx, cy), (px, py) = _point(rng), _point(rng)
            parts.append(f"Q {_fmt(cx)} {_fmt(cy)} {_fmt(px)} {_fmt(py)}")
        else:
            (c1x, c1y), (c2x, c2y), (px, py) = (_point(rng), _point(rng),
                                                _point(rng))
            parts.append(f"C {_fmt(c1x)} {_fmt(c1y)} {_fmt(c2x)} {_fmt(c2y)} "
                         f"{_fmt(px)} {_fmt(py)}")
        used += 1
    return " ".join(parts), used


def sample_one(rng: random.Random) -> str | None:
    """합법 SVG 하나. 바이트 상한을 넘으면 None(호출자가 다시 뽑는다)."""
    n_paths = rng.randint(1, MAX_PATHS)
    budget = MAX_COMMANDS
    paths = []
    for _ in range(n_paths):
        if budget <= 1:
            break
        d, used = _path_d(rng, budget)
        budget -= used
        paths.append(f'<path d="{d}"/>')
    svg = HEAD.format(w=_fmt(STROKE_WIDTH)) + "".join(paths) + "</svg>"
    if len(svg.encode("utf-8")) > MAX_BYTES:
        return None
    return svg


def sample(n: int = 200, seed: int = SEED) -> list:
    """표본 n건. 바이트 초과로 버린 것은 **건수에 안 센다**(설계 §1)."""
    rng = random.Random(seed)
    out, discarded = [], 0
    while len(out) < n:
        svg = sample_one(rng)
        if svg is None:
            discarded += 1
            if discarded > n * 10:          # 무한 루프 방지 - 구성이 잘못된 것
                raise RuntimeError("바이트 상한을 계속 넘는다 - 생성 규칙 점검")
            continue
        out.append(svg)
    return out


def coverage(samples: list) -> dict:
    """이 표본이 **어느 축을 얼마나 건드렸는가.**

    "200건 통과"만으로는 무슨 뜻인지 알 수 없다. 안 건드린 축은 안 잰 것이고,
    그걸 적지 않으면 커버리지를 부풀리게 된다.
    """
    from genesis import icon_lane

    axes = {"path_count": {}, "command_count": {}, "elements": {},
            "bytes": {"min": None, "max": None},
            "min_padding": {"min": None, "max": None},
            "commands_used": {}}
    for svg in samples:
        m = icon_lane.measure(svg, snap=SNAP)
        axes["path_count"][m["path_count"]] = \
            axes["path_count"].get(m["path_count"], 0) + 1
        bucket = (m["command_count"] // 5) * 5
        axes["command_count"][bucket] = axes["command_count"].get(bucket, 0) + 1
        for el in m["elements"]:
            axes["elements"][el] = axes["elements"].get(el, 0) + 1
        for key, val in (("bytes", m["bytes"]),
                         ("min_padding", m["min_padding"])):
            cur = axes[key]
            cur["min"] = val if cur["min"] is None else min(cur["min"], val)
            cur["max"] = val if cur["max"] is None else max(cur["max"], val)
        for cmd, _args in icon_lane.parse_path(
                svg.split('d="')[1].split('"')[0] if 'd="' in svg else ""):
            axes["commands_used"][cmd] = axes["commands_used"].get(cmd, 0) + 1
    return {
        "n": len(samples),
        "axes": axes,
        # 안 건드린 축을 **이름으로** 남긴다(설계 §1은 path만 쓴다고 적었다)
        "not_exercised": [
            "circle·rect·line·polyline 요소(허용 목록에 있으나 v0 생성기는 안 씀)",
            "Z(닫힌 경로)·A(원호)·H/V·상대 좌표 명령",
            "금지 요소(text·image·filter·mask·style·script·defs) — "
            "이건 negative 통제가 덮는다",
            "팔레트 위반(currentColor 아닌 색) — 역시 negative 쪽",
        ],
    }
