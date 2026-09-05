"""사무실 직함 캐릭터 발주 — 로키 화면에 쓸 2등신 스프라이트.

  python -X utf8 tools/artgen/order_office_cast.py --list        # 몇 회 쓰는지
  python -X utf8 tools/artgen/order_office_cast.py --dry         # 지출 0, 문구만
  GENESIS_SPEND=i-approve python -X utf8 tools/artgen/order_office_cast.py --only dev

**무엇을 만드나** (2026-08-31 사장님 지시): 옥토패스 트래블러풍, 밝은 배경,
사무실, **직함마다 캐릭터**, 머리:몸 = 1:1(2등신). 아트 바이블은
`ai-workforce/docs/art-bible-office-draft.md` 에 있다.

**왜 gpt-image 가 아니라 여기인가.** 초안은 gpt-image-2 로 뽑아 봤는데 "머리가
몸만큼 크게" 를 안 들었다 — 3등신에서 멈췄고, 확대하면 픽셀 격자도 안 맞는다.
픽셀랩은 캔버스 크기를 숫자로 받고 진짜 격자로 낸다. 비율은 문구로, 격자는
도구로 잡는다.

**배경은 크로마키다.** `no_background` 를 믿지 않는 것은 이 저장소의 기존 규칙
(`order_props.py`)이고 여기서도 같다 — 배경색을 지정해 주문하고 우리가 자른다.
자르기 전에 키 색과 그림 색의 거리를 재서 위험하면 거부한다.

키는 **마젠타**다. 사무실 인물은 살구·회색·남색이 많고 초록 키는 앞치마·화분과
부딪힌다. 마젠타는 이 소재에서 부딪힐 색이 거의 없다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# `chroma` 는 키가 하나라는 전제 위에 있어 이 배경에서는 못 쓴다 — is_background 주석 참조.
from tools.artgen import audition_pixellab as pl              # noqa: E402

OUT = os.path.join("audition", "office")
KEY_MAGENTA = (255, 0, 255)

# 아트 바이블의 형식 부분. 인물마다 바뀌지 않는다.
#
# 크기는 48×48. 32는 2등신에서 얼굴이 뭉개지고(눈이 두 픽셀이 된다), 64는 화면에
# 64~96px 로 놓을 때 축소가 애매해진다. 48은 2배로 키우면 96이라 딱 맞는다.
LOOK = (
    "chibi office worker, two heads tall: the head is as large as the whole "
    "body below it, big round head, small compact body, large expressive eyes. "
    "Bright warm office game art, dark ink outline, three-tone shading, "
    "limited palette. One single character alone, front view, one standing "
    "pose, no text."
)

# 로키 등록부(`employeeDefinitions`)에 **실제로 있는** 다섯. 없는 직함은 안
# 만든다 — 화면에 있는데 뽑을 수 없는 사람이 생긴다.
CAST = [
    {"name": "alex", "role": "Market Research Analyst",
     "desc": "holding a stack of papers, round glasses, navy cardigan, "
             "calm expression"},
    {"name": "emma", "role": "Sales Development Representative",
     "desc": "holding a phone to the ear with one hand raised in a wave, "
             "bright white shirt, cheerful open smile"},
    {"name": "iris", "role": "Art Director",
     "desc": "holding a fan of colour swatches, mustard apron, hair tied up "
             "in a bun, one eyebrow raised"},
    {"name": "nova", "role": "Game Artist",
     "desc": "holding a drawing tablet and stylus, grey hoodie, headphones "
             "resting around the neck"},
    {"name": "dev", "role": "Application Developer",
     "desc": "holding a laptop in one hand and a mug in the other, white "
             "shirt with rolled sleeves, orange tie"},
]

SIZE = 48


def prompt_for(member: dict) -> str:
    return (
        f"{LOOK} {member['desc']}. "
        "The background is a flat solid magenta #FF00FF chroma key screen, "
        "completely uniform, no gradient, no shadow, no floor."
    )


def _hsv(c):
    import colorsys
    h, s_, v = colorsys.rgb_to_hsv(c[0] / 255, c[1] / 255, c[2] / 255)
    return h * 360, s_, v


def cut_background(raw: str, out: str, hue_tol: float = 16.0,
                   min_sat: float = 0.45) -> dict:
    """가장자리에서 번져 들어가며 배경만 지운다.

    **색을 고정하지 않는다.** 주문서에 `#FF00FF` 를 적어도 생성기는 매번 다른
    분홍을 준다 — 실측: (224,28,159) (252,54,107) (253,92,196) (226,109,142)
    (252,95,154). 색 하나를 키로 박으면 다섯 중 셋이 안 잘린다(실제로 그랬다).
    색 목록으로 바꿔도 다음 그림에서 또 새 색이 나온다.

    그래서 두 가지를 같이 본다:

    1. **가장자리에서 이어져 있는가** — 배경은 정의상 테두리와 이어져 있다.
       인물 안쪽의 볼터치나 분홍 옷은 여기에 안 걸린다.
    2. **테두리 색과 색조가 같고, 그만큼 진한가** — 디더링된 두 번째 색과 발밑
       그림자까지 걷어내되 인물은 남긴다.

    색조만으로는 부족하다는 것을 실측으로 배웠다. 색조 여유를 28도로 뒀더니
    배경(252,54,107 · 색조 344도)과 **얼굴 살구색(색조 12도)의 거리가 정확히
    28**이라, alex 의 얼굴이 통째로 지워졌다. 그래서 채도를 같이 본다 — 배경은
    0.52~0.79 로 진하고 살구는 0.3 언저리다. 여유는 16도 / 채도 0.45.

    잘라 낸 뒤 남은 배경색 수를 세서 함께 돌려준다. 0 이 아니면 규칙이 놓친
    것이고, 그때는 사람이 봐야 한다 — 조용히 넘기지 않는다.
    """
    from PIL import Image
    im = Image.open(raw).convert("RGBA")
    w, h = im.size
    px = im.load()

    edge = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)]         + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    from collections import Counter
    border = Counter(px[x, y][:3] for x, y in edge)
    key = border.most_common(1)[0][0]
    key_h, key_s, _ = _hsv(key)

    def same_family(c) -> bool:
        hh, ss, vv = _hsv(c)
        if ss < min_sat or vv < 0.12:
            return False
        d = abs(hh - key_h)
        return min(d, 360 - d) <= hue_tol

    seen = [[False] * w for _ in range(h)]
    stack = [(x, y) for x, y in edge if same_family(px[x, y][:3])]
    cut = 0
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]:
            continue
        if not same_family(px[x, y][:3]):
            continue
        seen[y][x] = True
        px[x, y] = (0, 0, 0, 0)
        cut += 1
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]

    im.save(out)
    kept = [p for p in im.getdata() if p[3] > 0]
    return {
        "size": [w, h],
        "key": list(key),
        "cut": cut,
        "kept": len(kept),
        "background_left": sum(1 for p in kept if same_family(p[:3])),
        "colors": len(set(kept)),
        "alpha_binary": all(p[3] == 255 for p in kept),
    }


def order(member: dict, spend: bool) -> None:
    text = prompt_for(member)
    print(f"\n── {member['name']} · {member['role']}")
    print(text)
    if not spend:
        print("  (dry: 아무것도 안 쏩니다)")
        return

    r = pl.call("POST", "/create-image-pixflux", {
        "description": text,
        "image_size": {"width": SIZE, "height": SIZE},
        # 배경은 우리가 자른다. 생성기에 맡기지 않는다.
        "no_background": False,
    })
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f"{member['name']}_response.json"), "w",
              encoding="utf-8") as f:
        json.dump(r, f, ensure_ascii=False, indent=1)

    imgs = pl.images_in(r)
    if not imgs:
        print("  이미지가 안 왔습니다. 응답을 남겼습니다.")
        return

    raw = os.path.join(OUT, f"{member['name']}_raw.png")
    with open(raw, "wb") as f:
        import base64
        f.write(base64.b64decode(imgs[0]))
    print("  받음:", raw)

    cut_path = os.path.join(OUT, f"{member['name']}.png")
    report = cut_background(raw, cut_path)
    print("  잘랐습니다:", cut_path, json.dumps(report, ensure_ascii=False))


def main() -> int:
    ap = argparse.ArgumentParser(description="사무실 직함 캐릭터 발주")
    ap.add_argument("--only", help="한 명만. 예: dev")
    ap.add_argument("--dry", action="store_true", help="지출 0, 문구만 본다")
    ap.add_argument("--list", action="store_true", help="몇 회 쓰는지만")
    args = ap.parse_args()

    cast = [m for m in CAST if not args.only or m["name"] == args.only]
    if not cast:
        print("그런 이름이 없습니다:", args.only)
        return 2

    if args.list:
        for m in cast:
            print(f"{m['name']:6} {m['role']}")
        print(f"\n{len(cast)}회 · {SIZE}×{SIZE}")
        return 0

    # 지출은 **한 번 더 말해야** 나간다. 이 저장소의 기존 규칙과 같다.
    spend = not args.dry and os.environ.get("GENESIS_SPEND") == "i-approve"
    if not args.dry and not spend:
        print("지출하려면 GENESIS_SPEND=i-approve 를 붙이십시오. 지금은 안 쏩니다.")
        return 1

    for m in cast:
        order(m, spend)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
