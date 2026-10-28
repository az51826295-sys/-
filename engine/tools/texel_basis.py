"""도트 크기 자의 근거를 **먼저 재서** 모은다. 문턱은 이 출력을 보고 적는다.

09-21 규율: 잠그기 전에 돌려 본다. 그래서 이 스크립트가 먼저 돌고, 그 다음에
`texel_judge.MIN_*` 가 정해진다. 재료는 셋이다 —

1. 우리가 실제로 쓰는 스프라이트(두근도트 캐릭터)
2. 사장님이 가리킨 참고 화면(`docs/ui-ask/`)
3. 내가 만든 **정답이 아는** 그림 — 깨끗한 16배 확대 / 안티에일리어싱 / 비정수 배율

3번이 있어야 자가 0 과 1 을 가르는지 알 수 있다. 1·2번만 보면 "다 비슷하네"로
끝난다(대조군이 없으면 뭐든 모자라다가 통과한다 — 09-22).
"""
from __future__ import annotations

import glob
import os
import statistics
import sys
import tempfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from genesis import texel_judge as tj  # noqa: E402


def _art(n: int = 24) -> Image.Image:
    """정답이 아는 도트 그림. 투명 배경 + 몇 색."""
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    px = img.load()
    palette = [(40, 30, 60, 255), (120, 60, 90, 255), (220, 180, 120, 255),
               (70, 110, 140, 255), (240, 240, 230, 255)]
    for y in range(n):
        for x in range(n):
            if (x - n / 2) ** 2 + (y - n / 2) ** 2 > (n / 2 - 1) ** 2:
                continue
            px[x, y] = palette[(x // 3 + y // 4) % len(palette)]
    return img


def _cases(d: str) -> list:
    out = []
    art = _art()
    kinds = [
        ("깨끗한 16배", art.resize((384, 384), Image.NEAREST)),
        ("깨끗한 8배", art.resize((192, 192), Image.NEAREST)),
        ("안티에일리어싱 16배", art.resize((384, 384), Image.BICUBIC)),
        ("비정수 15.5배", art.resize((372, 372), Image.NEAREST)),
        ("원본 해상도", art.copy()),
        ("한 번 줄였다 늘림", art.resize((384, 384), Image.NEAREST)
                              .resize((300, 300), Image.BILINEAR)
                              .resize((384, 384), Image.NEAREST)),
    ]
    for name, im in kinds:
        p = os.path.join(d, name.replace(" ", "_") + ".png")
        im.save(p)
        out.append((name, [p]))
    return out


def main() -> None:
    rows = []
    with tempfile.TemporaryDirectory() as d:
        for name, paths in _cases(d):
            rows.append(("대조군", name, tj.measure(paths)))

    sprites = sorted(glob.glob(os.path.join(ROOT, "work", "dot-이사", "sprites",
                                            "*", "*.png")))
    for p in sprites[:8]:
        rows.append(("두근도트", os.path.basename(os.path.dirname(p)) + "/" +
                     os.path.basename(p), tj.measure([p])))

    refs = sorted(glob.glob(os.path.join(ROOT, "docs", "ui-ask", "*.png")))
    for p in refs[:8]:
        rows.append(("참고 화면", os.path.basename(p), tj.measure([p])))

    print(f"{'묶음':<10} {'이름':<24} {'크기':>11} {'도트':>5} "
          f"{'일치율':>7} {'순도':>7} {'논리':>11}  못 잼")
    for group, name, m in rows:
        im = (m["per_image"] or [{}])[0]
        size = "x".join(str(v) for v in im.get("size", []))
        logical = "x".join(str(v) for v in (im.get("logical") or []))
        print(f"{group:<10} {name[:24]:<24} {size:>11} {str(m['texel'] or '-'):>5} "
              f"{str(m['align'] if m['align'] is not None else '-'):>7} "
              f"{str(m['purity'] if m['purity'] is not None else '-'):>7} "
              f"{logical:>11}  {'; '.join(im.get('why', []))[:40]}")

    for label, group in (("깨끗", "대조군"), ("두근도트", "두근도트"), ("참고", "참고 화면")):
        vals = [m["purity"] for g, _, m in rows
                if g == group and m["purity"] is not None]
        al = [m["align"] for g, _, m in rows if g == group and m["align"] is not None]
        if vals:
            print(f"\n{group}: 순도 중앙값 {statistics.median(vals):.4f} "
                  f"(최소 {min(vals):.4f}) · 일치율 중앙값 {statistics.median(al):.4f} "
                  f"(최소 {min(al):.4f}) · n={len(vals)}")


if __name__ == "__main__":
    main()
