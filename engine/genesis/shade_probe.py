"""음영 계측 — "그림자가 들어갔나"를 기계가 잰다.

`docs/shading-param-v0-design.md` §2에서 **그림 보기 전에** 정한 세 측정이다.
예쁨을 재지 않는다. 예쁨은 사람 게이트다(2026-08-27 확정).

  colors      색 수. 음영은 중간톤을 요구하므로 색이 는다.
  luma_steps  타일 안에서 서로 다른 밝기 값의 개수.
  luma_range  가장 밝은 픽셀과 가장 어두운 픽셀의 밝기 차(0~255).
"""
from __future__ import annotations

import statistics

from PIL import Image

# Rec.601 휘도. 사람이 느끼는 밝기에 가깝다.
_R, _G, _B = 0.299, 0.587, 0.114


def _luma(px) -> float:
    return _R * px[0] + _G * px[1] + _B * px[2]


def shade(path: str) -> dict:
    """한 장을 잰다. 완전 투명 픽셀은 그림이 아니므로 뺀다."""
    img = Image.open(path).convert("RGBA")
    opaque = [p for p in img.get_flattened_data() if p[3] > 0]
    if not opaque:
        return {"path": path, "error": "불투명 픽셀이 없다"}
    lumas = [round(_luma(p)) for p in opaque]
    return {"path": path,
            "colors": len({p[:3] for p in opaque}),
            "luma_steps": len(set(lumas)),
            "luma_range": max(lumas) - min(lumas),
            "pixels": len(opaque)}


def shade_set(paths: list) -> dict:
    """세트 전체. 낱장 값의 **중앙값**으로 대표한다 - 한 장이 튀어도 안 흔들린다."""
    rows = [shade(p) for p in paths]
    good = [r for r in rows if "error" not in r]
    if not good:
        return {"n": 0, "error": "잴 수 있는 장이 없다", "rows": rows}
    out = {"n": len(good)}
    for k in ("colors", "luma_steps", "luma_range"):
        vals = [r[k] for r in good]
        out[k] = round(statistics.median(vals), 2)
        out[k + "_min"] = min(vals)
        out[k + "_max"] = max(vals)
    out["rows"] = rows
    return out


def compare(a_paths: list, b_paths: list) -> dict:
    """A/B 판정. **판정식은 설계 문서에서 왔고 여기서 바꾸지 않는다.**

    shading_helps      B가 세 측정 전부에서 A보다 크다
    shading_no_effect  B가 세 측정 전부에서 A와 같거나 작다
    undefined          섞여 나왔다 (그 사실을 그대로 적는다)
    """
    a, b = shade_set(a_paths), shade_set(b_paths)
    keys = ("colors", "luma_steps", "luma_range")
    if a.get("n", 0) == 0 or b.get("n", 0) == 0:
        return {"verdict": "undefined", "why": "한쪽을 못 쟀다", "a": a, "b": b}
    bigger = {k: b[k] > a[k] for k in keys}
    if all(bigger.values()):
        verdict = "shading_helps"
    elif not any(bigger.values()):
        verdict = "shading_no_effect"
    else:
        verdict = "undefined"
    return {"verdict": verdict,
            "design": "docs/shading-param-v0-design.md",
            "measures": {k: {"a": a[k], "b": b[k], "b_bigger": bigger[k]}
                         for k in keys},
            "a": {k: a[k] for k in keys} | {"n": a["n"]},
            "b": {k: b[k] for k in keys} | {"n": b["n"]}}
