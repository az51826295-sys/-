"""지형 wang 타일셋 주문 — 물·숲이 풀과 이어지게 한다.

  python -X utf8 tools/artgen/order_terrain_tileset.py water --dry
  GENESIS_SPEND=i-approve python -X utf8 tools/artgen/order_terrain_tileset.py forest

**왜.** 2026-08-27 사장님: *"연못 타일에 일정 부분은 풀이랑 연결해야 자연스러워."*
지금 물은 자리표시자 단색 타일 하나라 풀과 만나는 자리가 뚝 끊긴다. 흙길에 쓴
것과 **같은 wang 방식**을 물에도 준다 - 모서리 조합 16장이면 물가가 풀에 녹아든다.

**풀이 어긋나면 안 된다.** 새 타일셋도 제 나름의 풀을 그리는데, 그게 지금 게임의
풀과 다르면 연못 주변만 색이 튄다. API에 `lower_reference_image` 가 있으므로
**게임에 실제로 들어 있는 풀 타일을 참조로 넣는다.**

**스타일 파라미터는 일부러 안 보낸다.** 08-27 A/B에서 `shading`·`detail`·`outline`
을 넣은 쪽이 측정은 올랐지만, 사장님이 세 세트 중 **맨몸으로 주문한 08-07 것**을
가장 좋다고 고르셨다. 지금 게임의 풀·흙이 그 세트다. 여기에 맞추는 것이 목적이므로
같은 조건으로 주문한다.

**숲도 같은 방식이다.** 처음에는 나무를 낱장 소품으로 뽑으려 했는데 PixelLab의
최소 캔버스가 32×32라 16px 나무가 안 나왔다. 그 막힘이 오히려 맞는 길을 가리켰다 -
지금 맵의 나무 칸은 222개이고, 그건 낱장 소품이 아니라 **숲이라는 지형**이다.
물처럼 wang으로 주면 숲 가장자리가 풀에 녹아든다.

지형 하나당 무료 생성 **1회** 소모.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tools.artgen import audition_pixellab as pl              # noqa: E402
from tools.artgen import build_atlas                          # noqa: E402

TERRAINS = {
    "water": {
        "upper": "clear shallow pond water with a sandy shore edge",
        "transition": "wet sand and pebble shoreline",
    },
    "forest": {
        "upper": "dense forest canopy of round leafy treetops seen from above",
        "transition": "scattered bushes and undergrowth at the forest edge",
    },
}


def grass_reference(root: str = ROOT) -> str:
    """게임에 들어 있는 **순수 풀 타일**(wang_0)을 base64로. 이게 기준이다."""
    path = os.path.join(root, build_atlas.wang_order(root)[0])
    with open(path, "rb") as fh:
        return base64.b64encode(fh.read()).decode("ascii")


def body(name: str, root: str = ROOT) -> dict:
    t = TERRAINS[name]
    return {
        "lower_description": "lush green grass meadow",
        "upper_description": t["upper"],
        "transition_description": t["transition"],
        "tile_size": {"width": 16, "height": 16},
        "view": "low top-down",
        # 풀 쪽을 지금 게임의 풀에 맞춘다 - 이게 이 주문의 핵심이다
        "lower_reference_image": {"type": "base64", "format": "png",
                                  "base64": grass_reference(root)},
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("terrain", choices=sorted(TERRAINS))
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args(argv)
    out = os.path.join("audition", a.terrain)
    b = body(a.terrain)
    if a.dry:
        shown = {k: (f"<png {len(v['base64'])}자>" if k.endswith("_image") else v)
                 for k, v in b.items()}
        print(json.dumps(shown, ensure_ascii=False, indent=1))
        print("\n생성 1회 소모. 실제 주문은 GENESIS_SPEND=i-approve.")
        return 0
    if os.environ.get("GENESIS_SPEND") != "i-approve":
        print("지출 경로가 잠겨 있다. GENESIS_SPEND=i-approve 를 붙여라.")
        return 2
    r = pl.call("POST", "/create-tileset", b)
    job = r.get("background_job_id") or r.get("job_id")
    tid = r.get("tileset_id") or r.get("id")
    if job:
        pl.poll_job(job)
    doc = pl.call("GET", f"/tilesets/{tid}") if tid else r
    d = os.path.join(ROOT, out)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "tileset_result.json"), "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
    n = 0
    for i, b64 in enumerate(pl.images_in(doc)):
        with open(os.path.join(d, f"{a.terrain}_{i}.png"), "wb") as fh:
            fh.write(base64.b64decode(b64))
        n += 1
    print(f"타일 {n}장 → {out}")
    return 0 if n else 1


if __name__ == "__main__":
    sys.exit(main())
