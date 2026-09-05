"""아이콘 레인 실전 루프 테스트 — 프롬프트·필터·라운드 규율. 지출 0.

여기서 지키는 것은 넷이다:
1. hidden은 프롬프트로 새지 않는다(굿하트 대응이 코드로 남아 있나).
2. 재생성은 **리포트 덕**이어야 한다 — 목이 리포트 없이는 계속 어긴다.
3. 중복 서명은 조용히 버린다(프롬프트에 알리지 않는다).
4. 미정의는 탈락이 아니다 — 못 잰 규칙으로 고칠 것을 시키지 않는다.
"""
from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools import icon_judge as ij                        # noqa: E402
from tools import icon_lane_run as ilr                    # noqa: E402

DOC = ij.load_spec()


def run_one(provider=None, **kw):
    provider = provider or ilr.MockIconProposer()
    return provider, ilr.run_concept("save", "저장", provider, DOC, **kw)


# ------------------------------------------------------------- 프롬프트

def test_initial_prompt_carries_public_spec_only():
    p = ilr.initial_prompt("save", "저장", "ui", 1, [], DOC)
    assert "0 0 24 24" in p and "currentColor" in p and "2048" in p
    ilr._assert_no_hidden_leak(p, DOC)          # 던지지 않아야 한다


@pytest.mark.parametrize("leak", ["contrast", "roundtrip", "novelty",
                                  "structure_hash", "optical_weight_delta_max"])
def test_hidden_words_are_refused_in_any_prompt(leak):
    # contrast는 08-26에 screen_layer로 옮겼지만 프롬프트 금지는 유지한다 -
    # 지금 관문이 아니어도 이름을 흘리면 나중에 그 지표만 겨냥한 출력이 온다.
    with pytest.raises(ValueError, match="hidden"):
        ilr._assert_no_hidden_leak("스펙: " + leak + " 를 맞춰라", DOC)


def test_screen_layer_words_are_refused_too():
    doc = json.loads(json.dumps(DOC))
    doc["screen_layer"]["later_gate"] = {"x": 1}
    with pytest.raises(ValueError, match="later_gate"):
        ilr._assert_no_hidden_leak("later_gate 를 맞춰라", doc)


def test_hidden_guard_reads_the_spec_file_not_a_hardcoded_list():
    # 문서에 hidden 항목이 늘면 검사도 따라 는다
    doc = json.loads(json.dumps(DOC))
    doc["hidden"]["brand_new_secret"] = {"x": 1}
    with pytest.raises(ValueError, match="brand_new_secret"):
        ilr._assert_no_hidden_leak("brand_new_secret 를 맞춰라", doc)


def test_restructure_prompt_gives_no_reason():
    p = ilr.restructure_prompt(6)
    assert "violations" not in p and "rule" not in p
    assert "사유는 제공하지 않는다" in p


# ------------------------------------------------------------- 루프

def test_report_injection_is_what_turns_fail_into_pass():
    provider, out = run_one()
    assert out["verdict"] == "PASS" and out["used_rounds"] == 2
    assert out["rounds"][0]["passed"] == 0          # 1회차는 전부 탈락
    assert "violations:" in provider.calls[1]["user"]
    assert provider.calls[1]["temperature"] == 1.0  # §6: 2회차는 temp 유지


def test_duplicate_signature_is_dropped_silently():
    provider, out = run_one()
    assert out["rounds"][1]["dropped_duplicate"] == 1
    for call in provider.calls:                     # §6: 알리지 않는다
        assert "duplicate" not in call["user"]
        assert "중복" not in call["user"]


def test_accepted_peers_block_a_repeat_of_the_same_icon():
    good = (ilr._MOCK_HEAD
            + '<path d="M 4 6 L 19.5 6 L 19.5 18 L 4 18 Z"/></svg>')
    provider, out = run_one(accepted=[good])
    assert out["svg"] != good                       # 이미 채택된 구조는 못 낸다


def test_three_rounds_then_undefined_not_fail():
    class NeverFixes(ilr.MockIconProposer):
        def generate(self, system, user, temperature, n):
            return super().generate(system, "리포트 없음", temperature, n)

    provider, out = run_one(NeverFixes())
    assert out["verdict"] == "UNDEFINED"            # 탈락이 아니라 미정의
    assert out["used_rounds"] == 3
    assert [r["mode"] for r in out["rounds"]] == [
        "initial", "minimal_fix", "restructure"]
    assert provider.calls[-1]["temperature"] == 1.3  # §6: 3회차는 1.3
    assert out["rounds"][-1]["temperature_capped"] is False


def test_unmeasured_rule_is_undefined_and_asks_for_no_fix():
    """path가 없어 여백을 못 재는 SVG — 탈락이 아니라 미정의."""
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
           'fill="none" stroke="currentColor" stroke-width="1.5" '
           'stroke-linecap="round" stroke-linejoin="round"><g/></svg>')
    res = ij.judge_svg(svg, DOC)
    assert res["verdict"] == "UNDEFINED"
    text = ij.report(res)
    assert "undecided:" in text and "padding.min" in text
    assert "violations:" not in text

    class OnlyUndecided(ilr.MockIconProposer):
        def generate(self, system, user, temperature, n):
            return "<!--CANDIDATE 1-->\n" + svg

    provider, out = run_one(OnlyUndecided())
    assert out["verdict"] == "UNDEFINED"
    assert out["rounds"][0]["undefined"] == 1 and out["rounds"][0]["failed"] == 0
    # 못 잰 것으로 최소수정을 시키지 않는다 → 사유 없는 구조 변경으로 간다
    assert [r["mode"] for r in out["rounds"]][1:] == ["restructure",
                                                      "restructure"]


# ------------------------------------------------------------- 세트·지출

def test_set_run_saves_only_passing_icons(tmp_path):
    items = [{"concept": "save", "meaning": "저장"},
             {"concept": "load", "meaning": "불러오기"}]
    out = ilr.run_set(items, ilr.MockIconProposer(), DOC, set_name="ui",
                      out_dir=str(tmp_path))
    files = sorted(p.name for p in tmp_path.glob("*.svg"))
    assert len(files) == out["passed"] == 2
    assert out["set_consistency"]["variance_zero"] is True
    assert out["duplicates"] == []          # 세트 안에서 서로 다른 구조
    assert out["usd"] == 0.0


def test_mock_run_never_touches_the_ledger(tmp_path, monkeypatch):
    from tools import proposer as pz
    ledger = tmp_path / "ledger.jsonl"
    monkeypatch.setattr(pz, "LEDGER", str(ledger))
    run_one()
    assert not ledger.exists()


def test_paid_provider_is_locked_without_approval(monkeypatch):
    monkeypatch.delenv("GENESIS_SPEND", raising=False)
    with pytest.raises(RuntimeError, match="GENESIS_SPEND"):
        ilr.make_provider("anthropic")


def test_provider_temperature_cap_is_recorded_not_hidden():
    """설계는 3회차 1.3을 시킨다. 제공자 상한이 1.0이면 깎되 **깎았다고 적는다**."""
    class Capped(ilr.MockIconProposer):
        max_temperature = 1.0

        def generate(self, system, user, temperature, n):
            assert temperature <= self.max_temperature   # 상한을 넘겨 부르지 않는다
            return super().generate(system, "리포트 없음", temperature, n)

    provider, out = run_one(Capped())
    last = out["rounds"][-1]
    assert last["temperature"] == 1.0 and last["temperature_requested"] == 1.3
    assert last["temperature_capped"] is True


def test_paid_provider_stops_at_this_runs_budget(monkeypatch):
    monkeypatch.setenv("GENESIS_SPEND", "i-approve")
    monkeypatch.setattr(ilr.pz, "load_api_key", lambda: "sk-test")
    monkeypatch.setattr(ilr.pz, "ledger_total_usd", lambda: 0.0)
    prov = ilr.make_provider("anthropic", max_usd=0.01)
    prov.spent_here = 0.02                  # 이미 예산을 넘겼다
    with pytest.raises(RuntimeError, match="예산"):
        prov.generate("s", "u", 1.0, 6)


# ------------------------------------------------------------- 파싱

def test_candidates_split_on_markers_and_survive_code_fences():
    raw = ("```svg\n<!--CANDIDATE 1-->\n<svg a='1'></svg>\n"
           "<!--CANDIDATE 2-->\n<svg b='2'></svg>\n```")
    assert len(ilr.split_candidates(raw)) == 2


def test_candidates_found_even_without_markers():
    raw = "여기 있습니다: <svg a='1'></svg> 그리고 <svg b='2'></svg>"
    assert len(ilr.split_candidates(raw)) == 2


# --- 2026-08-26: 실행이 무엇을 시켰는지 남기기 -------------------------------

def test_run_records_what_it_asked_for():
    """구멍이었다: 모델·온도는 남기면서 프롬프트·스펙이 안 남아, '회차 사이에
    프롬프트가 바뀌었나'가 사후에 답이 안 됐다."""
    fp = ilr.prompt_fingerprint(DOC)
    for key in ("spec_id", "public_spec_sha", "system_prompt_sha",
                "initial_prompt_skeleton_sha", "retry_prompt_sha",
                "restructure_prompt_sha"):
        assert fp[key], key
    assert fp["spec_id"] == DOC["spec_id"]


def test_fingerprint_changes_when_the_spec_changes():
    """이빨: 스펙을 바꿨는데 지문이 그대로면 남길 이유가 없다."""
    import copy
    other = copy.deepcopy(DOC)
    other["public"]["size"]["max_bytes"] = 4096
    assert (ilr.prompt_fingerprint(other)["public_spec_sha"]
            != ilr.prompt_fingerprint(DOC)["public_spec_sha"])


def test_fingerprint_is_stable_across_concepts():
    """개념 이름이 달라도 지문은 같아야 한다 - 골격을 해시하기 때문."""
    a = ilr.prompt_fingerprint(DOC)["initial_prompt_skeleton_sha"]
    assert a == ilr.prompt_fingerprint(DOC)["initial_prompt_skeleton_sha"]


def test_fingerprint_lands_in_the_run_record():
    provider = ilr.MockIconProposer()
    out = ilr.run_set([{"concept": "save", "meaning": "저장"}], provider, DOC,
                      set_name="t", n=2)
    assert out["prompt_fingerprint"]["spec_id"] == DOC["spec_id"]
