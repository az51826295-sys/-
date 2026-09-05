"""도트 격자 정리 + 반입 규격 오라클 (game-design-v0.md §1b).

AI가 뽑은 고해상도 이미지는 그대로 쓰면 '가짜 도트'다: 픽셀이
격자에 안 맞고 색이 무한하다. 이 도구가 두 가지를 해결한다:

1. pixelize: 진짜 격자로 강제 변환 - 고품질 축소(디테일 평균) 후
   제한 팔레트로 양자화. 결과는 목표 크기에서 픽셀 = 격자.
2. check: 반입 오라클 - 크기·색 수·투명배경 검사. 불합격 에셋은
   게임 폴더에 들어갈 수 없다 (Rookery 검증과 같은 원리: 통과한
   것만 존재한다).

사용:
  python tools/artgen/pixelize.py in.png out.png --size 16x32 --colors 24
  python tools/artgen/pixelize.py out.png --check --size 16x32 --colors 24
  (--preview 8 을 주면 8배 확대본 out_preview.png 도 저장)
"""

from __future__ import annotations

import argparse
import sys

from PIL import Image


def pixelize(img: Image.Image, width: int, height: int,
             colors: int = 24) -> Image.Image:
    """고해상도 -> 격자 정합 도트. 축소는 LANCZOS(디테일 평균),
    양자화는 median-cut. 알파는 이진화(도트는 반투명이 없다)."""
    img = img.convert("RGBA")
    small = img.resize((width, height), Image.LANCZOS)
    alpha = small.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    rgb = small.convert("RGB").quantize(
        colors=colors, method=Image.MEDIANCUT).convert("RGB")
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def color_count(img: Image.Image) -> int:
    """불투명 픽셀의 고유 RGB 수 (투명 픽셀은 색으로 안 센다)."""
    img = img.convert("RGBA")
    seen = {px[:3] for px in img.getdata() if px[3] > 0}
    return len(seen)


def check_spec(img: Image.Image, width: int, height: int,
               max_colors: int,
               require_alpha: bool = True) -> list[str]:
    """반입 오라클: 위반 목록을 돌려준다. 비면 합격."""
    problems = []
    if img.size != (width, height):
        problems.append(
            f"size {img.size[0]}x{img.size[1]} != {width}x{height}")
    img = img.convert("RGBA")
    n = color_count(img)
    if n > max_colors:
        problems.append(f"colors {n} > {max_colors}")
    alphas = {px[3] for px in img.getdata()}
    if not alphas <= {0, 255}:
        problems.append("semi-transparent pixels (alpha not in {0,255})")
    if require_alpha and 0 not in alphas:
        problems.append("no transparent background")
    return problems


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="pixelize")
    p.add_argument("input")
    p.add_argument("output", nargs="?")
    p.add_argument("--size", required=True, help="예: 16x32")
    p.add_argument("--colors", type=int, default=24)
    p.add_argument("--check", action="store_true",
                   help="변환 없이 반입 규격 검사만")
    p.add_argument("--no-alpha", action="store_true",
                   help="투명배경 요구 해제 (타일 등 꽉 찬 에셋)")
    p.add_argument("--preview", type=int, default=0,
                   help="N배 확대 미리보기 저장")
    args = p.parse_args(argv)
    w, h = (int(x) for x in args.size.lower().split("x"))

    img = Image.open(args.input)
    if args.check:
        problems = check_spec(img, w, h, args.colors,
                              require_alpha=not args.no_alpha)
        for x in problems:
            print(f"불합격: {x}")
        print("합격" if not problems else f"위반 {len(problems)}건")
        return 0 if not problems else 1

    if not args.output:
        p.error("output 경로가 필요함 (--check 가 아니면)")
    out = pixelize(img, w, h, colors=args.colors)
    out.save(args.output)
    problems = check_spec(out, w, h, args.colors,
                          require_alpha=not args.no_alpha)
    if problems:                       # 자기 출력도 오라클을 통과해야
        for x in problems:
            print(f"경고: 변환 결과가 규격 미달 - {x}")
        return 1
    if args.preview:
        pv = out.resize((w * args.preview, h * args.preview),
                        Image.NEAREST)
        pv.save(args.output.rsplit(".", 1)[0] + "_preview.png")
    print(f"완료: {args.output} ({w}x{h}, "
          f"{color_count(out)}색)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
