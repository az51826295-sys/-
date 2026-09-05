"""레지스트리 계약 — 설계도 엔진이 **조용한 기본값**으로 굴러가지 않게 막는다.

두 구멍을 막는다:
1. 심판 없음·거짓 원자에 재구성 대안도, 재구성 못 하는 **사유 선언**도 없으면
   되묻기가 "(대체 없음)"이라고만 적는다 — 못 한 것인지 안 한 것인지 감춘다.
   되묻기는 이 제품의 심장이다(docs/director-ai-vision.md).
2. `effort`가 코인표에 없는 값이면 그 원자는 **조용히 0코인**이 된다. 공짜로
   견적이 나가는 것을 문법 오류 하나가 만들 수 있다.
"""
import json
import os

from tools import blueprint_engine as be

REG = be.load_registry()


def test_every_unjudgeable_atom_offers_a_route_or_declares_there_is_none():
    by = {a["id"]: a for a in REG}
    bad = []
    for a in REG:
        if a["verdict"] == "real":
            continue
        repl = [r for r in (a.get("reconstruct_to") or [])
                if by.get(r, {}).get("verdict") == "real"]
        if not repl and not (a.get("no_reconstruction") or "").strip():
            bad.append(a["id"])
    assert not bad, f"재구성 대안도 사유도 없는 원자: {bad}"


def test_no_real_atom_is_quietly_priced_at_zero():
    zero = [a["id"] for a in REG
            if a["verdict"] == "real" and be._coins(a) == 0]
    assert not zero, f"코인 0으로 매겨지는 원자: {zero}"


def test_every_real_atom_has_an_effort_the_coin_table_knows():
    unknown = [(a["id"], a.get("effort")) for a in REG
               if a["verdict"] == "real"
               and a.get("effort") not in be.COIN_BY_EFFORT]
    assert not unknown, f"코인표가 모르는 노력 등급: {unknown}"


def test_ask_back_says_when_a_reason_is_missing_rather_than_hiding_it():
    """이빨: 사유 없는 원자를 넣으면 되묻기가 **결함이라고 말해야** 한다."""
    fake = {"id": "ghost", "verdict": "no_judge", "reason": "시험용",
            "aliases": ["유령"], "effort": None}
    recon = be.reconstruct([fake], REG + [fake])
    text = be.ask_back("유령 만들어줘", recon)
    assert "사유가 선언되지 않았다" in text


def test_declared_reasons_are_shown_verbatim():
    declared = [a for a in REG if (a.get("no_reconstruction") or "").strip()]
    assert declared, "선언된 사유가 하나도 없다(이 계약이 죽었다)"
    a = declared[0]
    text = be.ask_back("x", be.reconstruct([a], REG))
    assert "재구성 없음(선언됨)" in text
    assert a["no_reconstruction"][:20] in text


def test_the_registry_file_is_still_valid_json_with_every_id_unique():
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "data", "capability_atoms.json")
    atoms = json.load(open(path, encoding="utf-8"))
    ids = [a["id"] for a in atoms]
    assert len(ids) == len(set(ids))
