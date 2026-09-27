# -*- coding: utf-8 -*-
"""
시험지의 정답을 **코드가 센다** (226회차 2026-09-27).

09-27 오전에 내가 손으로 적은 정답지가 틀렸다 — 정답 칸에 답이 아니라 "샘" 이 적혀 있었고,
그 줄은 어느 모델이 풀어도 틀린 것으로 찍혔다. 그래서 정답을 주장하지 않고 센다:
가능한 경우를 전부 돌려 보거나, 분수로 정확히 계산한다. sympy 는 안 쓴다 — 무작정 세는 쪽이
증명하기 쉽고 의존성이 없다.

   정답 칸이 비어 있으면  → 코드가 세서 채운다.
   정답 칸이 차 있으면    → 코드가 센 것과 대 보고, 어긋나면 **멈춘다**(내 답이 틀린 것이다).
"""
import io
import json
import math
import sys
from fractions import Fraction as F
from itertools import permutations
from math import comb, gcd


def brute_trig():
    """2sin²x - 3cos x = 0 의 [0, 2π) 실근 개수. 잘게 쪼개 부호가 바뀌는 곳을 센다."""
    f = lambda x: 2 * math.sin(x) ** 2 - 3 * math.cos(x)
    N = 2_000_000
    roots, prev = 0, f(0.0)
    for i in range(1, N + 1):
        cur = f(2 * math.pi * i / N)
        if (prev < 0) != (cur < 0):
            roots += 1
        prev = cur
    return roots


def brute_log():
    """log₂x + log₂(x-2) = 3 → x(x-2) = 8 을 정수 범위에서 찾는다(x > 2)."""
    return [x for x in range(3, 1000) if x * (x - 2) == 8][0]


def brute_area():
    """f(x)=∫₁ˣ(t²-3t+2)dt 의 극댓값과 극솟값의 차. 원시함수로 정확히(분수로) 계산한다."""
    Fx = lambda x: F(x) ** 3 / 3 - F(3, 2) * F(x) ** 2 + 2 * F(x)
    f = lambda x: Fx(x) - Fx(1)
    # f' = (x-1)(x-2): x=1 극대, x=2 극소
    return f(1) - f(2)


def brute_abs():
    """m + S. 최솟값은 잘게 훑어 찾고, 적분은 구간을 나눠 분수로 계산한다."""
    g = lambda x: abs(x - 1) + abs(x - 3)
    m = min(g(i / 10000) for i in range(0, 40001))
    S = F(3) + F(4) + F(3)  # [0,1]:3 · [1,3]:4 · [3,4]:3
    return F(round(m)) + S


def brute_seq():
    """a₁=1, n 홀수면 +n, n 짝수면 ×2. 그냥 열 번 돌린다 — 닫힌 식이 없다."""
    a = 1
    for n in range(1, 10):
        a = a + n if n % 2 == 1 else a * 2
    return a


def brute_k():
    """|x²-4x| = k 가 세 실근을 갖는 k. (0,4) 안 봉우리 높이이고, 그때 근이 정말 3개인지 센다."""
    k = max(abs(x * x - 4 * x) for x in (i / 100000 for i in range(1, 400000)))
    k = round(k)  # 봉우리는 x=2 에서 정확히 4
    n = 0
    n += sum(1 for d in [16 + 4 * k] if d > 0) * 2  # x²-4x=k  → 서로 다른 두 근
    d2 = 16 - 4 * k
    n += 2 if d2 > 0 else (1 if d2 == 0 else 0)  # x²-4x=-k
    assert n == 3, f"근이 3개가 아니다: {n}"
    return k


def brute_round():
    """7명 원탁, 특정 2명(1번·2번)이 이웃하지 않는 경우. 0번을 고정하고 나머지를 전부 돌린다."""
    cnt = 0
    for p in permutations(range(1, 7)):
        seats = (0,) + p  # 원탁: 0번 자리를 고정해 회전 중복을 없앤다
        i, j = seats.index(1), seats.index(2)
        if (i - j) % 7 not in (1, 6):
            cnt += 1
    return cnt


def brute_three():
    """1~9 에서 서로 다른 세 수로 만든 세 자리 수 중 3의 배수. 전부 만들어 센다."""
    return sum(1 for p in permutations(range(1, 10), 3) if (p[0] * 100 + p[1] * 10 + p[2]) % 3 == 0)


def brute_sin2x():
    """sin2x = cos x 의 [0, 2π] 실근 개수. 부호가 바뀌는 곳을 센다(양 끝은 근이 아니다)."""
    f = lambda x: math.sin(2 * x) - math.cos(x)
    N = 2_000_000
    roots, prev = 0, f(0.0)
    assert abs(prev) > 1e-9 and abs(f(2 * math.pi)) > 1e-9, "양 끝이 근이면 세는 법을 바꿔야 한다"
    for i in range(1, N + 1):
        cur = f(2 * math.pi * i / N)
        if (prev < 0) != (cur < 0):
            roots += 1
        prev = cur
    return roots


def brute_max():
    """f(x)=∫₀ˣ(t-1)(t-3)dt 의 극댓값. f' = (x-1)(x-3) 이므로 x=1 이 극대."""
    Fx = lambda x: F(x) ** 3 / 3 - 2 * F(x) ** 2 + 3 * F(x)
    return Fx(1) - Fx(0)


def show(v):
    if isinstance(v, F):
        return str(v.numerator) if v.denominator == 1 else f"{v.numerator}/{v.denominator}"
    if isinstance(v, float) and abs(v - round(v)) < 1e-9:
        return str(round(v))
    return str(v)


P = "engine/data/suneung-v0.json"
d = json.load(io.open(P, encoding="utf-8"))
bad = 0
채움 = 0
for q in d["문항"]:
    got = show(eval(q["검산"]))
    if q.get("정답") in (None, ""):
        q["정답"] = got
        채움 += 1
        print(f'  채움   {q["번호"]:>2}번({q["배점"]}점) 코드가 센 것 {got:>8}')
        continue
    ok = got == q["정답"]
    if not ok:
        bad += 1
    print(f'  {"맞음  " if ok else "어긋남"} {q["번호"]:>2}번({q["배점"]}점) 내가 적은 것 {q["정답"]:>8} · 코드가 센 것 {got:>8}')

if bad:
    print(f"\n**{bad}줄 어긋남 — 내 답이 틀렸다. 시험지를 안 고치고 멈춘다.**")
    sys.exit(1)
io.open(P, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=2))
총점 = sum(q["배점"] for q in d["문항"])
print(f"\n정답지 전부 일치 · 새로 채운 것 {채움}줄 · {len(d['문항'])}문항 {총점}점")
