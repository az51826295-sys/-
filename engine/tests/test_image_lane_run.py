"""그림(풍경) 레인 테스트 — 생성자만 바뀌고 심판은 그대로. 지출 0.

지키는 것:
1. 스펙 숫자는 사장님이 08-07에 동결한 아트 기준에서 온다(내가 고른 값 없음).
2. hidden은 프롬프트로 새지 않는다.
3. **후처리 뒤의 반입 오라클은 공허하다** — 이 사실을 테스트로 못박는다.
   생성기가 진짜 도트를 냈는지는 raw 판정만 말한다.
4. 유료 경로는 승인·키·단가·예산 넷이 다 있어야 열린다.
"""
from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools import image_lane_run as ilr                  # noqa: E402

DOC = ilr.load_spec()
SCENES = [{"slug": "square", "scene": "마을 광장", "meaning": "우물이 있는 광장"}]


# ------------------------------------------------------------- 스펙

def test_spec_numbers_come_from_the_frozen_art_standard():
    # docs/game-design-v0.md §1b: 뷰포트 640×360, 에셋당 색 수 <= 24
    assert DOC["public"]["logical_size"] == {"width": 640, "height": 360}
    assert DOC["public"]["max_colors"] == 24
    assert DOC["hidden"]["max_logical_size"] == 640
    assert "game-design-v0.md" in DOC["frozen_basis"]


def test_prompt_carries_public_only():
    p = ilr.build_prompt("마을 광장", "우물", DOC)
    assert "24" in p and "스타듀" in p
    ilr.assert_no_hidden_leak(p, DOC)


def test_hidden_words_are_refused_in_the_prompt():
    with pytest.raises(ValueError, match="hidden"):
        ilr.assert_no_hidden_leak("alpha_binary 를 맞춰라", DOC)


# ------------------------------------------------------------- 후처리

def test_crop_does_not_stretch(tmp_path):
    from PIL import Image
    out = ilr.crop_16_9(Image.new("RGBA", (1536, 1024)))
    assert out.size[0] / out.size[1] == pytest.approx(16 / 9, rel=0.01)
    assert out.size[0] <= 1536 and out.size[1] <= 1024   # 자른다, 늘이지 않는다


def test_postprocess_lands_on_the_declared_grid():
    from PIL import Image
    done = ilr.postprocess(Image.new("RGBA", (1536, 1024), (10, 20, 30, 255)),
                           DOC)
    assert done.size == (640, 360)


# ------------------------------------------------------------- 공허성(핵심)

def test_the_import_oracle_is_vacuous_after_postprocess(tmp_path):
    """가짜 도트(색 65536)도 후처리 뒤에는 통과한다 — 그래서 raw를 따로 잰다."""
    prov = ilr.MockImageProposer()
    out = ilr.run(SCENES, prov, DOC, str(tmp_path), n=2)
    rows = out["results"][0]["candidates"] + out["results"][0]["rejected"]
    assert len(rows) == 2
    assert all(r["verdict"] == "PASS" for r in rows)      # 후처리본은 전부 통과
    assert {r["raw_verdict"] for r in rows} == {"PASS", "FAIL"}  # 원본은 갈린다
    assert out["raw_passed"] == 1
    assert "공허" in out["hard_judge_note"]


def test_raw_is_kept_next_to_the_candidate(tmp_path):
    out = ilr.run(SCENES, ilr.MockImageProposer(), DOC, str(tmp_path), n=2)
    for row in out["results"][0]["candidates"]:
        assert os.path.isfile(os.path.join(ilr.ROOT, row["raw"]))
        assert os.path.isfile(os.path.join(ilr.ROOT, row["path"]))


def test_machine_does_not_choose(tmp_path):
    out = ilr.run(SCENES, ilr.MockImageProposer(), DOC, str(tmp_path), n=2)
    assert out["picked_by"] is None


# ------------------------------------------------------------- 지출 게이트

def test_paid_provider_is_locked_without_approval(monkeypatch):
    monkeypatch.delenv("GENESIS_SPEND", raising=False)
    with pytest.raises(RuntimeError, match="GENESIS_SPEND"):
        ilr.make_provider("openai")


def test_missing_key_says_where_to_put_it(monkeypatch):
    monkeypatch.setenv("GENESIS_SPEND", "i-approve")
    monkeypatch.setattr(ilr, "load_openai_key", lambda: "")
    with pytest.raises(RuntimeError, match="env.local"):
        ilr.make_provider("openai")


def test_unknown_price_refuses_to_call(monkeypatch):
    monkeypatch.setenv("GENESIS_SPEND", "i-approve")
    monkeypatch.setattr(ilr, "load_openai_key", lambda: "sk-test")
    prov = ilr.make_provider("openai", model="mystery-model")
    with pytest.raises(RuntimeError, match="단가표"):
        prov.generate("x", 1)


def test_budget_is_checked_before_the_call_not_after(monkeypatch):
    monkeypatch.setenv("GENESIS_SPEND", "i-approve")
    monkeypatch.setattr(ilr, "load_openai_key", lambda: "sk-test")
    prov = ilr.make_provider("openai", max_usd=0.01)     # 1장도 못 산다
    with pytest.raises(ilr.BudgetExhausted):
        prov.generate("x", 1)


def test_budget_exhaustion_is_undefined_not_a_verdict(tmp_path):
    class Broke(ilr.MockImageProposer):
        def generate(self, prompt, n):
            raise ilr.BudgetExhausted("예산 끝")

    out = ilr.run(SCENES, Broke(), DOC, str(tmp_path), n=1)
    assert out["results"][0]["verdict"] == "UNDEFINED"


def test_image_ledger_row_counts_pictures_not_tokens(tmp_path):
    ledger = tmp_path / "l.jsonl"
    row = ilr.record_image_call("gpt-image-1", "low", "1536x1024", 3, 0.048,
                                "마을 광장", path=str(ledger))
    assert row["tool"] == "image_lane" and row["images"] == 3
    saved = json.loads(ledger.read_text(encoding="utf-8").strip())
    assert saved["usd"] == 0.048 and saved["quality"] == "low"


def test_mock_run_never_touches_the_ledger(tmp_path, monkeypatch):
    from tools import proposer as pz
    ledger = tmp_path / "l.jsonl"
    monkeypatch.setattr(pz, "LEDGER", str(ledger))
    ilr.run(SCENES, ilr.MockImageProposer(), DOC, str(tmp_path), n=1)
    assert not ledger.exists()
