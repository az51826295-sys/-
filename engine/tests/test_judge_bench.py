"""판단자 v1 — 심판대. 설계·판정 기준: docs/judge-design.md

핵심 주장: 심판은 문장이 아니다. 자기 반례를 거절하지 못하는 항목은
real이 될 수 없고, 설계도의 기계 체크리스트에도 못 들어간다.

(genesis/judge.py = 실험 증거 판정 심판자. 여기는 능력 원자의 심판을
심판하는 심판대 — 다른 층이다.)
"""

import json

import pytest

from tools import blueprint_engine as be
from tools import judge_bench as judge
from tools import proposer as pr

REG = be.load_registry()


# ---------------------------------------------------------------- 심판대 기본

def test_sentence_alone_is_not_a_judge():
    # check 문장이 그럴듯해도 judge 명세가 없으면 심판이 아니다
    atom = {"id": "fake", "verdict": "real",
            "check": "잘 되는지 확인한다 - 결정적"}
    r = judge.bench_atom(atom)
    assert r["verdict"] == "missing"
    assert "문장뿐" in r["reason"]


def test_judge_without_counterexample_is_toothless():
    atom = {"id": "no_neg", "verdict": "real", "judge": {
        "kind": "numeric_delta",
        "params": {"before": "output.a", "after": "output.b", "min_delta": 1},
        "positive": {"output": {"a": 10, "b": 1}},
        "negatives": []}}
    r = judge.bench_atom(atom)
    assert r["verdict"] == "toothless"
    assert "반례가 0건" in r["reason"]


def test_judge_that_cannot_reject_its_counterexample_is_toothless():
    # 임계가 0이면 "그대로인 것"도 통과시킨다 → 이빨 없음
    atom = {"id": "loose", "verdict": "real", "judge": {
        "kind": "numeric_delta",
        "params": {"before": "output.a", "after": "output.b", "min_delta": 0},
        "positive": {"output": {"a": 10, "b": 1}},
        "negatives": [{"note": "정리했다면서 그대로",
                       "mutate": {"output.b": 10}}]}}
    r = judge.bench_atom(atom)
    assert r["verdict"] == "toothless"
    assert "거절하지 못한 반례" in r["reason"]


def test_positive_must_actually_pass():
    atom = {"id": "broken", "verdict": "real", "judge": {
        "kind": "tag_cover",
        "params": {"required": "input.req", "candidate": "output.tags"},
        "positive": {"input": {"req": ["a", "b"]}, "output": {"tags": ["a"]}},
        "negatives": [{"note": "무관", "mutate": {"output.tags": []}}]}}
    r = judge.bench_atom(atom)
    assert r["verdict"] == "toothless"
    assert "positive" in r["reason"]


def test_teeth_requires_rejecting_every_counterexample():
    atom = next(a for a in REG if a["id"] == "cache_cleanup")
    r = judge.bench_atom(atom)
    assert r["verdict"] == "teeth"
    assert r["teeth"] == len(r["negatives"]) >= 1
    assert all(n["rejected"] for n in r["negatives"])
    assert r["deterministic"] is True


def test_human_gate_is_declared_not_hidden():
    atom = next(a for a in REG if a["id"] == "beautiful_art_generation")
    r = judge.bench_atom(atom)
    # 실패가 아니라 정직한 신고 — 대신 기계 체크리스트에는 못 들어간다
    assert r["verdict"] == "human_gate"
    assert judge.atom_status(atom)["machine_judged"] is False


def test_unknown_kind_is_rejected():
    atom = {"id": "weird", "verdict": "real",
            "judge": {"kind": "vibes", "positive": {}, "negatives": []}}
    assert judge.bench_atom(atom)["verdict"] == "unknown_kind"


def test_vacuous_sample_cannot_earn_teeth():
    # 요구 태그가 비면 무엇이든 통과한다 → 심판 구실을 못 하므로 error
    atom = {"id": "vacuous", "verdict": "real", "judge": {
        "kind": "tag_cover",
        "params": {"required": "input.req", "candidate": "output.tags"},
        "positive": {"input": {"req": []}, "output": {"tags": ["a"]}},
        "negatives": [{"note": "x", "mutate": {"output.tags": []}}]}}
    r = judge.bench_atom(atom)
    assert r["verdict"] == "error" and "공허한" in r["reason"]


def test_mutation_counterexamples_are_not_strawmen():
    # 반례 정본은 positive에서 한 곳만 바꾼 변이 — 짚인형 위험 표시 없음
    res = judge.bench_registry(REG)
    assert res["summary"]["straw_risk"] == 0


# ---------------------------------------------------------------- 레지스트리 게이트

def test_registry_real_atoms_all_have_teeth():
    """상시 게이트: real이라고 주장하면서 심판이 없는 원자는 존재할 수 없다."""
    res = judge.bench_registry(REG)
    assert res["failed"] == [], res["failed"]
    assert res["summary"]["passes_strict"] is True
    assert res["summary"]["coverage"] == 1.0


def test_audit_cli_strict_exit_code():
    assert judge.main(["--audit", "--strict"]) == 0


# ---------------------------------------------------------------- 설계도 연결

def test_checklist_only_contains_bench_passing_atoms():
    """체크리스트 자격은 세 가지를 다 통과한 것: 이빨 + 측정 재료 + 잴 도구."""
    out = be.run("휴대폰 백신 청소 앱", refs=["플레이스토어 출시급"], days=30,
                 approve=True, registry=REG)
    bp = out["blueprint"]
    assert bp["checklist"]
    for c in bp["checklist"]:
        atom = next(a for a in REG if a["id"] == c["atom"])
        assert judge.bench_atom(atom)["verdict"] == "teeth"
        assert c["teeth"] >= 1 and c["judge"]
        assert c["evidence"] == "measured" and c["binding"] == "bound"
    # 권한 스캔·피싱 대조는 심판은 있으나 잴 어댑터가 아직 없다 → 사람 눈
    gated = {h["atom"]: h for h in bp["human_gate"]}
    assert set(gated) == {"dangerous_permission_scan", "phishing_link_check"}
    assert all(h["binding"] == "no_tool" for h in gated.values())
    # 5건 중 3건만 실제로 기계가 채점한다 - 부풀리지 않은 숫자
    assert bp["vision"]["machine_coverage"] == 0.6


def test_toothless_atom_falls_to_human_gate_not_checklist():
    # 심판 없는 원자를 real이라 주장해도 체크리스트에는 못 들어간다
    reg = [{"id": "vibes_only", "category": "art", "aliases": ["분위기"],
            "verdict": "real", "checkable": True, "worker": "Claude",
            "effort": "M", "check": "분위기가 맞는지 본다", "reason": "분위기"}]
    out = be.run("분위기 작업", approve=True, registry=reg)
    bp = out["blueprint"]
    assert bp["checklist"] == []
    assert [h["atom"] for h in bp["human_gate"]] == ["vibes_only"]
    assert bp["vision"]["machine_coverage"] == 0.0
    # 견적에는 여전히 남는다(범위이긴 하다) - 다만 자율 대상이 아니라고 표시된다
    assert [r["atom"] for r in out["estimate"]["recommended"]] == ["vibes_only"]


# ---------------------------------------------------------------- promote 게이트

def _proposal():
    return {"id": "guided_audio_session", "reason": "가이드 오디오 세션"}


def test_promote_real_requires_a_runnable_judge(tmp_path):
    path = tmp_path / "reg.json"
    path.write_text("[]", encoding="utf-8")
    with pytest.raises(ValueError, match="judge 명세"):
        pr.promote_proposal(_proposal(), verdict="real",
                            check="세션 길이를 파일로 확인 - 결정적",
                            registry_path=str(path))


def test_promote_real_rejects_a_toothless_judge(tmp_path):
    path = tmp_path / "reg.json"
    path.write_text("[]", encoding="utf-8")
    toothless = {"kind": "all_tests_pass", "params": {"results": "output.t"},
                 "positive": {"output": {"t": ["pass"]}}, "negatives": []}
    with pytest.raises(ValueError, match="심판대를 통과하지"):
        pr.promote_proposal(_proposal(), verdict="real", check="테스트 통과",
                            judge_spec=toothless, registry_path=str(path))
    assert json.loads(path.read_text(encoding="utf-8")) == []


def test_promote_real_succeeds_with_teeth(tmp_path):
    path = tmp_path / "reg.json"
    path.write_text("[]", encoding="utf-8")
    spec = {"kind": "all_tests_pass", "params": {"results": "output.t"},
            "positive": {"output": {"t": ["pass", "pass"]}},
            "negatives": [{"note": "하나 깨짐",
                           "mutate": {"output.t": ["pass", "fail"]}}]}
    atom = pr.promote_proposal(_proposal(), verdict="real",
                               check="세션 명세 테스트 전부 통과",
                               worker="음악 생성 AI + 자체 선별", effort="M",
                               judge_spec=spec, registry_path=str(path))
    assert atom["judge"] == spec
    assert judge.bench_atom(atom)["verdict"] == "teeth"
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved[0]["id"] == "guided_audio_session"


def test_promote_nonreal_records_why_no_machine_judge(tmp_path):
    path = tmp_path / "reg.json"
    path.write_text("[]", encoding="utf-8")
    atom = pr.promote_proposal({"id": "fortune_telling", "reason": "운세 - 진위 없음"},
                               verdict="no_judge", registry_path=str(path))
    assert atom["judge"]["kind"] == "human_gate"
    assert "진위" in atom["judge"]["params"]["why"]
    assert judge.bench_atom(atom)["verdict"] == "human_gate"
