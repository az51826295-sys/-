"""제대로 된 주문 한 번 — 아트 디렉션 + 스타일 파라미터 + 팔레트, 셋을 같이.

  python -X utf8 tools/artgen/order_pastel.py --dry
  GENESIS_SPEND=i-approve python -X utf8 tools/artgen/order_pastel.py

**왜.** 08-27까지 우리가 PixelLab에 보낸 문장은 `"lush green grass meadow"` 네
단어였고, 스타일 파라미터는 16개 중 3개만 썼고, pro 엔드포인트는 존재도 몰랐고,
여러 번 뽑아 고른 적도 없다. **넷 중 하나도 안 한 결과**를 보고 도구 탓을 할 수는
없다. 이 주문은 그 넷을 처음으로 같이 한다.

**목표 톤은 측정에서 왔다.** 사장님이 주신 참고 화면을 재니 밝기 중앙값 181 /
채도 35였다. 우리 지형은 87 / 76이다 - 두 배 어둡고 두 배 쨍하다. 그 화면의
팔레트를 그대로 베끼지 않는다(남의 게임 그림이다). 대신 **우리 팔레트를 그 수치로
옮겨서** 우리 것으로 만든다.
"""
from __future__ import annotations

import argparse
import base64
import colorsys
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from PIL import Image                                          # noqa: E402

from genesis import consistency as cs                          # noqa: E402
from tools.artgen import audition_pixellab as pl               # noqa: E402
from tools.artgen import build_atlas                           # noqa: E402
from tools.artgen import pixellab_ledger as led                # noqa: E402

OUT = os.path.join("audition", "pastel")
TARGET_LUMA = 181          # 참고 화면 실측
TARGET_SAT = 35            # 참고 화면 실측
_R, _G, _B = 0.299, 0.587, 0.114

# 아트 디렉션. 네 단어가 아니라 **무엇을 어떻게 그릴지**를 적는다.
STYLE = ("soft pastel colour palette, muted desaturated hues, high-key lighting, "
         "gentle multi-step shading with soft ambient shadow where shapes meet, "
         "cosy storybook mood, clean readable pixel clusters, no harsh contrast")
LOWER = ("a soft meadow of pale mint and lavender-tinted grass, fine grass tufts, "
         "a few tiny pale wildflowers and small pebbles scattered sparsely, "
         f"{STYLE}")
UPPER = ("a gently worn earth footpath in warm pale sand and clay tones, "
         "small smooth stones pressed into the surface, soft edges where the "
         f"path meets the grass, {STYLE}")
TRANSITION = ("a soft feathered border where pale grass thins into the sandy "
              "path, scattered blades and loose grains, no hard line")


def _pastel(c) -> tuple:
    """우리 색 하나를 목표 톤(밝기 181 / 채도 35)으로 옮긴다."""
    h, l, s = colorsys.rgb_to_hls(*[v / 255 for v in c])
    # 채도는 목표 비율로, 밝기는 목표 쪽으로 끌어당긴다(색상은 그대로 둔다 -
    # 색상까지 바꾸면 우리 게임의 색이 아니게 된다)
    s2 = min(1.0, TARGET_SAT / 255 * 2.2)
    l2 = l + (TARGET_LUMA / 255 - l) * 0.75
    r, g, b = colorsys.hls_to_rgb(h, max(0.0, min(1.0, l2)), s2)
    return tuple(round(v * 255) for v in (r, g, b))


def pastel_palette(root: str = ROOT) -> list:
    """우리 지형 팔레트를 파스텔로 옮긴 것. **우리 색이지 남의 색이 아니다.**"""
    base = cs.palette([os.path.join(root, p) for p in build_atlas.wang_order(root)])
    out, seen = [], set()
    for c in base:
        p = _pastel(c)
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def palette_png(root: str = ROOT) -> str:
    """`color_image` 는 **64x64여야 한다** - 08-27에 40x1을 보내 실패했다."""
    colors = pastel_palette(root)
    img = Image.new("RGB", (64, 64))
    px = img.load()
    for y in range(64):
        for x in range(64):
            px[x, y] = colors[(y * 64 + x) % len(colors)]
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def body(root: str = ROOT) -> dict:
    return {
        "lower_description": LOWER,
        "upper_description": UPPER,
        "transition_description": TRANSITION,
        "tile_size": {"width": 16, "height": 16},
        "view": "high top-down",
        # 지금까지 한 번도 안 보낸 것들
        "shading": "highly detailed shading",
        "detail": "highly detailed",
        "outline": "lineless",
        "text_guidance_scale": 9.0,
        "color_image": {"type": "base64", "format": "png",
                        "base64": palette_png(root)},
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args(argv)
    b = body()
    if a.dry:
        shown = {k: (f"<png 64x64>" if k == "color_image" else v)
                 for k, v in b.items()}
        print(json.dumps(shown, ensure_ascii=False, indent=1))
        pal = pastel_palette()
        print(f"\n파스텔 팔레트 {len(pal)}색  예: {pal[:6]}")
        print(f"잔량 {led.generations()}회 · 타일셋 1건 = 3회")
        return 0
    if os.environ.get("GENESIS_SPEND") != "i-approve":
        print("지출 경로가 잠겨 있다. GENESIS_SPEND=i-approve 를 붙여라.")
        return 2
    os.makedirs(os.path.join(ROOT, OUT), exist_ok=True)
    with led.Order("create-tileset pastel(제대로 된 문장+파라미터+팔레트)") as o:
        r = pl.call("POST", "/create-tileset", b)
        job = r.get("background_job_id") or r.get("job_id")
        tid = r.get("tileset_id") or r.get("id")
        if job:
            pl.poll_job(job)
        doc = pl.call("GET", f"/tilesets/{tid}") if tid else r
    with open(os.path.join(ROOT, OUT, "result.json"), "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
    n = 0
    for i, b64 in enumerate(pl.images_in(doc)):
        with open(os.path.join(ROOT, OUT, f"tile_{i}.png"), "wb") as fh:
            fh.write(base64.b64decode(b64))
        n += 1
    print(f"타일 {n}장 → {OUT}   실제 소모 {o.spent}회 (잔량 {o.after})")
    return 0 if n else 1


if __name__ == "__main__":
    sys.exit(main())
