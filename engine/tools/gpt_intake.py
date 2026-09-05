"""GPT가 그린 그림 → 진짜 게임 자산 (2026-08-27 사장님 방침).

  python -X utf8 tools/gpt_intake.py in.png --profile character --name witch
  python -X utf8 tools/gpt_intake.py in.png --profile tile --key magenta
  python -X utf8 tools/gpt_intake.py in.png --profile character --bible witch

> "도트는 지피티가 더 잘할 수 있어. 아예 지피티로 만들자."

**정직하게 나눠서 적는다.** GPT 이미지 모델은 *보기엔 픽셀아트인데 진짜 픽셀아트가
아닌 것*을 낸다 — 격자가 안 맞고, 색이 수천 개고, 가장자리가 흐리고, 배경이
투명하지 않다. 그건 GPT가 못해서가 아니라 그 모델이 그런 물건을 만들게 돼 있어서다.

**그리고 그걸 진짜 자산으로 바꾸는 것이 정확히 이 엔진이 할 일이다.**
생성은 생성 AI가, 규격·일관성·판정은 연출가가. 그게 이 제품의 분업이다.

이 도구가 하는 다섯 칸:

  1 배경 제거   알파가 없으면 크로마키로 자른다 (genesis/chroma)
  2 격자 강제   목표 논리 크기로 축소해 픽셀=격자로 만든다 (artgen/pixelize)
  3 팔레트      스타일 성경이 있으면 그 색으로 옮긴다 (genesis/palette_lock)
  4 규격 판정   반입 오라클 (크기·색 수·이진 알파)
  5 화면 판정   게임 바닥 위 1:1로 올려 경계 대비 (genesis/context_view)

**각 칸에서 무엇을 얼마나 고쳤는지 전부 기록한다.** 많이 고쳐야 통과한 그림은
"통과"가 아니라 "우리가 고쳐서 통과"다 — 그 구분을 지운 적이 있어서 그때부터
raw 판정을 따로 남긴다(`asset_intake` 와 같은 규율).
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import yaml                                                    # noqa: E402
from PIL import Image                                          # noqa: E402

from genesis import chroma                                     # noqa: E402
from genesis import context_view as cv                         # noqa: E402
from genesis import palette_lock as plock                      # noqa: E402
from genesis import style_bible as sb                          # noqa: E402
from tools.artgen import pixelize as pz                        # noqa: E402

SPEC = os.path.join("data", "image_specs", "pixel-sprite-v2.yaml")
OUT_DIR = os.path.join("audition", "gpt")
KEYS = {"magenta": (255, 0, 255), "green": (0, 100, 0)}


def load_spec(root: str = ROOT) -> dict:
    with open(os.path.join(root, SPEC), encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def run(src: str, profile: str, name: str | None = None,
        key: str | None = None, bible: str | None = None,
        ground: str | None = None, root: str = ROOT) -> dict:
    doc = load_spec(root)
    if profile not in doc["profiles"]:
        raise KeyError(f"등록되지 않은 부류: {profile!r}")
    p = doc["profiles"][profile]
    w, h = p["logical_size"]["width"], p["logical_size"]["height"]
    name = name or os.path.splitext(os.path.basename(src))[0]
    d = os.path.join(root, OUT_DIR, name)
    os.makedirs(d, exist_ok=True)
    steps = []

    img = Image.open(src).convert("RGBA")
    steps.append({"step": "받음", "size": list(img.size),
                  "colors": len(img.convert("RGB").getcolors(1 << 24) or []),
                  "has_alpha": any(q[3] < 255
                                   for q in img.get_flattened_data())})

    # 1) 배경
    work = os.path.join(d, "01_keyed.png")
    if steps[0]["has_alpha"]:
        img.save(work)
        steps.append({"step": "배경", "how": "알파가 이미 있다 - 건드리지 않음"})
    else:
        tmp = os.path.join(d, "00_src.png")
        img.save(tmp)
        # **흐린 그림에는 despill 을 쓴다.** key_out 은 가장자리가 딱 떨어지는
        # 픽셀아트 전용이라, GPT 그림에서는 헤일로를 남긴다(08-27 실측: 경계
        # 대비 14). 원본이 이미 격자에 맞는 진짜 도트면 key_out 이 더 정확하다.
        blurry = img.size[0] > 128 or steps[0]["colors"] > 256
        fn = chroma.despill if blurry else chroma.key_out
        r = fn(tmp, work, key=KEYS.get(key or "") or None)
        steps.append({"step": "배경",
                      "how": f"{'despill' if blurry else '크로마키'} {key or '자동'}",
                      **{k: v for k, v in r.items() if k != "image"}})
        if not r.get("ok"):
            return {"name": name, "verdict": "UNDEFINED", "steps": steps,
                    "why": ["배경을 못 잘랐다 - " + str(r.get("why"))]}

    # 2) 격자
    grid = os.path.join(d, "02_grid.png")
    px = pz.pixelize(Image.open(work), w, h, colors=p["max_colors"])
    px.save(grid)
    steps.append({"step": "격자", "to": [w, h], "colors": pz.color_count(px)})

    # 3) 팔레트 (성경이 있을 때만)
    final = grid
    if bible:
        b = sb.load(bible, root=root)
        pal = [tuple(c) for c in b["palette"]]
        final = os.path.join(d, "03_palette.png")
        r = plock.lock(grid, pal, final)
        steps.append({"step": "팔레트", "bible": bible, "moved": r["moved"],
                      "colors_after": r["colors_after"]})

    # 4) 규격
    out = Image.open(final)
    # check_spec 은 **위반 목록**을 돌려준다(비면 합격). 불리언이 아니다 -
    # 처음에 두 값으로 받으려다 터졌다.
    problems = pz.check_spec(out, w, h, p["max_colors"])
    ok = not problems
    steps.append({"step": "규격", "ok": ok, "problems": problems})

    # 5) 화면 안에서
    ctx = None
    if ground:
        ctx = cv.judge_in_context([final], os.path.join(root, ground))
        steps.append({"step": "화면", **{k: v for k, v in ctx.items()
                                         if k != "basis"}})

    verdict = ("FAIL" if not ok else
               "FAIL" if ctx and ctx["verdict"] == "FAIL" else
               "UNDEFINED" if ctx is None else "PASS")
    return {"name": name, "profile": profile, "source": src,
            "final": final, "verdict": verdict, "steps": steps,
            "note": ("고쳐서 통과한 것은 '통과'가 아니라 '우리가 고쳐서 통과'다. "
                     "각 칸에서 무엇을 얼마나 고쳤는지 steps에 있다")}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("src")
    ap.add_argument("--profile", default="character",
                    choices=["character", "tile", "icon"])
    ap.add_argument("--name")
    ap.add_argument("--key", choices=sorted(KEYS))
    ap.add_argument("--bible", help="스타일 성경 이름(있으면 그 팔레트로 옮긴다)")
    ap.add_argument("--ground", help="게임 바닥 PNG(있으면 화면 안에서 판정)")
    a = ap.parse_args(argv)
    r = run(a.src, a.profile, a.name, a.key, a.bible, a.ground)
    print(f"[{r['name']}] 판정 {r['verdict']}")
    for s in r["steps"]:
        rest = {k: v for k, v in s.items() if k != "step" and v not in (None, [], {})}
        print(f"  {s['step']:6} {rest}")
    print(f"  결과물: {r.get('final')}")
    print(f"  {r['note']}")
    return 0 if r["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
