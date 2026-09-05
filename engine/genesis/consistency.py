"""일관성 계측 — "같은 게임의 그림처럼 보이나"를 잰다.

2026-08-27 사장님: *"왜 도트 퀄리티가 일정하지 않을까? 우린 이걸 집중적으로
고친다."*

이건 **품질과 다른 물음이다.** 잘 그린 그림 열 장이 서로 안 맞으면 화면은 여전히
엉망이다. 그리고 이 물음은 우리 제품의 물음과 같은 모양이다 - "절대적으로 좋은가"가
아니라 **"정해 둔 것에 맞나"**.

세 가지를 잰다. 전부 **기준 자산 하나**를 놓고 그것에 대한 거리다.

  palette_distance  내 색들이 기준 팔레트에서 얼마나 떨어져 있나(0~1).
                    각 색에서 기준 팔레트의 가장 가까운 색까지 거리의 중앙값.
  luma_shift        밝기 중앙값의 차이(0~255). 한쪽만 밝으면 붕 뜬다.
  saturation_shift  채도 중앙값의 차이(0~255). 한쪽만 쨍하면 붕 뜬다.

**판정하지 않는다.** 문턱은 아직 없다 - 먼저 지금 값을 재고, 그 다음에 사람이
문턱을 정한다(2026-08-26 규율: 판정식은 고르기 전에 얼린다).
"""
from __future__ import annotations

import math
import statistics

from PIL import Image

_MAX_DIST = math.sqrt(3 * 255 ** 2)
_R, _G, _B = 0.299, 0.587, 0.114


def _pixels(path: str) -> list:
    img = Image.open(path).convert("RGBA")
    return [p[:3] for p in img.get_flattened_data() if p[3] > 0]


def palette(paths: list, top: int | None = None) -> list:
    """이 자산들이 실제로 쓰는 색. 많이 쓰인 순서."""
    counts: dict = {}
    for p in paths:
        for c in _pixels(p):
            counts[c] = counts.get(c, 0) + 1
    ordered = [c for c, _ in sorted(counts.items(), key=lambda kv: -kv[1])]
    return ordered[:top] if top else ordered


def _luma(c) -> float:
    return _R * c[0] + _G * c[1] + _B * c[2]


def _sat(c) -> float:
    return max(c) - min(c)


def _dist(a, b) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def against(paths: list, reference: list) -> dict:
    """기준 팔레트에 대해 이 자산들이 얼마나 떨어져 있나."""
    px = [c for p in paths for c in _pixels(p)]
    if not px or not reference:
        return {"error": "잴 것이 없다", "n_files": len(paths)}
    mine = sorted(set(px))
    near = [min(_dist(c, r) for r in reference) / _MAX_DIST for c in mine]
    ref_l = statistics.median([_luma(c) for c in reference])
    ref_s = statistics.median([_sat(c) for c in reference])
    return {"n_files": len(paths), "n_colors": len(mine),
            "palette_distance": round(statistics.median(near), 4),
            "palette_distance_max": round(max(near), 4),
            "luma_shift": round(statistics.median([_luma(c) for c in px]) - ref_l, 1),
            "saturation_shift": round(
                statistics.median([_sat(c) for c in px]) - ref_s, 1)}


def spread(groups: dict) -> dict:
    """여러 무리가 서로 얼마나 흩어져 있나. 기준은 **가장 큰 무리**로 잡는다.

    기준을 내가 고르지 않는다 - 화면을 가장 많이 차지하는 것이 사실상의 기준이다.
    """
    sizes = {k: sum(len(_pixels(p)) for p in v) for k, v in groups.items()}
    base = max(sizes, key=sizes.get)
    ref = palette(groups[base])
    out = {"reference": base, "reference_colors": len(ref), "groups": {}}
    for name, paths in groups.items():
        out["groups"][name] = against(paths, ref)
    vals = [g["palette_distance"] for g in out["groups"].values()
            if "palette_distance" in g]
    out["worst"] = max(vals) if vals else None
    out["spread"] = round(max(vals) - min(vals), 4) if vals else None
    return out
