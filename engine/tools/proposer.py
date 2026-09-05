"""LLM Proposer 층 — 자유 문장을 능력 원자로 '제안'한다.

설계도 엔진(tools/blueprint_engine.py)의 마지막 층. 지금까지 요청 분해는
레지스트리 별칭 매칭이라 아는 단어만 잡았다. 이 층은 자유로운 문장을 받아
원자를 '제안'한다 — 레지스트리에 없는 새 원자까지.

★ Proposer/Validator 경계 (오늘 하루의 핵심) ★
Proposer(LLM)는 제안만 한다. **믿지 않는다.** LLM이 제안한 새 원자는
verdict=unverified, status=proposed로 격리된다:
  - 검증(사람이 promote) 전에는 절대 real이 못 된다 → 코인 청구 대상 아님,
    설계도 체크리스트에 안 들어간다.
  - 모델이 "이거 검증 가능해요/진짜예요"라고 우겨도 그 주장은 suggested_*에만
    담고, 유효 verdict는 unverified로 둔다. 모델 주장 자체를 안 믿는다.
아는 원자(레지스트리 매칭)만 신뢰 경로로 blueprint 엔진에 넘어간다.

규율(CLAUDE.md): 목 먼저, 지출 0. 실 제공자는 GENESIS_SPEND=i-approve +
ANTHROPIC_API_KEY 있을 때만. 목만 기본으로 돈다.

  python -X utf8 tools/proposer.py --want "명상 수면 앱 만들어줘"
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

try:
    from tools import blueprint_engine as be
    from tools import judge_bench as judge
except ModuleNotFoundError:                     # 스크립트로 직접 실행 시
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from tools import blueprint_engine as be
    from tools import judge_bench as judge

# 모델 ID는 접미사 없는 현행 표기. 단가(USD/1M 토큰, 2026-06 기준)를 원장에 쓴다.
PRICING = {
    "claude-haiku-4-5": (1.00, 5.00),
    # 2026-08-27 정정: Sonnet 5는 $2/$10이다. $3/$15는 **Sonnet 4.6** 가격이고,
    # 그걸 적어 두는 바람에 오늘 sonnet 지출이 50% 과대계상됐다(원장 값이 실제
    # 청구보다 크다). 원장은 고치지 않는다 - 그때 기록한 값이 그거였다는 사실도
    # 기록이다. 대신 이 줄을 고쳐 앞으로가 맞게 한다.
    "claude-sonnet-5": (2.00, 10.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-opus-5": (5.00, 25.00),
}
DEFAULT_MODEL = "claude-haiku-4-5"    # 분해는 싼 티어로 충분(사장님 라우팅 방침)
USD_TO_KRW = 1400                      # 원장 표기용 자리표시 환율
LEDGER = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "data", "proposer_ledger.jsonl")
# 누적 상한. 넘으면 호출 거부. **사장님이 직접 올릴 때만 바뀐다** — 실험 하나를
# 승인받았다고 내가 올리지 않는다(docs/measurement-rules.md §8).
#   2026-08-12  1.00  최초
#   2026-08-27  10.00 사장님 승인("돈 상한 늘리자"). 08-26 하루에 $1.07을 써서
#               걸렸고, 모델 티어 비교·스냅 실험·취향 라운드가 막혀 있었다.
SPEND_CAP_USD = 10.00


def load_api_key() -> str:
    """환경변수 우선, 없으면 ai-workforce/.env.local. 키는 절대 출력하지 않는다."""
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if key:
        return key
    path = os.path.join(os.path.expanduser("~"), "Desktop", "ai-workforce",
                        ".env.local")
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("ANTHROPIC_API_KEY="):
                    return line.split("=", 1)[1].strip().strip("\"'")
    return ""


def ledger_total_usd(path: str = None) -> float:
    """이 도구가 지금까지 쓴 돈. 원장이 없으면 0."""
    path = path or LEDGER
    if not os.path.isfile(path):
        return 0.0
    total = 0.0
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                total += json.loads(line).get("usd", 0.0)
            except ValueError:
                continue
    return round(total, 6)


def record_call(model: str, want: str, usage: dict, path: str = None,
                tool: str = "proposer") -> dict:
    """호출 1건을 원장에 적는다. 숨기지 않는다 - 추정이 아니라 실제 usage.

    원장은 도구 공용이다(tool 열로 구분). 누적 상한 SPEND_CAP_USD는 이 파일
    전체에 걸린다 - 레인이 늘어도 지갑은 하나다."""
    path = path or LEDGER
    inp, outp = PRICING.get(model, (0.0, 0.0))
    usd = (usage.get("input_tokens", 0) * inp
           + usage.get("output_tokens", 0) * outp) / 1_000_000
    row = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "tool": tool,
           "model": model, "want": want,
           "input_tokens": usage.get("input_tokens", 0),
           "output_tokens": usage.get("output_tokens", 0),
           "usd": round(usd, 6), "krw": round(usd * USD_TO_KRW, 2)}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return row


# --------------------------------------------------------------- 제공자

class MockProposer:
    """결정적 목 — 파이프라인 검증 전용, 지출 0. 실제 분해는 LLM이 한다.

    아는 개념 몇 개는 스크립트로 '제안'하되(모델이 하듯 verdict/check까지
    제시), 전부 unverified로 격리되는지 보여준다. 나머지 미지 토큰은 일반
    제안 스텁으로 낸다."""

    name = "mock"

    # 모델이 낼 법한 제안(스크립트). suggested_*는 모델 주장 - 안 믿는다.
    SCRIPTED = {
        ("명상", "수면", "힐링", "마음챙김"): {
            "id": "guided_audio_session",
            "suggested_verdict": "real",
            "suggested_check": "세션 길이·트랙 파일 존재를 파일로 확인",
            "suggested_worker": "음악 생성 AI + 자체 선별",
            "reason": "가이드 오디오 세션 재생",
        },
        ("번역", "translate"): {
            "id": "translation",
            "suggested_verdict": "real",
            "suggested_check": "역번역 왕복 후 원문과 유사도 임계 비교",
            "suggested_worker": "ChatGPT (번역)",
            "reason": "텍스트 번역",
        },
        ("운세", "사주", "타로"): {
            "id": "fortune_telling",
            "suggested_verdict": "no_judge",
            "suggested_check": "",
            "suggested_worker": "ChatGPT (생성)",
            "reason": "운세 생성 - 진위 심판 없음",
        },
    }
    STOP = {"앱", "만들어줘", "만들", "해줘", "좀", "그리고", "이랑", "랑",
            "출시", "출시급", "만", "개발", "제작"}

    def complete(self, prompt: str) -> str:
        want = _want_from_prompt(prompt).lower()
        proposals = []
        for keys, atom in self.SCRIPTED.items():
            if any(k in want for k in keys):
                proposals.append(dict(atom))
        if not proposals:
            # 미지 토큰이 남으면 일반 제안 스텁(검증 필요, check 없음)
            residual = _residual_tokens(want)
            if residual:
                slug = re.sub(r"[^0-9a-z가-힣]+", "_", residual[0])[:20]
                proposals.append({
                    "id": f"proposed_{slug}",
                    "suggested_verdict": "unknown",
                    "suggested_check": "",
                    "suggested_worker": None,
                    "reason": f"'{residual[0]}' 관련 능력 - mock 스텁(실제 분해는 LLM)",
                })
        return json.dumps({"proposals": proposals}, ensure_ascii=False)


class AnthropicProposer:
    """실 제공자 — GENESIS_SPEND=i-approve + 키 있을 때만. 기본으로 안 돈다."""

    name = "anthropic"

    def __init__(self, model: str = DEFAULT_MODEL, max_tokens: int = 700):
        if os.environ.get("GENESIS_SPEND") != "i-approve":
            raise RuntimeError(
                "유료 경로 잠김: GENESIS_SPEND=i-approve 필요(사용자 승인). "
                "기본은 목이다.")
        self.api_key = load_api_key()
        if not self.api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY 없음(환경변수·ai-workforce/.env.local 둘 다)")
        spent = ledger_total_usd()
        if spent >= SPEND_CAP_USD:
            raise RuntimeError(
                f"누적 지출 ${spent:.4f} >= 상한 ${SPEND_CAP_USD:.2f} - 호출 거부. "
                "상한을 올리려면 사장님 승인이 필요하다")
        self.model = model
        self.max_tokens = max_tokens
        self.usage = {"calls": 0, "input_tokens": 0, "output_tokens": 0}
        self.last_cost = None

    def complete(self, prompt: str) -> str:
        body = json.dumps({
            "model": self.model, "max_tokens": self.max_tokens,
            "temperature": 1.0,
            "messages": [{"role": "user", "content": prompt}],
        }).encode()
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages", data=body,
            headers={"x-api-key": self.api_key,
                     "anthropic-version": "2023-06-01",
                     "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
        u = data.get("usage", {})
        self.usage["calls"] += 1
        self.usage["input_tokens"] += u.get("input_tokens", 0)
        self.usage["output_tokens"] += u.get("output_tokens", 0)
        self.last_cost = record_call(self.model, _want_from_prompt(prompt), u)
        return "".join(b.get("text", "") for b in data.get("content", []))


PROMPT = """다음 요청을 '능력 원자'로 분해해라. 각 원자는 하나의 검증 가능한
(또는 불가능한) 일이다. JSON만 출력: {{"proposals":[{{"id","suggested_verdict"
(real|snake_oil|no_judge|unknown),"suggested_check"(기계가 채점하는 방법 한 줄,
없으면 ""),"suggested_worker","reason"}}]}}. 절대적 '좋음/예쁨'은 no_judge다.

요청: {want}"""


def _extract_json(raw: str) -> dict:
    """모델 응답에서 JSON을 뽑는다. ```json 펜스나 앞뒤 설명이 붙어도 견딘다."""
    s = (raw or "").strip()
    m = re.search(r"```(?:json)?\s*(.+?)```", s, re.S)
    if m:
        s = m.group(1).strip()
    if not s.startswith("{"):
        i, j = s.find("{"), s.rfind("}")
        if i != -1 and j != -1 and j > i:
            s = s[i:j + 1]
    return json.loads(s)


def _want_from_prompt(prompt: str) -> str:
    m = re.search(r"요청:\s*(.+)\s*$", prompt, re.S)
    return (m.group(1) if m else prompt).strip()


def _residual_tokens(want: str) -> list:
    reg = be.load_registry()
    aliases = [al.lower() for a in reg for al in a.get("aliases", [])]
    out = []
    for tok in re.split(r"[\s,./]+", want):
        tok = tok.strip()
        if len(tok) < 2 or tok in MockProposer.STOP:
            continue
        if any(al in tok or tok in al for al in aliases):
            continue
        out.append(tok)
    return out


def make_provider(name: str):
    if name == "anthropic":
        return AnthropicProposer()
    return MockProposer()


# --------------------------------------------------------------- 층

def propose(want: str, registry: list | None = None,
            provider: str = "mock") -> dict:
    """자유 문장 → {known: [신뢰 원자], proposed: [격리된 제안]}.

    known: 레지스트리 매칭(신뢰). proposed: LLM 제안(unverified, 격리).
    """
    reg = registry if registry is not None else be.load_registry()
    known = be.intake(want, reg)
    known_ids = {a["id"] for a in known}

    prov = make_provider(provider)
    raw = prov.complete(PROMPT.format(want=want))
    try:
        parsed = _extract_json(raw).get("proposals", [])
    except (ValueError, AttributeError):
        parsed = []

    proposed = []
    for p in parsed:
        pid = p.get("id")
        if not pid or pid in known_ids:
            continue                     # 이미 아는 것이면 제안 아님
        proposed.append({
            "id": pid,
            "source": "llm",
            "status": "proposed",
            "verdict": "unverified",     # ← 격리. 모델 주장과 무관하게.
            "checkable": False,
            "suggested_verdict": p.get("suggested_verdict"),
            "suggested_check": p.get("suggested_check", ""),
            "suggested_worker": p.get("suggested_worker"),
            "reason": p.get("reason", ""),
        })
    return {"known": known, "proposed": proposed, "provider": prov.name}


def plan(want: str, refs=None, days=None, pick=None, provider="mock",
         registry=None) -> dict:
    """제안 → 신뢰 경로(known)만 설계도·견적으로, 제안은 격리해 첨부."""
    reg = registry if registry is not None else be.load_registry()
    pr = propose(want, reg, provider=provider)
    out = be.run(want, refs=refs, days=days, approve=True, pick=pick,
                 registry=reg, matched=pr["known"])
    out["proposed"] = pr["proposed"]     # 격리: 견적·체크리스트엔 안 들어감
    out["provider"] = pr["provider"]
    return out


REQUIRED_VERDICTS = {"real", "snake_oil", "no_judge"}


def promote_proposal(proposal: dict, verdict: str, check: str = "",
                     worker: str | None = None, worker_impl: str | None = None,
                     effort: str | None = None,
                     aliases: list | None = None,
                     judge_spec: dict | None = None,
                     adapter: str | None = None,
                     registry_path: str = be.REGISTRY) -> dict:
    """사람이 검증한 제안을 레지스트리에 등록한다(격리 해제).

    모델 주장이 아니라 **사람이 정한** verdict/check로 등록한다. 그리고
    v1부터 real의 조건은 문장이 아니다 — **심판대(tools/judge_bench.py)를 통과하는
    judge 명세**가 있어야 한다. 자기 반례를 거절하지 못하면 real이 될 수 없다.
    real이 아닌 원자는 왜 기계가 못 재는지를 human_gate로 명시해 남긴다."""
    if verdict not in REQUIRED_VERDICTS:
        raise ValueError(f"verdict는 {REQUIRED_VERDICTS} 중 하나여야 함")
    if verdict == "real":
        if not check.strip():
            raise ValueError("real로 등록하려면 기계 check가 반드시 필요하다")
        if not judge_spec:
            raise ValueError(
                "real로 등록하려면 실행 가능한 judge 명세가 필요하다 "
                "(kind/params/positive/negatives) — 문장만으로는 심판이 아니다")
        probe = judge.bench_atom({"id": proposal["id"], "verdict": "real",
                                  "judge": judge_spec})
        if probe["verdict"] != "teeth":
            raise ValueError(
                f'judge 명세가 심판대를 통과하지 못했다 '
                f'[{probe["verdict"]}]: {probe["reason"]}')
    elif judge_spec is None:
        judge_spec = {"kind": "human_gate",
                      "params": {"why": proposal.get("reason", "")
                                 or "기계 심판 없음(선언)"}}
    atom = {
        "id": proposal["id"],
        "category": "promoted",
        "aliases": aliases or [proposal["id"]],
        "verdict": verdict,
        "checkable": verdict == "real",
        # worker는 **표시용 역할**이다(벤더명 금지). 실명은 worker_impl.
        "worker_role": worker,
        "worker_impl": worker_impl,
        "effort": effort,
        "check": check,
        "reason": proposal.get("reason", ""),
        "judge": judge_spec,
    }
    if adapter:
        atom["adapter"] = adapter
    with open(registry_path, encoding="utf-8") as f:
        reg = json.load(f)
    if any(a["id"] == atom["id"] for a in reg):
        raise ValueError(f"{atom['id']} 이미 등록됨")
    reg.append(atom)
    with open(registry_path, "w", encoding="utf-8") as f:
        json.dump(reg, f, ensure_ascii=False, indent=2)
    return atom


def _print(out: dict) -> None:
    print(f'제공자: {out.get("provider")}   요청: "{out["want"]}"')
    print("=" * 60)
    print("[신뢰] 아는 원자 → 설계도·견적으로 진행:")
    print("   ", ", ".join(out["intake"]) or "(없음)")
    print("=" * 60)
    prop = out.get("proposed", [])
    if prop:
        print("[격리] LLM 제안 → 검증 전 사용 금지(코인·체크리스트 제외):")
        for p in prop:
            sv, sc = p.get("suggested_verdict"), p.get("suggested_check")
            print(f'    - {p["id"]}  [verdict=unverified; 모델주장={sv}]')
            print(f'        사유: {p["reason"]}')
            print(f'        모델이 낸 check: {sc or "(없음)"}  ← 사람이 검증해야 등록됨')
        print("    ⚠ 제안은 견적에 넣지 않는다. promote_proposal()로 검증·등록 후에만.")
    else:
        print("[격리] LLM 제안: 없음")


def main(argv=None):
    ap = argparse.ArgumentParser(description="LLM Proposer 층")
    ap.add_argument("--want", required=True)
    ap.add_argument("--provider", default="mock",
                    choices=["mock", "anthropic"])
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    out = plan(args.want, provider=args.provider)
    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        _print(out)
    return out


if __name__ == "__main__":
    main()
