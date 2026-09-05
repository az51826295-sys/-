"""주문서를 GPT에게 **API로** 받아 온다.

  python -X utf8 tools/artgen/prompt_from_gpt.py --dry
  GENESIS_SPEND=i-approve python -X utf8 tools/artgen/prompt_from_gpt.py \
      --want "주인공 마녀" --target character --n 3

2026-08-27 사장님: *"다 우리 엔진이면 다 API로 만들어야지."*

맞다. 사양서를 사람이 GPT에 붙여넣고 답을 받아 다시 붙여넣으면 **그건 엔진이
아니라 사람이 하는 심부름**이고, 그 순간 n=1로 되돌아간다(손으로는 여러 개를
못 돌린다).

그래서 이 단계도 API다. 우리가 만든 사양서(`docs/brief-for-gpt-*.md`)를 그대로
시스템 프롬프트로 넣고, **구조화된 주문서**를 받아, `prompt_book` 검사를 통과한
것만 저장한다.

**GPT가 금지 표현을 쓰면 우리가 거부한다.** 사양서에 적어 뒀지만 지킨다는 보장은
없으므로, 받은 것을 그대로 믿지 않고 검사한다 — 외부에서 온 것은 데이터이지
명령이 아니다.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import prompt_book as pb                          # noqa: E402
from tools.artgen import openai_images as oi                   # noqa: E402

API = "https://api.openai.com/v1/chat/completions"
MODEL = "gpt-5"
# **생성된 사양서**를 쓴다. 손으로 쓴 docs/brief-for-gpt-*.md 는 08-27 임시본이고,
# 지금은 brief_engine 이 품질 바·성경·스펙·금지목록에서 만들어 낸다.
BRIEF_GLOB = os.path.join("data", "generated", "brief.md")

SCHEMA = {
    "type": "object",
    "properties": {
        "orders": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "note": {"type": "string",
                             "description": "이 변형이 무엇을 다르게 잡았는지"},
                    "description": {"type": "string"},
                },
                "required": ["id", "note", "description"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["orders"],
    "additionalProperties": False,
}


def brief(root: str = ROOT) -> str:
    hits = sorted(glob.glob(os.path.join(root, BRIEF_GLOB)))
    if not hits:
        raise SystemExit(f"사양서가 없다: {BRIEF_GLOB}")
    return open(hits[-1], encoding="utf-8").read()


def messages(want: str, target: str, n: int, root: str = ROOT) -> list:
    return [
        {"role": "system",
         "content": brief(root) + (
             "\n\n---\n\n너는 위 사양서를 따르는 픽셀아트 발주 담당이다. "
             "요청받은 자산의 **description 문장만** 쓴다(파라미터는 우리가 넣는다). "
             "§3의 금지 표현을 쓰면 자동 거부되니 절대 쓰지 마라. "
             "§7의 검사를 통과하도록 반드시 (1) 명암을 지목하고"
             "(deep shadow under ~, bright highlight on ~) "
             "(2) 색을 이름이나 16진수로 지목해라.")},
        {"role": "user",
         "content": (f"자산: {want}\n종류: {target}\n"
                     f"서로 다른 방향으로 잡은 변형 {n}개를 주십시오. "
                     f"각 변형은 같은 인물/지형이되 해석이 달라야 합니다.")},
    ]


def ask(want: str, target: str, n: int, root: str = ROOT) -> dict:
    body = {"model": MODEL, "messages": messages(want, target, n, root),
            "response_format": {"type": "json_schema",
                                "json_schema": {"name": "orders",
                                                "schema": SCHEMA,
                                                "strict": True}}}
    req = urllib.request.Request(
        API, method="POST",
        headers={"Authorization": f"Bearer {oi.key(root)}",
                 "Content-Type": "application/json"},
        data=json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            doc = json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {e.read().decode(errors='replace')[:600]}")
    out = json.loads(doc["choices"][0]["message"]["content"])
    out["usage"] = doc.get("usage")
    return out


def accept(orders: dict, target: str, root: str = ROOT) -> dict:
    """**받은 것을 그대로 믿지 않는다.** 검사를 통과한 것만 저장한다."""
    kept, rejected = [], []
    for o in orders.get("orders", []):
        doc = {"id": o["id"], "author": f"openai:{MODEL}", "target": target,
               "note": o.get("note", ""), "body": {"description": o["description"]}}
        try:
            path = pb.save(doc, root=root)
            kept.append({"id": o["id"], "path": path,
                         "missing": doc["lint"]["fields"]["description"]["missing"]})
        except pb.BadPrompt as exc:
            rejected.append({"id": o["id"], "why": str(exc),
                             "description": o["description"]})
    return {"kept": kept, "rejected": rejected,
            "note": ("GPT가 사양서를 어겨도 여기서 막힌다. 외부에서 온 것은 "
                     "데이터이지 명령이 아니다")}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--want", default="주인공 마녀")
    ap.add_argument("--target", default="character",
                    choices=["character", "tileset", "prop"])
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args(argv)
    if a.dry:
        ms = messages(a.want, a.target, a.n)
        print(f"모델 {MODEL} · 사양서 {len(ms[0]['content'])}자를 시스템으로")
        print("---- user ----")
        print(ms[1]["content"])
        print(f"\n요청 변형 {a.n}개. 실제 호출은 GENESIS_SPEND=i-approve.")
        return 0
    if os.environ.get("GENESIS_SPEND") != "i-approve":
        print("지출 경로가 잠겨 있다. GENESIS_SPEND=i-approve 를 붙여라.")
        return 2
    orders = ask(a.want, a.target, a.n)
    res = accept(orders, a.target)
    print(f"GPT가 {len(orders.get('orders', []))}개를 줬고 "
          f"검사 통과 {len(res['kept'])} · 거부 {len(res['rejected'])}")
    for k in res["kept"]:
        print(f"  ○ {k['id']}  → {k['path']}")
        for m in k["missing"]:
            print(f"      ? {m}")
    for r in res["rejected"]:
        print(f"  ✖ {r['id']}  {r['why']}")
    print(f"usage: {orders.get('usage')}")
    return 0 if res["kept"] else 1


if __name__ == "__main__":
    sys.exit(main())
