"""아이콘 자동 조립 — 고른 SVG를 게임에 넣을 PNG로 (게이트 ④).

  python -X utf8 tools/icon_export.py

지금까지 게임 자산은 **손으로** 들어갔다(08-07 오디션분). 그러면 "설계도 →
자산 → 조립"이 끊긴다. 이 도구가 그 칸을 잇는다:

  선별 기록(사장님이 고른 것) → 래스터 → game/assets/ui/*.png + manifest.json

**고르지 않는다.** 무엇을 넣을지는 선별 기록이 정하고, 이 도구는 옮기기만 한다.
빈 그림·잘린 그림을 조용히 내보내지 않도록 내보낸 뒤 다시 재서 확인한다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import svg_raster                           # noqa: E402
from tools import pick_weight_spread as pws              # noqa: E402

SIZE = 24                       # icon-24-line-v1의 viewBox와 1:1
MIN_INK = 0.01                  # 내보낸 그림이 비어 있지 않은가(커버리지 평균)
OUT_DIR = "game/assets/ui"
MANIFEST = "game/assets/ui/manifest.json"


def _png_from_coverage(cov: list, path: str, size: int) -> dict:
    """커버리지(0~1) → 흰색 + 알파 PNG. 색은 게임이 modulate로 정한다."""
    from PIL import Image

    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    px = img.load()
    ink = 0.0
    for y in range(size):
        for x in range(size):
            a = max(0.0, min(1.0, cov[y][x]))
            ink += a
            px[x, y] = (255, 255, 255, int(round(a * 255)))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    return {"ink_mean": round(ink / (size * size), 6)}


def export(root: str = ROOT, size: int = SIZE) -> dict:
    if not svg_raster.available():
        return {"error": "래스터 경로 없음 - 내보낼 수 없다(미측정)", "icons": []}
    picks = pws.load_picks(root)
    rows, problems = [], []
    for concept in sorted(picks):
        src = os.path.join(root, picks[concept])
        name = concept.split("_", 1)[-1]
        dst_rel = f"{OUT_DIR}/{name}.png"
        with open(src, encoding="utf-8") as fh:
            svg = fh.read()
        cov = svg_raster.render_coverage(svg, px=size)
        if cov is None:
            problems.append({"concept": concept, "why": "렌더 실패"})
            continue
        stat = _png_from_coverage(cov, os.path.join(root, dst_rel), size)
        row = {"concept": name, "source": picks[concept].replace("\\", "/"),
               "png": dst_rel, "size": size, **stat}
        if stat["ink_mean"] < MIN_INK:
            problems.append({"concept": concept,
                             "why": f'내보낸 그림이 거의 비었다 '
                                    f'(ink={stat["ink_mean"]})'})
            row["suspect"] = True
        rows.append(row)
    manifest = {"spec": "ui-icons-v0", "size": size, "count": len(rows),
                "icons": rows, "problems": problems,
                "note": ("선별 기록이 정한 것만 옮긴다. 이 파일은 생성물이므로 "
                         "손으로 고치지 않는다")}
    with open(os.path.join(root, MANIFEST), "w", encoding="utf-8",
              newline="\n") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
    return manifest


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--size", type=int, default=SIZE)
    a = ap.parse_args(argv)
    res = export(size=a.size)
    if res.get("error"):
        print(res["error"])
        return 0
    print(f"아이콘 {res['count']}개 → {OUT_DIR}/ ({a.size}px)")
    for r in res["icons"]:
        mark = "  ← 의심" if r.get("suspect") else ""
        print(f"  {r['concept']:<12} ink {r['ink_mean']:.4f}  "
              f"{os.path.basename(r['source'])}{mark}")
    for p in res["problems"]:
        print(f"  ✖ {p['concept']}: {p['why']}")
    print(f"기록: {MANIFEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
