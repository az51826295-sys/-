"""LLM Proposer 층 — 제안은 하되 믿지 않는다(격리).

핵심 주장: LLM이 제안한 새 원자는 verdict=unverified로 갇혀, 검증(promote)
전에는 코인 견적·설계도 체크리스트에 절대 들어가지 않는다.
"""

import json

import pytest

from tools import blueprint_engine as be
from tools import proposer as pr

REG = be.load_registry()


def test_known_atoms_go_through_trusted_path():
    out = pr.propose("휴대폰 백신 청소 앱", REG, provider="mock")
    known = {a["id"] for a in out["known"]}
    assert "malware_detection" in known and "cache_cleanup" in known


def test_unknown_request_is_proposed_not_invented():
    out = pr.propose("명상 수면 앱 만들어줘", REG, provider="mock")
    assert out["proposed"], "미지 요청은 제안되어야 한다"
    p = out["proposed"][0]
    # 격리: 모델이 real이라 우겨도 유효 verdict는 unverified
    assert p["verdict"] == "unverified"
    assert p["status"] == "proposed" and p["source"] == "llm"
    assert p["suggested_verdict"] == "real"      # 모델 주장은 보존만


def test_proposals_never_enter_estimate():
    out = pr.plan("명상 수면 앱 만들어줘", provider="mock", registry=REG)
    priced = {r["atom"] for r in out["estimate"]["recommended"]}
    proposed = {p["id"] for p in out["proposed"]}
    # 제안된 원자는 코인 견적에 하나도 없다
    assert priced.isdisjoint(proposed)


def test_generic_residual_has_no_fake_check():
    out = pr.propose("양자컴퓨터 시뮬레이션 앱", REG, provider="mock")
    assert out["proposed"]
    # 일반 스텁은 가짜 check를 지어내지 않는다
    assert out["proposed"][0]["suggested_check"] == ""


def test_extract_json_survives_code_fences():
    # 실제 모델은 ```json 펜스로 감싸서 낸다 - 파서가 견뎌야 한다
    fenced = '설명입니다.\n```json\n{"proposals": [{"id": "x"}]}\n```\n끝'
    assert pr._extract_json(fenced)["proposals"][0]["id"] == "x"
    # 앞뒤 산문만 있고 펜스가 없어도 객체를 뽑는다
    prose = 'here you go: {"proposals": []} thanks'
    assert pr._extract_json(prose) == {"proposals": []}


def test_fenced_provider_still_quarantines(monkeypatch):
    class FencedProv:
        name = "fenced"
        def complete(self, prompt):
            return '```json\n{"proposals":[{"id":"foo","suggested_verdict":"real",' \
                   '"suggested_check":"c"}]}\n```'
    monkeypatch.setattr(pr, "make_provider", lambda name: FencedProv())
    out = pr.propose("아무거나", REG, provider="fenced")
    assert out["proposed"][0]["id"] == "foo"
    assert out["proposed"][0]["verdict"] == "unverified"   # 여전히 격리


def test_anthropic_locked_without_spend_gate(monkeypatch):
    monkeypatch.delenv("GENESIS_SPEND", raising=False)
    with pytest.raises(RuntimeError, match="유료 경로 잠김"):
        pr.AnthropicProposer()


# 판단자 v1 이후 real 승격은 '실행되는 심판'을 요구한다(docs/judge-design.md).
SESSION_JUDGE = {
    "kind": "numeric_delta",
    "params": {"before": "input.requested_sec", "after": "output.short_by_sec",
               "min_delta": 1},
    "positive": {"input": {"requested_sec": 600}, "output": {"short_by_sec": 0}},
    "negatives": [{"note": "요청 길이를 못 채운 트랙",
                   "mutate": {"output.short_by_sec": 600}}],
}


def test_promote_requires_check_and_judge_for_real(tmp_path):
    regfile = tmp_path / "reg.json"
    regfile.write_text(json.dumps([]), encoding="utf-8")
    proposal = {"id": "guided_audio_session", "reason": "세션 재생"}
    # real인데 check 없으면 거부
    with pytest.raises(ValueError, match="기계 check"):
        pr.promote_proposal(proposal, verdict="real", check="",
                            registry_path=str(regfile))
    # check 문장만 있고 실행되는 심판이 없으면 여전히 거부
    with pytest.raises(ValueError, match="judge 명세"):
        pr.promote_proposal(proposal, verdict="real",
                            check="트랙 파일 존재 확인", worker="음악 AI",
                            effort="M", registry_path=str(regfile))
    # 심판대를 통과하는 명세와 함께면 등록됨
    atom = pr.promote_proposal(proposal, verdict="real",
                               check="요청 길이를 채웠는지 초 단위로 확인",
                               worker="음악 AI", effort="M",
                               judge_spec=SESSION_JUDGE,
                               registry_path=str(regfile))
    assert atom["verdict"] == "real" and atom["checkable"] is True
    reg = json.loads(regfile.read_text(encoding="utf-8"))
    assert any(a["id"] == "guided_audio_session" for a in reg)


def test_promoted_atom_then_prices_normally(tmp_path):
    regfile = tmp_path / "reg.json"
    regfile.write_text(json.dumps(be.load_registry(), ensure_ascii=False),
                       encoding="utf-8")
    pr.promote_proposal({"id": "guided_audio_session", "reason": "세션"},
                        verdict="real", check="요청 길이 충족 확인",
                        worker="음악 생성 AI + 자체 선별", effort="M",
                        aliases=["명상", "수면"], judge_spec=SESSION_JUDGE,
                        registry_path=str(regfile))
    reg2 = json.loads(regfile.read_text(encoding="utf-8"))
    # 등록 뒤엔 신뢰 경로로 들어와 견적에 잡힌다
    out = be.run("명상 세션", approve=True, registry=reg2)
    assert "guided_audio_session" in out["reconstruction"]["keep"]
    assert out["estimate"]["total_coins"] > 0
