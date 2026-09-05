"""다양성 60후보 세션의 **집계 경로** 시험.

목(mock) 제공자는 일부러 스펙을 어기므로 통과 후보를 내지 않는다 — 즉 목
파일럿은 프롬프트·채점·기록 경로만 태우고 집계는 못 태운다. 그 구멍을 여기서
합성 표본으로 메운다. 실지출 전에 이 파일이 초록이어야 한다.
"""
from tools import diversity_curve as dcv
from tools import diversity_run as dr


def _call(no: int, sigs: list) -> dict:
    return {"call": no, "n": len(sigs), "passed": len(sigs),
            "candidates": [{"verdict": "PASS", "svg": "",
                            "signatures": {t: s for t in dcv.TIERS}}
                           for s in sigs]}


def _run(concept: str, calls: list) -> dict:
    return {"concept": concept, "why": None, "calls": calls}


def _all_new(concepts=2, calls=10, per=6):
    out = []
    for c in range(concepts):
        out.append(_run(f"k{c}", [
            _call(k, [f"c{c}-k{k}-i{i}" for i in range(per)])
            for k in range(1, calls + 1)]))
    return out


def _all_same(concepts=2, calls=10, per=6):
    out = []
    for c in range(concepts):
        out.append(_run(f"k{c}", [_call(k, [f"c{c}-i{i}" for i in range(per)])
                                  for k in range(1, calls + 1)]))
    return out


def test_every_signature_unique_means_no_resolution():
    """이빨(v0에서 상속): 중복이 0이면 flat이 아니라 **분해능 없음**이다."""
    res = dr.analyse(_all_new())
    assert res["tier_used"] is None
    for tier in dcv.TIERS:
        assert res["tiers"][tier]["has_resolution"] is False


def test_calling_again_and_getting_the_same_thing_is_saturating():
    res = dr.analyse(_all_same())
    t = res["tiers"][res["tier_used"]]
    assert t["u_across"]["mean"] == 0.0
    assert t["u_across"]["verdict"] == "saturating"
    # 대비가 핵심이다: **한 호출 안에서는** 6개가 서로 달라 u_within=1.0인데
    # 호출을 다시 하면 같은 여섯이 또 온다. 호출 안만 보면 "다양하다"고
    # 잘못 읽게 되는 바로 그 상황이다.
    assert t["u_within"]["mean"] == 1.0
    assert t["u_within"]["verdict"] == "flat"


def test_fresh_every_call_reads_as_flat_when_a_duplicate_exists_somewhere():
    """호출 안에는 중복이 있고 호출 사이에는 없는 경우 — 자가 살아 있고 flat이다."""
    runs = []
    for c in range(2):
        calls = []
        for k in range(1, 11):
            sigs = [f"c{c}-k{k}-i{i}" for i in range(5)] + [f"c{c}-k{k}-i0"]
            calls.append(_call(k, sigs))       # 한 호출 안에 중복 1쌍
        runs.append(_run(f"k{c}", calls))
    res = dr.analyse(runs)
    t = res["tiers"][res["tier_used"]]
    assert t["has_resolution"] is True
    assert t["u_across"]["mean"] == 1.0
    assert t["u_across"]["verdict"] == "flat"


def test_too_few_calls_is_undefined_not_a_verdict():
    res = dr.analyse(_all_same(calls=3))
    t = res["tiers"][res["tier_used"]]
    assert t["u_across"]["verdict"] == "undefined"
    assert t["u_across"]["why"] == "sample_gate"


def test_duplicates_are_counted_not_dropped():
    res = dr.analyse(_all_same())
    t = res["tiers"][res["tier_used"]]
    # 개념 전체 기준: 후보 60개 중 서로 다른 서명은 6개 → 중복 54개, 개념 2개
    assert t["duplicates"] == 2 * (60 - 6)
    assert t["candidates"] == 2 * 10 * 6


def test_novelty_curve_is_recorded_per_call():
    res = dr.analyse(_all_same())
    curve = res["tiers"][res["tier_used"]]["novelty_curve"]
    assert set(curve) == {"k0", "k1"}
    assert [p["call"] for p in curve["k0"]] == list(range(2, 11))
    assert all(p["novel"] == 0.0 for p in curve["k0"])


def test_thresholds_are_inherited_not_reinvented():
    assert dr.FLAT_LOWER == dcv.FLAT_LOWER == 0.80
    assert dr.SATURATING_UPPER == dcv.SATURATING_UPPER == 0.50


def test_examples_are_loadable_and_go_into_the_prompt():
    """설계 §2의 '생산 설정 그대로'는 세트 예시를 **넣는다**는 뜻이다.

    1회차에서 이걸 빈 목록으로 돌려 통과율이 무너졌고 표본이 6분의 1이 됐다.
    """
    from tools import icon_judge
    from tools import icon_lane_run as ilr
    ex = dr.load_examples()
    assert len(ex) >= 1 and all(e.strip().startswith("<svg") for e in ex)
    doc = icon_judge.load_spec()
    with_ex = ilr.initial_prompt("save", "저장", "d", 1, ex, doc, 6)
    without = ilr.initial_prompt("save", "저장", "d", 1, [], doc, 6)
    assert "<svg" in with_ex and "<svg" not in without


def test_record_keeps_every_candidate_not_just_counts():
    """지출로 얻은 자료를 버리지 않는다 — 1회차 기록은 요약뿐이었다."""
    import inspect
    src = inspect.getsource(dr.main)
    assert '"candidates": c["candidates"]' in src


class _FlakyProvider:
    """세 번째 호출에서 끊기는 제공자 — 중간 저장이 사는지 보려는 것."""
    name, model, max_temperature, spent_here = "flaky", "flaky", 1.0, 0.0

    def __init__(self):
        self.calls = 0

    def generate(self, system, prompt, temp, n):
        self.calls += 1
        if self.calls == 3:
            raise ConnectionError("끊김")
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
                'fill="none" stroke="currentColor" stroke-width="1.5" '
                'stroke-linecap="round" stroke-linejoin="round">'
                '<path d="M4 4 L20 20"/></svg>')


def test_a_dropped_connection_does_not_erase_the_calls_already_paid_for(tmp_path):
    from tools import icon_judge
    saved = {}

    def sink(concept, calls_so_far):
        saved[concept] = list(calls_so_far)

    try:
        dr.run_concept_calls({"concept": "save", "meaning": "저장"},
                             _FlakyProvider(), icon_judge.load_spec(),
                             calls=5, sink=sink)
    except ConnectionError:
        pass
    assert len(saved.get("save", [])) == 2, "끊기기 전 두 호출이 안 남았다"
