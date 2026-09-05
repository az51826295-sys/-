"""프롬프트 제거 통제 — 등록 문서(§2-1·§3)와 코드가 어긋나지 않게 막는다.

이 통제가 무력해지는 길은 둘이다: `no_spec` 팔에 스펙이 남아 있거나(그러면
"스펙 없이도 통과한다"가 거짓말이 된다), 통과율의 분모가 팔마다 달라지거나
(중복 버리기·재시도). 둘 다 여기서 막는다.
"""
import os

from tools import icon_judge
from tools import icon_lane_run as ilr
from tools import prompt_ablation as pa

DESIGN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "docs", "prompt-ablation-v0-design.md")

DOC = icon_judge.load_spec()
SPEC_TOKENS = ("1.5", "2048", "currentColor", "viewBox", "0.5", "여백")

LEGAL = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
         'fill="none" stroke="currentColor" stroke-width="1.5" '
         'stroke-linecap="round" stroke-linejoin="round">'
         '<path d="M4 4 L20 20"/></svg>')


class _Twice:
    """같은 후보를 두 번 내는 제공자 — 중복이 버려지는지 보려는 것."""
    name, model, max_temperature = "twice", "twice", 1.0
    spent_here = 0.0

    def generate(self, system, prompt, temp, n):
        return LEGAL + "\n<!--CANDIDATE 2-->\n" + LEGAL


def test_no_spec_prompt_carries_no_spec():
    with_spec = ilr.initial_prompt("save", "저장", "s", 1, [], DOC, 6)
    no_spec = ilr.initial_prompt("save", "저장", "s", 1, [], DOC, 6,
                                 no_spec=True)
    for tok in SPEC_TOKENS:
        assert tok in with_spec, tok
        assert tok not in no_spec, f"no_spec 팔에 스펙이 남았다: {tok}"
    assert "save" in no_spec and "저장" in no_spec        # 과제는 남는다


def test_no_spec_system_prompt_carries_no_spec():
    """§2-1: 시스템 프롬프트에도 스펙이 세 줄 있었다. 그것도 뺀다."""
    for tok in ("currentColor", "소수점", "스펙"):
        assert tok in ilr.SYSTEM_PROMPT, tok
        assert tok not in ilr.SYSTEM_PROMPT_NO_SPEC, tok
    # 출력 형식과 "기계가 검사한다"는 사실은 두 팔 모두 남는다
    assert "CANDIDATE" in ilr.SYSTEM_PROMPT_NO_SPEC
    assert "기계 검증기" in ilr.SYSTEM_PROMPT_NO_SPEC


def test_both_arms_keep_the_hidden_guard():
    for no_spec in (False, True):
        p = ilr.initial_prompt("save", "저장", "s", 1, [], DOC, 6,
                               no_spec=no_spec)
        ilr._assert_no_hidden_leak(p, DOC)          # 던지면 실패다
        for key in ("roundtrip", "novelty", "optical_weight", "structure_hash"):
            assert key not in p.lower()


def test_fingerprint_records_which_arm_ran():
    a = ilr.prompt_fingerprint(DOC, no_spec=False)
    b = ilr.prompt_fingerprint(DOC, no_spec=True)
    assert a["arm"] == "with_spec" and b["arm"] == "no_spec"
    assert b["public_spec_sha"] is None
    assert a["system_prompt_sha"] != b["system_prompt_sha"]
    assert a["initial_prompt_skeleton_sha"] != b["initial_prompt_skeleton_sha"]


def test_duplicates_are_not_dropped_from_the_denominator():
    """생산 루프는 중복 서명을 버린다. 통제에서 버리면 분모가 팔마다 달라진다."""
    arm = pa.run_arm([{"concept": "save", "meaning": "저장"}], _Twice(), DOC,
                     no_spec=False)
    assert arm["n"] == 2, "같은 후보 둘이 하나로 접혔다"
    assert arm["passed"] == 2


def test_verdict_thresholds_match_the_registered_design():
    text = open(DESIGN, encoding="utf-8").read()
    assert pa.SPEC_HELPS_LOWER == 0.20 and "0.20" in text
    assert pa.IRRELEVANT_UPPER == 0.05 and "0.05" in text
    assert pa.MIN_PER_ARM == 24 and "팔당 후보 ≥ 24" in text
    assert pa.MIN_CONCEPTS == 4 and "개념 ≥ 4" in text


def _arm(passes: int, n: int, concepts: int = 9, per_call: int = 6) -> dict:
    """v1: 표본 단위는 호출이다. 호출별 통과 비율을 같이 만든다."""
    rows = [{"concept": f"c{i % concepts}",
             "verdict": "PASS" if i < passes else "FAIL",
             "violated": [], "hidden_violated": False}
            for i in range(n)]
    calls = []
    for start in range(0, n, per_call):
        chunk = rows[start:start + per_call]
        ok = sum(1 for r in chunk if r["verdict"] == "PASS")
        calls.append({"concept": chunk[0]["concept"], "n": len(chunk),
                      "passed": ok, "rate": ok / len(chunk)})
    return {"rows": rows, "calls": calls, "n_calls": len(calls),
            "concepts": [f"c{i}" for i in range(concepts)]}


def test_a_big_gap_reads_as_spec_helps():
    j = pa.verdict(_arm(120, 120), _arm(12, 120))
    assert j["verdict"] == "spec_helps" and j["unit"] == "call"


def test_no_gap_reads_as_prompt_irrelevant():
    j = pa.verdict(_arm(120, 120), _arm(120, 120))
    assert j["verdict"] == "prompt_irrelevant"


def test_small_sample_is_undefined_not_a_verdict():
    j = pa.verdict(_arm(12, 12), _arm(0, 12))
    assert j["verdict"] == "undefined" and j["why"] == "sample_gate"


def test_counting_candidates_instead_of_calls_inflates_precision():
    """v1 §6: 한 호출의 후보들은 같이 움직인다. 후보로 세면 구간이 좁아진다.

    같은 자료에 두 단위를 대 보고, **후보 단위가 더 좁다**는 것을 못 박는다.
    21:31과 23:29가 크게 달랐던 것이 이 부풀림 때문이다.
    """
    a = _arm(60, 120)          # 호출 10개 중 앞 10개가 전부 통과
    b = _arm(12, 120)
    call_ci = pa.verdict(a, b, unit="call")["ci95"]
    cand_ci = pa.verdict(a, b, unit="candidate")["ci95"]
    assert (cand_ci[1] - cand_ci[0]) < (call_ci[1] - call_ci[0])


def test_a_dropped_connection_is_retried_but_a_timeout_is_not(monkeypatch):
    """21:56 사고: 끊긴 연결 하나가 20호출짜리 실행을 죽였다.

    범위를 좁게 잡은 것도 함께 못 박는다 — **응답을 못 받은 것이 확실한 경우**만
    재시도한다. 읽기 시간초과는 서버가 이미 처리(=과금)했을 수 있어 재시도하면
    장부에 못 적는 지출이 생긴다.
    """
    import socket
    import urllib.request

    p = ilr.AnthropicIconProposer.__new__(ilr.AnthropicIconProposer)
    p.retries, p.retry_log = 0, []
    monkeypatch.setattr(ilr.time, "sleep", lambda _s: None)

    calls = {"n": 0}

    class _Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b'{"content": [{"text": "ok"}], "usage": {}}'

    def flaky(req, timeout=None):
        calls["n"] += 1
        if calls["n"] < 3:
            raise ConnectionError("Remote end closed connection")
        return _Resp()

    monkeypatch.setattr(urllib.request, "urlopen", flaky)
    assert p._post(object())["content"][0]["text"] == "ok"
    assert p.retries == 1 and len(p.retry_log) == 2

    def timing_out(req, timeout=None):
        raise socket.timeout("read timed out")

    monkeypatch.setattr(urllib.request, "urlopen", timing_out)
    p2 = ilr.AnthropicIconProposer.__new__(ilr.AnthropicIconProposer)
    p2.retries, p2.retry_log = 0, []
    try:
        p2._post(object())
        raise AssertionError("시간초과를 재시도했다")
    except socket.timeout:
        pass
    assert p2.retries == 0
