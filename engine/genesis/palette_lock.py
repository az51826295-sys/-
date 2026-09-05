"""마스터 팔레트 — 일관성을 **생성 이후에** 강제한다.

2026-08-27 사장님: *"일관성은 가장 중요한 거야."*

**왜 생성기에게 맡기지 않나.** PixelLab의 `color_image` 는 명세에도 "weakly
guiding"이라 적혀 있다. 부탁이지 강제가 아니다. 그리고 오늘 실측이 보여준 것은
같은 주문이 회차마다 크게 흔들린다는 것이다 — 확률적인 것에 부탁해서 결정적인
결과를 얻을 수는 없다.

**그러면 우리가 한다.** 팔레트를 정하고, 나온 그림을 전부 그 팔레트로 옮긴다.
공짜고, 결정적이고, 생성기가 무엇이든·어느 회차든 상관없다. 이미 가진 자산에도
소급 적용된다.

**할 수 있는 것과 없는 것을 분명히 한다.**

  색 일관성      팔레트 잠금으로 **완전히** 해결된다. 거리가 0이 된다.
  밝기·채도      같이 해결된다(팔레트가 곧 밝기·채도 분포다).
  모양·밀도      **해결 안 된다.** 6색 실루엣은 팔레트를 바꿔도 실루엣이다.
                 그건 다시 뽑아서 고르는 수밖에 없다.

세 번째를 감추지 않는다. 팔레트만 맞춰 놓고 "일관성 해결"이라 말하면 거짓이다.
"""
from __future__ import annotations

import math

from PIL import Image

_R, _G, _B = 0.299, 0.587, 0.114


def _pixels(path: str) -> list:
    img = Image.open(path).convert("RGBA")
    return [p[:3] for p in img.get_flattened_data() if p[3] > 0]


def _counts(paths: list) -> dict:
    out: dict = {}
    for p in paths:
        for c in _pixels(p):
            out[c] = out.get(c, 0) + 1
    return out


def _median_cut(counts: dict, n: int) -> list:
    """빈도 가중 median cut. **많이 쓰인 색이 살아남는다.**

    이게 중요한 이유: UI 아이콘 8장이 순백 단색인데, 그건 화면의 아주 작은 부분이다.
    빈도로 가중하면 흰색은 자연히 밀려나고, 아이콘은 살아남은 색 중 가장 가까운
    것으로 옮겨 간다 - 즉 게임의 색 세계 안으로 들어온다. 색마다 한 표씩 주면
    반대로 아이콘이 팔레트를 차지한다.
    """
    boxes = [list(counts.items())]
    while len(boxes) < n:
        # 가장 넓은(가중 화소가 많고 색 범위가 큰) 상자를 쪼갠다
        target, axis, span = None, 0, -1
        for i, box in enumerate(boxes):
            if len(box) < 2:
                continue
            for ax in range(3):
                vals = [c[ax] for c, _ in box]
                s = (max(vals) - min(vals)) * math.log(
                    1 + sum(w for _, w in box))
                if s > span:
                    target, axis, span = i, ax, s
        if target is None:
            break
        box = sorted(boxes[target], key=lambda cw: cw[0][axis])
        half = sum(w for _, w in box) / 2
        acc, cut = 0, 1
        for j, (_, w) in enumerate(box):
            acc += w
            if acc >= half:
                cut = max(1, min(j, len(box) - 1))
                break
        boxes[target:target + 1] = [box[:cut], box[cut:]]
    out = []
    for box in boxes:
        total = sum(w for _, w in box) or 1
        out.append(tuple(round(sum(c[ax] * w for c, w in box) / total)
                         for ax in range(3)))
    return sorted(set(out))


def build_master(paths: list, n: int = 32) -> list:
    """자산들에서 마스터 팔레트 후보를 뽑는다. **사장님이 승인하거나 갈아치운다.**"""
    return _median_cut(_counts(paths), n)


def _nearest(c, palette) -> tuple:
    return min(palette, key=lambda p: (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2
               + (c[2] - p[2]) ** 2)


def lock(path: str, palette: list, out: str | None = None) -> dict:
    """이 그림을 팔레트로 옮긴다. 알파는 건드리지 않는다(픽셀 아트는 이진 알파)."""
    img = Image.open(path).convert("RGBA")
    px = img.load()
    w, h = img.size
    cache: dict = {}
    moved = 0
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] == 0:
                continue
            c = p[:3]
            if c not in cache:
                cache[c] = _nearest(c, palette)
            if cache[c] != c:
                moved += 1
            px[x, y] = cache[c] + (p[3],)
    if out:
        img.save(out)
    return {"path": path, "out": out, "moved": moved,
            "colors_before": len(cache),
            "colors_after": len({v for v in cache.values()})}
