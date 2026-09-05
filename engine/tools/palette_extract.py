"""마스터 팔레트 **추출** — 뽑기만 한다. 동결은 사장님 몫이다.

docs/game-design-v0.md §1b(2026-08-07 동결): "전역 마스터 팔레트는 스타일 확정
화면에서 추출해 동결". 이 도구는 그 문장의 앞쪽 절반만 한다.

  python -X utf8 tools/palette_extract.py out/images/style/*.png \
      --out data/palettes/master-v0.proposed.json

**하지 않는 것**(일부러):
- 스펙 파일(`data/image_specs/*.yaml`)에 색을 써 넣지 않는다. 동결은 사람이
  결정하고, 결정한 사실이 파일에 남아야 한다(`frozen_by`).
- 색을 합치거나 양자화하지 않는다. 픽셀 아트에서 비슷한 두 색은 대개 의도이고,
  기계가 뭉치면 원본에 없던 색이 팔레트에 들어간다.
- 상위 N개를 넘긴 색을 "틀렸다"고 하지 않는다. 넘친 색 수와 그 픽셀 비중을
  같이 적어, 자를지 말지는 보는 사람이 정한다.

정규화는 취향 특징과 같다 — 정수배 확대본은 논리 격자로 내려서 센다
(`asset_probe.measure_pixel_art`의 block_size 재사용).
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import asset_probe                          # noqa: E402

# 자리표시 아님 — docs/game-design-v0.md §1b의 "에셋당 색 수 ≤ 24"에서 온다.
DEFAULT_TOP = 24


def _hex(rgb: tuple) -> str:
    return "#%02x%02x%02x" % tuple(int(v) for v in rgb[:3])


def count_colors(path: str) -> tuple:
    """(색→픽셀수, 불투명 픽셀 총수, block_size) 또는 (None, 오류, None)."""
    probe = asset_probe.measure_pixel_art(path)
    if probe["error"]:
        return None, probe["error"], None
    from PIL import Image

    with Image.open(path) as img:
        rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    b = probe["block_size"] or 1
    counts: dict = {}
    for y in range(0, h, b):
        for x in range(0, w, b):
            p = px[x, y]
            if p[3] == 0:
                continue
            counts[p[:3]] = counts.get(p[:3], 0) + 1
    return counts, sum(counts.values()), b


def extract(paths: list, top: int = DEFAULT_TOP) -> dict:
    total: dict = {}
    per_file, errors = [], []
    for p in paths:
        counts, n_or_err, block = count_colors(p)
        if counts is None:
            errors.append({"path": p, "error": n_or_err})
            continue
        for rgb, n in counts.items():
            total[rgb] = total.get(rgb, 0) + n
        per_file.append({"path": p, "opaque_pixels": n_or_err,
                         "colors": len(counts), "block_size": block})
    grand = sum(total.values())
    # 정렬은 (픽셀 수 내림차순, hex 오름차순) — 동률에서 순서가 흔들리면
    # 같은 입력이 다른 팔레트를 낸다.
    ordered = sorted(total.items(), key=lambda kv: (-kv[1], _hex(kv[0])))
    kept = ordered[:top]
    cut = ordered[top:]
    return {
        "tool": "tools/palette_extract.py",
        "extracted_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "status": "proposed",
        "frozen": False,
        "frozen_by": None,
        "note": ("추출값이다. 동결은 사장님이 하신다 - 이 파일을 스펙으로 쓰지 "
                 "말 것."),
        "sources": per_file,
        "errors": errors,
        "opaque_pixels_total": grand,
        "distinct_colors": len(total),
        "top": top,
        "palette": [{"hex": _hex(rgb), "rgb": list(rgb), "count": n,
                     "share": round(n / grand, 6) if grand else 0.0}
                    for rgb, n in kept],
        "over_top": {
            "colors": len(cut),
            "pixel_share": round(sum(n for _c, n in cut) / grand, 6)
            if grand else 0.0,
        },
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="마스터 팔레트 추출(동결 아님)")
    ap.add_argument("images", nargs="+", help="PNG 경로 또는 글롭")
    ap.add_argument("--top", type=int, default=DEFAULT_TOP)
    ap.add_argument("--out", default=None)
    a = ap.parse_args(argv)

    paths = []
    for pat in a.images:
        hit = sorted(glob.glob(pat))
        paths.extend(hit or [pat])
    result = extract(paths, top=a.top)

    for c in result["palette"]:
        print(f"{c['hex']}  {c['count']:>8}  {c['share']:.4f}")
    print(f"\n서로 다른 색 {result['distinct_colors']}개 중 상위 {a.top}개."
          f" 넘친 색 {result['over_top']['colors']}개"
          f"(픽셀 {result['over_top']['pixel_share']:.4f}).")
    if result["errors"]:
        print(f"못 읽은 파일 {len(result['errors'])}건.")
    print("status=proposed / frozen=false - 동결은 사장님 결정입니다.")

    if a.out:
        os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
        with open(a.out, "w", encoding="utf-8", newline="\n") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
