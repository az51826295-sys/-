"""마녀 오디션 — GPT가 그리고 PixelLab이 돌리고 우리가 거른다.

  GENESIS_SPEND=i-approve python -X utf8 tools/witch_audition.py

2026-08-27. 오늘 처음으로 **고를 수 있는 후보**를 만드는 자리다. 지금까지 게임의
모든 자산이 n=1이었다 — 한 번 뽑고 나온 걸 그냥 썼다.

  1 주문서   GPT가 이미 썼다 (data/prompts/1A~1D). 검사 4/4 통과, 램프 25색 공유
  2 그리기   OpenAI 이미지 — 정면 한 장 (도트·투명배경)
  3 돌리기   PixelLab create-character-v3 참조 모드 — 8방향
  4 거르기   character_judge (색·채도·명암폭·바닥대비·방향 일관성)
  5 고르기   **사장님**

`genesis/audition.py` 가 순위를 안 매긴다. 통과한 것을 뽑은 순서대로 낸다.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import audition as au                             # noqa: E402
from genesis import character_judge as cj                      # noqa: E402
from genesis import prompt_book as pb                          # noqa: E402
from tools.artgen import openai_images as oi                   # noqa: E402
from tools.artgen import rotate_reference as rr                # noqa: E402

IDS = ["1A", "1B", "1C", "1D"]
# 그림 주문에 붙이는 형식 지시. **내용은 GPT 주문서에서 오고, 이건 형식만이다.**
# 08-27에 "pixel art game sprite"만 쓰면 20프레임 시트가 왔다. 못박아야 한다.
FORM = ("Pixel art sprite for a 2D top-down game. Chunky visible square pixels, "
        "hard-edged, limited palette, no anti-aliasing, no blur, no gradients. "
        "ONE single character alone, centered, full body, facing the viewer "
        "(south-facing), one standing pose. Completely empty transparent "
        "background, nothing else: no ground, no floor shadow, no vignette, "
        "no frame, no border, no grid, no second pose, no text.")


def make(i: int) -> dict:
    pid = IDS[i]
    doc = pb.load(pid)
    text = FORM + " " + doc["body"]["description"]
    g = oi.generate(text, 1, f"witch_{pid}", "low")
    if not g["paths"]:
        raise RuntimeError("이미지가 0장 왔다")
    rot = rr.main([g["paths"][0], "--name", f"witch_{pid}", "--size", "64",
                   "--desc", doc["note"]])
    d = os.path.join(ROOT, rr.OUT, f"witch_{pid}")
    files = sorted(glob.glob(os.path.join(d, "Idle", "rotations", "*.png")))
    if not files:
        raise RuntimeError(f"회전본이 없다 (rc={rot})")
    return {"id": pid, "note": doc["note"], "flat": g["paths"][0],
            "dir": d, "paths": files}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n", type=int, default=len(IDS))
    a = ap.parse_args(argv)
    if os.environ.get("GENESIS_SPEND") != "i-approve":
        print("지출 경로가 잠겨 있다. GENESIS_SPEND=i-approve 를 붙여라.")
        return 2
    res = au.audition(make, lambda c: cj.judge(c["paths"]),
                      n=min(a.n, len(IDS)), label="주인공 마녀")
    print()
    print(au.summary(res))
    for p in res["passed"]:
        c, j = p["cand"], p["judgement"]
        print(f'   ○ {c["id"]}  {c["note"]}')
        print(f'       색 {j["colors"]} 채도 {j["saturation"]} '
              f'명암폭 {j["luma_spread"]} 대비 {j["ground_contrast"]}')
    au.save(res, os.path.join(ROOT, "data", "witch_audition.json"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
