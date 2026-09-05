"""취향 특징(그림/PNG) — 사람 선택을 설명해 볼 후보 지표 10개.

사전 등록 문서: `docs/taste-judge-image-v0-design.md` §2. **동결된 목록이다** —
선택을 본 뒤에 특징을 추가하면 그게 과적합이다. 전부 Pillow로 결정적으로 재는
값이고 모델 호출은 0이다.

특징이 있다고 심판이 되는 것은 아니다. 이 값들이 사람 선택을 실제로 가르는지는
쌍 비교 LOCO(설계 §3)가 시험하고, 관문(§4)을 통과할 때만 승격된다.

정규화: 정수배 업스케일본은 논리 격자로 **내려서** 잰다. 격자 검출은
`asset_probe.measure_pixel_art`를 그대로 쓴다 — 같은 파일을 두 벌로 해석하지
않기 위해서다. 확대본과 원본이 다른 값을 내면 특징이 그림이 아니라 저장 방식을
재는 셈이 된다.
"""
from __future__ import annotations

import colorsys

from genesis import asset_probe

# 동결: 이 순서가 곧 동률일 때의 우선순위다(설계 §3).
FEATURES = ("color_count", "opaque_ratio", "bbox_fill_ratio",
            "mean_saturation", "mean_value", "value_spread", "edge_density",
            "symmetry_x", "dominant_color_share", "outline_ratio")

# i7 전용 고정 상수(설계 §2). 결과를 보고 옮기지 않는다.
EDGE_DELTA = 30


def _percentile(values: list, q: float) -> float:
    """가장 가까운 순위(nearest-rank). 보간하지 않는다 — 값이 바뀌는 방식을
    하나로 못박기 위해서다."""
    if not values:
        return 0.0
    s = sorted(values)
    idx = min(len(s) - 1, max(0, int(round(q * (len(s) - 1)))))
    return s[idx]


def _logical_pixels(path: str) -> tuple:
    """(픽셀 격자, 폭, 높이, block_size) 또는 (None, 오류 문자열).

    블록이 전부 단색이라는 것은 measure_pixel_art가 이미 확인했으므로 블록의
    좌상단 한 점만 읽으면 된다.
    """
    probe = asset_probe.measure_pixel_art(path)
    if probe["error"]:
        return None, probe["error"]
    from PIL import Image

    with Image.open(path) as img:
        rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    b = probe["block_size"] or 1
    lw, lh = w // b, h // b
    grid = [[px[x * b, y * b] for x in range(lw)] for y in range(lh)]
    return (grid, lw, lh, b), None


def measure(path: str) -> dict:
    """PNG 한 장에서 특징 10개를 잰다. 판정하지 않는다.

    잴 수 없으면 값이 아니라 `error`를 남긴다 — 미측정은 fail이 아니라
    undefined다(judge-bench-v1.2 규율 4).
    """
    out = {"error": None, "block_size": None,
           "logical_width": None, "logical_height": None}
    out.update({f: None for f in FEATURES})

    loaded, err = _logical_pixels(path)
    if err:
        out["error"] = err
        return out
    grid, w, h, block = loaded
    out["block_size"] = block
    out["logical_width"], out["logical_height"] = w, h

    opaque = [(x, y, grid[y][x][:3])
              for y in range(h) for x in range(w) if grid[y][x][3] > 0]
    if not opaque:
        out["error"] = "불투명 픽셀 0 - 잴 것이 없다"
        return out
    n_op = len(opaque)
    total = w * h

    counts: dict = {}
    for _x, _y, rgb in opaque:
        counts[rgb] = counts.get(rgb, 0) + 1
    out["color_count"] = len(counts)
    out["opaque_ratio"] = round(n_op / total, 6)
    out["dominant_color_share"] = round(max(counts.values()) / n_op, 6)

    xs = [p[0] for p in opaque]
    ys = [p[1] for p in opaque]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    bbox_area = (x1 - x0 + 1) * (y1 - y0 + 1)
    out["bbox_fill_ratio"] = round(bbox_area / total, 6)

    sats, vals = [], []
    for _x, _y, (r, g, b) in opaque:
        _hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        sats.append(s)
        vals.append(v)
    out["mean_saturation"] = round(sum(sats) / n_op, 6)
    out["mean_value"] = round(sum(vals) / n_op, 6)
    out["value_spread"] = round(_percentile(vals, 0.9)
                                - _percentile(vals, 0.1), 6)

    pairs = diff = 0
    for y in range(h):
        for x in range(w):
            a = grid[y][x]
            if a[3] == 0:
                continue
            for dx, dy in ((1, 0), (0, 1)):
                nx, ny = x + dx, y + dy
                if nx >= w or ny >= h:
                    continue
                bpx = grid[ny][nx]
                if bpx[3] == 0:
                    continue
                pairs += 1
                if sum(abs(a[i] - bpx[i]) for i in range(3)) > EDGE_DELTA:
                    diff += 1
    out["edge_density"] = round(diff / pairs, 6) if pairs else 0.0

    same = 0
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            mx = x0 + x1 - x
            a, b_ = grid[y][x], grid[y][mx]
            if a[3] == 0 and b_[3] == 0:
                same += 1
            elif a[3] > 0 and b_[3] > 0 and a[:3] == b_[:3]:
                same += 1
    out["symmetry_x"] = round(same / bbox_area, 6)

    outline = 0
    for x, y, _rgb in opaque:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h) or grid[ny][nx][3] == 0:
                outline += 1
                break
    out["outline_ratio"] = round(outline / n_op, 6)
    return out
