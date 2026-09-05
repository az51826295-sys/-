"""골든 케이스(심판의 심판) 테스트 — 자산 심판 초안 §7. 지출 0.

여기서 고정하는 것:
- 위반본은 **한 곳만** 바꾼 것이어야 하고, 심판이 그걸 전부 거절해야 한다.
- 판정(go/no-go)은 문턱 셋 **과 최소 표본** 둘 다를 본다 — 표본 4건짜리
  통과율 1.0이 go로 새지 않는다.
- 매니페스트에 적힌 파일만 집계에 들어간다(사후 표집 금지).
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools import golden_bench as gb                     # noqa: E402
from tools import icon_judge as ij                       # noqa: E402

DOC = ij.load_spec()
OK = ('<svg viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" '
      'fill="none" stroke-linecap="round" stroke-linejoin="round">\n'
      '<path d="M5 5h14v14H5Z"/>\n<path d="M9 12h6"/>\n</svg>')


def manifest(tmp_path, n=1) -> dict:
    rels = []
    for i in range(n):
        p = tmp_path / f"icon{i}.svg"
        p.write_text(OK, encoding="utf-8")
        rels.append(p.name)
    return {"id": "t", "spec": "data/icon_specs/icon-24-line-v1.yaml",
            "assets": rels}


FAST_N = 12          # 테스트용 합법 표본 수. 등록값(200)은 실주행에서만 쓴다 —
                     # 줄여 부르면 그 통제는 최소 표본 미달로 자동 강등된다.


def external(m: dict) -> dict:
    """심판 바깥 출처라고 선언된 매니페스트(G1). positive가 관문이 된다."""
    return {**m, "positive_source": "external"}


def test_the_sample_itself_passes_the_judge():
    assert ij.judge_svg(OK, DOC)["verdict"] == "PASS"


def test_every_mutation_changes_exactly_one_thing_and_is_rejected():
    for m in gb.mutations(OK):
        assert m["svg"] != OK
        res = ij.judge_svg(m["svg"], DOC)
        assert res["verdict"] in ("FAIL", "UNDEFINED"), m["rule"]
        broke = {r["rule"] for r in res["rules"] if r["ok"] is False}
        assert m["rule"] in broke or res["verdict"] == "UNDEFINED", m["rule"]


def test_mutation_list_is_not_empty_and_covers_the_named_rules():
    rules = {m["rule"] for m in gb.mutations(OK)}
    for want in ("stroke.width", "palette", "viewBox", "stroke.linecap",
                 "forbidden_elements", "size.max_bytes"):
        assert want in rules


def test_null_specs_are_different_specs_not_mutations():
    names = {v["spec_name"] for v in gb.null_specs(DOC)}
    assert len(names) >= 5
    for v in gb.null_specs(DOC):
        assert v["doc"]["public"] != DOC["public"]
        assert v["doc"]["hidden"] == DOC["hidden"]   # 숨은 항목은 안 건드린다


def test_small_sample_cannot_be_a_go(tmp_path):
    res = gb.run(manifest(tmp_path, n=1), root=str(tmp_path), legal_n=FAST_N)
    assert res["positive"]["rate"] == 1.0            # 통과율은 만점인데
    assert res["positive"]["n_ok"] is False          # 표본이 모자라므로
    assert res["verdict"] == "no-go"                 # go가 아니다


def test_negative_control_is_measured_on_real_files(tmp_path):
    res = gb.run(manifest(tmp_path, n=2), root=str(tmp_path), legal_n=FAST_N)
    assert res["negative"]["n"] >= 10
    assert res["negative"]["rate"] >= 0.90
    assert res["negative"]["undefined"] == 0


def test_only_manifest_files_are_counted(tmp_path):
    m = manifest(tmp_path, n=2)
    (tmp_path / "stray.svg").write_text(OK, encoding="utf-8")   # 매니페스트 밖
    res = gb.run(m, root=str(tmp_path), legal_n=FAST_N)
    assert res["positive"]["n"] == 2


def test_cli_returns_nonzero_on_no_go(tmp_path, capsys):
    path = tmp_path / "m.json"
    path.write_text(json.dumps(external(manifest(tmp_path, n=1)),
                               ensure_ascii=False), encoding="utf-8")
    code = gb.main(["--manifest", str(path), "--root", str(tmp_path)])
    out = capsys.readouterr().out
    # 자산 1건이면 negative·inspec 표본이 최소치를 못 채운다 → 본실행 금지
    assert code == 1
    assert "NO-GO" in out
    assert "최소" in out


# --- 2026-08-26 재등록(G1·G2): 출처·해당없음·새 관문 -------------------------

def test_self_sourced_positive_is_never_a_pass(tmp_path):
    """G1: 우리 심판이 통과시킨 것을 positive로 쓰면 통과로 세지 않는다.

    G4(17:4x)에서 상태 이름이 바뀌었다: '측정 불가' → '범위 밖'. 이유는 아래
    test_positive_is_out_of_scope_not_undefined 에 있다. 숫자는 그대로 남긴다.
    """
    res = gb.run(manifest(tmp_path, n=12), root=str(tmp_path), legal_n=FAST_N)
    assert res["positive"]["rate"] == 1.0             # 숫자는 그대로 남기고
    assert res["positive"]["counts"] is False         # 집계에는 안 들어간다
    assert res["positive"]["state"] == "out_of_scope"


def test_source_defaults_to_self_when_unstated(tmp_path):
    """밝히지 않은 출처를 external로 쳐주면 순환이 조용히 통과한다."""
    m = manifest(tmp_path, n=12)
    assert "positive_source" not in m
    assert gb.run(m, root=str(tmp_path), legal_n=FAST_N)["positive_source"] == "self"


def test_external_source_is_recorded_but_still_out_of_scope(tmp_path):
    """G4 이후: 출처가 바깥이어도 positive는 골든의 관문이 아니다.

    '스펙이 사람 뜻과 같은가'는 표본 출처와 무관하게 골든이 답할 질문이 아니다.
    출처는 기록으로만 남는다.
    """
    res = gb.run(external(manifest(tmp_path, n=12)), root=str(tmp_path), legal_n=FAST_N)
    assert res["positive_source"] == "external"       # 기록은 남고
    assert res["positive"]["state"] == "out_of_scope"  # 관문은 아니다
    assert "external" in res["positive"]["why"]


def test_null_is_not_applicable_without_model_based_fields(tmp_path):
    """G2: 아이콘 심판에는 model_based 필드가 없다 → 미달이 아니라 해당 없음."""
    res = gb.run(manifest(tmp_path, n=2), root=str(tmp_path), legal_n=FAST_N)
    assert res["null"]["state"] == "n/a"
    assert res["null"]["counts"] is False
    assert res["null"]["n"] > 0                       # 값은 계속 잰다
    assert "null" not in res["counted_controls"]


def test_null_becomes_a_gate_once_a_model_based_field_exists(tmp_path):
    m = {**manifest(tmp_path, n=2), "model_based_fields": ["observed.mood"]}
    res = gb.run(m, root=str(tmp_path), legal_n=FAST_N)
    assert res["null"]["state"] == "measured"
    assert "null" in res["counted_controls"]


def test_spec_sensitivity_flips_on_specs_the_asset_must_violate(tmp_path):
    """새 관문: 잰 값에서 구성한 위반 스펙은 전부 FAIL로 뒤집혀야 한다."""
    res = gb.run(manifest(tmp_path, n=4), root=str(tmp_path), legal_n=gb.N_MIN["legal"])
    assert res["sensitivity"]["n"] >= gb.N_MIN["sensitivity"]
    assert res["sensitivity"]["rate"] >= gb.THRESHOLDS["sensitivity"]
    assert res["sensitivity"]["passes_threshold"] is True
    assert {r["verdict"] for r in res["sensitivity_rows"]} == {"FAIL"}


def test_spec_sensitivity_has_teeth_against_a_rubber_stamp_judge(
        tmp_path, monkeypatch):
    """이빨: 스펙을 안 읽고 통과 도장만 찍는 심판은 여기서 0이 나와야 한다."""
    real = gb.icon_judge.judge_svg
    monkeypatch.setattr(
        gb.icon_judge, "judge_svg",
        lambda svg, doc=None, **kw: {**real(svg, doc, **kw),
                                     "verdict": "PASS"})
    res = gb.run(manifest(tmp_path, n=4), root=str(tmp_path), legal_n=gb.N_MIN["legal"])
    assert res["sensitivity"]["rate"] == 0.0
    assert res["sensitivity"]["passes_threshold"] is False
    assert res["verdict"] == "no-go"


def test_violating_specs_are_built_from_measured_values(tmp_path):
    """구성이 우리 판정이 아니라 잰 값에서 나온다(순환 방지)."""
    measured = ij.judge_svg(OK, DOC)["measured"]
    names = {v["spec_name"] for v in gb.violating_specs(DOC, measured)}
    assert names == {"stroke_width+0.5", "path_max_count-1", "command_max-1",
                     "padding_min+1", "max_bytes-1"}
    for v in gb.violating_specs(DOC, measured):
        assert v["doc"]["hidden"] == DOC["hidden"]     # 숨은 항목은 안 건드린다
        assert ij.judge_svg(OK, v["doc"])["verdict"] == "FAIL"


# --- G4(2026-08-26): positive는 범위 밖 -------------------------------------

def test_positive_is_out_of_scope_not_undefined(tmp_path):
    """못 잰 것과 여기서 잴 것이 아닌 것은 다른 상태다."""
    res = gb.run(manifest(tmp_path, n=4), root=str(tmp_path), legal_n=gb.N_MIN["legal"])
    pos = res["positive"]
    assert pos["state"] == "out_of_scope"
    assert pos["counts"] is False
    assert "골든이 답할 질문이 아니다" in pos["why"]
    assert "취향 라인" in pos["why"]
    assert "positive" not in res["counted_controls"]


def test_the_four_controls_that_answer_question_i_are_counted(tmp_path):
    res = gb.run(manifest(tmp_path, n=4), root=str(tmp_path), legal_n=gb.N_MIN["legal"])
    assert set(res["counted_controls"]) == {"negative", "sensitivity",
                                            "inspec", "legal"}


def test_go_needs_all_four_and_a_failure_still_blocks(tmp_path, monkeypatch):
    """이빨: 넷 중 하나가 무너지면 GO가 아니다 - 범위 밖으로 뺀 게 관문을
    느슨하게 만든 것이 아님을 고정한다."""
    res = gb.run(manifest(tmp_path, n=4), root=str(tmp_path), legal_n=gb.N_MIN["legal"])
    assert res["verdict"] == "go"
    monkeypatch.setattr(gb.icon_judge, "judge_svg",
                        lambda svg, doc=None, **kw: {"verdict": "PASS",
                                                     "rules": [],
                                                     "measured": {},
                                                     "structure_hash": "x"})
    broken = gb.run(manifest(tmp_path, n=4), root=str(tmp_path), legal_n=gb.N_MIN["legal"])
    assert broken["verdict"] == "no-go"      # negative가 아무것도 못 떨어뜨린다


def test_positive_sample_is_still_used_as_the_source_of_variants(tmp_path):
    """표본을 지우지 않았다 - negative·inspec 변이의 원본이다."""
    res = gb.run(manifest(tmp_path, n=4), root=str(tmp_path), legal_n=gb.N_MIN["legal"])
    assert res["positive"]["n"] == 4
    assert res["negative"]["n"] > 0
    assert res["inspec"]["n"] >= gb.N_MIN["inspec"]


def test_shrinking_the_legal_sample_downgrades_that_control(tmp_path):
    """표본을 줄여 부르면 관문이 헐거워지는 게 아니라 **미달로 강등**된다.

    테스트가 빠르려고 줄여 쓰는 자리이지, 실주행에서 낮추는 자리가 아니다.
    """
    res = gb.run(manifest(tmp_path, n=4), root=str(tmp_path), legal_n=FAST_N)
    assert res["legal"]["n"] == FAST_N
    assert res["legal"]["n_ok"] is False          # 200 미달
    assert res["verdict"] == "no-go"              # 그래서 go가 안 된다
    assert gb.N_MIN["legal"] == 200               # 등록값은 그대로
