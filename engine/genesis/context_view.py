"""화면 안에서 본다 — 자산을 **실제 게임 바닥 위에 1:1 크기로** 올려 판정한다.

2026-08-27, 사장님이 "도트 게임 디자이너라면 뭐부터 하겠냐"고 물으셨을 때 나온 것.
그날 나는 자산을 **회색 배경에 8배 확대해서** 보여드렸다. 아무도 게임을 그렇게 안
한다. 따로 보면 괜찮은데 같이 놓으면 엉망인 것이 픽셀 아트 실패의 대부분이다.

**여기서 재는 것은 '읽히나' 하나다.**

  edge_contrast   스프라이트 바깥 테두리 화소와 **바로 뒤 바닥** 사이의 밝기 차.
                  이게 낮으면 캐릭터가 땅에 묻힌다. 전체 평균 대비가 아니라
                  **경계에서** 재야 한다 - 사람 눈이 형태를 읽는 곳이 거기다.
  ground_luma     실제로 뒤에 깔린 바닥의 밝기(추정이 아니라 실측).
  silhouette      불투명 화소 비율. 너무 작으면 화면에서 안 보인다.

바닥 이미지는 **게임에서 실제로 렌더한 것**을 쓴다. 내가 그린 대용품이 아니다.
"""
from __future__ import annotations

import os
import statistics

from PIL import Image

_R, _G, _B = 0.299, 0.587, 0.114


def _luma(c) -> float:
    return _R * c[0] + _G * c[1] + _B * c[2]


def place(sprite: str, ground: str, at: tuple | None = None,
          scale: int = 1, out: str | None = None) -> dict:
    """스프라이트를 바닥 위에 **1:1로** 올린다. `scale` 은 보여줄 때만 쓴다.

    판정은 언제나 1:1에서 한다 - 확대해서 보면 안 보이던 문제가 계속 안 보인다.
    """
    bg = Image.open(ground).convert("RGBA")
    sp = Image.open(sprite).convert("RGBA")
    if at is None:
        at = ((bg.width - sp.width) // 2, (bg.height - sp.height) // 2)
    comp = bg.copy()
    comp.alpha_composite(sp, at)

    # 경계 대비: 스프라이트의 바깥 테두리 화소 vs 바로 뒤 바닥
    spx, bpx = sp.load(), bg.load()
    edge_pairs = []
    body = 0
    for y in range(sp.height):
        for x in range(sp.width):
            if spx[x, y][3] == 0:
                continue
            body += 1
            neighbours = ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
            outside = any(not (0 <= nx < sp.width and 0 <= ny < sp.height)
                          or spx[nx, ny][3] == 0 for nx, ny in neighbours)
            if not outside:
                continue
            gx, gy = at[0] + x, at[1] + y
            if 0 <= gx < bg.width and 0 <= gy < bg.height:
                edge_pairs.append((_luma(spx[x, y]), _luma(bpx[gx, gy])))
    res = {"sprite": sprite, "ground": ground, "at": list(at),
           "body_pixels": body,
           "silhouette_ratio": round(body / (sp.width * sp.height), 3),
           "edge_samples": len(edge_pairs)}
    if edge_pairs:
        diffs = [abs(a - b) for a, b in edge_pairs]
        res["edge_contrast"] = round(statistics.median(diffs), 1)
        res["edge_contrast_low_decile"] = round(sorted(diffs)[len(diffs) // 10], 1)
        res["ground_luma"] = round(statistics.median(
            [b for _, b in edge_pairs]), 1)
    if out:
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        (comp if scale == 1 else
         comp.resize((comp.width * scale, comp.height * scale),
                     Image.NEAREST)).save(out)
        res["out"] = out
    return res


MIN_EDGE_CONTRAST = 40      # 경계에서 이보다 안 차이나면 형태가 안 읽힌다
MIN_SILHOUETTE = 0.10       # 캔버스의 10% 미만이면 화면에서 안 보인다


def judge_in_context(sprites: list, ground: str) -> dict:
    """방향 여러 장을 **같은 바닥 위에서** 본다. 3값이다."""
    rows = [place(s, ground) for s in sprites]
    have = [r for r in rows if "edge_contrast" in r]
    if not have:
        return {"verdict": "UNDEFINED",
                "undefined": ["경계 화소를 못 찾았다(투명하거나 꽉 찼다)"],
                "n": len(rows)}
    ec = round(statistics.median([r["edge_contrast"] for r in have]), 1)
    sil = round(statistics.median([r["silhouette_ratio"] for r in have]), 3)
    fail = []
    if ec < MIN_EDGE_CONTRAST:
        fail.append(f"경계 대비 {ec} < {MIN_EDGE_CONTRAST} — 바닥에 묻혀 형태가 "
                    f"안 읽힌다 (바닥 밝기 {have[0].get('ground_luma')})")
    if sil < MIN_SILHOUETTE:
        fail.append(f"실루엣 비율 {sil} < {MIN_SILHOUETTE} — 화면에서 너무 작다")
    return {"verdict": "FAIL" if fail else "PASS", "fail": fail,
            "edge_contrast": ec, "silhouette_ratio": sil,
            "ground_luma": have[0].get("ground_luma"), "n": len(have),
            "basis": "게임에서 실제로 렌더한 바닥 위, 1:1 크기"}
