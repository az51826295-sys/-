"""타일·캐릭터 계측기 (docs/tile-character-oracle-v0-design.md).

한 장짜리 속성(크기·색 수·알파)은 `asset_probe`가 잰다. 여기서 재는 것은
**한 장으로는 안 보이는 것**이다:

- 타일: 이어 붙였을 때 이음새가 보이나 (`seam_ratio_x/y`)
- 캐릭터: 방향들끼리 프레임 수·키·팔레트가 맞나

재기만 한다. **판정하지 않고 문턱도 갖지 않는다** — 문턱은 사장님이 동결한다.
못 재는 것은 0이 아니라 `None`이다(단색 타일, 방향 누락, 파손).
"""
from __future__ import annotations

import os

from genesis import asset_probe

DIRS = ("south", "west", "east", "north")


def _logical_grid(path: str):
    """논리 격자(정수배 업스케일본은 내려서). asset_probe와 같은 해석을 쓴다."""
    m = asset_probe.measure_pixel_art(path)
    if m.get("error"):
        return None, m["error"]
    from PIL import Image
    with Image.open(path) as im:
        im = im.convert("RGBA")
        w, h = im.size
        block = m.get("block_size") or 1
        lw, lh = w // block, h // block
        px = im.load()
        grid = [[px[x * block, y * block] for x in range(lw)]
                for y in range(lh)]
    return grid, None


def _col(grid, x):
    return [row[x] for row in grid]


def _row(grid, y):
    return list(grid[y])


def _mean_diff(a: list, b: list) -> float:
    """두 픽셀 열(행)의 평균 채널 차. 알파가 0인 곳은 색을 비교하지 않는다."""
    tot, n = 0.0, 0
    for pa, pb in zip(a, b):
        if pa[3] == 0 and pb[3] == 0:
            continue
        tot += sum(abs(pa[i] - pb[i]) for i in range(4)) / 4.0
        n += 1
    return (tot / n) if n else 0.0


def _median(xs: list):
    if not xs:
        return None
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def tile_seam(path: str) -> dict:
    """이음새 비율 — 가장자리 불연속이 내부 이웃 차이에 비해 얼마나 큰가.

    비율이 정의되지 않으면(내부 변화가 0인 단색 타일) `None`이다. 그건 "이음새가
    없다"가 아니라 **잴 수 없다**는 뜻이고, 판정은 undefined로 간다.
    """
    grid, err = _logical_grid(path)
    if grid is None:
        return {"error": err, "seam_ratio_x": None, "seam_ratio_y": None}
    h, w = len(grid), len(grid[0])
    if w < 3 or h < 3:
        # 단색 타일은 격자 역산에서 1x1로 접힌다. "3픽셀 미만"이라고만 적으면
        # 왜 못 쟀는지가 거짓말이 된다 - 두 경우를 갈라 적는다.
        flat = len({p for row in grid for p in row}) <= 1
        return {"error": ("단색 타일 - 내부 변화가 없어 비율이 정의되지 않는다"
                          if flat else "타일이 3픽셀 미만 - 내부 이웃이 없다"),
                "seam_dx": 0.0, "interior_dx": 0.0,
                "seam_dy": 0.0, "interior_dy": 0.0,
                "seam_ratio_x": None, "seam_ratio_y": None,
                "logical_size": [w, h]}

    seam_dx = _mean_diff(_col(grid, w - 1), _col(grid, 0))
    inner_dx = _median([_mean_diff(_col(grid, x), _col(grid, x + 1))
                        for x in range(w - 1)])
    seam_dy = _mean_diff(_row(grid, h - 1), _row(grid, 0))
    inner_dy = _median([_mean_diff(_row(grid, y), _row(grid, y + 1))
                        for y in range(h - 1)])
    return {"error": None,
            "seam_dx": round(seam_dx, 4), "interior_dx": round(inner_dx, 4),
            "seam_dy": round(seam_dy, 4), "interior_dy": round(inner_dy, 4),
            "seam_ratio_x": (round(seam_dx / inner_dx, 4) if inner_dx else None),
            "seam_ratio_y": (round(seam_dy / inner_dy, 4) if inner_dy else None),
            "logical_size": [w, h]}


def _palette(path: str):
    grid, err = _logical_grid(path)
    if grid is None:
        return None, err
    return {p[:3] for row in grid for p in row if p[3] > 0}, None


def _bbox_height(path: str):
    grid, err = _logical_grid(path)
    if grid is None:
        return None, err
    ys = [y for y, row in enumerate(grid) for p in row if p[3] > 0]
    return (max(ys) - min(ys) + 1) if ys else None, None


def character_set(base: str) -> dict:
    """캐릭터 폴더 하나 — 방향들끼리 맞는가.

    `rotations/{dir}.png` 와 `walking/{dir}/frame_*.png` 를 본다(sprite_lib 규약).
    없는 방향은 fail이 아니라 그 규칙을 **undefined**로 만든다.
    """
    out = {"error": None, "dirs_found": [], "frame_counts": {},
           "bbox_heights": {}, "frame_count_equal": None,
           "bbox_height_spread": None, "palette_overlap_min": None,
           "missing": []}
    palettes = {}
    for d in DIRS:
        rot = os.path.join(base, "rotations", f"{d}.png")
        if not os.path.exists(rot):
            out["missing"].append(f"rotations/{d}.png")
            continue
        out["dirs_found"].append(d)
        pal, err = _palette(rot)
        if err:
            out["error"] = err
            return out
        palettes[d] = pal
        hgt, _ = _bbox_height(rot)
        out["bbox_heights"][d] = hgt
        wdir = os.path.join(base, "walking", d)
        if os.path.isdir(wdir):
            out["frame_counts"][d] = len(
                [f for f in os.listdir(wdir) if f.endswith(".png")])
        else:
            out["missing"].append(f"walking/{d}")

    if len(out["frame_counts"]) == len(DIRS):
        out["frame_count_equal"] = len(set(out["frame_counts"].values())) == 1
    heights = [h for h in out["bbox_heights"].values() if h is not None]
    if len(heights) == len(DIRS):
        out["bbox_height_spread"] = max(heights) - min(heights)
    if len(palettes) >= 2:
        worst = None
        keys = sorted(palettes)
        for i, a in enumerate(keys):
            for b in keys[i + 1:]:
                pa, pb = palettes[a], palettes[b]
                union = len(pa | pb)
                j = (len(pa & pb) / union) if union else None
                if j is not None and (worst is None or j < worst):
                    worst = j
        out["palette_overlap_min"] = (round(worst, 4)
                                      if worst is not None else None)
    return out
