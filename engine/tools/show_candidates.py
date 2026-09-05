"""후보를 **게임 화면 안에** 나란히 세워 보여준다. 순위는 매기지 않는다.

  python -X utf8 tools/show_candidates.py --out shot.png

2026-08-27. 오늘 내가 크게 틀린 것 하나가 자산을 **회색 배경에 8배 확대해서**
보여드린 것이다. 아무도 게임을 그렇게 안 본다. 따로 보면 괜찮은데 같이 놓으면
엉망인 것이 픽셀 아트 실패의 대부분이다.

그래서 고르실 자료는 항상 이렇게 만든다:
  - **실제 게임 바닥** 위에
  - **1:1 크기**로 (보기 좋으라고 확대하는 것은 판정 뒤의 일이다)
  - 통과분을 **뽑은 순서 그대로** (순위·최고점 없음 — 마지막 칸은 사람 것)
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

from PIL import Image, ImageDraw                               # noqa: E402

from genesis import character_judge as cj                      # noqa: E402

GROUND = os.path.join("data", "ground.png")


def sheet(cands: list, ground: str = GROUND, zoom: int = 3,
          root: str = ROOT) -> Image.Image:
    """한 줄에 후보 하나: 게임 바닥 위 정면 + 8방향 띠 + 판정 수치."""
    g = Image.open(os.path.join(root, ground)).convert("RGBA")
    rows = []
    for c in cands:
        fs = c["paths"]
        south = next((f for f in fs if "south.png" in f), fs[0])
        s = Image.open(south).convert("RGBA")
        cell = g.copy().crop((0, 0, min(g.width, 96), min(g.height, 96)))
        cell.alpha_composite(s, ((cell.width - s.width) // 2,
                                 (cell.height - s.height) // 2))
        strip = Image.new("RGBA", (len(fs) * 66, 66), (60, 62, 70, 255))
        for i, f in enumerate(fs):
            im = Image.open(f).convert("RGBA")
            strip.alpha_composite(im.resize((64, 64), Image.NEAREST),
                                  (i * 66 + 1, 1))
        rows.append((c, cell, strip))
    w = max(r[1].width + r[2].width + 24 for r in rows)
    h = sum(max(r[1].height, r[2].height) + 34 for r in rows)
    out = Image.new("RGBA", (w * zoom, h * zoom), (26, 26, 30, 255))
    y = 0
    for c, cell, strip in rows:
        big_cell = cell.resize((cell.width * zoom, cell.height * zoom),
                               Image.NEAREST)
        big_strip = strip.resize((strip.width * zoom, strip.height * zoom),
                                 Image.NEAREST)
        out.alpha_composite(big_cell, (8, y + 26 * zoom // zoom + 20))
        out.alpha_composite(big_strip, (big_cell.width + 20,
                                        y + 26 * zoom // zoom + 20))
        d = ImageDraw.Draw(out)
        j = c.get("judgement", {})
        label = (f'{c["id"]}  {c.get("note", "")}   '
                 f'[색 {j.get("colors")} · 채도 {j.get("saturation")} · '
                 f'명암폭 {j.get("luma_spread")} · 대비 {j.get("ground_contrast")}]'
                 f'  {j.get("verdict", "")}')
        d.text((10, y + 6), label, fill=(245, 225, 150, 255))
        y += max(big_cell.height, big_strip.height) + 34
    return out


def collect(pattern: str = "audition/rotated/witch_*", root: str = ROOT) -> list:
    out = []
    for d in sorted(glob.glob(os.path.join(root, pattern))):
        fs = sorted(glob.glob(os.path.join(d, "Idle", "rotations", "*.png")))
        if not fs:
            continue
        out.append({"id": os.path.basename(d), "paths": fs,
                    "judgement": cj.judge(fs)})
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pattern", default="audition/rotated/witch_*")
    ap.add_argument("--out", default="data/candidates.png")
    ap.add_argument("--all", action="store_true",
                    help="탈락분도 같이 보여준다(고를 때가 아니라 볼 때용)")
    a = ap.parse_args(argv)
    cands = collect(a.pattern)
    if not cands:
        print("후보가 없다"); return 1
    shown = cands if a.all else [c for c in cands
                                 if c["judgement"]["verdict"] == "PASS"]
    if not shown:
        print("통과가 0이다 — **떨어진 것 중에서 고르지 않는다.** "
              "--all 로 보실 수는 있다")
        shown = cands
    img = sheet(shown)
    p = os.path.join(ROOT, a.out)
    img.save(p)
    for c in cands:
        j = c["judgement"]
        print(f'{c["id"]:12} {j["verdict"]:8} 색 {j["colors"]:>5} '
              f'채도 {j["saturation"]:>5} 명암폭 {j["luma_spread"]:>6} '
              f'대비 {j["ground_contrast"]:>6}')
        for f in j.get("fail", []):
            print(f'    ✖ {f}')
    print(f'\n{p}  (순위 없음 — 고르는 것은 사장님)')
    return 0


if __name__ == "__main__":
    sys.exit(main())
