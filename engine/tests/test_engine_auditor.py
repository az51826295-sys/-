"""Alpha step 4: Validator Auditor.

Each invariant is tested against the real incident it exists to catch,
so a regression is legible as "incident N could happen again".
Acceptance condition 7 (halt on disagreement, 100%) is checked as a
durable, reboot-surviving stop.
"""

import pytest

from genesis.rookery.engine.auditor import (
    HALT, HALT_FLAG, I1, I2, I3, I4, I5, I6, Auditor, AuditorConfig,
    ValidatorVerdict, WARN, engine_halted, is_test_file)
from genesis.rookery.engine.store import Store


@pytest.fixture()
def store(tmp_path):
    s = Store(str(tmp_path / "e.db"))
    yield s
    s.close()


@pytest.fixture()
def auditor(store):
    return Auditor(store)


def good(**kw) -> ValidatorVerdict:
    base = dict(
        task_id="t1", accepted=True, evidence_tests=["tests/t.py::a"],
        before={"tests/t.py::a": "fail"},
        after={"tests/t.py::a": "pass"},
        reference={"tests/t.py::a": "pass"},
        changed_files=["pkg/mod.py"],
        metrics={"pass_rate": 0.6},
        baseline_metrics={"pass_rate": 0.5})
    base.update(kw)
    return ValidatorVerdict(**base)


def codes(result):
    return {f.code for f in result.findings}


def test_clean_verdict_is_agreed(auditor):
    r = auditor.audit(good())
    assert r.agree and not r.findings and not r.halted
    assert not auditor.halted()


# ---- I1: the 8.3 fail->fail incident


def test_i1_evidence_test_passing_before_patch(auditor):
    r = auditor.audit(good(before={"tests/t.py::a": "pass"}))
    assert not r.agree and I1 in codes(r)


def test_i1_evidence_test_not_passing_after(auditor):
    r = auditor.audit(good(after={"tests/t.py::a": "fail"}))
    assert not r.agree and I1 in codes(r)


def test_i1_missing_outcomes(auditor):
    r = auditor.audit(good(before={}, after={}))
    assert not r.agree and I1 in codes(r)


def test_i1_ignored_for_rejected_verdicts(auditor):
    r = auditor.audit(good(accepted=False,
                           before={"tests/t.py::a": "pass"}))
    assert I1 not in codes(r)


# ---- I2: a test the reference patch cannot pass is broken


def test_i2_reference_failure_invalidates_test(auditor):
    r = auditor.audit(good(reference={"tests/t.py::a": "fail"}))
    assert not r.agree and I2 in codes(r)


def test_i2_missing_reference_is_a_warning_not_a_halt(store):
    a = Auditor(store, AuditorConfig(require_reference=True))
    r = a.audit(good(reference=None))
    assert r.agree, "a missing reference must not halt by itself"
    assert I2 in codes(r)
    assert all(f.severity == WARN for f in r.findings)


# ---- I3: the 9.2 spent-task reuse incident


def test_i3_spent_task_rejected(store):
    a = Auditor(store, spent_task_ids={"t1"})
    r = a.audit(good(task_id="t1"))
    assert not r.agree and I3 in codes(r)


def test_i3_already_succeeded_task_reappearing(store, auditor):
    store.add_task("t1", "fix")
    store.complete(store.claim("w1"))
    r = auditor.audit(good(task_id="t1"))
    assert not r.agree and I3 in codes(r)


# ---- I4: the 9.1 all-zeros incident


def test_i4_all_metrics_zero(auditor):
    r = auditor.audit(good(metrics={"a": 0.0, "b": 0.0},
                           baseline_metrics=None))
    assert not r.agree and I4 in codes(r)


def test_i4_accepted_with_no_evidence(auditor):
    r = auditor.audit(good(evidence_tests=[]))
    assert not r.agree and I4 in codes(r)


def test_i4_empty_after_results(auditor):
    r = auditor.audit(good(after={}))
    assert not r.agree and I4 in codes(r)


def test_i4_all_errors_after_a_working_before_is_candidate_damage(
        auditor):
    """(b) 재검증 B팔 0차: 패치 전에는 실행된(fail) 테스트가 패치 후
    전부 error - 환경이 아니라 후보의 파손이다. 기각(WARN)이지
    엔진 정지가 아니다."""
    r = auditor.audit(good(
        accepted=False,
        evidence_tests=["x"], before={"x": "fail"},
        after={"x": "error"}, reference={"x": "pass"}))
    assert r.agree and I4 in codes(r) and not r.halted
    assert all(f.severity == WARN for f in r.findings if f.code == I4)


def test_i4_all_errors_with_no_working_before_halts(auditor):
    """전에도 전부 error였거나 전 결과가 없으면 환경 의심이 실재 -
    기존대로 정지."""
    r = auditor.audit(good(
        accepted=False, evidence_tests=["x"], before={"x": "error"},
        after={"x": "error"}, reference={"x": "pass"}))
    assert not r.agree and I4 in codes(r)
    r2 = auditor.audit(good(
        accepted=False, evidence_tests=["x"], before={},
        after={"x": "error"}, reference={"x": "pass"}))
    assert not r2.agree and I4 in codes(r2)


# ---- I5: ceiling and leakage


@pytest.mark.parametrize("path", [
    "tests/test_mod.py", "test_mod.py", "pkg/tests/helper.py",
    "conftest.py", "pkg/mod_test.py",
])
def test_is_test_file(path):
    assert is_test_file(path)


def test_i5_patch_editing_tests_is_a_leak(auditor):
    r = auditor.audit(good(changed_files=["pkg/mod.py",
                                          "tests/test_mod.py"]))
    assert not r.agree and I5 in codes(r)


def test_i5_sudden_perfection_flagged(auditor):
    r = auditor.audit(good(metrics={"pass_rate": 1.0},
                           baseline_metrics={"pass_rate": 0.2}))
    assert not r.agree and I5 in codes(r)


def test_i5_gradual_improvement_to_perfect_is_fine(auditor):
    r = auditor.audit(good(metrics={"pass_rate": 1.0},
                           baseline_metrics={"pass_rate": 0.9}))
    assert r.agree, "a small step to 1.0 is not evidence of a leak"


# ---- I6: capability run 4 - scratch files rode an adopted commit


def test_i6_new_files_in_accepted_fix_halt(auditor):
    r = auditor.audit(good(new_files=["tmp_out.txt", "tmp_show.py"]))
    assert not r.agree and I6 in codes(r)


def test_i6_ignored_for_rejected_verdicts(auditor):
    r = auditor.audit(good(accepted=False,
                           new_files=["tmp_out.txt"]))
    assert I6 not in codes(r)


def test_i6_no_new_files_is_clean(auditor):
    r = auditor.audit(good(new_files=[]))
    assert r.agree


# ---- halting behaviour (acceptance condition 7)


def test_disagreement_halts_durably(store, auditor):
    auditor.audit(good(before={"tests/t.py::a": "pass"}))
    assert auditor.halted() and engine_halted(store)
    reason = auditor.halt_reason()
    assert reason["task_id"] == "t1" and reason["findings"]


def test_halt_survives_reboot(tmp_path):
    path = str(tmp_path / "e.db")
    s1 = Store(path)
    Auditor(s1).audit(good(before={"tests/t.py::a": "pass"}))
    s1.close()
    s2 = Store(path)                                  # reboot
    assert engine_halted(s2), "a halt must not be cleared by restart"
    a2 = Auditor(s2)
    assert a2.halted()
    a2.resume(who="tester")
    assert not engine_halted(s2)
    assert any(e["kind"] == "engine_resume" for e in s2.events())
    s2.close()


def test_accept_requires_both_validator_and_auditor(auditor):
    ok, res = auditor.accept_if_audited(good())
    assert ok and res.agree
    auditor.resume()
    ok2, res2 = auditor.accept_if_audited(
        good(accepted=False))
    assert not ok2, "a rejected candidate is never adopted"
    auditor.resume()
    ok3, res3 = auditor.accept_if_audited(
        good(changed_files=["tests/test_x.py"]))
    assert not ok3 and not res3.agree, \
        "auditor disagreement blocks adoption even when validator said yes"


def test_every_disagreement_logs_an_event(store, auditor):
    auditor.audit(good(evidence_tests=[]))
    kinds = [e["kind"] for e in store.events()]
    assert "audit_disagree" in kinds and "engine_halt" in kinds


def test_multiple_invariants_reported_together(auditor):
    r = auditor.audit(good(
        before={"tests/t.py::a": "pass"},
        changed_files=["tests/test_x.py"],
        metrics={"pass_rate": 0.0}))
    assert {I1, I4, I5} <= codes(r)
    assert all(f.severity == HALT for f in r.halting)
