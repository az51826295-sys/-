"""프롬프트 책 — 프롬프트는 **엔진의 입력**이지 엔진이 짜는 것이 아니다.

2026-08-27 사장님: *"프롬프트 입력하는 거 지피티가 더 잘하면 너 말고 지피티 시키자."*

맞는 결정이다. 내가 쓴 프롬프트는 그날 두 번 실패했다 —
`"no harsh contrast"` 로 명암폭을 172→36으로 뭉갰고, `"low saturation"` 으로
캐릭터를 채도 3(유채색 램프 0개)으로 만들었다.

**그리고 이게 엔진 설계에 더 맞다.** 이 제품은 "좋은 프롬프트를 쓰는 AI"가 아니라
**"나온 것이 설계도에 맞는지 판정하고 골라 주는 AI"** 다. 프롬프트가 어디서 오든
상관없어야 한다. 그러니 프롬프트를 코드에서 빼서 파일로 둔다.

  data/prompts/<id>.json   { id, author, target, body{...}, note }

`author` 가 필수다 — 누가 쓴 프롬프트인지 남아야 **출처끼리 비교**할 수 있다.
(GPT가 쓴 것 대 내가 쓴 것을 티어 비교처럼 재는 것이 다음 실험이다.)

**금지 표현을 기계가 잡는다.** measurement-rules §12: 생성기에 부정 지시를 보내면
그 극단이 온다. 누가 쓴 프롬프트든 이 검사를 통과해야 발주된다.
"""
from __future__ import annotations

import glob
import json
import os
import re

BOOK_DIR = os.path.join("data", "prompts")

# §12. 속성을 "낮춰라/없애라"로 요구하면 0이 온다. 실제로 두 번 당했다.
BANNED = [
    (r"\bno\s+(harsh|strong|hard)\s+\w+", "부정 지시 - 원하는 것을 적어라"),
    (r"\blow\s+saturation\b", "채도를 낮추라고 하면 흑백이 온다 (마녀A 채도 3)"),
    (r"\bdesaturated\b", "같은 이유 - 대신 쓸 색을 지목하라"),
    (r"\bmuted\b", "같은 이유"),
    (r"\bminimal\s+(shading|detail|contrast)\b", "명암을 줄이라고 하면 사라진다"),
    (r"\blineless\b", "형태가 지워진다 (08-27 타일 실측)"),
    (r"\bsimple\b(?!\s+(dress|tunic|shirt|robe))", "'단순하게'는 실루엣을 부른다"),
    (r"\bflat\s+(colou?rs?|shading)\b", "명암폭이 0이 된다"),
]
# 있으면 좋은 것. 없다고 거부하진 않지만 경고한다.
WANTED = [
    (r"shadow|highlight|light", "명암을 **지목**했는가 (deep shadow under ~, bright highlight on ~)"),
    (r"#[0-9a-fA-F]{6}|\b(plum|ochre|teal|rust|sage|brass|copper|cream|slate)\b"
     r"|\b\w+\s+(brown|green|blue|red|purple|grey|gray)\b",
     "색을 **이름으로** 지목했는가"),
]


class BadPrompt(ValueError):
    """금지 표현이 든 프롬프트. 발주 전에 막는다."""


def lint(text: str) -> dict:
    """프롬프트 한 덩어리를 검사한다. 누가 썼든 같은 검사를 받는다."""
    bad = [{"pattern": p, "why": w, "found": m.group(0)}
           for p, w in BANNED if (m := re.search(p, text, re.I))]
    missing = [w for p, w in WANTED if not re.search(p, text, re.I)]
    return {"ok": not bad, "banned": bad, "missing": missing,
            "words": len(text.split())}


def lint_body(body: dict) -> dict:
    """주문 본문의 **모든 문자열 필드**를 검사한다."""
    out = {}
    for k, v in body.items():
        if isinstance(v, str) and len(v) > 20:
            out[k] = lint(v)
    return {"ok": all(r["ok"] for r in out.values()) if out else False,
            "fields": out}


def save(doc: dict, root: str = ".") -> str:
    for k in ("id", "author", "target", "body"):
        if not doc.get(k):
            raise BadPrompt(f"프롬프트에 {k} 가 없다 "
                            f"(author 는 출처 비교에 필요하다)")
    r = lint_body(doc["body"])
    if not r["ok"]:
        bad = [b for f in r["fields"].values() for b in f["banned"]]
        if bad:
            raise BadPrompt(
                "금지 표현이 있다 (measurement-rules §12): "
                + "; ".join(f'{b["found"]!r} — {b["why"]}' for b in bad))
    doc["lint"] = r
    d = os.path.join(root, BOOK_DIR)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, f'{doc["id"]}.json')
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
    return p


def load(pid: str, root: str = ".") -> dict:
    with open(os.path.join(root, BOOK_DIR, f"{pid}.json"), encoding="utf-8") as fh:
        return json.load(fh)


def all_prompts(root: str = ".") -> list:
    return [json.load(open(p, encoding="utf-8"))
            for p in sorted(glob.glob(os.path.join(root, BOOK_DIR, "*.json")))]
