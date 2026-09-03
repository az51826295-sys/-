"""로키 마크 — 까마귀 머리 옆모습, 픽셀 도트.

2026-09-03 사장님이 정하신 것: **픽셀 도트 · 머리 옆모습 · 심볼만.**

## 왜 손으로 찍는가

생성 모델에 시키면 16px 에서 뭉갠다. 파비콘은 16px 에서 읽혀야 하고, 로고는
"대충 새 같은 것" 이 아니라 **매번 똑같은 그림**이어야 한다. 그래서 격자를
사람이 적고, 이 파일이 그것을 여러 크기로 내보낸다.

## 왜 SVG 와 PNG 둘 다인가

SVG 는 픽셀 하나를 사각형 하나로 그려서 아무리 키워도 도트가 또렷하다.
PNG 는 정수 배로만 키운다 — 3.5배 같은 것을 하면 도트 경계가 흐려져서
픽셀 그림이 픽셀 그림이 아니게 된다.

    python tools/make_logo.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# 16x16. 왼쪽을 보는 까마귀 머리. **사장님이 고르신 안이다(09-03).**
#
# 생성기로 뽑은 시안 넷(`public/logo/drafts/`)이 그림으로는 훨씬 좋았지만,
# 사장님은 이 단순한 쪽을 고르셨다. 화면이 Galmuri 픽셀 폰트라 결이 맞고,
# 16px 에서 갈기가 뭉개지지 않는다.
#
# 고른 것을 여기 적어 두는 이유: 나중에 "왜 이 모양이지" 가 되면 시안을 다시
# 돌리게 되고, 그건 이미 한 번 한 일이다.
#
# `#` 은 칠하는 자리, `.` 은 비우는 자리다. 눈은 **구멍**으로 둔다 — 검은
# 바탕에 흰 마크를 얹으면 그 구멍이 눈이 되고, 반대로 얹어도 눈이 된다.
# 색을 하나만 쓰면 어디에 올려도 같은 그림이다.
MARK = [
    "................",
    "........#####...",
    "......########..",
    ".....##########.",
    "....###########.",
    "....####.######.",
    "....###########.",
    "..#############.",
    "###############.",
    "..#############.",
    "....###########.",
    ".....##########.",
    "......#########.",
    ".......########.",
    "........#######.",
    "................",
]

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public" / "logo"


def grid() -> tuple[int, int, list[str]]:
    h = len(MARK)
    w = len(MARK[0])
    for i, row in enumerate(MARK):
        if len(row) != w:
            raise SystemExit(f"{i}번 줄 길이가 {len(row)} 입니다 — {w} 여야 합니다.")
    return w, h, MARK


def write_svg(path: Path, w: int, h: int, rows: list[str], color: str) -> None:
    """픽셀 하나에 사각형 하나. 키워도 도트가 안 흐려진다."""
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'shape-rendering="crispEdges" role="img" aria-label="로키">'
    ]
    for y, row in enumerate(rows):
        x = 0
        while x < w:
            if row[x] != "#":
                x += 1
                continue
            run = 0
            while x + run < w and row[x + run] == "#":
                run += 1
            # 가로로 이어진 칸은 사각형 하나로 묶는다. 파일이 작아지고,
            # 사각형 사이 실선이 안 보인다.
            parts.append(f'<rect x="{x}" y="{y}" width="{run}" height="1" fill="{color}"/>')
            x += run
    parts.append("</svg>")
    path.write_text("\n".join(parts) + "\n", encoding="utf-8")


def write_png(path: Path, w: int, h: int, rows: list[str], scale: int,
              rgb: tuple[int, int, int]) -> None:
    """정수 배로만 키운다. 반배는 도트를 흐린다."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c == "#":
                px[x, y] = (*rgb, 255)
    if scale > 1:
        img = img.resize((w * scale, h * scale), Image.NEAREST)
    img.save(path)


def main() -> int:
    w, h, rows = grid()
    OUT.mkdir(parents=True, exist_ok=True)

    # 흰 것과 검은 것 둘 다 낸다. 검은 바탕에는 흰 것을, 흰 종이에는 검은
    # 것을 쓴다 — 한 벌만 두면 언젠가 안 보이는 자리에 얹게 된다.
    write_svg(OUT / "rookery-mark.svg", w, h, rows, "currentColor")
    write_svg(OUT / "rookery-mark-white.svg", w, h, rows, "#ffffff")
    write_svg(OUT / "rookery-mark-black.svg", w, h, rows, "#000000")

    for scale in (1, 2, 4, 16):
        write_png(OUT / f"rookery-mark-{w * scale}.png", w, h, rows, scale,
                  (255, 255, 255))

    # 탭 아이콘. Next 는 `src/app/icon.svg` 를 파비콘으로 쓴다.
    write_svg(HERE.parent / "src" / "app" / "icon.svg", w, h, rows, "#ffffff")

    print(f"{w}x{h} 마크를 냈습니다:")
    for f in sorted(OUT.iterdir()):
        print(f"  public/logo/{f.name}")
    print("  src/app/icon.svg  (탭 아이콘)")
    print()
    for row in rows:
        print("  " + row.replace("#", "██").replace(".", "  "))
    return 0


if __name__ == "__main__":
    sys.exit(main())
