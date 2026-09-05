"""팔레트 강제 A/B (docs/consistency-v0-design.md).

  python -X utf8 tools/artgen/palette_test.py --dry
  GENESIS_SPEND=i-approve python -X utf8 tools/artgen/palette_test.py
  python -X utf8 tools/artgen/palette_test.py --judge     # 받은 것으로 판정만

사장님이 정한 집중 목표: **"왜 도트 퀄리티가 일정하지 않을까?"**

같은 주문을 갈래당 두 번씩 넣고, **같은 갈래의 두 회차가 서로 얼마나 다른지**를
잰다. 그게 흔들림이다. `color_image`(팔레트 강제)가 그 흔들림을 줄이는지 본다.

**씨앗을 주지 않는다.** 흔들림을 재는 실험에서 씨앗을 고정하면 재려는 것을 없애는
셈이다.
"""
from __future__ import annotations

import argparse
import base64
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

OUT = os.path.join("audition", "palette_ab")
REPS = 2                                                       # 갈래당 회차
BASE = {"lower_description": "lush green grass meadow",
        "upper_description": "packed dirt village path",
        "tile_size": {"width": 16, "height": 16},
        "view": "low top-down"}


def reference_paths(root: str = ROOT) -> list:
    """기준 = 사장님이 3세트 중 고른 풀·흙 지형 16장."""
    return [os.path.join(root, p) for p in build_atlas.wang_order(root)]


def palette_image(root: str = ROOT) -> str:
    """기준 팔레트를 담은 작은 PNG. 색 목록을 그림으로 넘기는 것이 API 규약이다."""
    colors = cs.palette(reference_paths(root))
    w = len(colors)
    img = Image.new("RGB", (w, 1))
    img.putdata(colors)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def body(arm: str, root: str = ROOT) -> dict:
    b = dict(BASE)
    if arm == "B_palette":
        b["color_image"] = {"type": "base64", "format": "png",
                            "base64": palette_image(root)}
    return b


def order(arm: str, rep: int) -> dict:
    print(f"주문 {arm} #{rep}", flush=True)
    r = pl.call("POST", "/create-tileset", body(arm))
    job = r.get("background_job_id") or r.get("job_id")
    tid = r.get("tileset_id") or r.get("id")
    if job:
        pl.poll_job(job)
    doc = pl.call("GET", f"/tilesets/{tid}") if tid else r
    d = os.path.join(ROOT, OUT, f"{arm}_{rep}")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "response.json"), "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
    files = []
    for i, b64 in enumerate(pl.images_in(doc)):
        p = os.path.join(d, f"tile_{i}.png")
        with open(p, "wb") as fh:
            fh.write(base64.b64decode(b64))
        files.append(p)
    print(f"  타일 {len(files)}장")
    return {"arm": arm, "rep": rep, "dir": d, "n": len(files)}


def judge(root: str = ROOT) -> dict:
    """**판정식은 설계 문서에서 왔고 여기서 바꾸지 않는다.**"""
    import glob
    wob = {}
    for arm in ("A_bare", "B_palette"):
        runs = [sorted(glob.glob(os.path.join(root, OUT, f"{arm}_{r}", "tile_*.png")))
                for r in range(1, REPS + 1)]
        if not all(runs):
            wob[arm] = None
            continue
        # 흔들림 = 회차1의 팔레트를 기준으로 본 회차2의 거리
        ref = cs.palette(runs[0])
        wob[arm] = cs.against(runs[1], ref)["palette_distance"]
    a, b = wob.get("A_bare"), wob.get("B_palette")
    if a is None or b is None or a == 0:
        verdict = "undefined"
        why = "두 갈래를 다 못 받았거나 A의 흔들림이 0이다"
    elif b <= a * 0.5:
        verdict, why = "palette_pins", None
    elif b >= a * 0.9:
        verdict, why = "palette_no_effect", None
    else:
        verdict = "undefined"
        why = f"0.5배와 0.9배 사이다 (B/A = {b / a:.3f}) — 2대2로는 못 가른다"
    return {"design": "docs/consistency-v0-design.md", "verdict": verdict,
            "why": why, "wobble": wob,
            "ratio": round(b / a, 4) if (a and b is not None) else None}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--judge", action="store_true")
    a = ap.parse_args(argv)
    if a.judge:
        r = judge()
        print(json.dumps(r, ensure_ascii=False, indent=1))
        return 0
    if a.dry:
        for arm in ("A_bare", "B_palette"):
            b = body(arm)
            shown = {k: (f"<png {len(v['base64'])}자>" if k == "color_image" else v)
                     for k, v in b.items()}
            print(f"--- {arm} × {REPS}회")
            print(json.dumps(shown, ensure_ascii=False, indent=1))
        print(f"\n생성 {2 * REPS}회 소모. 실제 주문은 GENESIS_SPEND=i-approve.")
        return 0
    if os.environ.get("GENESIS_SPEND") != "i-approve":
        print("지출 경로가 잠겨 있다. GENESIS_SPEND=i-approve 를 붙여라.")
        return 2
    runs = [order(arm, rep) for arm in ("A_bare", "B_palette")
            for rep in range(1, REPS + 1)]
    res = {"runs": runs, **judge()}
    with open(os.path.join(ROOT, "data", "consistency_ab_v0.json"), "w",
              encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)
    print(f"\n판정: {res['verdict']}" + (f"  ({res['why']})" if res["why"] else ""))
    print(f"흔들림 A {res['wobble'].get('A_bare')} / B {res['wobble'].get('B_palette')}")
    print("기록: data/consistency_ab_v0.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
