"""아이콘 레인 실전 루프 — 생성(외부 LLM) → 심판 J → 재생성 → 저장.

설계: docs/icon-lane-design.md §3(초회 프롬프트)·§5(재생성)·§6(실패·중복 처리).
어제까지는 심판만 있고 후보가 없었다. 이 파일이 그 구멍을 메운다.

경계는 그대로다: **Proposer는 교체 가능한 외부 LLM, 심판은 우리 순수 함수.**
이 파일에 채점 로직은 없다 — 전부 tools/icon_judge.py(→ genesis/icon_lane.py)를
부른다. 여기 있는 것은 프롬프트·루프·필터뿐이다.

굿하트 대응 세 가지가 코드로 강제된다:
1. **hidden 미주입** — 프롬프트는 spec 문서의 `public` 가지에서만 만든다.
   `_assert_no_hidden_leak()`이 생성 직전에 프롬프트를 검사하고, 새면 던진다.
2. **hidden 탈락은 사유 미제공** — 리포트가 `internal_quality_gate`로만 나가고
   (icon_judge.report), 그 라운드는 최소수정이 아니라 구조 변경(temp 1.3)으로 간다.
3. **중복 서명은 프롬프트에 안 알린다** — 그 후보만 조용히 버린다(§6).

지출 규율: 기본 제공자는 목(mock)이다. 실 호출은 GENESIS_SPEND=i-approve +
--provider anthropic + 이 실행분 예산(--max-usd)까지 셋 다 있어야 한다.
비용은 tools/proposer.py의 공용 원장(data/proposer_ledger.jsonl)에 tool=icon_lane
으로 적힌다.

  python -X utf8 tools/icon_lane_run.py --concept save --meaning "저장"
  python -X utf8 tools/icon_lane_run.py --set-file data/icon_sets/rpg-ui-v1.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import icon_lane                            # noqa: E402
from tools import icon_judge                             # noqa: E402
from tools import proposer as pz                         # noqa: E402

CANDIDATE_MARK = re.compile(r"^\s*<!--\s*CANDIDATE\s*\d+\s*-->\s*$", re.M)
# 2026-08-27 사장님 결정: 기본 티어를 **sonnet 5**로 올린다.
# 근거(같은 날 실측, 예시 0개·호출 18씩):
#   규격 통과율  haiku 0.276 / sonnet 0.870 / opus 0.972  (tier_helps)
#   블라인드 선별 31선택 중 haiku **0개**            (avoided, p=0.025)
#   눈으로는 sonnet과 opus가 구분 안 됨              (p=0.69)
#   통과분당 단가는 1.5배뿐                          ($0.0035 → $0.0055)
# 그래서 "싼 티어부터"를 버린다. opus가 아니라 sonnet인 이유는 눈에 차이가
# 없는데 값이 두 배이기 때문이다.
DEFAULT_MODEL = "claude-sonnet-5"
DEFAULT_N = 6                          # §3: 6후보 = 무작위 120후보 수준(7A)
MAX_ROUNDS = 3                         # §6: 4라운드는 없다 → 미정의
# 설계 §5·§6은 3회차에 temp 1.3을 쓰라고 한다. 그런데 Anthropic API는
# temperature 범위가 0..1이다(2026-08-26 09:26, "range: 0..1"로 400).
# **설계를 조용히 고치지 않는다**: 요청값은 그대로 두고 제공자가 자기 상한으로
# 깎게 하며, 깎였다는 사실을 라운드 기록에 남긴다(temperature_requested).
TEMP_BY_ROUND = {1: 1.0, 2: 1.0, 3: 1.3}


class BudgetExhausted(RuntimeError):
    """이번 실행 예산이 끊겼다. 후보의 결격이 아니므로 판정은 미정의로 간다."""


def _sha12(text: str) -> str:
    return hashlib.sha1((text or "").encode("utf-8")).hexdigest()[:12]


SYSTEM_PROMPT = """너는 SVG 아이콘 생성기다. 설명하지 않는다. 협상하지 않는다.
출력 규칙:
- SVG 코드만 출력한다. 마크다운 코드펜스, 주석, 설명 문장 일절 금지.
- 후보를 N개 요구받으면 각 후보를 <!--CANDIDATE k--> 줄로만 구분한다.
- 스펙을 위반하는 출력은 폐기된다. 스펙과 심미성이 충돌하면 스펙이 이긴다.
- 좌표는 소수점 이하 한 자리까지만 쓴다.
- 색을 하드코딩하지 않는다. stroke="currentColor" 만 쓴다.
너는 기계 검증기에 제출하고 있다. 사람이 보고 봐주지 않는다."""


# 프롬프트 제거 통제(docs/prompt-ablation-v0-design.md §2-1)의 짝. 스펙 내용을
# 한 줄도 담지 않는다 — 출력 형식과 "기계가 검사한다"는 사실만 남는다.
SYSTEM_PROMPT_NO_SPEC = """너는 SVG 아이콘 생성기다. 설명하지 않는다. 협상하지 않는다.
출력 규칙:
- SVG 코드만 출력한다. 마크다운 코드펜스, 주석, 설명 문장 일절 금지.
- 후보를 N개 요구받으면 각 후보를 <!--CANDIDATE k--> 줄로만 구분한다.
너는 기계 검증기에 제출하고 있다. 사람이 보고 봐주지 않는다."""


# ------------------------------------------------------------------ 프롬프트

def _hidden_keys(node, out=None) -> list:
    out = [] if out is None else out
    if isinstance(node, dict):
        for k, v in node.items():
            out.append(str(k))
            _hidden_keys(v, out)
    elif isinstance(node, list):
        for v in node:
            _hidden_keys(v, out)
    return out


def _assert_no_hidden_leak(prompt: str, doc: dict) -> None:
    """hidden 가지의 어떤 열쇠말도 프롬프트에 없어야 한다(§0 굿하트 대응).

    문서를 고쳐 hidden 항목이 늘어도 이 검사가 따라온다 — 손으로 적은 금지어
    목록이 아니라 spec 문서 자체에서 열쇠말을 뽑기 때문이다.
    """
    lowered = prompt.lower()
    # screen_layer도 같이 막는다(2026-08-26): 지금은 자산 심판이 아니지만 UI
    # 테마가 동결되면 관문이 된다. 이름을 프롬프트에 넣어 두면 그때 가서
    # 그 지표만 겨냥하는 출력이 온다 - 굿하트는 층을 가리지 않는다.
    secret = (list(_hidden_keys(doc.get("hidden", {})))
              + list(_hidden_keys(doc.get("screen_layer", {}))))
    leaked = sorted({k for k in secret if k and k.lower() in lowered})
    if leaked:
        raise ValueError(f"hidden 항목이 프롬프트로 샜다: {leaked}")


def public_spec_lines(doc: dict) -> str:
    """프롬프트에 넣는 스펙 — 오직 public 가지에서. 심판과 같은 문서를 읽는다."""
    p = doc["public"]
    fills = p["fill"] if isinstance(p["fill"], str) else ", ".join(p["fill"])
    return "\n".join([
        '- viewBox="{}" / 모든 좌표 {}의 배수'.format(
            p["viewBox"], p["grid"]["snap"]),
        '- stroke-width="{}", linecap/linejoin="{}", fill="{}", '
        'stroke="{}"'.format(p["stroke"]["width"], p["stroke"]["linecap"],
                             fills, p["palette"][0]),
        '- 가장자리 최소 {} 여백 / <path> 최대 {}, 명령 최대 {}'.format(
            p["padding"]["min"], p["path"]["max_count"],
            p["path"]["max_total_commands"]),
        '- 허용: {} / 금지: {}'.format(",".join(p["allowed_elements"]),
                                       ",".join(p["forbidden_elements"])),
        '- {}바이트 이하'.format(p["size"]["max_bytes"]),
    ])


def initial_prompt(concept: str, meaning: str, set_name: str, index: int,
                   examples: list, doc: dict, n: int = DEFAULT_N,
                   no_spec: bool = False) -> str:
    """설계 §3. 세트 예시는 이미 통과한 것만 넣는다(스타일 전파).

    `no_spec=True`면 **스펙 블록을 통째로 뺀다** — 프롬프트 제거 통제의 팔이다
    (docs/prompt-ablation-v0-design.md §2-1). 예시를 넣을지는 부르는 쪽이
    정한다: 예시도 본보기로 준 스펙이라 통제에서는 두 팔 모두 비운다.
    """
    ex = "\n".join(examples[:3]) or "(없음 - 세트의 첫 아이콘)"
    if no_spec:
        return ("개념: {}\n의미: {}\n"
                "세트 맥락: {} 세트의 {}번째. 기존 아이콘 스타일 참고:\n{}\n"
                "후보 {}개를 서로 다른 구조로. 회전·반전은 다른 구조가 아니다."
                ).format(concept, meaning, set_name, index, ex, n)
    return ("개념: {}\n의미: {}\n"
            "세트 맥락: {} 세트의 {}번째. 기존 아이콘 스타일 참고:\n{}\n"
            "스펙 (전부 강제):\n{}\n"
            "후보 {}개를 서로 다른 구조로. 회전·반전은 다른 구조가 아니다."
            ).format(concept, meaning, set_name, index, ex,
                     public_spec_lines(doc), n)


def retry_prompt(judge_report: str) -> str:
    """설계 §5 최소수정. 리포트는 icon_judge.report()가 이미 hidden을 가린 것."""
    return ("직전 출력이 기계 검증에서 탈락했다. 리포트:\n"
            "{}\n"
            "수정 규칙:\n"
            "- violations에 적힌 것만 고쳐라. passed는 건드리지 마라.\n"
            "- 형태 컨셉 유지, 좌표만 조정. 새로 디자인하지 마라.\n"
            "- 다시 SVG 코드만.").format(judge_report)


def restructure_prompt(n: int = DEFAULT_N) -> str:
    """설계 §5 예외 — 사유를 주지 않는다. hidden 탈락이거나 3회차."""
    return ("직전 출력이 기계 검증에서 탈락했다. 사유는 제공하지 않는다.\n"
            "다른 구조로 다시. 후보 {}개, SVG만.".format(n))


# ------------------------------------------------------------------ 제공자

def split_candidates(raw: str) -> list:
    """<!--CANDIDATE k--> 로 자른다. 마커가 없으면 <svg ...>...</svg>로 훑는다."""
    text = (raw or "").strip()
    text = re.sub(r"```(?:svg|xml|html)?", "", text)
    parts = [p.strip() for p in CANDIDATE_MARK.split(text)]
    out = [p for p in parts if p.startswith("<svg")]
    if out:
        return out
    return [m.group(0) for m in re.finditer(r"<svg\b.*?</svg>", text, re.S)]


_MOCK_HEAD = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
              'fill="none" stroke="currentColor" stroke-width="1.5" '
              'stroke-linecap="round" stroke-linejoin="round">')


class MockIconProposer:
    """결정적 목 — 루프·필터·리포트 주입을 지출 0으로 검증한다.

    실 모델을 흉내 내지 않는다. 리포트를 못 받은 라운드에는 스펙을 어기는 후보
    (격자 이탈·색 하드코딩·금지 요소)만 내고, **위반 리포트를 받으면** 고친
    후보를 낸다. 리포트가 안 오면 계속 어긴다 — 통과가 리포트 주입 덕인지
    그냥 재시도 운인지를 가르기 위해서다.
    """

    name = "mock"
    model = "mock"
    max_temperature = 2.0          # 목은 온도를 안 쓴다(상한 없음과 같다)

    def __init__(self):
        self.calls = []

    def generate(self, system: str, user: str, temperature: float,
                 n: int) -> str:
        self.calls.append({"user": user, "temperature": temperature, "n": n})
        if "violations:" in user:
            good = _MOCK_HEAD + '<path d="M 4 6 L 19.5 6 L 19.5 18 L 4 18 Z"/></svg>'
            body = [good,
                    good,                       # 구조 동일 → 중복 필터가 먹어야
                    _MOCK_HEAD + '<path d="M 6 4 L 18 4 L 18 20 L 6 20 Z"/></svg>']
        else:
            body = [
                # 격자 이탈(4.37) — grid.snap 위반
                _MOCK_HEAD + '<path d="M 4.37 6 L 19.5 6"/></svg>',
                # 색 하드코딩 — palette 위반
                _MOCK_HEAD.replace('stroke="currentColor"', 'stroke="#ff0000"')
                + '<path d="M 4 6 L 19.5 6"/></svg>',
                # 금지 요소 text
                _MOCK_HEAD + '<text x="4" y="6">i</text></svg>',
            ]
        return "\n".join("<!--CANDIDATE {}-->\n{}".format(i + 1, s)
                         for i, s in enumerate(body))


class AnthropicIconProposer:
    """실 제공자 — GENESIS_SPEND=i-approve + 키 + 이번 실행 예산이 다 있어야 산다.

    tools/proposer.py의 지갑을 그대로 쓴다(누적 상한·원장 공용). 온도와 시스템
    프롬프트가 필요해 클래스가 따로 있을 뿐, 예산 규율은 한 곳이다.
    """

    name = "anthropic"
    max_temperature = 1.0          # API 제약(0..1). 설계의 1.3은 여기서 깎인다
    # 온도를 받지 않는 계열(적응형 사고). 접두사로 판정한다 — 새 모델이 나와도
    # 이름이 이 계열이면 자동으로 걸린다.
    NO_TEMPERATURE_PREFIXES = ("claude-sonnet-5", "claude-opus-5",
                               "claude-fable-5", "claude-mythos-5",
                               "claude-opus-4-6", "claude-opus-4-7",
                               "claude-opus-4-8", "claude-sonnet-4-6")

    # 5-계열은 적응형 사고가 항상 켜져 있어 출력 예산을 먹는다. 3000이면
    # SVG가 중간에 잘린다(2026-08-27 07:2x 실측: 출력이 정확히 3000).
    # effort는 Haiku 4.5가 받지 않으므로 5-계열에만 보낸다.
    EFFORT_MODELS = ("claude-sonnet-5", "claude-opus-5", "claude-fable-5",
                     "claude-mythos-5", "claude-opus-4-8", "claude-opus-4-7")

    def __init__(self, model: str = DEFAULT_MODEL, max_usd: float = 0.05,
                 max_tokens: int = 16000, effort: str | None = "low"):
        if os.environ.get("GENESIS_SPEND") != "i-approve":
            raise RuntimeError(
                "유료 경로 잠김: GENESIS_SPEND=i-approve 필요(사장님 승인). "
                "기본은 목이다.")
        self.api_key = pz.load_api_key()
        if not self.api_key:
            raise RuntimeError("ANTHROPIC_API_KEY 없음")
        spent = pz.ledger_total_usd()
        if spent >= pz.SPEND_CAP_USD:
            raise RuntimeError(
                "누적 지출 ${:.4f} >= 상한 ${:.2f} - 거부".format(
                    spent, pz.SPEND_CAP_USD))
        self.model = model
        self.max_usd = max_usd
        self.max_tokens = max_tokens
        self.effort = effort if any(model.startswith(p)
                                    for p in self.EFFORT_MODELS) else None
        self.spent_here = 0.0
        self.accepts_temperature = not any(
            model.startswith(p) for p in self.NO_TEMPERATURE_PREFIXES)
        self.temperature_dropped = False
        self.retries = 0
        self.retry_log = []
        self.usage = {"calls": 0, "input_tokens": 0, "output_tokens": 0}

    # 2026-08-26 21:56: 교정 재실행이 **첫 호출에서** RemoteDisconnected로 죽고
    # 20호출짜리 실행이 통째로 날아갔다(지출은 0이었다). 재시도를 넣되 범위를
    # 좁힌다: **응답을 못 받은 것이 확실한 경우**만. 읽기 시간초과는 서버가 이미
    # 처리했을 수 있어(=과금됐을 수 있어) 재시도하지 않는다 — 장부에 못 적는
    # 지출을 만드는 것이 끊긴 연결보다 나쁘다.
    RETRY_ON = (ConnectionError,)      # RemoteDisconnected가 여기 속한다
    RETRY_HTTP = (429, 529)            # 넘침·과부하 — 과금되지 않는다
    RETRY_MAX = 3
    RETRY_BACKOFF = (2, 5)

    def _post(self, req) -> dict:
        import urllib.error
        import urllib.request
        last = None
        for attempt in range(1, self.RETRY_MAX + 1):
            try:
                with urllib.request.urlopen(req, timeout=180) as resp:
                    if attempt > 1:
                        self.retries += 1
                    return json.loads(resp.read())
            except urllib.error.HTTPError as exc:   # 본문을 삼키지 않는다
                detail = exc.read().decode("utf-8", "replace")[:400]
                if exc.code not in self.RETRY_HTTP or attempt == self.RETRY_MAX:
                    raise RuntimeError(
                        "API {} - {}".format(exc.code, detail)) from None
                last = "HTTP {}".format(exc.code)
            except self.RETRY_ON as exc:
                if attempt == self.RETRY_MAX:
                    raise
                last = type(exc).__name__
            time.sleep(self.RETRY_BACKOFF[min(attempt - 1,
                                              len(self.RETRY_BACKOFF) - 1)])
            self.retry_log.append({"attempt": attempt, "why": last})
        raise RuntimeError("재시도 소진: {}".format(last))

    def generate(self, system: str, user: str, temperature: float,
                 n: int) -> str:
        if self.spent_here >= self.max_usd:
            raise BudgetExhausted(
                "이번 실행 예산 ${:.4f} 소진(${:.4f}) - 호출 중단".format(
                    self.max_usd, self.spent_here))
        import urllib.error
        import urllib.request
        payload = {
            "model": self.model, "max_tokens": self.max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        # 온도는 **모델에 따라 존재하지 않는다**. Sonnet 5·Opus 5·Fable 5 등
        # 최신 계열은 temperature/top_p를 받지 않고 400을 낸다(적응형 사고가
        # 대신한다). 티어를 바꿔 재는 실험에서 이걸 모르면 전부 400으로 죽는다.
        # **온도를 못 거는 것 자체가 티어 간 차이**이므로 기록에 남긴다.
        if self.accepts_temperature:
            payload["temperature"] = temperature
        else:
            self.temperature_dropped = True
        if self.effort:
            # 아이콘 SVG는 사고가 깊을 일이 아니다. 사고 토큰이 곧 비용이다.
            payload["output_config"] = {"effort": self.effort}
        body = json.dumps(payload).encode()
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages", data=body,
            headers={"x-api-key": self.api_key,
                     "anthropic-version": "2023-06-01",
                     "content-type": "application/json"})
        data = self._post(req)
        u = data.get("usage", {})
        self.usage["calls"] += 1
        self.usage["input_tokens"] += u.get("input_tokens", 0)
        self.usage["output_tokens"] += u.get("output_tokens", 0)
        row = pz.record_call(self.model, user.splitlines()[0][:60], u,
                             tool="icon_lane")
        self.spent_here += row["usd"]
        return "".join(b.get("text", "") for b in data.get("content", []))


def make_provider(name: str, model: str = DEFAULT_MODEL,
                  max_usd: float = 0.05, max_tokens: int = 16000):
    if name == "anthropic":
        return AnthropicIconProposer(model=model, max_usd=max_usd,
                                     max_tokens=max_tokens)
    return MockIconProposer()


# ------------------------------------------------------------------ 루프

def run_concept(concept: str, meaning: str, provider, doc: dict,
                set_name: str = "set", index: int = 1,
                accepted: list | None = None, n: int = DEFAULT_N,
                max_rounds: int = MAX_ROUNDS, no_spec: bool = False) -> dict:
    """개념 하나 → 라운드를 돌며 통과 후보를 찾는다. 못 찾으면 UNDEFINED.

    설계 §6의 라운드표 그대로. 반환에는 라운드마다 어떤 프롬프트를 왜 썼는지가
    남는다 — 나중에 "통과가 리포트 덕이었나 운이었나"를 되짚기 위해서다.
    """
    accepted = list(accepted or [])
    rounds = []
    seen = {icon_lane.structure_hash(s) for s in accepted}
    prompt = initial_prompt(concept, meaning, set_name, index, accepted, doc,
                            n, no_spec=no_spec)
    system = SYSTEM_PROMPT_NO_SPEC if no_spec else SYSTEM_PROMPT
    mode = "initial"
    for rd in range(1, max_rounds + 1):
        want_temp = TEMP_BY_ROUND.get(rd, 1.3)
        temp = min(want_temp, getattr(provider, "max_temperature", 2.0))
        _assert_no_hidden_leak(prompt, doc)
        try:
            raw = provider.generate(system, prompt, temp, n)
        except BudgetExhausted as exc:
            # 예산이 끊긴 것은 후보의 잘못이 아니다 → 탈락이 아니라 미정의
            return {"concept": concept, "meaning": meaning,
                    "verdict": "UNDEFINED", "svg": None, "candidates": [],
                    "rounds": rounds, "used_rounds": len(rounds),
                    "why": str(exc)}
        cands = split_candidates(raw)
        judged, dropped_dup = [], 0
        for svg in cands:
            h = icon_lane.structure_hash(svg)
            if h in seen:                       # §6: 알리지 않고 버린다
                dropped_dup += 1
                continue
            seen.add(h)
            res = icon_judge.judge_svg(svg, doc)
            judged.append({"svg": svg, "result": res,
                           "violations": sum(1 for r in res["rules"]
                                             if r["ok"] is False)})
        passed = [j for j in judged if j["result"]["verdict"] == "PASS"]
        # 미정의는 탈락이 아니다 → 고칠 것을 시키지 않는다(심판대 규율 4·5)
        failed = [j for j in judged if j["result"]["verdict"] == "FAIL"]
        rounds.append({"round": rd, "mode": mode, "temperature": temp,
                       "temperature_requested": want_temp,
                       "temperature_capped": temp != want_temp,
                       "candidates": len(cands), "judged": len(judged),
                       "dropped_duplicate": dropped_dup,
                       "passed": len(passed), "failed": len(failed),
                       "undefined": len(judged) - len(passed) - len(failed),
                       "reports": [icon_judge.report(j["result"], i)
                                   for i, j in enumerate(judged)]})
        if passed:
            # 통과 후보를 **전부** 돌려준다. 첫 통과만 남기고 버리면 사람이
            # 고를 것이 없다 - 심판은 걸러낼 뿐, 고르는 것은 사장님이다.
            return {"concept": concept, "meaning": meaning, "verdict": "PASS",
                    "svg": passed[0]["svg"],
                    "candidates": [j["svg"] for j in passed],
                    "extra_passes": len(passed) - 1,
                    "rounds": rounds, "used_rounds": rd}
        if rd == max_rounds:
            break
        if not failed:      # 중복·파싱 실패·미정의뿐 → 고칠 것을 못 준다
            prompt, mode = restructure_prompt(n), "restructure"
            continue
        best = min(failed, key=lambda j: j["violations"])
        hidden_only = all(r["hidden"] for r in best["result"]["rules"]
                          if r["ok"] is False)
        if hidden_only or rd + 1 == max_rounds:
            prompt, mode = restructure_prompt(n), "restructure"
        else:
            prompt = retry_prompt(icon_judge.report(best["result"]))
            mode = "minimal_fix"
    return {"concept": concept, "meaning": meaning, "verdict": "UNDEFINED",
            "svg": None, "candidates": [], "rounds": rounds,
            "used_rounds": len(rounds),
            "why": "{}회차까지 통과 후보 없음 - 판정하지 않고 큐에 남긴다".format(
                max_rounds)}


def prompt_fingerprint(doc: dict, no_spec: bool = False) -> dict:
    """이 실행이 **무엇을 시켰는지**의 지문.

    2026-08-26에 발견한 구멍: 실행 기록에 모델·온도·온도 상한 조정까지 남기면서
    정작 **프롬프트와 스펙이 안 남았다.** 그래서 "회차 사이에 프롬프트가
    바뀌었나"라는 질문이 사후에 답이 안 됐고, 통과율 0.81 → 0.98의 원인을
    가릴 수 없었다.

    프롬프트 전문이 아니라 지문(해시)과 스펙 ID를 남긴다 — 전문은 길고, 우리가
    알아야 하는 것은 "같았나 달랐나"이기 때문이다. 초회 프롬프트는 개념 이름이
    들어가 매번 다르므로 **개념을 뺀 골격**을 해시한다.
    """
    skeleton = initial_prompt("<개념>", "<뜻>", "<세트>", 0, [], doc,
                              DEFAULT_N, no_spec=no_spec)
    return {
        "spec_id": doc.get("spec_id"),
        "arm": "no_spec" if no_spec else "with_spec",
        "public_spec_sha": (None if no_spec
                            else _sha12(public_spec_lines(doc))),
        "system_prompt_sha": _sha12(SYSTEM_PROMPT_NO_SPEC if no_spec
                                    else SYSTEM_PROMPT),
        "initial_prompt_skeleton_sha": _sha12(skeleton),
        "retry_prompt_sha": _sha12(retry_prompt("<리포트>")),
        "restructure_prompt_sha": _sha12(restructure_prompt()),
        "note": ("프롬프트 전문이 아니라 지문이다. 회차 간 '같았나 달랐나'를 "
                 "사후에 답할 수 있게 하는 것이 목적."),
    }


def run_set(items: list, provider, doc: dict, set_name: str = "set",
            out_dir: str | None = None, n: int = DEFAULT_N,
            defer_pick: bool = False) -> dict:
    """세트 전체. 통과 후보를 남기고, 끝에 세트 규칙(획 통일·중복)을 다시 건다.

    defer_pick=True면 **기계가 고르지 않는다**: 통과 후보를 전부 candidates/에
    남기고 대표 파일을 쓰지 않는다. 고르는 것은 사람 몫이고, 그 선택이 다음
    심판의 재료가 된다(tools/pick_session.py).
    """
    accepted, results = [], []
    for i, item in enumerate(items, 1):
        r = run_concept(item["concept"], item.get("meaning", item["concept"]),
                        provider, doc, set_name=set_name, index=i,
                        accepted=accepted, n=n)
        results.append(r)
        slug = re.sub(r"[^0-9a-zA-Z가-힣_-]+", "_", item["concept"])
        if out_dir and r.get("candidates"):
            cdir = os.path.join(out_dir, "candidates",
                                "{:02d}_{}".format(i, slug))
            os.makedirs(cdir, exist_ok=True)
            r["candidate_paths"] = []
            for k, svg in enumerate(r["candidates"], 1):
                cpath = os.path.join(cdir, "c{:02d}.svg".format(k))
                with open(cpath, "w", encoding="utf-8") as f:
                    f.write(svg)
                r["candidate_paths"].append(os.path.relpath(cpath, ROOT))
        if r["svg"]:
            accepted.append(r["svg"])
            if out_dir and not defer_pick:
                os.makedirs(out_dir, exist_ok=True)
                path = os.path.join(out_dir, "{:02d}_{}.svg".format(i, slug))
                with open(path, "w", encoding="utf-8") as f:
                    f.write(r["svg"])
    cons = icon_lane.set_consistency(accepted) if accepted else {
        "stroke_widths": [], "variance_zero": True,
        "optical_weight": "미측정 - 래스터라이저 필요"}
    return {"set": set_name, "results": results,
            "passed": sum(1 for r in results if r["verdict"] == "PASS"),
            "total": len(results),
            "calls": getattr(provider, "usage", {}).get("calls",
                                                        len(getattr(provider, "calls", []))),
            "usd": round(getattr(provider, "spent_here", 0.0), 6),
            "provider": provider.name,
            "model": getattr(provider, "model", "mock"),
            "set_consistency": cons,
            "duplicates": icon_lane.duplicates(accepted),
            "candidate_total": sum(len(r.get("candidates", []))
                                   for r in results),
            "prompt_fingerprint": prompt_fingerprint(doc),
            "picked_by": None if defer_pick else "machine_first_pass",
            "unmeasured": ["contrast", "roundtrip", "optical_weight_delta"]}


def _print(out: dict) -> None:
    print("세트 {} — 제공자 {}/{}".format(out["set"], out["provider"],
                                          out["model"]))
    print("=" * 64)
    for r in out["results"]:
        print("{:9s} {:16s} 라운드 {}".format(r["verdict"], r["concept"],
                                              r["used_rounds"]))
        for rd in r["rounds"]:
            temp = "{}{}".format(
                rd["temperature"],
                "(요청 {} 깎임)".format(rd["temperature_requested"])
                if rd.get("temperature_capped") else "")
            print("    r{} {:12s} temp {}  후보 {} / 채점 {} / 중복버림 {}"
                  " / 통과 {} / 탈락 {} / 미정의 {}".format(
                      rd["round"], rd["mode"], temp,
                      rd["candidates"], rd["judged"], rd["dropped_duplicate"],
                      rd["passed"], rd["failed"], rd["undefined"]))
        if r["verdict"] != "PASS":
            print("    → {}".format(r.get("why", "")))
    c = out["set_consistency"]
    print("=" * 64)
    print("통과 {}/{}  후보 {}개 남김  호출 {}회  지출 ${:.6f}".format(
        out["passed"], out["total"], out.get("candidate_total", 0),
        out["calls"], out["usd"]))
    if out.get("picked_by") is None:
        print("고른 사람: (없음) — 선택은 사람 몫으로 유보됨")
    print("세트 획 굵기 {} (통일={}), 중복쌍 {}".format(
        c["stroke_widths"], "예" if c["variance_zero"] else "아니오",
        out["duplicates"]))
    print("미측정: {}".format(", ".join(out["unmeasured"])))


def main(argv=None):
    ap = argparse.ArgumentParser(description="아이콘 레인 실전 루프")
    ap.add_argument("--concept")
    ap.add_argument("--meaning", default="")
    ap.add_argument("--set-file", help="[{concept, meaning}, ...] JSON")
    ap.add_argument("--set-name", default="ad-hoc")
    ap.add_argument("--provider", default="mock",
                    choices=["mock", "anthropic"])
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--max-usd", type=float, default=0.05,
                    help="이번 실행에서 쓸 상한(USD). 넘으면 호출을 멈춘다")
    ap.add_argument("--n", type=int, default=DEFAULT_N)
    ap.add_argument("--out", help="통과분을 저장할 디렉터리")
    ap.add_argument("--defer-pick", action="store_true",
                    help="기계가 고르지 않는다 - 통과 후보만 남기고 사람에게 넘긴다")
    ap.add_argument("--spec", default=icon_judge.SPEC_PATH,
                    help="스펙 문서. 기본은 등록된 icon-24-line-v1")
    ap.add_argument("--record", help="실행 기록 JSON 경로")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    doc = icon_judge.load_spec(args.spec)
    if args.set_file:
        with open(args.set_file, encoding="utf-8") as f:
            items = json.load(f)
        set_name = args.set_name if args.set_name != "ad-hoc" else \
            os.path.splitext(os.path.basename(args.set_file))[0]
    elif args.concept:
        items = [{"concept": args.concept,
                  "meaning": args.meaning or args.concept}]
        set_name = args.set_name
    else:
        ap.error("--concept 또는 --set-file 이 필요하다")

    provider = make_provider(args.provider, args.model, args.max_usd)
    started = time.time()
    out = run_set(items, provider, doc, set_name=set_name, out_dir=args.out,
                  n=args.n, defer_pick=args.defer_pick)
    out["seconds"] = round(time.time() - started, 2)
    out["ts"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    if args.record:
        os.makedirs(os.path.dirname(args.record) or ".", exist_ok=True)
        with open(args.record, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        _print(out)
    return 0 if out["passed"] == out["total"] else 1


if __name__ == "__main__":
    sys.exit(main() or 0)
