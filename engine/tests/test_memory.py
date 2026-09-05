"""ExperienceStore: persistence, retrieval, and round-tripping."""

from datetime import datetime, timedelta, timezone

import pytest
from helpers import make_experience

from genesis.memory.experience_store import ExperienceStore


@pytest.fixture
def store(tmp_path):
    store = ExperienceStore(tmp_path / "test.db")
    store.initialize()
    yield store
    store.close()


def test_initialize_creates_database(tmp_path):
    store = ExperienceStore(tmp_path / "sub" / "fresh.db")
    store.initialize()
    assert (tmp_path / "sub" / "fresh.db").exists()
    assert store.count() == 0
    store.close()


def test_save_and_count(store):
    store.save(make_experience())
    store.save(make_experience(step=1))
    assert store.count() == 2


def test_experience_round_trip(store):
    experience = make_experience()
    store.save(experience)
    restored = store.get_by_episode(experience.episode_id)[0]
    assert restored.model_dump() == experience.model_dump()


def test_get_by_episode(store):
    for step in range(3):
        store.save(make_experience(episode_id="ep-a", step=step))
    store.save(make_experience(episode_id="ep-b", step=0))
    results = store.get_by_episode("ep-a")
    assert len(results) == 3
    assert [e.step for e in results] == [0, 1, 2]


def test_iter_all_is_chronological(store):
    base = datetime.now(timezone.utc)
    saved = [
        make_experience(step=i, created_at=base + timedelta(seconds=i))
        for i in range(3)
    ]
    for experience in saved:
        store.save(experience)
    restored = list(store.iter_all())
    assert [e.experience_id for e in restored] == [
        e.experience_id for e in saved
    ]


def test_get_recent(store):
    base = datetime.now(timezone.utc)
    saved = [
        make_experience(step=i, created_at=base + timedelta(seconds=i))
        for i in range(5)
    ]
    for experience in saved:
        store.save(experience)
    recent = store.get_recent(limit=3)
    assert len(recent) == 3
    assert recent[0].experience_id == saved[-1].experience_id
