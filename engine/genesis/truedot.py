"""가짜 도트를 진짜 도트로 — **격자를 찾아서 눌러 앉힌다**.

2026-11-10 사장님: *"오늘부터 하나의 기술만 할 거야. 가짜 도트를 진짜 도트로 만드는 기술."*

## 가짜 도트란 무엇인가 (세 가지가 같이 틀어져 있다)

1. **칸 크기가 정수가 아니다** — 1024 를 피드 폭 390 에 맞추느라 2.6배로 줄이면
   한 칸이 2.6화소가 된다. 눈에는 도트인데 자로 재면 격자가 없다.
2. **위상이 어긋나 있다** — 칸 크기는 맞는데 격자가 3화소 밀려 있으면 칸마다
   이웃 색이 한 줄씩 섞인다.
3. **칸 안에 색이 여럿이다** — 안티에일리어싱. 도트 한 칸이 한 색이 아니면
   그건 도트 그림이 아니라 도트처럼 생긴 그림이다.

## 이 모듈이 하는 일

`texel_judge` 가 **이미 격자를 찾는다**(주기 + 위상, `trace`). 자가 보던 것을
**고치는 쪽으로** 돌린 것이 전부다. 새로 지어낸 것은 하나도 없다:

    1. 격자 찾기   texel s 와 위상 (ox, oy)      ← texel_judge._period
    2. 칸마다 한 색  **최빈색**(평균이 아니다)     ← 평균을 내면 없던 중간색이 생긴다
    3. 색 줄이기   가까운 색끼리 묶는다            ← 선택(`colors`)
    4. 되돌리기    논리 그림, 또는 정수배로 키운 것

**평균이 아니라 최빈색**인 것이 핵심이다. 평균은 "경계가 섞인 칸"에서 양쪽 어디에도
없던 색을 만들어 낸다 — 그 색이 팔레트를 부풀리고, 두 번 돌리면 또 번진다.
최빈색은 **있던 색 중 하나**를 고르므로 팔레트가 자란 적이 없다.

## 못 하는 것 — 알고 있다

- **격자가 아예 뭉개진 그림**(바이큐빅으로 늘린 것)은 찾을 격자가 없다.
  `texel_judge` 가 "격자 없음" 이라 적는 그 칸이다. 그때는 `want` 로 사람이 줘야 한다.
- **원래 도트가 아니던 그림**(사진·일러스트)을 도트로 만드는 것은 이 모듈이 아니다.
  그건 "격자를 찾는" 일이 아니라 "격자를 정하는" 일이다 — `want` 를 주면 같은 길로 간다.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
from PIL import Image

import texel_judge as T


def _comb(edge: np.ndarray, p: float, phase: float) -> float:
    """격자 빗(comb)이 경계를 얼마나 잡아내나 — 0~1.

    격자선은 `phase + k·p` 에 선다(p 가 **소수점이어도** 된다). 경계 하나가 격자선에서
    0.5화소 안에 있으면 잡힌 것으로 센다.
    """
    pos = np.arange(len(edge), dtype=float) + 1.0
    d = np.abs((pos - phase) / p - np.round((pos - phase) / p)) * p
    hit = edge[d <= 0.5].sum()
    return float(hit) / float(edge.sum())


def _fractional(edge: np.ndarray, lo: float, hi: float) -> tuple[float, float, float]:
    """**소수점 칸 크기**를 찾는다 — (p, phase, 점수).

    이것이 11-10 에 새로 한 일이다. 정수 격자만 찾던 때는 1.7배로 늘린 그림의 진짜 칸이
    6.8화소인데 7 로 집었고, 칸이 조금씩 밀려 **그림 자체가 달라졌다**(자는 격자만 보고
    "고쳤다"고 했다). 빗을 소수점으로 훑으면 6.8 을 6.8 로 집는다.

    **고르는 규칙이 중요하다.** 처음엔 `잡힌비율 × p` 가 제일 큰 것을 집었는데, 그러면
    진짜 주기(6.8)와 그 **두 배**(13.6)가 같은 점수를 낸다 — 두 배는 절반만 잡지만 p 가 두 배라
    곱이 같다. 실제로 13.6 을 집어 논리 해상도가 반이 됐고, 복원율이 57~70% 에 머물렀다.

    진짜 주기는 **잡힌 비율이 거의 1**이다(모든 경계가 격자선에 앉는다). 그 아래 배수들
    (p/2, p/3)도 비율 1 이지만 더 촘촘하다. 그래서 **비율이 문턱을 넘는 것 중 제일 큰 p**
    를 집는다 — `texel_judge` 가 정수 격자에서 쓰는 규칙(`clean`)과 같다.

    **씨앗을 믿지 않는다.** 처음엔 정수 자(trace)가 준 값 둘레 ±1.6 만 훑었는데, 그 값이
    6.8 의 다섯 배인 34 였다 — 좁은 창 안에서는 34 가 제일 큰 값이라 그대로 집혔다.
    창을 씌우면 **창 밖에 있는 정답은 영영 안 보인다**. 전 구간을 훑되 거칠게 → 곱게 두 번 간다.
    """
    문턱 = 0.75

    def 훑기(ps, 위상나눔):
        좋은것 = (0.0, 0.0, 0.0)
        최고 = (0.0, 0.0, 0.0)
        for p in ps:
            p = float(p)
            if p < 1.5:
                continue
            r최고, ph최고 = 0.0, 0.0
            for ph in np.arange(0.0, p, max(0.02, p / 위상나눔)):
                r = _comb(edge, p, float(ph))
                if r > r최고:
                    r최고, ph최고 = r, float(ph)
            if r최고 * p > 최고[2]:
                최고 = (p, ph최고, r최고 * p)
            if r최고 >= 문턱 and p > 좋은것[0]:
                좋은것 = (p, ph최고, r최고)
        return 좋은것, 최고

    거친, 대비 = 훑기(np.arange(lo, hi, 0.1), 16)
    if not 거친[0]:
        return 대비
    고운, _ = 훑기(np.arange(max(1.5, 거친[0] - 0.2), 거친[0] + 0.2, 0.005), 60)
    return 고운 if 고운[0] else 거친


def _grid(a: np.ndarray, want: int | None) -> dict:
    """격자(칸 크기 s, 위상 ox/oy)를 찾는다. 못 찾으면 why 를 담아 돌려준다."""
    if want:
        return {"texel": int(want), "ox": 0, "oy": 0, "어떻게": f"주문받음({want})"}
    ex, ey = T._edge_counts(a)
    H, W = a.shape[:2]
    px = T._period(ex, min(T.MAX_TEXEL, W // 4))
    py = T._period(ey, min(T.MAX_TEXEL, H // 4))
    if px.get("why") or py.get("why"):
        return {"why": px.get("why") or py.get("why")}
    # 깨끗한 격자가 있으면 그걸, 없으면 흔적이 제일 센 격자를 쓴다.
    cx, cy = px["clean"], py["clean"]
    if cx["texel"] > 1 and cx["texel"] == cy["texel"]:
        return {"texel": cx["texel"], "ox": cx["offset"], "oy": cy["offset"], "어떻게": "깨끗한 격자"}
    """
    **소수점으로 다시 찾는다.** 정수 격자가 깨끗하지 않다는 것은 보통 "격자가 없다"가 아니라
    "칸이 6.8화소다" 라는 뜻이다. 전 구간(1.6 ~ 가로의 1/4, 최대 64)을 훑는다.
    """
    hi = float(min(T.MAX_TEXEL, W // 4, H // 4))
    pxF = _fractional(ex, 1.6, hi)
    pyF = _fractional(ey, 1.6, hi)
    잡힌비율 = min(pxF[2], pyF[2])
    칸 = (pxF[0] + pyF[0]) / 2
    """
    **못 찾은 것을 찾았다고 하지 않는다.** 바이큐빅으로 흐린 그림은 격자가 아예 없는데,
    빗은 `p=1.5` 같은 아주 작은 값에서 늘 높은 비율을 낸다(촘촘하면 뭐든 걸린다).
    그걸 "칸 1.5" 로 내보내면 **고쳤다는 거짓말**이 된다 — 칸이 2화소 미만이면 격자가 아니다.
    """
    if 칸 < 2.0:
        return {"why": f"격자가 없다 (제일 그럴듯한 칸이 {칸:.2f}화소 — 2 미만은 격자가 아니다)"}
    if 잡힌비율 < 0.6:
        return {"why": f"격자를 못 찾았다 (잡힌 비율 가로 {pxF[2]:.2f} · 세로 {pyF[2]:.2f})"}
    return {"texel": round((pxF[0] + pyF[0]) / 2, 3), "ox": pxF[1], "oy": pyF[1],
            "어떻게": f"소수점 격자 (가로 {pxF[0]:.2f} · 세로 {pyF[0]:.2f} · 잡힌 {잡힌비율:.2f})"}


def _mode_cells_f(a: np.ndarray, p: float, ox: float, oy: float) -> np.ndarray:
    """**소수점 칸**으로 자른다 — 칸마다 최빈색.

    칸 경계가 `ox + k·p` 라 화소 경계와 안 맞는다. 그래서 칸마다 `round` 로 잘라 쓰되,
    **가운데 절반**만 센다 — 가장자리 화소는 이웃 칸과 섞여 있는 화소라, 그걸 같이 세면
    경계색이 최빈색이 되는 칸이 생긴다.
    """
    H, W = a.shape[:2]
    nbx = int((W - ox) // p)
    nby = int((H - oy) // p)
    out = np.zeros((nby, nbx, 4), dtype=np.uint8)
    여유 = max(0.0, p * 0.25)
    for by in range(nby):
        y0 = int(round(oy + by * p + 여유))
        y1 = max(y0 + 1, int(round(oy + (by + 1) * p - 여유)))
        for bx in range(nbx):
            x0 = int(round(ox + bx * p + 여유))
            x1 = max(x0 + 1, int(round(ox + (bx + 1) * p - 여유)))
            flat = a[y0:y1, x0:x1].reshape(-1, 4)
            if not len(flat):
                continue
            solid = flat[flat[:, 3] >= 128]
            if len(solid) * 2 < len(flat):
                continue
            c = Counter(map(tuple, solid))
            out[by, bx] = np.array(c.most_common(1)[0][0], dtype=np.uint8)
    return out


def _mode_cells(a: np.ndarray, s: int, ox: int, oy: int) -> np.ndarray:
    """칸마다 **최빈색** 한 개. 논리 크기 그림(H', W', 4)을 돌려준다.

    평균이 아니라 최빈색인 까닭은 모듈 설명에 적었다. 완전히 투명한 화소는
    색이 아니라 **없음**으로 세고, 칸의 절반 넘게 비어 있으면 그 칸도 비운다 —
    실루엣 가장자리가 반투명으로 번지는 것이 제일 흔한 고장이다.
    """
    H, W = a.shape[:2]
    # 위상만큼 잘라 내고 칸 수를 센다
    y0, x0 = oy % s, ox % s
    nby, nbx = (H - y0) // s, (W - x0) // s
    out = np.zeros((nby, nbx, 4), dtype=np.uint8)
    for by in range(nby):
        for bx in range(nbx):
            cell = a[y0 + by * s: y0 + (by + 1) * s, x0 + bx * s: x0 + (bx + 1) * s]
            flat = cell.reshape(-1, 4)
            solid = flat[flat[:, 3] >= 128]
            if len(solid) * 2 < len(flat):
                continue                                   # 반 넘게 비었으면 빈 칸
            c = Counter(map(tuple, solid))
            out[by, bx] = np.array(c.most_common(1)[0][0], dtype=np.uint8)
    return out


def _shrink_palette(small: np.ndarray, colors: int) -> np.ndarray:
    """색 수를 줄인다 — **있던 색 중에서** 고른다(새 색을 만들지 않는다).

    흔한 색부터 `colors` 개를 남기고, 나머지는 그중 **제일 가까운 색**으로 보낸다.
    k-평균처럼 중심을 새로 만들면 그 중심이 원래 없던 색이 되고, 도트 그림에서는
    그 한 색이 눈에 띈다(팔레트가 손으로 고른 것이라서).
    """
    solid = small[small[..., 3] >= 128]
    if len(solid) == 0:
        return small
    cnt = Counter(map(tuple, solid))
    if len(cnt) <= colors:
        return small
    keep = np.array([c for c, _ in cnt.most_common(colors)], dtype=np.int16)
    out = small.copy()
    ys, xs = np.where(small[..., 3] >= 128)
    px = small[ys, xs, :3].astype(np.int16)
    d = ((px[:, None, :] - keep[None, :, :3]) ** 2).sum(axis=2)
    pick = keep[d.argmin(axis=1)]
    out[ys, xs, :3] = pick[:, :3].astype(np.uint8)
    return out


def convert(path: str, out_path: str, want: int | None = None,
            colors: int | None = None, scale: int | None = None) -> dict:
    """가짜 도트 → 진짜 도트. 무엇을 했는지 숫자로 돌려준다.

    `scale` 을 주면 논리 그림을 그만큼 정수배로 키워 내보낸다(도트 크기가 정확히 그 값).
    안 주면 **논리 크기 그대로** 낸다 — 키우는 것은 쓰는 쪽에서 정할 일이다.
    """
    a = T._rgba(path)
    g = _grid(a, want)
    if g.get("why"):
        return {"ok": False, "why": g["why"]}
    s, ox, oy = g["texel"], g["ox"], g["oy"]
    small = (_mode_cells(a, int(s), int(ox), int(oy)) if float(s).is_integer()
             else _mode_cells_f(a, float(s), float(ox), float(oy)))
    before_colors = len(set(map(tuple, a.reshape(-1, 4)[a.reshape(-1, 4)[:, 3] >= 128])))
    if colors:
        small = _shrink_palette(small, colors)
    img = Image.fromarray(small, "RGBA")
    if scale and scale > 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    img.save(out_path)
    after_colors = len(set(map(tuple, small.reshape(-1, 4)[small.reshape(-1, 4)[:, 3] >= 128])))
    return {"ok": True, "찾은_도트": s, "위상": [ox, oy], "어떻게": g["어떻게"],
            "논리크기": [int(small.shape[1]), int(small.shape[0])],
            "낸크기": [img.width, img.height],
            "색_전": before_colors, "색_후": after_colors}


if __name__ == "__main__":
    import json
    import sys

    args = sys.argv[1:]
    def opt(name, cast=int):
        return cast(args[args.index(name) + 1]) if name in args else None
    src = args[0]
    dst = args[1]
    print(json.dumps(convert(src, dst, want=opt("--want"), colors=opt("--colors"),
                             scale=opt("--scale")), ensure_ascii=False))
