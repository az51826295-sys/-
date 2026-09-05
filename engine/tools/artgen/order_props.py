"""소품 발주 — 단색 배경 위에 뽑고, 우리가 잘라 투명 스프라이트로 만든다.

  python -X utf8 tools/artgen/order_props.py --list          # 무엇을 몇 회 쓸지
  python -X utf8 tools/artgen/order_props.py --dry           # 지출 0, 프롬프트만
  GENESIS_SPEND=i-approve python -X utf8 tools/artgen/order_props.py --only tree

**절차** (2026-08-27 사장님 지시):

  "나무 뽑을 땐 나무 옆에는 크로마키해서 니가 분해해서 넣어야지"

생성기의 `no_background` 를 믿지 않는다. **배경색을 지정해 주문하고 우리가
`genesis.chroma` 로 자른다.** 자르기 전에 도구가 키 색과 그림 색의 거리를 재고,
위험하면 **거부한다** - 잎이 조용히 지워지는 것을 막는다.

**키 색은 마젠타다.** 사장님은 찐한 녹색을 말씀하셨지만 실측 결과 잎 색까지의
여유가 초록 0.072 / 마젠타 0.848로 **12배 차이**였다. 나무·덤불이 전부 초록이라
초록 키는 강도를 0.036 위로 못 올린다. 방식은 그대로 두고 색만 바꿨다.
(`--key` 로 언제든 초록으로 되돌릴 수 있다.)

**PixelLab 잔량은 유한하다** - 2026-08-27 기준 무료 체험 21회. 그래서 이 도구는
주문 전에 몇 회를 쓰는지 먼저 세어 보여주고, 확인 없이는 안 쏜다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import chroma                                    # noqa: E402
from tools.artgen import audition_pixellab as pl              # noqa: E402

OUT = os.path.join("audition", "props")
KEY_MAGENTA = (255, 0, 255)
# 사장님이 말한 '찐한 녹색'. 남겨 두되 기본값은 아니다(위 주석의 실측 때문).
KEY_GREEN = (0, 100, 0)

# 자리표시자로 남아 있는 5칸 + 단조로움을 깨는 소품.
# `slot` 이 있으면 아틀라스의 그 칸을 대체한다. None이면 새 소품이다.
# 자리표시자로 남아 있는 칸을 진짜 그림으로 바꾼다 (2026-08-27 사장님: "나무 집
# 연못 다시 만들어"). 연못은 wang 타일셋이라 따로 주문한다
# (`order_water_tileset.py`) - 물은 풀과 **이어져야** 하므로 낱장으로는 안 된다.
#
# 크기는 **지금 맵이 쓰는 칸 수에 맞춘다.** 예뻐 보이려고 크게 뽑으면 맵을 다시
# 그려야 하고, 그러면 이번 변경이 배치까지 건드리게 된다.
#   나무 16×16 = 1칸  (지금 맵에 나무 칸이 222개다. 숲을 채우는 크기다)
#   집   64×32 = 4×2칸 (지금 집 모양 그대로. 잘라서 아틀라스에 넣는다)
PROPS = [
    {"name": "tree", "slot": "tree", "size": 16, "tiles": (1, 1),
     "desc": "a single small round tree seen from above, dark green canopy, "
             "top-down 16-bit village game tile"},
    {"name": "house", "slot": "house", "size": 64, "height": 32, "tiles": (4, 2),
     "desc": "a small cottage seen from a low top-down angle, thatched or "
             "tiled roof, timber walls, one wooden door in the front wall, "
             "16-bit village game building"},
]


def prompt_for(p: dict, key: tuple) -> dict:
    """주문 본문. 배경색을 **말로** 지정한다 - 그게 크로마키의 전제다."""
    rgb = "magenta" if tuple(key) == KEY_MAGENTA else "dark green"
    return {"description": (f"{p['desc']}, centered, "
                            f"on a plain solid {rgb} background, "
                            f"no shadow on the background"),
            "image_size": {"width": p["size"],
                           "height": p.get("height", p["size"])},
            "no_background": False}


def extract(path: str, key: tuple, strength: float | None,
            force: bool = False) -> dict:
    out = os.path.splitext(path)[0] + "_cut.png"
    return chroma.key_out(path, out, key=key, strength=strength, force=force)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--list", action="store_true", help="발주 목록과 회수만")
    ap.add_argument("--dry", action="store_true", help="프롬프트만 찍고 안 쏜다")
    ap.add_argument("--only", help="이 이름 하나만")
    ap.add_argument("--key", choices=["magenta", "green"], default="magenta")
    ap.add_argument("--strength", type=float,
                    help="크로마키 강도. 안 주면 그림마다 안전값을 계산한다")
    ap.add_argument("--force", action="store_true",
                    help="위험 강도라도 자른다(그림 색이 지워질 수 있다)")
    a = ap.parse_args(argv)
    key = KEY_MAGENTA if a.key == "magenta" else KEY_GREEN
    items = [p for p in PROPS if not a.only or p["name"] == a.only]

    if a.list:
        print(f"발주 대상 {len(items)}건 (PixelLab 생성 {len(items)}회)")
        for p in items:
            slot = f"아틀라스 {p['slot']} 칸 대체" if p["slot"] else "새 소품"
            print(f"  {p['name']:8} {p['size']}px  {slot}")
        print(f"키 색: {a.key} {key}")
        return 0

    if a.dry:
        for p in items:
            print(f"--- {p['name']}")
            print(json.dumps(prompt_for(p, key), ensure_ascii=False, indent=1))
        print(f"\n지출 0. 실제 주문은 GENESIS_SPEND=i-approve 가 필요하다.")
        return 0

    if os.environ.get("GENESIS_SPEND") != "i-approve":
        print("지출 경로가 잠겨 있다. GENESIS_SPEND=i-approve 를 붙여라.")
        return 2

    os.makedirs(OUT, exist_ok=True)
    results = []
    for p in items:
        print(f"주문: {p['name']}", flush=True)
        r = pl.call("POST", "/create-image-pixflux", prompt_for(p, key))
        imgs = pl.images_in(r)
        if not imgs:
            print("  이미지가 안 왔다"); results.append({"name": p["name"],
                                                   "ok": False}); continue
        raw = os.path.join(OUT, f"{p['name']}.png")
        with open(raw, "wb") as fh:
            import base64
            fh.write(base64.b64decode(imgs[0]))
        cut = extract(raw, key, a.strength, a.force)
        print(f"  원본 {raw}")
        if cut["ok"]:
            print(f"  분해 {cut['out']}  강도 {cut['strength']} "
                  f"(천장 {cut['ceiling']})  남긴 픽셀 {cut['kept']}")
        else:
            print(f"  분해 거부: {cut['why']}")
        cut.pop("image", None)
        results.append({"name": p["name"], "raw": raw, **cut})
    rec = os.path.join("data", "prop_orders.json")
    with open(os.path.join(ROOT, rec), "w", encoding="utf-8") as fh:
        json.dump({"key": list(key), "results": results}, fh,
                  ensure_ascii=False, indent=2)
    print(f"기록: {rec}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
