"""마녀 주인공 발주 — 여러 명 뽑아서 고른다.

  python -X utf8 tools/artgen/order_witch.py --dry
  GENESIS_SPEND=i-approve python -X utf8 tools/artgen/order_witch.py --n 1

2026-08-27 사장님: *"캐릭터만 잘 뽑으면 돼. 마녀."*

**오늘 배운 것을 프롬프트에 반영한다.**

내가 아침에 쓴 "제대로 된" 프롬프트는 `muted desaturated hues, no harsh contrast,
lineless` 였고, 결과는 명암폭 172 → **36**으로 뭉개진 베이지 죽이었다.
**대비를 없애 달라고 써 놓고 대비가 없다고 했다.**

사장님이 주신 참고 화면을 다시 재니 채도 37 / 밝기중앙 169인데 **명암폭이 172**다.
파스텔은 *저채도 + 넓은 명암폭*이지 밋밋한 게 아니었다. 그래서 이 주문은
**채도는 낮게, 명암폭은 강하게** 요구한다 - 정반대 지시다.

그리고 스타일 문구를 짧게 유지한다. 아침에는 40단어짜리 스타일 꼬리를 16×16
타일에 붙였다. 256화소에 들어갈 수 없는 것을 요구하면 정작 주제가 묻힌다.

**엔드포인트는 `create-character-v3`.** 비용이 `ceil(w*h*8/65536)+1` 이라 48×48이면
약 2회다(pro는 20~40회라 잔량으로 불가). 여러 명 뽑아 고르는 것이 목적이므로
싼 쪽이 맞다 - **고를 수 있는 것이 이 제품의 전부다.**
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

from tools.artgen import audition_pixellab as pl               # noqa: E402
from tools.artgen import pixellab_ledger as led                # noqa: E402

OUT = os.path.join("audition", "witch")
SIZE = 48

# 명암을 **요구한다.** 이게 오늘 배운 것의 전부다.
LIGHT = ("strong light and shadow: deep shadow under the hat brim and inside the "
         "cloak folds, bright highlight on the hat crown and shoulders, "
         "low saturation but a wide range from dark to light")

# 같은 인물을 다르게 잡은 셋. 뽑아 놓고 고른다.
VARIANTS = [
    {"name": "witch_a",
     "desc": ("a young witch standing calmly, wide-brimmed pointed hat tilted "
              "slightly, long dark hair past the shoulders, layered travelling "
              f"cloak over a simple dress, leather satchel at the hip, worn boots. {LIGHT}")},
    {"name": "witch_b",
     "desc": ("a small witch girl, oversized pointed hat with a folded tip, "
              "short messy hair, patched cloak, wooden wand tucked in her belt, "
              f"striped stockings and buckled shoes. {LIGHT}")},
    {"name": "witch_c",
     "desc": ("a witch in a long dark robe with a deep hood over a pointed hat, "
              "silver clasp at the throat, a lantern hanging from one hand, "
              f"heavy boots. {LIGHT}")},
]


def body(v: dict) -> dict:
    return {"description": v["desc"],
            "image_size": {"width": SIZE, "height": SIZE},
            "view": "low top-down",
            "detail": "highly detailed",
            "outline": "selective outline",     # lineless는 형태를 지운다(오늘 배움)
            "no_background": True}


def order(v: dict) -> dict:
    d = os.path.join(ROOT, OUT, v["name"])
    os.makedirs(d, exist_ok=True)
    with led.Order(f"create-character-v3 {v['name']}") as o:
        r = pl.call("POST", "/create-character-v3", body(v))
        job = r.get("background_job_id") or r.get("job_id")
        cid = r.get("character_id") or r.get("id")
        if job:
            pl.poll_job(job)
        doc = pl.call("GET", f"/characters/{cid}") if cid else r
    with open(os.path.join(d, "result.json"), "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
    n = 0
    for i, b64 in enumerate(pl.images_in(doc)):
        with open(os.path.join(d, f"dir_{i}.png"), "wb") as fh:
            fh.write(base64.b64decode(b64))
        n += 1
    print(f"  {v['name']}: {n}장  소모 {o.spent}회  잔량 {o.after}")
    return {"name": v["name"], "n": n, "spent": o.spent, "left": o.after}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--n", type=int, default=1,
                    help="몇 명 뽑을지. 한 명 뽑고 실제 단가를 본 뒤 늘려라")
    a = ap.parse_args(argv)
    if a.dry:
        for v in VARIANTS:
            print(f"--- {v['name']}")
            print(json.dumps(body(v), ensure_ascii=False, indent=1))
        print(f"\n잔량 {led.generations()}회. 48x48 v3 예상 단가 2회.")
        return 0
    if os.environ.get("GENESIS_SPEND") != "i-approve":
        print("지출 경로가 잠겨 있다. GENESIS_SPEND=i-approve 를 붙여라.")
        return 2
    out = []
    for v in VARIANTS[:a.n]:
        try:
            out.append(order(v))
        except SystemExit as exc:
            print(f"  {v['name']} 실패: {exc}")
            break
    with open(os.path.join(ROOT, "data", "witch_orders.json"), "w",
              encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
