"""EpisodeStore persistence and the learning report."""

from datetime import datetime, timedelta, timezone

import pytest

from genesis.evaluation.report import build_learning_report
from genesis.memory.episode_store import EpisodeStore
from genesis.models.experience import EpisodeRecord


def make_record(
    episode_id: str,
    run_id: str = "run-1",
    error: float = 0.05,
    success: bool = False,
    created_at: datetime | None = None,
    agent: str = "random",
    difficulty: str = "basic",
) -> EpisodeRecord:
    return EpisodeRecord(
        episode_id=episode_id,
        run_id=run_id,
        agent=agent,
        difficulty=difficulty,
        model="similarity",
        world_seed=42,
        total_steps=100,
        total_reward=-0.5,
        success=success,
        terminal_reason="energy_depleted",
        average_prediction_error=error,
        experiences_saved=100,
        created_at=created_at or datetime.now(timezone.utc),
    )


@pytest.fixture
def store(tmp_path):
    store = EpisodeStore(tmp_path / "episodes.db")
    store.initialize()
    yield store
    store.close()


def test_save_and_round_trip(store):
    record = make_record("ep-1")
    store.save(record)
    assert store.count() == 1
    restored = store.get_all()[0]
    assert restored.model_dump() == record.model_dump()


def test_get_all_is_chronological(store):
    base = datetime.now(timezone.utc)
    for i in range(3):
        store.save(
            make_record(f"ep-{i}", created_at=base + timedelta(seconds=i))
        )
    assert [r.episode_id for r in store.get_all()] == ["ep-0", "ep-1", "ep-2"]


def test_empty_report_message():
    assert "No episodes recorded" in build_learning_report([])


def test_report_aggregates_runs():
    base = datetime.now(timezone.utc)
    records = [
        make_record("ep-1", run_id="run-a", success=True, created_at=base),
        make_record(
            "ep-2", run_id="run-a", created_at=base + timedelta(seconds=1)
        ),
        make_record(
            "ep-3", run_id="run-b", created_at=base + timedelta(seconds=2)
        ),
    ]
    report = build_learning_report(records, experience_count=300)
    assert "Runs: 2 | Episodes: 3 | Experiences: 300" in report
    assert "Overall success rate: 1/3" in report
    assert "run-a" in report and "run-b" in report


def test_report_detects_improvement():
    base = datetime.now(timezone.utc)
    records = [
        make_record(
            f"ep-{i}",
            run_id="run-a" if i < 2 else "run-b",
            error=0.2 if i < 2 else 0.01,
            created_at=base + timedelta(seconds=i),
        )
        for i in range(4)
    ]
    report = build_learning_report(records)
    assert "Trend: improving" in report


def test_report_shows_per_agent_trends():
    base = datetime.now(timezone.utc)
    records = [
        make_record(
            f"ep-{i}",
            agent="greedy" if i % 2 == 0 else "random",
            error=0.01 * i,
            created_at=base + timedelta(seconds=i),
        )
        for i in range(6)
    ]
    report = build_learning_report(records)
    assert "Trend by agent:" in report
    assert "greedy" in report and "random" in report


def test_report_shows_per_difficulty_trends():
    base = datetime.now(timezone.utc)
    records = [
        make_record(
            f"ep-{i}",
            difficulty="basic" if i % 2 == 0 else "advanced",
            error=0.01 * i,
            created_at=base + timedelta(seconds=i),
        )
        for i in range(6)
    ]
    report = build_learning_report(records)
    assert "Trend by difficulty:" in report
    assert "advanced" in report


def test_report_shows_outcomes_by_difficulty():
    base = datetime.now(timezone.utc)
    records = [
        make_record(
            f"ep-{i}",
            difficulty="advanced",
            success=(i == 0),
            created_at=base + timedelta(seconds=i),
        )
        for i in range(2)
    ]
    records[0] = records[0].model_copy(update={"hazard_hits": 4})
    report = build_learning_report(records)
    assert "Outcomes by difficulty:" in report
    assert "solved 1/2" in report
    assert "hazard hits/step 0.0200" in report  # 4 hits over 200 steps


def test_report_detects_flat_trend():
    base = datetime.now(timezone.utc)
    records = [
        make_record(
            f"ep-{i}", error=0.05, created_at=base + timedelta(seconds=i)
        )
        for i in range(4)
    ]
    assert "Trend: flat" in build_learning_report(records)
