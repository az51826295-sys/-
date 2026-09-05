"""품질 바 — 사장님이 가리킨 **레퍼런스 작품**을 수치로 옮긴다.

`docs/director-ai-vision.md` 2단계: *"품질 바를 **레퍼런스 작품으로** 박는다.
추상어 대신 실제 작품을 가리킨다."*

2026-08-27에 사장님이 참고 화면 하나를 주시며 *"이 정도 퀄리티로 가고"* 라고
하셨다. 그 한 장이 이 제품의 **목표**다. 우리가 "예쁘다/아름답다" 같은 못 재는
말을 안 써도 되는 이유가 이것이다 — 가리킨 작품이 있으면 재면 된다.

**남의 그림에서 팔레트를 그대로 베끼지 않는다.** 통계(밝기·채도·명암폭)만 뽑는다.
"이 정도 톤으로" 는 정상적인 참고이고, 색을 통째로 가져오는 것은 다른 일이다.
그 선을 코드에 남긴다.

**화면 캡처는 압축돼 있다.** 색 수를 그대로 세면 수만 개가 나오므로 색 수는
재지 않는다(`colors: None`). 재지 않은 것을 재지 않았다고 적는 것이 3값 규율이다.
"""
from __future__ import annotations

import json
import os
import statistics

from PIL import Image

BAR_DIR = os.path.join("data", "quality_bar")
_R, _G, _B = 0.299, 0.587, 0.114


def _luma(c) -> float:
    return _R * c[0] + _G * c[1] + _B * c[2]


def _sat(c) -> float:
    return max(c) - min(c)


def measure(path: str, crop: tuple | None = None,
            scale_down: int = 2, sample: int = 400) -> dict:
    """레퍼런스 한 장에서 통계를 뽑는다. **팔레트는 뽑지 않는다.**

    `scale_down` 은 화면 캡처의 확대 배율을 되돌린다(2배로 찍힌 것이 흔하다).
    `sample` 은 빈도 가중 표본을 만들 때 몇 화소당 한 표를 줄지다 - 큰 그림을
    통째로 세면 느리기만 하고 결과가 같다.
    """
    im = Image.open(path).convert("RGB")
    if crop:
        im = im.crop(crop)
    if scale_down > 1:
        im = im.resize((im.width // scale_down, im.height // scale_down),
                       Image.NEAREST)
    cols = im.getcolors(1 << 22)
    if not cols:
        raise ValueError("색을 못 셌다 - 그림이 너무 크다")
    lum, sat = [], []
    for n, c in cols:
        w = max(1, n // sample)
        lum += [_luma(c)] * w
        sat += [_sat(c)] * w
    lum.sort()
    return {"source": os.path.basename(path),
            "size": list(im.size), "crop": list(crop) if crop else None,
            "scale_down": scale_down,
            "luma_median": round(statistics.median(lum), 1),
            "luma_spread": round(lum[int(len(lum) * .95)]
                                 - lum[int(len(lum) * .05)], 1),
            "saturation_median": round(statistics.median(sat), 1),
            # 화면 캡처는 압축돼 있어 색 수가 부풀려진다. **재지 않는다.**
            "colors": None,
            "colors_note": "화면 캡처는 압축으로 색이 부풀려져 세지 않았다(미측정)",
            "palette_taken": False,
            "palette_note": ("남의 작품에서 팔레트를 가져오지 않는다. 통계만 "
                             "뽑는다 - '이 정도 톤으로'는 참고이고 색을 통째로 "
                             "가져오는 것은 다른 일이다"),
            "basis": "docs/director-ai-vision.md 2단계 — 품질 바는 레퍼런스 작품"}


def adopt(path: str, name: str, pointed_by: str, note: str = "",
          root: str = ".", **kw) -> dict:
    if not pointed_by.strip():
        raise ValueError("누가 이 작품을 가리켰는지 적어라 - 품질 바는 사람이 정한다")
    doc = measure(path, **kw)
    doc.update({"name": name, "pointed_by": pointed_by, "note": note})
    d = os.path.join(root, BAR_DIR)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, f"{name}.json")
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
    doc["path"] = p
    return doc


def load(name: str, root: str = ".") -> dict:
    with open(os.path.join(root, BAR_DIR, f"{name}.json"), encoding="utf-8") as fh:
        return json.load(fh)
