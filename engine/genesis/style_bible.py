"""스타일 성경 — **사장님이 고른 자산 하나**가 나머지 전부의 기준이 된다.

`docs/measurement-rules.md` §14: *기준은 고르는 것이지 모집단에서 뽑는 것이 아니다.*

2026-08-27에 나는 "가진 자산 전부에서 마스터 팔레트를 뽑아 강제"하려다 실패했다.
어긋난 것들로 기준을 만들면 어긋남이 기준이 된다(UI 아이콘 거리 0.457 → 0.457).
도트 디자이너는 통계에 맞추지 않는다 — **완성된 자산 하나를 성경 삼고 나머지를
거기에 맞춘다.**

**램프가 핵심이다.** 픽셀 아트가 통일돼 보이는 것은 색이 예뻐서가 아니라, 재질마다
그림자→중간→하이라이트가 3~5단계 램프로 묶여 있고 **모든 자산이 같은 램프에서
색을 꺼내 쓰기** 때문이다. 평평한 색 목록은 팔레트가 아니다.

**이 모듈은 성경을 만들지 않는다.** 사람이 고른 것을 받아 적는다. `adopt()` 는
`chosen_by` 를 요구하고, 그게 없으면 거부한다 - 기계가 슬쩍 기준을 정하는 길을
막는다.
"""
from __future__ import annotations

import colorsys
import json
import math
import os
import statistics

from PIL import Image

BIBLE_DIR = os.path.join("data", "style_bible")
HUE_BANDS = 12          # 색상환을 12로 나눈다. 12면 초록과 청록이 갈린다.
MIN_RAMP_STEPS = 3      # 3단계 미만은 램프가 아니라 점이다
_MAX_DIST = math.sqrt(3 * 255 ** 2)
_R, _G, _B = 0.299, 0.587, 0.114


class NotChosen(ValueError):
    """사람이 고르지 않은 것을 성경으로 삼으려 할 때."""


def _luma(c) -> float:
    return _R * c[0] + _G * c[1] + _B * c[2]


def _sat(c) -> float:
    return max(c) - min(c)


def _opaque(paths: list) -> list:
    out = []
    for p in paths:
        img = Image.open(p).convert("RGBA")
        out += [q[:3] for q in img.get_flattened_data() if q[3] > 0]
    return out


def ramps(colors: list) -> dict:
    """색을 **색상대별 밝기 사다리**로 묶는다. 이게 팔레트의 실제 구조다.

    무채색(채도가 아주 낮은 것)은 색상이 의미 없으므로 따로 모은다 - 안 그러면
    회색들이 아무 색상대에나 흩어져 램프를 오염시킨다.
    """
    bands: dict = {}
    grey = []
    for c in set(colors):
        if _sat(c) < 12:
            grey.append(round(_luma(c)))
            continue
        h, l, s = colorsys.rgb_to_hls(*[v / 255 for v in c])
        bands.setdefault(round(h * HUE_BANDS) % HUE_BANDS, []).append(c)
    out = {}
    for k, cs_ in bands.items():
        steps = sorted(cs_, key=_luma)
        if len(steps) >= MIN_RAMP_STEPS:
            out[k] = {"steps": [list(c) for c in steps],
                      "luma": [round(_luma(c)) for c in steps],
                      "n": len(steps)}
    return {"bands": out, "grey_steps": sorted(set(grey)),
            "band_count": len(out),
            "median_steps": (round(statistics.median(
                [v["n"] for v in out.values()]), 1) if out else 0)}


def adopt(paths: list, name: str, chosen_by: str, note: str = "",
          root: str = ".") -> dict:
    """고른 자산을 성경으로 채택한다. **`chosen_by` 없이는 채택하지 않는다.**"""
    if not chosen_by or not chosen_by.strip():
        raise NotChosen(
            "성경은 사람이 고른 것이어야 한다(measurement-rules §14). "
            "누가 골랐는지 `chosen_by` 에 적어라 - 기계가 정할 자리가 아니다")
    px = _opaque(paths)
    if not px:
        raise ValueError("불투명 화소가 없다")
    lum = sorted(_luma(c) for c in px)
    doc = {"name": name, "chosen_by": chosen_by, "note": note,
           "sources": paths,
           "palette": [list(c) for c in sorted(set(px))],
           "colors": len(set(px)),
           "luma_median": round(statistics.median(lum), 1),
           "luma_spread": round(lum[int(len(lum) * .95)]
                                - lum[int(len(lum) * .05)], 1),
           "saturation_median": round(statistics.median(
               [_sat(c) for c in px]), 1),
           "ramps": ramps(px),
           "basis": "measurement-rules §14 — 기준은 고르는 것이다"}
    d = os.path.join(root, BIBLE_DIR)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, f"{name}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
    doc["path"] = path
    return doc


def load(name: str, root: str = ".") -> dict:
    with open(os.path.join(root, BIBLE_DIR, f"{name}.json"),
              encoding="utf-8") as fh:
        return json.load(fh)


def compare(paths: list, bible: dict) -> dict:
    """이 자산이 **성경과 같은 세계인가**. 좋은가를 묻지 않는다."""
    px = _opaque(paths)
    if not px:
        return {"error": "불투명 화소가 없다"}
    pal = [tuple(c) for c in bible["palette"]]
    mine = sorted(set(px))
    near = [min(math.dist(c, r) for r in pal) / _MAX_DIST for c in mine]
    lum = sorted(_luma(c) for c in px)
    mine_ramps = ramps(px)
    # 성경의 색상대 중 이 자산이 실제로 쓰는 것
    shared = set(mine_ramps["bands"]) & set(int(k) for k in bible["ramps"]["bands"])
    return {"colors": len(mine),
            "palette_distance": round(statistics.median(near), 4),
            "palette_distance_max": round(max(near), 4),
            "luma_median": round(statistics.median(lum), 1),
            "luma_spread": round(lum[int(len(lum) * .95)]
                                 - lum[int(len(lum) * .05)], 1),
            "saturation_median": round(statistics.median(
                [_sat(c) for c in px]), 1),
            "luma_shift": round(statistics.median(lum)
                                - bible["luma_median"], 1),
            "saturation_shift": round(statistics.median([_sat(c) for c in px])
                                      - bible["saturation_median"], 1),
            "ramp_bands": mine_ramps["band_count"],
            "shared_ramp_bands": len(shared),
            "bible": bible["name"]}
