"""`truedot` 가 정말 고치는가 — **대조군부터 재는** 시험판.

2026-11-10. 규율 세 가지를 그대로 따른다:

1. **좋은 쪽을 먼저 잰다.** 진짜 도트 그림을 넣었을 때 **안 망가지는가**가 먼저다.
   고치는 도구가 멀쩡한 것을 깨뜨리면 쓸 수 없다([[palette-overlap-is-not-style]]).
2. **가짜는 만들어서 심는다.** 진짜 도트를 비정수 배율로 늘리거나 흐리면
   그게 곧 "가짜 도트" 다 — 정답(원본 논리 그림)을 **알고 있는** 가짜다.
3. **고쳤다고 말하지 않고 잰다.** 고친 뒤 순도·일치율·흔적이 진짜 도트와 같아야 하고,
   **원본 논리 그림과 얼마나 같은지**(복원율)도 같이 적는다. 격자만 맞고 그림이
   달라졌으면 고친 게 아니다.

    python engine/genesis/truedot_bench.py
"""
from __future__ import annotations

import os
import sys
import tempfile

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import texel_judge as T  # noqa: E402
import truedot  # noqa: E402

TMP = tempfile.mkdtemp(prefix="truedot-")


def 잰다(p: str) -> dict:
    m = T.measure_one(p)
    return {"texel": m.get("texel"), "align": m.get("align"),
            "trace": m.get("trace"), "purity": m.get("purity"), "colors": m.get("colors")}


def 같은가(a_path: str, b_path: str) -> float:
    """두 그림이 얼마나 같은가 — **같은 화소 비율**(0~1).

    11-10: 처음엔 크기가 다르면 **0 을 돌려줬다.** 그래서 격자를 고쳐 놓고도 "원본과 0%" 가
    찍혔고, 하마터면 "고쳐도 그림이 달라진다" 로 읽을 뻔했다 — 실은 **크기가 한 칸 다른 것**을
    0 으로 센 것이다([[zero-can-mean-i-cannot-see]]). 이제 큰 쪽을 작은 쪽에 **최근접으로
    맞춘 뒤** 비교하고, 크기 차이는 따로 적는다.
    """
    a = np.array(Image.open(a_path).convert("RGBA"))
    b = np.array(Image.open(b_path).convert("RGBA"))
    if a.shape != b.shape:
        bi = Image.open(b_path).convert("RGBA").resize(
            (a.shape[1], a.shape[0]), Image.NEAREST)
        b = np.array(bi)
    둘다빔 = (a[..., 3] < 128) & (b[..., 3] < 128)
    같음 = (a == b).all(axis=2) | 둘다빔
    return round(float(같음.mean()), 4)


def 가짜만들기(원본: str, 어떻게: str, 배: float) -> str:
    """진짜 도트에서 **정답을 아는 가짜**를 만든다."""
    im = Image.open(원본).convert("RGBA")
    w, h = int(im.width * 배), int(im.height * 배)
    법 = {"늘림": Image.NEAREST, "흐림": Image.BICUBIC}[어떻게]
    out = os.path.join(TMP, f"fake-{어떻게}-{배}-{os.path.basename(원본)}")
    im.resize((w, h), 법).save(out)
    return out


def main() -> int:
    진짜들 = [
        ("스프라이트(도트 4)", "public/dot-sprites/rin/neutral.png"),
        ("얼굴(도트 4)", "public/dot-sprites/yuna/face/happy.png"),
        ("사진(도트 2)", "public/dot-sprites/rin/photo/1.png"),
    ]
    줄: list[tuple[str, str, dict, dict, float]] = []
    나쁨 = 0

    print("── 1. 대조군 — 진짜 도트를 넣으면 안 망가져야 한다 ──")
    for 이름, p in 진짜들:
        if not os.path.exists(p):
            print(f"  (없다) {p}")
            continue
        전 = 잰다(p)
        out = os.path.join(TMP, "ctl-" + os.path.basename(p))
        r = truedot.convert(p, out, scale=전["texel"] or 1)
        if not r.get("ok"):
            print(f"  ❌ {이름}: {r.get('why')}")
            나쁨 += 1
            continue
        후 = 잰다(out)
        보존 = 같은가(p, out)
        맞음 = 후["texel"] == 전["texel"] and 보존 >= 0.99
        나쁨 += 0 if 맞음 else 1
        print(f"  {'✅' if 맞음 else '❌'} {이름}: 도트 {전['texel']}→{후['texel']} · "
              f"순도 {전['purity']}→{후['purity']} · 그대로 {보존:.1%}")

    print("\n── 2. 가짜 — 정답을 아는 그림을 망가뜨려 넣는다 ──")
    for 이름, p in 진짜들:
        if not os.path.exists(p):
            continue
        texel = 잰다(p)["texel"] or 1
        for 어떻게, 배 in [("늘림", 1.7), ("늘림", 2.3), ("흐림", 1.6)]:
            가짜 = 가짜만들기(p, 어떻게, 배)
            전 = 잰다(가짜)
            out = os.path.join(TMP, f"fix-{어떻게}-{배}-{os.path.basename(p)}")
            r = truedot.convert(가짜, out, scale=texel)
            if not r.get("ok"):
                print(f"  ◻︎ {이름} {어떻게}×{배}: 못 고침 — {r.get('why')}")
                continue
            후 = 잰다(out)
            보존 = 같은가(p, out)
            """
            **순도만 보면 안 된다.** 아무 격자로나 잘라도 칸마다 한 색을 고르므로 순도는 1.0 이
            나온다 — 사진 흐림×1.6 은 칸 18.35 라는 엉뚱한 격자를 찾고도 순도 1.0 으로 통과했다.
            격자가 깨끗한 것과 **그림이 살아 있는 것**은 다른 물음이다([[measure-the-thing-not-a-proxy]]).
            그래서 복원율을 합격 조건에 넣는다.
            """
            고쳐짐 = (후["purity"] or 0) >= 0.99 and (후["align"] or 0) >= 0.99 and 보존 >= 0.75
            나쁨 += 0 if 고쳐짐 else 1
            print(f"  {'✅' if 고쳐짐 else '❌'} {이름} {어떻게}×{배}: "
                  f"찾은 칸 {r.get('찾은_도트')} (진짜 {round(texel*배,2)}) · "
                  f"순도 {전['purity']}→{후['purity']} · "
                  f"색 {전['colors']}→{후['colors']} · 원본과 {보존:.1%}")
            줄.append((이름, f"{어떻게}×{배}", 전, 후, 보존))

    print(f"\n임시 폴더 {TMP}")
    print("틀린 칸" if 나쁨 else "전부 맞음", 나쁨)
    return 1 if 나쁨 else 0


if __name__ == "__main__":
    raise SystemExit(main())
