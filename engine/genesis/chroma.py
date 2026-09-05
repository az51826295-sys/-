"""크로마키 분해 — 단색 배경 위에 뽑은 소품을 잘라내 투명 스프라이트로 만든다.

  from genesis import chroma
  res = chroma.key_out("tree.png", strength=0.25)

**왜 이렇게 하나** (2026-08-27 사장님 지시):

  "나무 뽑을 땐 나무 옆에는 찐한 녹색 크로마키해서 니가 분해해서 넣어야지"

생성기의 `no_background` 를 믿는 대신, **배경을 단색으로 주문하고 우리가 자른다.**
그러면 어디까지가 그림이고 어디부터가 배경인지 우리가 판정하게 되고, 실패하면
그 사실이 숫자로 남는다.

**이 도구의 이빨.** 초록 나무를 초록 배경에서 자르는 것은 위험하다 — 강도를
올리면 잎이 같이 지워진다. 그래서 이 도구는 자르기 전에 **키 색과 그림 색 사이의
최소 거리**를 재고, 강도가 그 거리를 넘으면 **자르지 않고 거부한다.** 사람이
눈으로 확인하기 전에 잎이 사라지는 일을 막는다.

강도(strength)는 0~1이다. 키 색에서 그 비율만큼 떨어진 색까지 배경으로 친다
(1.0 = RGB 공간의 최대 거리 = 전부 배경). 픽셀 아트라 **알파는 0 아니면 255**다
(반투명 없음) — `pixel-sprite-v2` 의 `alpha_binary` 를 태생부터 지킨다.
"""
from __future__ import annotations

import math
import os

from PIL import Image

# RGB 정육면체의 대각선. 거리를 0~1로 정규화하는 데 쓴다.
_MAX_DIST = math.sqrt(3 * 255 ** 2)


def _dist(a: tuple, b: tuple) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a[:3], b[:3])))


def border_color(img: Image.Image) -> tuple:
    """테두리에서 가장 흔한 색 = 배경으로 추정한다.

    소품은 가운데 있고 배경이 가장자리를 두른다는 사실만 쓴다. 이게 틀리면
    (예: 그림이 가장자리까지 닿으면) 아래 거리 검사가 걸러낸다.
    """
    w, h = img.size
    px = img.load()
    counts: dict = {}
    for x in range(w):
        for y in (0, h - 1):
            counts[px[x, y][:3]] = counts.get(px[x, y][:3], 0) + 1
    for y in range(h):
        for x in (0, w - 1):
            counts[px[x, y][:3]] = counts.get(px[x, y][:3], 0) + 1
    return max(counts.items(), key=lambda kv: kv[1])[0]


def safe_strength(path: str, key: tuple | None = None) -> dict:
    """이 그림에서 **강도를 얼마까지 올려도 안전한가**를 잰다.

    키 색에서 가장 가까운 '그림 색'까지의 거리가 천장이다. 그 절반을 권장값으로
    삼는다 - 절반이면 배경 잡티는 지우면서 그림 색은 확실히 남는다.
    """
    img = Image.open(path).convert("RGBA")
    k = tuple(key) if key else border_color(img)
    colors = img.convert("RGB").getcolors(maxcolors=1 << 20) or []
    total = sum(n for n, _ in colors)
    # 배경으로 볼 수 없는 색 = 키와 다른 색. 그중 키에 가장 가까운 것.
    others = [(_dist(k, c), c, n) for n, c in colors if c != k]
    if not others:
        return {"key": list(k), "ceiling": None, "recommended": None,
                "why": "그림에 키 색 말고 다른 색이 없다(전부 배경)"}
    others.sort()
    ceiling = others[0][0] / _MAX_DIST
    return {"key": list(k), "ceiling": round(ceiling, 4),
            "recommended": round(ceiling / 2, 4),
            "nearest_art_color": list(others[0][1]),
            "key_share": round(sum(n for n, c in colors if c == k) / total, 4)}


def despill(path: str, out: str | None = None, key: tuple | None = None,
            tolerance: float = 0.22, spill: float = 0.55) -> dict:
    """**가장자리가 흐린 그림**(GPT 이미지 등)에서 배경을 뗀다.

    `key_out` 은 가장자리가 딱 떨어지는 픽셀아트를 전제한다 - 키 색에서 가장
    가까운 '그림 색'까지를 천장으로 잡는데, 흐린 그림에서는 키와 그림이 섞인
    중간 화소들이 전부 '그림 색'으로 잡혀 **천장이 0으로 무너진다.**

    2026-08-27에 실제로 그랬다: GPT풍 입력(512px·12,050색·흐린 가장자리)에서
    안전강도가 0.0011로 계산돼 **순수 마젠타만 지워지고 헤일로가 남았다.**
    규격 검사(크기·색 수·알파)는 통과했는데 화면에 올리니 경계 대비 14로
    떨어졌다 - 배경색이 테두리를 두르고 있었으니 당연하다.

    여기서는 다르게 한다. **키 색과의 거리만** 본다(그림 색을 참조하지 않는다).

      거리 <= tolerance         배경. 지운다.
      tolerance < 거리 <= spill 흘러든 자국. 남기되 **키 성분을 빼서** 되돌린다.
      거리 > spill              그림. 그대로 둔다.

    `tolerance` 를 사람이 준다. 자동 계산하지 않는다 - 흐린 그림에서는 자동이
    바로 위 사고를 낸다. 기본값은 마젠타 키에서 경험적으로 잡은 값이다.
    """
    img = Image.open(path).convert("RGBA")
    k = tuple(key) if key else border_color(img)
    px = img.load()
    w, h = img.size
    lim, spill_lim = tolerance * _MAX_DIST, spill * _MAX_DIST
    cut = fixed = 0
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] == 0:
                cut += 1
                continue
            d = _dist(k, p)
            if d <= lim:
                px[x, y] = (0, 0, 0, 0)
                cut += 1
            elif d <= spill_lim:
                # 키 쪽으로 끌려간 채널을 나머지 채널의 평균으로 눌러 되돌린다.
                # 마젠타(R,B 높음·G 낮음)면 R·B가 G 근처로 내려온다.
                lo = min(p[:3])
                fixed_px = tuple(min(v, lo + (max(p[:3]) - lo) // 2)
                                 if k[i] > 127 else v
                                 for i, v in enumerate(p[:3]))
                px[x, y] = fixed_px + (255,)
                fixed += 1
            elif p[3] != 255:
                px[x, y] = p[:3] + (255,)
    if out:
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        img.save(out)
    total = w * h
    return {"ok": True, "mode": "despill", "out": out, "key": list(k),
            "tolerance": tolerance, "spill": spill,
            "cut": cut, "despilled": fixed, "kept": total - cut,
            "cut_ratio": round(cut / total, 4), "size": [w, h], "image": img}


def key_out(path: str, out: str | None = None, key: tuple | None = None,
            strength: float | None = None, force: bool = False) -> dict:
    """배경을 잘라 투명하게 만든다. 강도가 위험하면 **자르지 않고 거부한다.**

    **가장자리가 딱 떨어지는 그림 전용이다.** 흐린 그림(GPT 이미지 등)에는
    `despill()` 을 쓴다 - 이유는 그 함수의 설명에 있다.
    """
    img = Image.open(path).convert("RGBA")
    info = safe_strength(path, key)
    k = tuple(info["key"])
    if info["ceiling"] is None:
        return {"ok": False, "why": info["why"], **info}
    s = info["recommended"] if strength is None else float(strength)
    if not force and s >= info["ceiling"]:
        return {"ok": False, "strength": s, **info,
                "why": (f"강도 {s}가 천장 {info['ceiling']}에 닿는다 - "
                        f"그림 색 {info['nearest_art_color']}까지 지워진다. "
                        "키 색을 그림과 먼 색으로 바꾸거나 강도를 낮춰라")}
    limit = s * _MAX_DIST
    px = img.load()
    w, h = img.size
    cut = 0
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] == 0:
                cut += 1
                continue
            # 픽셀 아트다 - 반투명을 만들지 않는다(alpha_binary).
            if _dist(k, p) <= limit:
                px[x, y] = (0, 0, 0, 0)
                cut += 1
            elif p[3] != 255:
                px[x, y] = (p[0], p[1], p[2], 255)
    if out:
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        img.save(out)
    total = w * h
    return {"ok": True, "out": out, "strength": round(s, 4), **info,
            "cut": cut, "kept": total - cut,
            "cut_ratio": round(cut / total, 4),
            "size": [w, h], "image": img}
