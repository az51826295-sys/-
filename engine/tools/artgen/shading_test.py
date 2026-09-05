"""shading 파라미터 A/B (docs/shading-param-v0-design.md).

  python -X utf8 tools/artgen/shading_test.py --dry
  GENESIS_SPEND=i-approve python -X utf8 tools/artgen/shading_test.py

같은 씨앗·같은 설명으로 타일셋을 두 번 주문한다. **A는 지금까지 우리가 보내던
그대로**(shading 없음), B는 shading/detail/outline 을 넣는다. 사장님 질문
("그림자 표현도 없고… 니가 프롬프트를 못 넣은 거야?")에 그림으로 답하는 것이
목적이다.
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

OUT = os.path.join("audition", "shading_ab")
SEED = 20260827
BASE = {"lower_description": "lush green grass meadow",
        "upper_description": "packed dirt village path",
        "tile_size": {"width": 16, "height": 16},
        "view": "low top-down",
        "seed": SEED}
ARMS = {
    # 2026-08-07 오디션이 실제로 보낸 것. 아무 스타일 파라미터도 없다.
    "A_bare": {},
    "B_shaded": {"shading": "highly detailed shading",
                 "detail": "highly detailed",
                 "outline": "selective outline"},
}


def body(arm: str) -> dict:
    return {**BASE, **ARMS[arm]}


def order(arm: str) -> dict:
    print(f"주문 {arm}: {json.dumps(ARMS[arm], ensure_ascii=False) or '(스타일 없음)'}",
          flush=True)
    r = pl.call("POST", "/create-tileset", body(arm))
    job = r.get("background_job_id") or r.get("job_id")
    tid = r.get("tileset_id") or r.get("id")
    if job:
        pl.poll_job(job)
    doc = pl.call("GET", f"/tilesets/{tid}") if tid else r
    d = os.path.join(ROOT, OUT, arm)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "response.json"), "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
    saved = []
    for i, b64 in enumerate(pl.images_in(doc)):
        p = os.path.join(d, f"tile_{i}.png")
        with open(p, "wb") as fh:
            fh.write(base64.b64decode(b64))
        saved.append(p)
    print(f"  타일 {len(saved)}장 → {d}")
    return {"arm": arm, "tileset_id": tid, "files": saved}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args(argv)
    if a.dry:
        for arm in ARMS:
            print(f"--- {arm}")
            print(json.dumps(body(arm), ensure_ascii=False, indent=1))
        print("\n생성 2회 소모. 실제 주문은 GENESIS_SPEND=i-approve.")
        return 0
    if os.environ.get("GENESIS_SPEND") != "i-approve":
        print("지출 경로가 잠겨 있다. GENESIS_SPEND=i-approve 를 붙여라.")
        return 2
    res = [order(arm) for arm in ARMS]
    rec = os.path.join(ROOT, "data", "shading_ab_v0.json")
    with open(rec, "w", encoding="utf-8") as fh:
        json.dump({"design": "docs/shading-param-v0-design.md",
                   "seed": SEED, "arms": ARMS, "runs": res}, fh,
                  ensure_ascii=False, indent=2)
    print(f"기록: data/shading_ab_v0.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
