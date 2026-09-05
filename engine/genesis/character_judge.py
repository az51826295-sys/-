"""캐릭터 심판 — 뽑은 것 중 무엇을 사장님께 보여드릴지 기계가 먼저 거른다.

2026-08-27. 사장님이 정한 목표는 **일관성**이고, 오늘 확인한 사실은 같은 설정이
다른 결과를 낸다는 것이다. 그러면 답은 하나다: **여러 명 뽑아서 고른다.**
이 자는 그 앞단이다 - 사람이 보기 전에 명백히 못 쓸 것을 걸러낸다.

**기준은 사장님이 주신 참고 화면 실측에서 왔다.** 내가 지어낸 수가 아니다.

  밝기폭 ≥ 120    참고 화면 172. 오늘 내 파스텔은 36이었고 그림이 죽었다.
                  "파스텔"을 저대비로 잘못 읽은 것이 오늘의 가장 큰 실수다.
  색 수  ≥ 16     hero가 10.5색이라 실루엣처럼 보였다. merchant는 21이었다.
  바닥 대비 ≥ 60  참고 캐릭터는 바닥보다 99 어둡다. 우리 hero는 38뿐이라
                  땅에 묻힌다. 캐릭터가 어두운 것은 결함이 아니라 의도다.
  방향 일관성     4~8방향이 같은 인물로 보이나. 색 수가 방향마다 크게 다르면
                  같은 사람이 아니다.

**이 자는 고르지 않는다.** 거르기만 한다. 마지막 칸은 사람이 고른다
(2026-08-26 규율). 통과한 것이 여럿이면 전부 보여드린다.
"""
from __future__ import annotations

import statistics

from PIL import Image

MIN_LUMA_SPREAD = 120        # 참고 172
MIN_COLORS = 16              # hero 10.5(약함) / merchant 21(괜찮음)
MIN_GROUND_CONTRAST = 60     # 참고 99 / 우리 hero 38
MIN_SATURATION = 25          # 참고 캐릭터 30 / hero 33 / merchant 36
# **왜 나중에 붙었나.** 마녀 A가 채도 3(거의 흑백)인데 이 심판이 PASS를 줬다.
# 채도 축이 아예 없었기 때문이다. 이건 결과를 보고 문턱을 옮긴 것이 아니라
# **빠져 있던 축을 같은 근거(참고 화면 실측)로 채운 것**이다. 그 구분은 흐리지
# 않는다 - 문턱을 옮기는 것은 규율 위반이고, 없던 축을 만드는 것은 계측기 보수다.
MAX_COLOR_SPREAD = 0.5       # 방향 간 색 수 차이 허용 비율

# **대비는 목표 바닥에 대고 잰다, 지금 바닥이 아니라.**
# 지금 우리 땅은 밝기 87이고 참고 화면은 169다. 지금 바닥에 대고 재면 캐릭터가
# "땅에 묻힌다"고 떨어지는데, 실제 원인은 **땅이 어두운 것**이다. 캐릭터를 땅의
# 결함으로 벌하면 안 된다. 우리가 만들려는 세계의 바닥 밝기를 기준으로 삼는다.
TARGET_GROUND_LUMA = 169     # 사장님 참고 화면 실측

_R, _G, _B = 0.299, 0.587, 0.114


def _luma(c) -> float:
    return _R * c[0] + _G * c[1] + _B * c[2]


def _sat(c) -> float:
    return max(c) - min(c)


def _opaque(path: str) -> list:
    img = Image.open(path).convert("RGBA")
    return [p[:3] for p in img.get_flattened_data() if p[3] > 0]


def measure(paths: list, ground_luma: float | None = None) -> dict:
    """방향 여러 장을 한 인물로 본다. 낱장이 아니라 **세트**가 판정 단위다."""
    per = []
    for p in paths:
        px = _opaque(p)
        if not px:
            continue
        lum = sorted(_luma(c) for c in px)
        lo, hi = lum[int(len(lum) * .05)], lum[int(len(lum) * .95)]
        per.append({"path": p, "colors": len(set(px)),
                    "saturation": round(statistics.median(
                        [_sat(c) for c in px]), 1),
                    "luma_spread": round(hi - lo, 1),
                    "luma_median": round(statistics.median(lum), 1),
                    "pixels": len(px)})
    if not per:
        return {"error": "불투명 화소가 없다", "n": 0}
    cols = [d["colors"] for d in per]
    out = {"n": len(per),
           "colors": round(statistics.median(cols), 1),
           "colors_min": min(cols), "colors_max": max(cols),
           "color_spread": round((max(cols) - min(cols)) / max(cols, default=1), 3),
           "luma_spread": round(statistics.median(
               [d["luma_spread"] for d in per]), 1),
           "luma_median": round(statistics.median(
               [d["luma_median"] for d in per]), 1),
           "saturation": round(statistics.median(
               [d["saturation"] for d in per]), 1),
           "per_direction": per}
    if ground_luma is not None:
        out["ground_contrast"] = round(abs(out["luma_median"] - ground_luma), 1)
    return out


def judge(paths: list, ground_luma: float | None = TARGET_GROUND_LUMA) -> dict:
    """3값이다. 못 잰 것은 fail이 아니라 undefined다.

    `ground_luma` 는 기본이 **목표 바닥**(169)이다. 지금 우리 바닥(87)에 대고
    재고 싶으면 명시적으로 넘긴다 - 그건 "지금 화면에서 읽히나"라는 다른 물음이다.
    """
    m = measure(paths, ground_luma)
    if m.get("n", 0) == 0:
        return {"verdict": "UNDEFINED", "why": [m.get("error", "잴 수 없다")], **m}
    fail, undef = [], []
    if m["luma_spread"] < MIN_LUMA_SPREAD:
        fail.append(f"명암폭 {m['luma_spread']} < {MIN_LUMA_SPREAD} "
                    f"(참고 화면 172) — 밋밋해서 형태가 안 읽힌다")
    if m["colors"] < MIN_COLORS:
        fail.append(f"색 {m['colors']} < {MIN_COLORS} — 실루엣에 가깝다")
    if m["saturation"] < MIN_SATURATION:
        fail.append(f"채도 {m['saturation']} < {MIN_SATURATION} "
                    f"(참고 캐릭터 30) — 흑백에 가까워 세계에서 뜬다")
    if m["color_spread"] > MAX_COLOR_SPREAD:
        fail.append(f"방향 간 색 수 차이 {m['color_spread']} > {MAX_COLOR_SPREAD} "
                    f"({m['colors_min']}~{m['colors_max']}) — 같은 인물로 안 보인다")
    if ground_luma is None:
        undef.append("바닥 밝기를 안 줘서 대비를 못 쟀다")
    elif m["ground_contrast"] < MIN_GROUND_CONTRAST:
        fail.append(f"바닥 대비 {m['ground_contrast']} < {MIN_GROUND_CONTRAST} "
                    f"(참고 99) — 땅에 묻힌다")
    verdict = "FAIL" if fail else ("UNDEFINED" if undef else "PASS")
    return {"verdict": verdict, "fail": fail, "undefined": undef,
            "thresholds": {"luma_spread": MIN_LUMA_SPREAD, "colors": MIN_COLORS,
                           "ground_contrast": MIN_GROUND_CONTRAST,
                           "color_spread": MAX_COLOR_SPREAD,
                           "saturation": MIN_SATURATION},
            "basis": "사장님 참고 화면 실측 (밝기폭 172 · 캐릭터-바닥 대비 99)",
            **{k: v for k, v in m.items() if k != "per_direction"}}
