"""이중 구현 대조 — 설계 §6의 이빨 셋.

이 시험이 무력해지는 경로는 셋뿐이다: B가 A를 부르거나(같은 버그를 두 번),
틀린 A를 넣어도 일치가 나오거나, 스위프가 뒤집힘을 못 찾거나. 셋 다 여기서
막는다.
"""
import os

from genesis import icon_judge_b as B
from tools import dual_check as dc
from tools import icon_judge
from tools import judge_bench as jb

MOD_B = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     "genesis", "icon_judge_b.py")

LEGAL = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
         'fill="none" stroke="currentColor" stroke-width="1.5" '
         'stroke-linecap="round" stroke-linejoin="round">'
         '<path d="M4 4 L20 20"/></svg>')
ILLEGAL = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
           'fill="none" stroke="currentColor" stroke-width="1.5" '
           'stroke-linecap="round" stroke-linejoin="round">'
           '<text x="4" y="4">x</text><path d="M4 4 L20 20"/></svg>')


def test_b_does_not_call_a():
    """B가 A의 파서를 부르면 파서 버그가 두 구현에서 똑같이 틀린다.

    문자열이 아니라 **import 문**을 본다 — 설명에 이름이 적혀 있는 것과
    실제로 부르는 것은 다르다.
    """
    import ast
    tree = ast.parse(open(MOD_B, encoding="utf-8").read())
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported |= {a.name for a in node.names}
        elif isinstance(node, ast.ImportFrom):
            imported.add(node.module or "")
            imported |= {f"{node.module}.{a.name}" for a in node.names}
    banned = {"icon_lane", "icon_judge", "taste_features", "judge_bench",
              "artifact_adapter"}
    hits = {m for m in imported for b in banned if b in (m or "")}
    assert not hits, f"B가 A 쪽 모듈을 부른다: {sorted(hits)}"


def test_b_refuses_to_pass_a_rule_it_does_not_know():
    """모르는 제약을 조용히 통과시키면 대조가 죽는다 → undefined여야 한다."""
    res = B.judge(LEGAL, {"viewBox": "0 0 24 24", "brand_new_rule": 3})
    assert res["verdict"] == "UNDEFINED"
    row = next(r for r in res["rows"] if r["rule"] == "brand_new_rule")
    assert row["ok"] is None


def test_a_wrong_on_purpose_shows_up_as_disagreement():
    """전부 PASS 도장을 찍는 가짜 A를 넣으면 일치율이 1.0 아래여야 한다."""
    doc = icon_judge.load_spec()
    items = [("legal", LEGAL), ("negative", ILLEGAL)]
    stamp = lambda svg: {"verdict": "PASS", "rows": []}      # noqa: E731
    res = dc.compare(doc, items, None, judge_a=stamp)
    assert res["agreement"] < 1.0
    assert res["disagreements"]
    # 표본이 모자라므로 판정 자체는 undefined다 — 관문은 관문대로 산다.
    assert res["verdict"] == "undefined" and res["why"] == "sample_gate"


def test_sweep_catches_a_document_that_disagrees_with_the_code():
    """문서값만 하나 바꾼 가짜 스펙에서는 mismatch가 나와야 한다."""
    doc = icon_judge.load_spec()
    reg = jb.load_registry()
    import copy
    fake = copy.deepcopy(doc)
    fake["public"]["path"]["max_count"] = 3          # 코드는 여전히 6에서 뒤집힌다
    res = dc.sweep(fake, reg,
                   judge_a=lambda svg: dc.judge_a_public(svg, doc, reg))
    assert res["verdict"] == "mismatch"
    assert "path.max_count" in res["mismatches"]
    assert res["axes"]["path.max_count"]["observed"] == 6


def test_sweep_reports_undefined_instead_of_failing_on_a_missing_rule():
    doc = icon_judge.load_spec()
    reg = jb.load_registry()
    import copy
    fake = copy.deepcopy(doc)
    del fake["public"]["padding"]
    res = dc.sweep(fake, reg,
                   judge_a=lambda svg: dc.judge_a_public(svg, doc, reg))
    assert res["axes"]["padding.min"]["status"] == "undefined"
    assert res["axes"]["padding.min"]["why"] == "스펙에 없음"
