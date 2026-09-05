"""대화창 — **이것이 제품이다.**

`docs/director-ai-vision.md`:

  1단계 정보 수집 — 처음에 **선택지를 많이** 줘서 취향·방향을 캐낸다.
  (**질문이 아니라 고르게 한다. 고른 선택이 곧 명세가 됨**)

  > 주관적 대작 기준을 "체크 가능한 하위 기준"으로 분해하는 것 —
  > 이게 이 방향의 핵심 난제이자 우리만의 자산이다.

  > 먼저 증명할 최소 조각 = 정보수집→설계도 엔진 하나.
  > "사람 취향을 선별 기준으로 옮기는 것"이 되는지부터.

2026-08-27 사장님: *"대화창이랑 대화창에서의 선택인데."*

나는 하루 종일 뒤쪽(생성·판정·조립)을 만들고 대화를 곁다리로 뒀다. 거꾸로다.
**대화가 제품이고 나머지는 그 뒤에서 도는 것이다.**

## 이 모듈이 지키는 것

- **묻지 않고 고르게 한다.** 자유 질문은 사람에게 일을 시키는 것이다. 선택지를
  내밀면 고르는 것만으로 명세가 쌓인다.
- **고른 것이 무엇이 되는지 보여준다.** 안 보이면 취향을 물어본 뒤 버리는 것과
  구별이 안 된다.
- **분해되지 않는 것은 사람 눈 게이트로 남긴다.** 억지로 수치로 바꾸지 않는다.
  대신 **무엇이 분해됐고 무엇이 안 됐는지를 매 턴 기록한다** — 그 비율이
  이 제품의 진짜 지표다(분해가 많을수록 AI가 혼자 오래 굴러간다).
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

MODEL = "gpt-5"
API = "https://api.openai.com/v1/chat/completions"

SYSTEM = """너는 '연출가 AI'다. 사람의 창작 방향을 받아 **설계도**로 만든다.
너는 그림을 그리지 않고 글을 쓰지 않는다. **무엇을 만들지 정하고, 나온 것이
그 설계도에 맞는지 판정할 기준을 세우는 것**이 네 일이다.

## 반드시 지킬 것

1. **질문하지 말고 고르게 하라.** 매 턴 선택지를 2~4개 낸다. 자유 질문은
   사람에게 일을 시키는 것이다. 선택지는 서로 확실히 다른 방향이어야 한다.
2. **고른 것이 무엇이 되는지 그 자리에서 보여줘라.** 각 선택지에는 그것이
   만들어 낼 **측정 가능한 기준**(measurable)이나 **발주 문구**(fragment)를 붙인다.
3. **분해되지 않는 것은 솔직히 남겨라.** "예쁘다" 같은 것을 억지로 수치로 바꾸지
   마라. `human_gate` 에 적어 사람 눈이 판정할 항목으로 남긴다.
4. 한 번에 **한 가지만** 묻는다. 사람이 이미 말한 것은 다시 묻지 않는다.
5. 짧게 말한다. 설명은 두 문장을 넘기지 않는다. 한국어로 답한다.

## 측정 가능한 기준의 예 (이런 모양이어야 한다)

- `{"name": "명암폭", "op": ">=", "value": 150, "why": "형태가 읽히려면"}`
- `{"name": "채도 중앙값", "op": "between", "value": [25, 55], "why": "아늑한 톤"}`
- `{"name": "색 수", "op": ">=", "value": 20, "why": "실루엣이 안 되게"}`

수치가 아니라 규칙이어도 된다:
- `{"name": "모든 자산이 같은 팔레트 램프를 쓴다", "op": "rule", "value": true}`

## 언제 끝나나

더 물을 것이 없으면 `done: true` 를 내고 `blueprint` 를 채운다. 보통 4~7턴이다.
"""

SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string", "description": "사람에게 할 말. 두 문장 이내."},
        "choices": {
            "type": "array",
            "description": "이번 턴의 선택지. done이 true면 빈 배열.",
            "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string"},
                    "label": {"type": "string", "description": "고를 문구. 짧게."},
                    "measurables": {
                        "type": "array",
                        "description": "이걸 고르면 생기는 **기계가 잴 수 있는** 기준",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "op": {"type": "string"},
                                "value": {"type": "string",
                                          "description": "JSON 문자열. 예 \"150\", \"[25,55]\", \"true\""},
                                "why": {"type": "string"},
                            },
                            "required": ["name", "op", "value", "why"],
                            "additionalProperties": False,
                        },
                    },
                    "fragments": {"type": "array", "items": {"type": "string"},
                                  "description": "발주 문구 조각(영어)"},
                    "human_gate": {"type": "array", "items": {"type": "string"},
                                   "description": "이 선택에서 **수치로 못 옮긴 것**"},
                },
                "required": ["key", "label", "measurables", "fragments",
                             "human_gate"],
                "additionalProperties": False,
            },
        },
        "done": {"type": "boolean"},
        "blueprint": {
            "type": "object",
            "properties": {
                "what": {"type": "string", "description": "무엇을 만드는가"},
                "vision": {"type": "string", "description": "사람이 읽는 방향"},
                "summary": {"type": "string"},
            },
            "required": ["what", "vision", "summary"],
            "additionalProperties": False,
        },
    },
    "required": ["reply", "choices", "done", "blueprint"],
    "additionalProperties": False,
}


def _key(root: str = ".") -> str:
    v = os.environ.get("OPENAI_API_KEY", "").strip()
    if v:
        return v
    p = os.path.join(root, ".secrets", "openai.key")
    with open(p, encoding="ascii") as fh:
        return fh.read().strip()


def turn(history: list, root: str = ".") -> dict:
    """대화 한 턴. `history` 는 {role, content} 목록이다."""
    body = {"model": MODEL,
            "messages": [{"role": "system", "content": SYSTEM}] + history,
            "response_format": {"type": "json_schema",
                                "json_schema": {"name": "director_turn",
                                                "schema": SCHEMA,
                                                "strict": True}}}
    req = urllib.request.Request(
        API, method="POST",
        headers={"Authorization": f"Bearer {_key(root)}",
                 "Content-Type": "application/json"},
        data=json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            doc = json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode(errors='replace')[:400]}")
    out = json.loads(doc["choices"][0]["message"]["content"])
    out["usage"] = doc.get("usage")
    return out


def decomposition(spec: dict) -> dict:
    """**이 제품의 진짜 지표.** 취향이 얼마나 기계 기준으로 옮겨졌나.

    분해가 많을수록 AI가 혼자 오래 굴러가고, 적을수록 매번 사람 눈이 심판이 된다
    (director-ai-vision). 그러니 이 수를 매 대화마다 낸다.
    """
    m = len(spec.get("measurables", []))
    h = len(spec.get("human_gate", []))
    total = m + h
    return {"measurable": m, "human_gate": h, "total": total,
            "rate": round(m / total, 3) if total else None,
            "note": ("분해율 = 기계가 잴 수 있는 항목 / 전체 항목. "
                     "1.0이면 사람 눈 없이 굴러간다. 0이면 매번 사람이 봐야 한다")}
