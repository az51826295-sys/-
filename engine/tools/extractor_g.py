"""추출기 G — 제3의 모델이 산출물을 **보고** 값을 보고한다 (observed.*).

증거 등급의 네 번째 이름공간(2026-08-26 사장님 승인 C):

    spec.*      설계도가 정한 것
    measured.*  우리가 잰 것            ← 자율 근거
    observed.*  추출기 G가 본 것        ← **여기**. 자율 근거 아님
    claim.*     후보가 스스로 말한 것

G는 후보를 만든 쪽이 아니다(그래서 claim이 아니고), 우리가 잰 것도 아니다
(그래서 measured가 아니다). 세 번 물어 **다수결**을 잡고, 갈리면 값을 내지
않는다 — 값이 없으면 그 규칙은 fail이 아니라 undefined다.

그리고 등록되지 않은 observed 필드는 **판정에 아예 못 쓴다**:
`judge_bench.observed_gate()`가 null 통제(data/observed_controls.json)를 보고
미등록·미달이면 Unjudgeable로 보낸다. 여기서 값을 내는 것과, 그 값으로 판정하는
것은 별개다.

  python -X utf8 tools/extractor_g.py --svg out/icons/x.svg --field art_style
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tools import proposer as pz                         # noqa: E402

EXTRACTOR_VERSION = "G-v0.1"
DEFAULT_MODEL = "claude-haiku-4-5"
K = 3                                   # 호출 수. 다수결 = 2/3 이상

# 물어볼 수 있는 것만 물어본다. 선택지가 고정돼야 다수결이 정의된다.
FIELDS = {
    "art_style": {
        "question": "이 그림의 화풍은 다음 중 무엇인가",
        "choices": ["pixel", "line", "painterly", "photo", "unknown"],
    },
    "subject_match": {
        "question": "이 그림이 나타내는 것이 주어진 개념과 같은가",
        "choices": ["yes", "no", "unclear"],
    },
    "mood": {
        "question": "이 산출물의 분위기는 다음 중 무엇인가",
        "choices": ["calm", "tense", "bright", "dark", "unknown"],
    },
}

PROMPT = """다음 산출물을 보고 질문에 답해라.
질문: {question}
선택지: {choices}
규칙:
- 선택지에 있는 낱말 **하나만** 출력한다. 설명·문장·따옴표 금지.
- 확신이 없으면 선택지 중 unknown/unclear 계열을 고른다. 지어내지 마라.

산출물:
{artifact}"""


class MockExtractor:
    """결정적 목 — 지출 0. 답을 미리 정해 두고 다수결·불일치 경로를 시험한다."""

    name = "mock"
    model = "mock"

    def __init__(self, answers=None):
        # answers: 호출 순서대로 돌려줄 답. 없으면 첫 선택지를 계속 답한다.
        self.answers = list(answers or [])
        self.calls = 0

    def ask(self, prompt: str, choices: list) -> str:
        self.calls += 1
        if self.answers:
            return self.answers[(self.calls - 1) % len(self.answers)]
        return choices[0]


class AnthropicExtractor:
    """실 제공자 — GENESIS_SPEND=i-approve + 키 + 이번 실행 예산."""

    name = "anthropic"

    def __init__(self, model: str = DEFAULT_MODEL, max_usd: float = 0.02):
        if os.environ.get("GENESIS_SPEND") != "i-approve":
            raise RuntimeError("유료 경로 잠김: GENESIS_SPEND=i-approve 필요")
        self.api_key = pz.load_api_key()
        if not self.api_key:
            raise RuntimeError("ANTHROPIC_API_KEY 없음")
        if pz.ledger_total_usd() >= pz.SPEND_CAP_USD:
            raise RuntimeError("누적 상한 초과 - 호출 거부")
        self.model = model
        self.max_usd = max_usd
        self.spent_here = 0.0
        self.usage = {"calls": 0, "input_tokens": 0, "output_tokens": 0}

    def ask(self, prompt: str, choices: list) -> str:
        if self.spent_here >= self.max_usd:
            raise RuntimeError(f"이번 실행 예산 ${self.max_usd:.4f} 소진")
        import urllib.error
        import urllib.request
        body = json.dumps({
            "model": self.model, "max_tokens": 16, "temperature": 1.0,
            "messages": [{"role": "user", "content": prompt}],
        }).encode()
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages", data=body,
            headers={"x-api-key": self.api_key,
                     "anthropic-version": "2023-06-01",
                     "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            raise RuntimeError(f"API {exc.code} - {detail}") from None
        u = data.get("usage", {})
        self.usage["calls"] += 1
        self.usage["input_tokens"] += u.get("input_tokens", 0)
        self.usage["output_tokens"] += u.get("output_tokens", 0)
        row = pz.record_call(self.model, "observe", u, tool="extractor_g")
        self.spent_here += row["usd"]
        return "".join(b.get("text", "") for b in data.get("content", []))


def make_extractor(name: str, model: str = DEFAULT_MODEL,
                   max_usd: float = 0.02):
    if name == "anthropic":
        return AnthropicExtractor(model=model, max_usd=max_usd)
    return MockExtractor()


def _normalize(raw: str, choices: list) -> str | None:
    """선택지 밖의 답은 **버린다**. 비슷한 말로 끼워 맞추지 않는다."""
    tok = (raw or "").strip().strip('".\'').lower()
    return tok if tok in choices else None


def observe(artifact: str, field: str, extractor, k: int = K) -> dict:
    """한 필드를 k번 물어 다수결. 갈리면 값 없음(→ 하류에서 undefined).

    다수결은 **과반**이다(k=3이면 2표). 2:1은 값이 되고 1:1:1은 안 된다.
    표가 갈린 사실 자체를 votes로 남긴다 — 숨기면 나중에 원인을 못 찾는다.
    """
    if field not in FIELDS:
        raise KeyError(f"등록되지 않은 observed 필드: {field}")
    meta = FIELDS[field]
    prompt = PROMPT.format(question=meta["question"],
                           choices=", ".join(meta["choices"]),
                           artifact=artifact)
    votes, invalid = [], 0
    for _ in range(k):
        answer = _normalize(extractor.ask(prompt, meta["choices"]),
                            meta["choices"])
        if answer is None:
            invalid += 1
        else:
            votes.append(answer)
    tally = collections.Counter(votes)
    value, count = (tally.most_common(1)[0] if tally else (None, 0))
    decided = bool(value) and count * 2 > k
    return {"field": f"observed.{field}", "value": value if decided else None,
            "decided": decided, "votes": votes, "invalid": invalid,
            "tally": dict(tally), "k": k,
            "extractor_version": EXTRACTOR_VERSION,
            "extractor": extractor.name,
            "model": getattr(extractor, "model", "mock"),
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S")}


def observe_many(artifact: str, fields: list, extractor, k: int = K) -> dict:
    """여러 필드 → observed 이름공간 한 덩어리. 미결정 필드는 키가 없다.

    미결정을 None으로 채워 넣지 않는다 — 키가 없어야 _get이 못 찾고,
    그래야 하류가 undefined로 간다(없는 값을 있는 척하지 않는다)."""
    rows = [observe(artifact, f, extractor, k) for f in fields]
    return {"observed": {r["field"].split(".", 1)[1]: r["value"]
                         for r in rows if r["decided"]},
            "rows": rows,
            "undecided": [r["field"] for r in rows if not r["decided"]]}


def main(argv=None):
    ap = argparse.ArgumentParser(description="추출기 G (observed.*)")
    ap.add_argument("--svg", help="관찰할 SVG 파일")
    ap.add_argument("--text", help="관찰할 텍스트(파일 대신)")
    ap.add_argument("--field", action="append", required=True,
                    choices=sorted(FIELDS))
    ap.add_argument("--provider", default="mock",
                    choices=["mock", "anthropic"])
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--max-usd", type=float, default=0.02)
    ap.add_argument("--k", type=int, default=K)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    if args.svg:
        with open(args.svg, encoding="utf-8") as f:
            artifact = f.read()
    elif args.text:
        artifact = args.text
    else:
        ap.error("--svg 또는 --text 가 필요하다")
    ex = make_extractor(args.provider, args.model, args.max_usd)
    out = observe_many(artifact, args.field, ex, k=args.k)
    out["usd"] = round(getattr(ex, "spent_here", 0.0), 6)
    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        for r in out["rows"]:
            state = r["value"] if r["decided"] else "미결정(표가 갈림)"
            print(f'{r["field"]:24s} {state}   표 {r["tally"]} '
                  f'/ 무효 {r["invalid"]}')
        print(f'지출 ${out["usd"]:.6f}  ({EXTRACTOR_VERSION})')
        print("주의: 값이 나왔다고 판정에 쓸 수 있는 건 아니다 — "
              "null 통제 등록 전에는 undefined다.")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
