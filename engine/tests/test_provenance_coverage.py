"""출처 헤더 상시 검사 — 사전 등록 문서가 계약 밖으로 새지 않게.

2026-08-26에 하루 동안 설계 문서를 9건 썼는데 **헤더를 두 건만 찍었다.**
계약(docs/provenance-contract.md)은 있었지만 그것을 강제하는 검사가 없었고,
그래서 내 부주의가 조용히 지나갔다. 규율은 문서가 아니라 **코드가 지킨다** —
이 파일이 그 자리다.

여기서 고정하는 것: `docs/*-design.md`(이 저장소의 사전 등록 문서 이름 규칙)는
전부 출처 헤더를 가진다. 규범 문서라면 부모가 비어 있어야 한다(계약 G7).
"""
import glob
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from genesis import provenance_scan as ps                 # noqa: E402

# 이름 규칙으로 잡는다. 새 설계 문서를 만들면 자동으로 이 검사에 들어온다.
DESIGN_DOCS = sorted(glob.glob(os.path.join(ROOT, "docs", "*-design.md")))
# 이름 규칙 밖이지만 같은 성격(정책·재등록)인 문서들. 늘리는 것은 손으로.
EXTRA_NORMATIVE = ["docs/test-loop-policy.md",
                   "docs/golden-decisions-20260826.md",
                   "docs/provenance-contract.md"]


def _header(rel: str):
    return ps.parse_header(os.path.join(ROOT, rel))


def test_there_are_design_docs_to_check():
    assert len(DESIGN_DOCS) >= 10        # 검사가 빈 목록을 돌지 않는지


@pytest.mark.parametrize("path", DESIGN_DOCS,
                         ids=[os.path.basename(p) for p in DESIGN_DOCS])
def test_every_design_doc_carries_provenance(path):
    rel = os.path.relpath(path, ROOT).replace("\\", "/")
    header = _header(rel)
    assert header is not None, (
        f"{rel}: 출처 헤더가 없다 - tools/stamp_provenance.py 로 찍어라")
    assert header.get("source_id") == rel
    assert header.get("source_kind") in ("normative", "derived")


@pytest.mark.parametrize("rel", EXTRA_NORMATIVE)
def test_policy_and_decision_docs_carry_provenance(rel):
    header = _header(rel)
    assert header is not None, f"{rel}: 출처 헤더가 없다"


def test_normative_documents_have_no_parents():
    """계약 G7: 규범은 파생이 아니다. 부모가 있으면 derived로 써야 한다."""
    for path in DESIGN_DOCS:
        rel = os.path.relpath(path, ROOT).replace("\\", "/")
        header = _header(rel) or {}
        if header.get("source_kind") == "normative":
            assert not header.get("parent_ids"), rel
