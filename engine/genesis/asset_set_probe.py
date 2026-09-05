"""세트 계측기 — 낱장이 아니라 **여러 장이 같이 있을 때** 보이는 것.

아이콘 세트는 이미 잰다(획 굵기·구조 중복·시각 무게 폭, `icon_judge.judge_set`).
타일과 캐릭터는 낱장만 봤다. 그런데 세트의 결함은 낱장에 없다:

- 타일: 크기가 제각각이면 못 깐다 · 세트 전체 색 수가 팔레트를 넘는다 ·
  어떤 타일이 유난히 이음새가 크다
- 캐릭터: 캐릭터마다 키가 다르면 같은 마을 사람으로 안 보인다 ·
  세트 팔레트가 갈라진다

재기만 한다. 문턱은 사장님이 동결한다(`docs/measurement-rules.md` §4).
"""
from __future__ import annotations

import os

from genesis import tile_probe


def _median(xs: list):
    if not xs:
        return None
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def tile_set(paths: list) -> dict:
    """타일 여러 장 — 같이 깔 수 있는가.

    `sizes_uniform`은 계약이다(크기가 다르면 애초에 못 깐다). 나머지는
    measured·미판정이다.
    """
    out = {"error": None, "count": len(paths), "logical_sizes": [],
           "sizes_uniform": None, "palette_union": None,
           "seam_ratio_max": None, "seam_ratio_median": None,
           "worst_tile": None, "unmeasured": []}
    if not paths:
        out["error"] = "타일이 없다"
        return out
    palette: set = set()
    sizes, ratios = [], []
    for p in paths:
        seam = tile_probe.tile_seam(p)
        if seam.get("error") and seam.get("logical_size") is None:
            out["unmeasured"].append({"path": os.path.basename(p),
                                      "why": seam["error"]})
            continue
        if seam.get("logical_size"):
            sizes.append(tuple(seam["logical_size"]))
        rx, ry = seam.get("seam_ratio_x"), seam.get("seam_ratio_y")
        if rx is None or ry is None:
            out["unmeasured"].append({"path": os.path.basename(p),
                                      "why": seam.get("error")
                                      or "이음새 비율이 정의되지 않는다"})
        else:
            worst = max(rx, ry)
            ratios.append(worst)
            if out["seam_ratio_max"] is None or worst > out["seam_ratio_max"]:
                out["seam_ratio_max"] = worst
                out["worst_tile"] = os.path.basename(p)
        grid, err = tile_probe._logical_grid(p)
        if grid is not None:
            palette |= {q[:3] for row in grid for q in row if q[3] > 0}
    out["logical_sizes"] = sorted({f"{w}x{h}" for w, h in sizes})
    out["sizes_uniform"] = (len(set(sizes)) == 1) if sizes else None
    out["palette_union"] = len(palette) if palette else None
    out["seam_ratio_median"] = (round(_median(ratios), 4) if ratios else None)
    if out["seam_ratio_max"] is not None:
        out["seam_ratio_max"] = round(out["seam_ratio_max"], 4)
    return out


def character_group(bases: list) -> dict:
    """캐릭터 여러 명 — 같은 마을 사람으로 보이는가."""
    out = {"error": None, "count": len(bases), "heights": {},
           "height_spread": None, "palette_union": None,
           "frame_counts": {}, "frame_counts_uniform": None,
           "unmeasured": []}
    if not bases:
        out["error"] = "캐릭터가 없다"
        return out
    palette: set = set()
    for base in bases:
        name = os.path.basename(base.rstrip("/\\"))
        one = tile_probe.character_set(base)
        if one.get("error"):
            out["unmeasured"].append({"character": name, "why": one["error"]})
            continue
        hs = [h for h in one["bbox_heights"].values() if h is not None]
        if hs:
            out["heights"][name] = max(hs)
        counts = set(one["frame_counts"].values())
        if len(counts) == 1:
            out["frame_counts"][name] = counts.pop()
        elif counts:
            out["frame_counts"][name] = sorted(counts)
        for d in tile_probe.DIRS:
            rot = os.path.join(base, "rotations", f"{d}.png")
            if os.path.exists(rot):
                pal, err = tile_probe._palette(rot)
                if pal:
                    palette |= pal
    heights = list(out["heights"].values())
    out["height_spread"] = (max(heights) - min(heights)) if len(heights) >= 2 \
        else None
    out["palette_union"] = len(palette) if palette else None
    counts = [c for c in out["frame_counts"].values() if isinstance(c, int)]
    out["frame_counts_uniform"] = (len(set(counts)) == 1
                                   if len(counts) == len(bases) else None)
    return out
