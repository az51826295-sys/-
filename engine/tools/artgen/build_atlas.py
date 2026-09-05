"""게임 타일 아틀라스 조립 — 오디션 진짜 타일 + 남은 자리표시자.

  python -X utf8 tools/artgen/build_atlas.py

**왜 이 도구가 생겼나.** 08-27 사장님이 "도트 퀄리티 좀 늘려라, 못 알아보겠다"고
하셨다. 재 보니 게임 타일 8장은 전부 `make_placeholder_tiles.py`가 그린 단색
블록이었다 — 진짜 아트는 `audition/pixellab/tileset_*.png` 16장인데 색 상한 24에
걸려 반입되지 못하고 있었다(낱장 31색). 상한을 48로 올린 뒤(스펙 v2) 16장 전부가
통과했다.

**하지만 1:1로 못 바꾼다.** 오디션 16장은 **wang 타일셋**이다 — 풀↔흙 두 지형의
모서리 조합 16가지이지 서로 다른 지형 8종이 아니다. 물·나무·벽·지붕·문에
해당하는 그림이 **없다.** 그러니 정직한 조립은 이것이다:

  칸 0..15   오디션 wang 16장  (풀/흙 지형 — 맵의 대부분)
  칸 16..20  자리표시자 5장    (물·나무·벽·지붕·문 — 아직 진짜 아트가 없다)

지형이 화면의 대부분이므로 여기만 바꿔도 눈에 보이는 차이는 크다. 남은 5칸이
아직 자리표시자라는 사실은 매니페스트에 그대로 적는다 — 감추면 다음 사람이
"타일은 진짜다"라고 잘못 읽는다.
"""
from __future__ import annotations

import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TILE = 16
AUDITION = "audition/pixellab"
RESULT = os.path.join(AUDITION, "tileset_result.json")
OUT = os.path.join("game", "assets", "tiles", "atlas.png")
# 자리표시자에서 계속 쓰는 칸(원래 아틀라스의 x 인덱스)과 그 뜻
KEEP_PLACEHOLDER = [(3, "water"), (4, "tree"), (5, "wall"), (6, "roof"), (7, "door")]
# 마지막 칸은 **완전 투명**이다. 나무처럼 그림은 스프라이트로 그리고 충돌만
# 타일에 남겨야 하는 것에 쓴다. 08-27 사장님이 참고 화면을 주시며 "타일로만
# 되냐"고 물으셨고, 답은 아니오였다 - 수관이 격자를 무시하고 서로 겹친다.
# 그러려면 그림은 자유 배치 스프라이트여야 하고, 충돌은 여기 남는다.
BLOCKER = "blocker"


def wang_order(root: str = ROOT) -> list:
    """파일 순서 → wang 번호. 결과 JSON의 tiles 배열 순서가 파일 번호다.

    PixelLab이 돌려준 순서는 wang 번호순이 **아니다**(첫 장이 wang_13이다).
    번호를 직접 읽어야 0(전부 풀)과 15(전부 흙)를 맞게 집는다.
    """
    with open(os.path.join(root, RESULT), encoding="utf-8") as fh:
        doc = json.load(fh)
    out = {}
    for i, t in enumerate(doc["tileset"]["tiles"]):
        wang = int(t["name"].rsplit("_", 1)[1])
        out[wang] = f"{AUDITION}/tileset_{i}.png"
    if sorted(out) != list(range(16)):
        raise ValueError(f"wang 16칸이 다 안 왔다: {sorted(out)}")
    return [out[w] for w in range(16)]


def build(root: str = ROOT, out: str = OUT) -> dict:
    old_path = os.path.join(root, out)
    old = Image.open(old_path).convert("RGBA") if os.path.exists(old_path) else None
    files = wang_order(root)
    n = len(files) + len(KEEP_PLACEHOLDER) + 1   # +1 = 투명 충돌 칸
    atlas = Image.new("RGBA", (TILE * n, TILE), (0, 0, 0, 0))
    for x, rel in enumerate(files):
        im = Image.open(os.path.join(root, rel)).convert("RGBA")
        if im.size != (TILE, TILE):
            raise ValueError(f"{rel} 크기 {im.size} — {TILE}칸이 아니다")
        atlas.paste(im, (x * TILE, 0))
    slots = {}
    for i, (src_x, name) in enumerate(KEEP_PLACEHOLDER):
        x = len(files) + i
        slots[name] = x
        if old is not None:
            atlas.paste(old.crop((src_x * TILE, 0, (src_x + 1) * TILE, TILE)),
                        (x * TILE, 0))
    slots[BLOCKER] = len(files) + len(KEEP_PLACEHOLDER)   # 그린 것이 없다 = 투명
    atlas.save(old_path)
    colors = len(atlas.convert("RGBA").getcolors(maxcolors=1 << 16) or [])
    return {"out": out, "size": list(atlas.size), "wang": len(files),
            "placeholder": slots, "colors": colors,
            "note": "칸 16~20은 여전히 자리표시자다(물·나무·벽·지붕·문)"}


def main(argv=None) -> int:
    res = build()
    print(f"아틀라스 {res['out']}  {res['size'][0]}x{res['size'][1]}  색 {res['colors']}")
    print(f"  wang 진짜 타일 {res['wang']}칸 (0~{res['wang']-1})")
    print(f"  자리표시자 {res['placeholder']}")
    print(f"  {res['note']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
