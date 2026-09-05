"""Frozen §9.3 selfchecks for the auto-derived spent registry.

Hand-maintained spent arrays failed twice (design §9.2, instrument
incident #3). These pin the five required guarantees.
"""

import pytest

from genesis.rookery.spent import (
    _stale_candidates, is_spent, sha_matches, spent_records,
    unresolved_tasks)


def test_all_v3a_tasks_detected():
    from genesis.rookery.adapters.repo_tasks import TASKS_V3A

    missing = [t.task_id for t in TASKS_V3A
               if not is_spent(t.repo_name, t.fix_commit)]
    assert not missing, f"v3a tasks not detected as spent: {missing}"
    assert len(TASKS_V3A) == 9


def test_all_b83_tasks_detected():
    from genesis.rookery.tasks_b4 import build_b4_tasks

    tasks = build_b4_tasks()
    assert len(tasks) == 3
    missing = [t.task_id for t in tasks
               if not is_spent(t.repo_name, t.fix_commit)]
    assert not missing, f"8.3 B tasks not detected: {missing}"


def test_short_and_long_sha_normalization():
    assert sha_matches("d992be0", "d992be0de1234567890abcdef")
    assert sha_matches("d992be0de1234567890abcdef", "d992be0")
    assert not sha_matches("d992be0", "d992bff0")
    assert not sha_matches("d992be", "d992be0de"), "too short to match"
    assert not sha_matches("", "d992be0de")


def test_stale_candidate_manifests_are_excluded_at_run_time():
    """A spent commit left in a mined candidate file must still be
    blocked when the scan runs - the incident #3 leak."""
    stale = _stale_candidates()
    assert stale, "expected the known stale entries to be present"
    for entry in stale:
        repo, sha = entry.split(":")
        assert is_spent(repo, sha), f"{entry} not blocked"


def test_known_resistant_task_is_always_excluded():
    """mi_running_minmax_stability ran in five experiments and was
    nearly admitted as a fresh INC task."""
    assert is_spent("more-itertools", "d992be0de")
    assert is_spent("more-itertools", "d992be0")
    assert is_spent("more-itertools",
                    "d992be0de1a2b3c4d5e6f708192a3b4c5d6e7f80")


def test_fresh_inc_tasks_are_not_spent():
    """08-03의 예시(dateutil 15fc1fa8c, marshmallow d057cb976)는 08-08
    ablation 11이 소진했다 - 이제 spent가 맞다. 신선한 예시는 ablation
    입회에서 기각돼 한 번도 실행되지 않은 두 과제."""
    assert is_spent("dateutil", "15fc1fa8c")        # abl_dateutil_15fc1fa8c
    assert is_spent("marshmallow", "d057cb976")     # abl_marshmallow_d057cb976
    assert not is_spent("marshmallow", "ff18e782b")
    assert not is_spent("more-itertools", "e0ee0c0f4")


def test_registry_resolves_every_report_task_id():
    assert unresolved_tasks() == []


def test_registry_is_derived_not_hardcoded():
    """Entries carry the source they were derived from. Report-sourced
    task ids dedupe into their v3a/b4 records, so the report pass
    shows up as full resolution rather than as extra rows."""
    sources = {r["source"].split(":")[0] for r in spent_records()}
    assert {"v3a", "b4"} <= sources
    assert unresolved_tasks() == [], "report ids must all resolve"
    assert all(r["fix_commit"] for r in spent_records() if r["repo"])


def test_synthetic_world_ids_are_not_unresolved():
    """보드게임·ablation 보고의 숫자 과제 id는 저장소 과제가 아니다 -
    레지스트리는 이를 synthetic으로 적고 unresolved로 세지 않는다."""
    recs = spent_records()
    synthetic = [r for r in recs if r["source"].startswith("synthetic")]
    assert synthetic, "조건 실험 보고가 data/에 있으니 synthetic 행이 있어야"
    assert all(r["task_id"].isdigit() and not r["repo"] for r in synthetic)
    assert unresolved_tasks() == []
