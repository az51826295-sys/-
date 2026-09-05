"""설계도 엔진 v0 — 재구성해서 되묻기가 진짜로 갈라내는지 검증.

핵심 주장: '휴대폰 백신 청소 앱' 요청에서 심판 없음(악성코드 탐지)·거짓(RAM
부스터)은 떨궈지고, 검증 가능한 것(권한 스캔·캐시 정리)만 설계도에 남는다.
"""

import os

from tools import blueprint_engine as be

REG = be.load_registry()


def test_intake_decomposes_request():
    matched = {a["id"] for a in be.intake("휴대폰 백신 청소 앱", REG)}
    # 백신 → malware_detection, 청소 → cleaner 원자들
    assert "malware_detection" in matched
    assert "ram_booster" in matched
    assert "cache_cleanup" in matched


def test_reconstruct_drops_snakeoil_and_nojudge():
    matched = be.intake("휴대폰 백신 청소 앱", REG)
    recon = be.reconstruct(matched, REG)
    kept = {a["id"] for a in recon["keep"]}
    dropped = {d["dropped"] for d in recon["drops"]}
    # 심판 없음 + 거짓은 빠진다
    assert "malware_detection" in dropped
    assert "ram_booster" in dropped
    # 검증 가능한 것만 남는다
    assert "dangerous_permission_scan" in kept
    assert "cache_cleanup" in kept
    # 남은 건 전부 real
    assert all(a["verdict"] == "real" for a in recon["keep"])


def test_dropped_items_carry_replacement():
    matched = be.intake("백신", REG)
    recon = be.reconstruct(matched, REG)
    mal = next(d for d in recon["drops"] if d["dropped"] == "malware_detection")
    # 재구성 대상이 붙어 있어야 되묻기가 성립
    assert "dangerous_permission_scan" in mal["replaced_by"]


def test_blueprint_two_layers_and_checklist():
    out = be.run("휴대폰 백신 청소 앱", refs=["플레이스토어 출시급"],
                 days=30, approve=True, registry=REG)
    bp = out["blueprint"]
    assert bp["vision"]["quality_refs"] == ["플레이스토어 출시급"]
    assert bp["vision"]["duration_days"] == 30
    # 체크리스트는 비어있지 않고, 각 항목이 기계 검사 문장을 가진다
    assert bp["checklist"]
    assert all(c["check"] for c in bp["checklist"])
    # 뺀 것도 설계도에 보존(왜 뺐는지)
    assert any(d["dropped"] == "malware_detection" for d in bp["dropped"])


def test_pretty_art_reconstructs_to_spec_fit():
    # "예쁜 그림"은 심판 없음 → 스펙 대조 선별로 재구성
    matched = be.intake("예쁜 그림 그려줘", REG)
    recon = be.reconstruct(matched, REG)
    dropped = {d["dropped"] for d in recon["drops"]}
    kept = {a["id"] for a in recon["keep"]}
    assert "beautiful_art_generation" in dropped
    assert "spec_fit_art_selection" in kept


def test_unknown_request_is_honest_not_fake():
    out = be.run("양자컴퓨터로 우주 시뮬레이션", registry=REG)
    assert out["intake"] == []
    assert "분해하지 못했습니다" in out["ask_back"]


def test_estimate_recommends_with_coins_and_workers():
    out = be.run("휴대폰 백신 청소 앱", refs=["플레이스토어 출시급"],
                 days=30, approve=True, registry=REG)
    est = out["estimate"]
    # 추천 메뉴의 각 항목에 채용된 일꾼과 코인가가 붙는다(미배정 없음)
    assert est["recommended"] and all(
        r["worker"] != "미배정" and r["coins"] > 0 for r in est["recommended"])
    # 표시는 역할("코딩 AI"), 실명은 내부에만 (worker 분리, 2026-08-25)
    assert any("코딩 AI" in r["worker"] for r in est["recommended"])
    assert any("Claude" in (r["implementer"] or "") for r in est["recommended"])
    # 코인 견적 + 투명한 원 환산(페그 노출)
    assert est["total_coins"] > 0
    assert est["won_equiv"] == est["total_coins"] * est["coin_to_won"]
    # 사람 시간은 숨기지 않고 별도
    assert "미측정" in est["human_time"]


def test_pick_lets_owner_choose_subset():
    # 추천을 확정으로 들이밀지 않고, 고른 것만 견적에 든다
    out = be.run("휴대폰 백신 청소 앱", approve=True,
                 pick=["cache_cleanup"], registry=REG)
    est = out["estimate"]
    assert [r["atom"] for r in est["selected"]] == ["cache_cleanup"]
    assert est["total_coins"] == be.COIN_BY_EFFORT["S"]   # S=10코인
    # 추천 메뉴는 여전히 전체를 보여준다(고르라고)
    assert len(est["recommended"]) > 1


VENDORS = ("ChatGPT", "GPT", "Claude", "Haiku", "Sonnet", "Opus",
           "Midjourney", "Suno", "Anthropic", "OpenAI", "Stable Diffusion")


def test_estimate_shows_roles_not_vendors():
    """표시 이름은 역할이다. 벤더는 감추되 **AI라는 사실은 감추지 않는다**
    (2026-08-25 사장님 결정)."""
    out = be.run("공포게임 스토리랑 게임 기능 음악", approve=True, registry=REG)
    rows = out["estimate"]["recommended"]
    workers = " ".join(r["worker"] for r in rows)
    assert "스토리" in workers and "음악" in workers and "코딩" in workers
    assert "AI" in workers                      # 사람인 척하지 않는다
    assert "자체 선별" in workers or "자체 테스트" in workers
    for v in VENDORS:                           # 벤더명은 표시에 없다
        assert v not in workers, v
    # 내부용 실명은 남아 있다(원장·라우팅·재현성)
    impls = " ".join(r["implementer"] or "" for r in rows)
    assert "ChatGPT" in impls or "Claude" in impls


def test_no_vendor_name_leaks_into_the_customer_screen(capsys):
    """사람이 보는 출력 전체를 훑어 벤더명이 하나도 없는지 본다."""
    out = be.run("공포게임 스토리랑 게임 기능 음악, 아이콘, 픽셀 그래픽",
                 refs=["스타듀밸리급"], days=30, approve=True, registry=REG)
    be._print_human(out)
    screen = capsys.readouterr().out
    for v in VENDORS:
        assert v not in screen, f"고객 화면에 벤더명 노출: {v}"
    assert "AI" in screen


def test_all_fake_no_replacement_keeps_nothing():
    # reconstruct_to가 없는 순수 거짓만 있으면 남는 게 없어야 한다
    fake_only = [{"id": "x", "verdict": "snake_oil", "reason": "거짓",
                  "aliases": ["x"]}]
    recon = be.reconstruct(fake_only, fake_only)
    assert recon["keep"] == []
    assert recon["drops"][0]["replaced_by"] == []


# --- 2026-08-26: 체크리스트 자격의 셋째 축(설계도를 읽는 심판) ---------------
# 계약: docs/spec-sensitivity-v1-design.md 부록 B

def test_checklist_rows_declare_whether_the_judge_reads_the_blueprint():
    bp = be.run("휴대폰 백신 청소 앱", days=30, approve=True,
                registry=REG)["blueprint"]
    assert bp["checklist"]
    for c in bp["checklist"]:
        assert c["spec_sensitive"] in (True, None)   # False면 여기 있으면 안 된다
        sv = c["spec_sensitivity"]
        assert sv["state"] in ("pass", "undefined")
        if c["spec_sensitive"] is True:
            assert sv["rate"] == 1.0 and sv["n"] >= 1
        else:
            assert sv["why"], "설계도로 채점 안 되는 이유를 적어야 한다"
    assert 0.0 <= bp["vision"]["spec_sensitive_coverage"] <= 1.0


def test_a_judge_that_ignores_the_blueprint_is_demoted(monkeypatch):
    """설계도를 안 읽는 심판은 체크리스트에서 human_gate로 내려간다.

    이게 없으면 설계도가 '설계도대로 채점합니다'라고 거짓 약속을 한다.
    """
    real = be.sensitivity.run_atom

    def blind(atom):
        r = real(atom)
        if atom["id"] == "cache_cleanup":
            return {**r, "state": "fail", "rate": 0.0,
                    "why": "설계도를 안 읽는 규칙: 임계를 실제 차이 초과로"}
        return r
    monkeypatch.setattr(be.sensitivity, "run_atom", blind)
    bp = be.run("휴대폰 백신 청소 앱", days=30, approve=True,
                registry=REG)["blueprint"]
    assert "cache_cleanup" not in [c["atom"] for c in bp["checklist"]]
    row = next(h for h in bp["human_gate"] if h["atom"] == "cache_cleanup")
    assert "설계도를 읽지 않는 심판" in row["why"]


def test_a_judge_without_a_blueprint_is_kept_but_labelled():
    """설계도 입력이 없는 심판은 빼지 않고 무엇으로 채점하는지 적는다."""
    bp = be.run("휴대폰 백신 청소 앱", days=30, approve=True,
                registry=REG)["blueprint"]
    row = next((c for c in bp["checklist"]
                if c["atom"] == "duplicate_file_finder"), None)
    assert row is not None, "이빨·측정 재료는 갖췄으므로 빼지 않는다"
    assert row["spec_sensitive"] is None
    assert "설계도 입력이 없는 심판" in row["spec_sensitivity"]["why"]


def test_customer_screen_says_what_each_check_is_judged_against(capsys):
    be.main(["--want", "휴대폰 백신 청소 앱", "--days", "30", "--approve"])
    out = capsys.readouterr().out
    assert "설계도를 읽는 심판" in out          # 커버리지 두 개를 같이 낸다
    assert "설계도 읽음: 구성" in out
    assert "설계도가 아니라 자기일관성으로 채점됨" in out
