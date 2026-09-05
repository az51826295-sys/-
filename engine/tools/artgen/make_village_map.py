"""마을 지도 생성 — ASCII 맵을 손으로 치지 않고 배치 규칙으로 그린다.

  python -X utf8 tools/artgen/make_village_map.py            # 미리보기
  python -X utf8 tools/artgen/make_village_map.py --apply    # .gd 에 써 넣는다

**왜 다시 그리나.** 08-27 사장님: *"전체적인 퀄리티가 낮네."* 타일을 진짜 아트로
바꿔도 배치가 그대로면 마을로 안 읽힌다. 지금 맵은 **시험 도면**이다 - 12×8 갈색
직사각형 광장, 똑같은 상자집 2채를 나란히, 네모 연못, 균일한 나무 테두리.
사람이 사는 곳은 이렇게 안 생겼다.

**바꾸는 규칙** (타일이 아니라 배치의 문제다):
  - 길은 꺾인다. 직선 격자가 아니라 집을 향해 굽는다.
  - 집은 흩어지고 서로 다른 방향을 본다. 나란히 두 채가 아니다.
  - 연못은 가장자리가 들쭉날쭉하다.
  - 나무는 뭉쳐 자란다. 한 겹 테두리가 아니라 덩어리다.
  - 빈 풀밭을 남긴다. 다 채우면 눈이 쉴 곳이 없다.

**바꾸지 않는 것**: 크기(40×23)와 문자 규약. 플레이어·상인 시작 칸이 걸어갈 수
있어야 한다는 제약도 지킨다(아래에서 검사한다).
"""
from __future__ import annotations

import argparse
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W, H = 40, 23
GD = os.path.join("game", "scripts", "village_map.gd")
SEED = 20260827
# 씬이 정한 시작 위치(픽셀 → 칸). 여기가 막히면 게임이 시작부터 갇힌다.
SPAWNS = {"player": (320 // 16, 230 // 16), "merchant": (328 // 16, 184 // 16)}
SOLID = set("~TWR")
NEWLINE = chr(10)


def blank() -> list:
    return [["." for _ in range(W)] for _ in range(H)]


def put(g, x, y, ch) -> None:
    if 0 <= x < W and 0 <= y < H:
        g[y][x] = ch


def house(g, x, y) -> None:
    """지붕 한 줄 + 벽 한 줄. 문 위치를 바꿔 같은 집으로 안 보이게 한다."""
    for i in range(4):
        put(g, x + i, y, "R")
    door = 1 + (x + y) % 2
    for i in range(4):
        put(g, x + i, y + 1, "D" if i == door else "W")


MAX_STRAIGHT = 14        # 이보다 길게 곧으면 마을이 아니라 활주로다


def _hline(g, x0, x1, y) -> None:
    for x in range(min(x0, x1), max(x0, x1) + 1):
        put(g, x, y, "#")


def _vline(g, y0, y1, x) -> None:
    for y in range(min(y0, y1), max(y0, y1) + 1):
        put(g, x, y, "#")


def path(g, points, rng=None) -> None:
    """꺾인 길. **긴 다리는 중간에서 한 칸 어긋난다.**

    처음에는 그냥 가로→세로로 이었다. 그랬더니 여러 길이 같은 줄에서 만나
    18~19칸짜리 직선 대로가 생겼다 - 씨앗 5개 중 3개에서. 내가 고른 씨앗이 우연히
    통과했을 뿐이다. 문턱을 늘리는 대신 **다리마다 계단을 넣어** 곧게 이어질 수
    없게 만든다.
    """
    rng = rng or random.Random(0)
    for i in range(len(points) - 1):
        (x0, y0), (x1, y1) = points[i], points[i + 1]
        if i % 2 == 0:
            _jog_h(g, x0, x1, y0, rng)
            _vline(g, y0, y1, x1)
        else:
            _jog_v(g, y0, y1, x0, rng)
            _hline(g, x0, x1, y1)


def _jog_h(g, x0, x1, y, rng) -> None:
    """가로 다리. 길면 중간에서 한 칸 위/아래로 어긋났다가 돌아온다."""
    lo, hi = min(x0, x1), max(x0, x1)
    if hi - lo <= MAX_STRAIGHT // 2:
        _hline(g, lo, hi, y)
        return
    mid = rng.randrange(lo + 2, hi - 1)
    dy = rng.choice((-1, 1))
    if not (0 < y + dy < H - 1):
        dy = -dy
    _hline(g, lo, mid, y)
    _vline(g, y, y + dy, mid)
    _hline(g, mid, hi, y + dy)
    _vline(g, y + dy, y, hi)


def _jog_v(g, y0, y1, x, rng) -> None:
    lo, hi = min(y0, y1), max(y0, y1)
    if hi - lo <= MAX_STRAIGHT // 2:
        _vline(g, lo, hi, x)
        return
    mid = rng.randrange(lo + 2, hi - 1)
    dx = rng.choice((-1, 1))
    if not (0 < x + dx < W - 1):
        dx = -dx
    _vline(g, lo, mid, x)
    _hline(g, x, x + dx, mid)
    _vline(g, mid, hi, x + dx)
    _hline(g, x + dx, x, hi)


def blob(g, cx, cy, rx, ry, ch, rng, ragged=0.35) -> None:
    """들쭉날쭉한 덩어리. 타원에 잡음을 섞는다 - 네모 연못을 없애는 부분."""
    for y in range(cy - ry - 1, cy + ry + 2):
        for x in range(cx - rx - 1, cx + rx + 2):
            d = ((x - cx) / max(rx, 0.5)) ** 2 + ((y - cy) / max(ry, 0.5)) ** 2
            if d <= 1.0 - ragged * (rng.random() - 0.3):
                put(g, x, y, ch)


def _runs(line: list, ch: str = "#") -> list:
    """이 줄에서 ch 가 연속으로 이어진 구간들. (시작, 끝) 포함."""
    out, start = [], None
    for i, c in enumerate(line + [None]):
        if c == ch and start is None:
            start = i
        elif c != ch and start is not None:
            out.append((start, i - 1))
            start = None
    return out


def break_straights(g, rng) -> int:
    """긴 직선을 끊어 계단으로 만든다. **연결은 유지한다.**

    다리마다 계단을 넣는 것만으로는 부족했다 - 서로 다른 길이 광장에서 만나 다시
    곧게 이어졌고, 씨앗 41개 중 15개가 걸렸다. 그래서 다 그린 **뒤에** 한 번 훑어
    남은 직선을 끊는다. 구간 가운데를 한 줄 옮기고 양 끝을 세로로 이어 붙이므로
    길이 끊기지 않는다.

    옮길 자리에 건물·물이 있으면 건드리지 않는다 - 지도를 고치려다 집을 부수는
    것이 더 나쁘다. 그래서 이 함수는 **모든 경우를 고치지 못할 수 있고**, 남은 것은
    check() 가 잡는다(조용히 통과시키지 않는다).
    """
    fixed = 0
    for _ in range(6):
        changed = False
        for y in range(1, H - 1):
            for a, b in _runs(g[y]):
                if b - a + 1 <= MAX_STRAIGHT:
                    continue
                lo = a + (b - a) // 3
                hi = b - (b - a) // 3
                for dy in rng.sample([-1, 1], 2):
                    ty = y + dy
                    if not (0 < ty < H - 1):
                        continue
                    if any(g[ty][x] not in ".,#" for x in range(lo, hi + 1)):
                        continue
                    for x in range(lo, hi + 1):
                        g[ty][x] = "#"
                    for x in range(lo + 1, hi):
                        g[y][x] = "."
                    fixed += 1
                    changed = True
                    break
        if not changed:
            break
    return fixed


def build(seed: int = SEED) -> str:
    """그리는 **순서가 규칙이다.** 첫 판에서 순서를 틀려 길이 집 벽을 뚫고 지나갔다.

      숲·연못 → 길 → 집(길을 덮는다) → 집 둘레 정리 → 풀 변형

    집을 길보다 나중에 놓아야 문 앞에서 길이 끊기지 골목이 벽을 관통하지 않는다.
    """
    rng = random.Random(seed)
    g = blank()

    # 1) 숲. 한 겹 테두리 대신 가장자리를 따라 두께가 변하는 띠 + 안쪽 덩어리.
    for x in range(W):
        for y in range(H):
            edge = min(x, y, W - 1 - x, H - 1 - y)
            if edge == 0 or (edge <= 2 and rng.random() < 0.55 - 0.18 * edge):
                g[y][x] = "T"
    for cx, cy, rx, ry in ((7, 18, 3, 2), (33, 18, 2, 2), (16, 3, 2, 1)):
        blob(g, cx, cy, rx, ry, "T", rng)

    # 2) 연못. 큰 덩어리 + 작은 덩어리를 겹쳐 가장자리를 깬다.
    blob(g, 30, 5, 5, 3, "~", rng)
    blob(g, 26, 6, 2, 2, "~", rng)

    # 3) 작은 광장. 예전 12×8이 아니라 6×3이고, 가장자리를 살짝 깎는다.
    for y in range(12, 15):
        for x in range(18, 24):
            if not (rng.random() < 0.18 and (x in (18, 23) or y == 14)):
                put(g, x, y, "#")

    # 4) 길. **광장에서 나가는 지점을 서로 다르게 잡는다.** 첫 판에서는 전부
    #    y=13에서 출발해 40칸짜리 직선 대로가 생겼다 - 마을이 아니라 활주로였다.
    houses = [(6, 6), (13, 4), (27, 13), (9, 16), (24, 18), (32, 9)]
    exits = [(18, 12), (18, 14), (23, 12), (21, 15), (23, 14), (19, 15)]
    for (hx, hy), (ex, ey) in zip(houses, exits):
        door = hx + 1 + (hx + hy) % 2          # 문 칸 바로 아래로 길을 붙인다
        mx = (ex + door) // 2 + rng.choice((-2, -1, 1, 2))
        my = (ey + hy + 2) // 2 + rng.choice((-1, 1))
        path(g, [(ex, ey), (mx, my), (door, hy + 2)], rng)
    path(g, [(21, 15), (20, 21)], rng)         # 남쪽 출구

    # 5) 집. 길보다 **나중에** 놓아 길을 덮는다.
    for x, y in houses:
        house(g, x, y)

    # 6) 집 둘레 한 칸을 풀로 정리한다. 나무가 벽에 달라붙으면 집이 안 읽힌다.
    for x, y in houses:
        for dy in range(-1, 3):
            for dx in range(-1, 5):
                cx, cy = x + dx, y + dy
                if 0 < cx < W - 1 and 0 < cy < H - 1 and g[cy][cx] in "T~":
                    g[cy][cx] = "."

    # 6b) 남은 직선을 끊는다. 집·풀 정리보다 뒤, 풀 변형보다 앞.
    break_straights(g, rng)

    # 7) 풀 변형을 흩뿌린다(길·물·나무·건물이 아닌 곳에만).
    for _ in range(60):
        x, y = rng.randrange(W), rng.randrange(H)
        if g[y][x] == ".":
            g[y][x] = ","
    return NEWLINE.join("".join(r) for r in g)


def check(m: str) -> list:
    """배치가 게임을 망가뜨리지 않는가. **미리 정한 제약만** 본다(예쁨은 사람 몫)."""
    rows = m.split("\n")
    bad = []
    if len(rows) != H:
        bad.append(f"줄 수 {len(rows)} (기대 {H})")
    for i, r in enumerate(rows):
        if len(r) != W:
            bad.append(f"{i}줄 길이 {len(r)} (기대 {W})")
    for name, (x, y) in SPAWNS.items():
        for dx, dy in ((0, 0), (0, -1)):
            ch = rows[y + dy][x] if 0 <= y + dy < len(rows) else "?"
            if ch in SOLID:
                bad.append(f"{name} 시작 칸({x},{y + dy})이 막혔다: {ch!r}")
    # 첫 판에서 길이 집 벽을 관통했다(그리는 순서를 틀렸다). 기계가 잡게 한다.
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != "#":
                continue
            for dx in (-1, 1):
                if 0 <= x + dx < W and rows[y][x + dx] == "W"                         and 0 <= x - dx < W and rows[y][x - dx] == "W":
                    bad.append(f"길이 벽 사이를 지난다 ({x},{y})")
    # 40칸짜리 직선 대로가 생기면 마을이 아니다.
    for y, r in enumerate(rows):
        run = longest = 0
        for ch in r:
            run = run + 1 if ch == "#" else 0
            longest = max(longest, run)
        if longest > MAX_STRAIGHT:
            bad.append(f"{y}줄에 길이 {longest}칸 직선으로 이어진다")
    if any(ch not in ".,#~TWRD" for r in rows for ch in r):
        bad.append("규약에 없는 문자가 있다")
    edge = [rows[0], rows[-1]] + [r[0] + r[-1] for r in rows]
    if any(c not in "T" for r in edge for c in r):
        bad.append("바깥 테두리가 나무로 닫히지 않았다(맵 밖으로 나간다)")
    return bad


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--seed", type=int, default=SEED)
    a = ap.parse_args(argv)
    m = build(a.seed)
    bad = check(m)
    print(m)
    print()
    counts = {c: m.count(c) for c in ".,#~TWRD"}
    print("칸 수:", counts)
    if bad:
        print("결함:")
        for b in bad:
            print("  ✖", b)
        return 1
    print("검사 통과")
    if a.apply:
        p = os.path.join(ROOT, GD)
        src = open(p, encoding="utf-8").read()
        i = src.index('const MAP := """')
        j = src.index('"""', i + len('const MAP := """'))
        src = src[:i] + 'const MAP := """' + m + src[j:]
        open(p, "w", encoding="utf-8", newline="\n").write(src)
        print(f"써 넣음: {GD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
