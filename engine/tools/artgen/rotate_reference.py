"""참조 이미지를 8방향으로 돌린다 (PixelLab `create-character-v3`).

  python -X utf8 tools/artgen/rotate_reference.py in.png --dry
  GENESIS_SPEND=i-approve python -X utf8 tools/artgen/rotate_reference.py \
      audition/gpt_raw/witch_key/witch_key_0.png --name witch --size 64

2026-08-27 사장님: *"www.pixellab.ai 이걸로 하자."*

**GPT가 그린 것을 버리지 않는다.** GPT는 한 방향을 아주 잘 그리고, PixelLab v3는
그것을 **8방향으로 돌린다**(`reference_image` 모드). 각자 잘하는 것만 시킨다 —
그게 연출가가 하는 일이다.

비용은 `ceil(w*h*8/65536)` 생성이다. 64×64면 **1회**, 128×128이면 2회.
**참조는 정면(south-facing)이어야 한다** — 모델이 그렇게 훈련됐다고 명세에 적혀 있다.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import urllib.request                                          # noqa: E402

from PIL import Image                                          # noqa: E402

from tools.artgen import audition_pixellab as pl               # noqa: E402
from tools.artgen import pixelize as pz                        # noqa: E402
from tools.artgen import pixellab_ledger as led                # noqa: E402

OUT = os.path.join("audition", "rotated")


def cost(size: int) -> int:
    import math
    return math.ceil(size * size * 8 / 65536)


def reference_b64(src: str, size: int, colors: int = 48,
                  save: str | None = None) -> str:
    """참조를 우리 격자로 먼저 정리해서 보낸다.

    흐릿한 1024px 그림을 그대로 보내면 v3가 그 흐림을 8방향에 복제한다.
    먼저 진짜 도트로 만들어 보내면 회전본도 도트로 온다.
    """
    img = pz.pixelize(Image.open(src), size, size, colors=colors)
    if save:
        os.makedirs(os.path.dirname(save) or ".", exist_ok=True)
        img.save(save)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def fetch_zip(cid: str, dest: str, root: str = ROOT) -> list:
    key = open(os.path.join(root, ".secrets", "pixellab.key"),
               encoding="ascii").read().strip()
    req = urllib.request.Request(
        f"https://api.pixellab.ai/v2/characters/{cid}/zip",
        headers={"Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=180) as r:
        blob = r.read()
    z = zipfile.ZipFile(io.BytesIO(blob))
    z.extractall(dest)
    return [n for n in z.namelist() if n.endswith(".png")]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("src")
    ap.add_argument("--name", default="rotated")
    ap.add_argument("--size", type=int, default=64,
                    help="참조 크기. 비용 = ceil(size^2*8/65536)")
    ap.add_argument("--desc", default="a young witch with a wide-brimmed "
                    "pointed hat and a deep plum cloak")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args(argv)
    d = os.path.join(ROOT, OUT, a.name)
    ref_png = os.path.join(d, "reference.png")
    b64 = reference_b64(a.src, a.size, save=ref_png)
    if a.dry:
        print(f"참조 {a.src} → {a.size}x{a.size} ({ref_png})")
        print(f"예상 비용 {cost(a.size)}회 · 잔량 {led.generations()}회")
        print("실제 주문은 GENESIS_SPEND=i-approve.")
        return 0
    if os.environ.get("GENESIS_SPEND") != "i-approve":
        print("지출 경로가 잠겨 있다. GENESIS_SPEND=i-approve 를 붙여라.")
        return 2
    with led.Order(f"create-character-v3 ref {a.name} {a.size}px") as o:
        r = pl.call("POST", "/create-character-v3",
                    {"description": a.desc,
                     "reference_image": {"type": "base64", "format": "png",
                                         "base64": b64}})
        job = r.get("background_job_id") or r.get("job_id")
        cid = r.get("character_id") or r.get("id")
        if job:
            pl.poll_job(job)
    if not cid:
        print(f"character_id 가 안 왔다: {json.dumps(r, ensure_ascii=False)[:400]}")
        return 1
    files = fetch_zip(cid, d)
    print(f"{len(files)}장 → {d}   소모 {o.spent}회 (잔량 {o.after})")
    for f in files[:10]:
        print("  ", f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
