"""세트 층 측정기 — 자산 **집합**의 일관성을 잰다. 초안 §3 layer_set.image

낱개가 전부 통과해도 세트는 망할 수 있다. 그리고 "일관되는가"는 취향이 아니라
**분산**이므로 기계가 잘한다 — 초안의 근거 그대로. 이 모듈도 판정하지 않는다:
숫자만 내고, 문턱은 사장님이 동결한다.

측정 관례(값과 함께 항상 보고한다):
- 색은 **불투명 픽셀만** 센다(투명 배경은 색이 아니다).
- 색상(hue)은 원형 통계로 다룬다. 채도가 낮은 픽셀의 hue는 의미가 없으므로
  **채도로 가중**한다. 분산은 원형 분산 `1 - R`(0=완전 일치, 1=완전 분산).
- 획 두께는 **2 × 불투명 면적 / 윤곽 길이** 근사다(폭 w·길이 L의 획에서
  면적≈wL, 윤곽≈2L). 알파가 없는 꽉 찬 그림에는 의미가 없어 None을 낸다.
- 이상치 거리는 **임베딩이 아니다**. 위에서 잰 특징(hue·채도·명도·색 수)의
  거리이며, 초안이 말한 임베딩 이상치의 **대용**이다. 격리 판단용이지 탈락 아님.

적격성(E6): 세트 표본이 5개 미만이면 정렬 지표를 내지 않는다(None → undefined).
"""
from __future__ import annotations

import colorsys
import math
import os

MIN_SET_N = 5           # 초안 §5 E6. 문턱이 아니라 등록된 적격성 조건


def _opaque_colors(path: str, max_colors: int = 1 << 18) -> list:
    """[(개수, (r,g,b)), ...] — 불투명 픽셀만."""
    from PIL import Image

    with Image.open(path) as img:
        rgba = img.convert("RGBA")
    colors = rgba.getcolors(maxcolors=max_colors)
    if colors is None:
        counts: dict = {}
        for c in rgba.getdata():
            counts[c] = counts.get(c, 0) + 1
        colors = [(n, c) for c, n in counts.items()]
    return [(n, c[:3]) for n, c in colors if c[3] > 0]


def _weighted_median(pairs: list):
    """[(값, 가중치)] → 가중 중앙값."""
    if not pairs:
        return None
    rows = sorted(pairs)
    total = sum(w for _v, w in rows)
    acc = 0.0
    for v, w in rows:
        acc += w
        if acc >= total / 2:
            return v
    return rows[-1][0]


def _circular(hues: list) -> tuple:
    """[(hue 0~1, 가중치)] → (평균 hue, 집중도 R 0~1)."""
    if not hues:
        return None, 0.0
    total = sum(w for _h, w in hues) or 1.0
    x = sum(w * math.cos(2 * math.pi * h) for h, w in hues) / total
    y = sum(w * math.sin(2 * math.pi * h) for h, w in hues) / total
    r = math.hypot(x, y)
    ang = math.atan2(y, x) / (2 * math.pi)
    return (ang % 1.0), r


def measure_asset(path: str) -> dict:
    """자산 하나의 세트용 특징. 낱개 심판(asset_probe)과 목적이 다르다."""
    out = {"path": path, "error": None, "dominant_hue": None,
           "hue_concentration": None, "median_saturation": None,
           "median_value": None, "color_count": None,
           "stroke_thickness": None, "visible_pixels": 0}
    if not os.path.isfile(path):
        out["error"] = f"파일이 없다: {path}"
        return out
    try:
        colors = _opaque_colors(path)
    except Exception as exc:                       # 손상·미지원 포맷
        out["error"] = f"디코딩 실패: {type(exc).__name__}: {exc}"
        return out
    if not colors:
        out["error"] = "불투명 픽셀이 없다"
        return out

    hsv = [(colorsys.rgb_to_hsv(r / 255, g / 255, b / 255), n)
           for n, (r, g, b) in colors]
    out["visible_pixels"] = sum(n for _c, n in hsv)
    out["color_count"] = len(colors)
    # hue는 채도로 가중(회색의 색상은 의미 없음)
    hue_w = [(h, n * s) for (h, s, _v), n in hsv if s > 0]
    hue, r = _circular(hue_w)
    out["dominant_hue"] = None if hue is None else round(hue, 6)
    out["hue_concentration"] = round(r, 6)
    out["median_saturation"] = round(
        _weighted_median([(s, n) for (_h, s, _v), n in hsv]), 6)
    out["median_value"] = round(
        _weighted_median([(v, n) for (_h, _s, v), n in hsv]), 6)
    out["stroke_thickness"] = _stroke_thickness(path)
    return out


def _stroke_thickness(path: str):
    """2 × 불투명 면적 / 윤곽 길이. 알파가 없으면 None(잴 수 없다)."""
    from PIL import Image

    with Image.open(path) as img:
        rgba = img.convert("RGBA")
    w, h = rgba.size
    alpha = rgba.getchannel("A").load()
    area = 0
    border = 0
    for y in range(h):
        for x in range(w):
            if alpha[x, y] == 0:
                continue
            area += 1
            if (x == 0 or y == 0 or x == w - 1 or y == h - 1
                    or alpha[x - 1, y] == 0 or alpha[x + 1, y] == 0
                    or alpha[x, y - 1] == 0 or alpha[x, y + 1] == 0):
                border += 1
    if area == 0 or border == 0 or area == w * h:
        return None                     # 꽉 찬 그림엔 '획'이 없다
    return round(2 * area / border, 6)


def _hue_distance(a: float, b: float) -> float:
    d = abs(a - b) % 1.0
    return min(d, 1.0 - d) * 2          # 0~1로 정규화(최대 반바퀴)


def measure_set(paths: list, value_tolerance: float | None = None,
                saturation_tolerance: float | None = None) -> dict:
    """세트 전체를 잰다. tolerance는 **동결된 스펙에서 온 값**이며, 없으면
    이탈 비율을 내지 않는다(None → 심판은 undefined)."""
    assets = [measure_asset(p) for p in paths]
    ok = [a for a in assets if a["error"] is None]
    out = {"assets": assets, "n": len(assets), "n_measured": len(ok),
           "eligible": len(ok) >= MIN_SET_N, "min_set_n": MIN_SET_N,
           "hue_dispersion": None, "value_median": None,
           "saturation_median": None, "value_outside_ratio": None,
           "saturation_outside_ratio": None,
           "thickness_cv": None, "outlier_ranking": [],
           "value_tolerance": value_tolerance,
           "saturation_tolerance": saturation_tolerance,
           "errors": [a["path"] for a in assets if a["error"]]}
    if not out["eligible"]:             # E6 — 표본 미달이면 정렬 지표를 안 낸다
        out["ineligible_reason"] = (
            f'세트 표본 {len(ok)}개 < {MIN_SET_N} (초안 §5 E6) - 판정하지 않는다')
        return out

    hues = [(a["dominant_hue"], 1.0) for a in ok if a["dominant_hue"] is not None]
    _mean_hue, r = _circular(hues)
    out["hue_dispersion"] = round(1 - r, 6) if hues else None

    vals = [a["median_value"] for a in ok]
    sats = [a["median_saturation"] for a in ok]
    out["value_median"] = _weighted_median([(v, 1.0) for v in vals])
    out["saturation_median"] = _weighted_median([(s, 1.0) for s in sats])
    if value_tolerance is not None:
        off = [v for v in vals if abs(v - out["value_median"]) > value_tolerance]
        out["value_outside_ratio"] = round(len(off) / len(vals), 6)
    if saturation_tolerance is not None:
        off = [s for s in sats
               if abs(s - out["saturation_median"]) > saturation_tolerance]
        out["saturation_outside_ratio"] = round(len(off) / len(sats), 6)

    th = [a["stroke_thickness"] for a in ok if a["stroke_thickness"] is not None]
    if len(th) >= 2:
        mean = sum(th) / len(th)
        var = sum((t - mean) ** 2 for t in th) / len(th)
        out["thickness_cv"] = round(math.sqrt(var) / mean, 6) if mean else None
        out["thickness_mean"] = round(mean, 6)

    out["outlier_ranking"] = _rank_outliers(ok, out)
    return out


def _rank_outliers(ok: list, agg: dict) -> list:
    """특징 거리 순위. **임베딩 대용**이며 격리 후보를 고르는 용도(탈락 아님)."""
    hue_c = [a["dominant_hue"] for a in ok if a["dominant_hue"] is not None]
    center_hue, _r = _circular([(h, 1.0) for h in hue_c]) if hue_c else (None, 0)
    rows = []
    for a in ok:
        parts = [abs(a["median_value"] - agg["value_median"]),
                 abs(a["median_saturation"] - agg["saturation_median"])]
        if center_hue is not None and a["dominant_hue"] is not None:
            parts.append(_hue_distance(a["dominant_hue"], center_hue))
        rows.append({"path": a["path"],
                     "distance": round(math.sqrt(sum(p * p for p in parts)), 6)})
    return sorted(rows, key=lambda r: -r["distance"])
