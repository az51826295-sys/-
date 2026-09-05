"""Model snapshotting: serialize state, restore, replay only the delta."""

from helpers import act, make_world

from genesis.memory.experience_store import ExperienceStore
from genesis.memory.snapshot_store import SnapshotStore
from genesis.models.action import ActionType
from genesis.world_model.naive_model import NaiveWorldModel
from genesis.world_model.similarity_model import SimilarityWorldModel
from test_similarity_model import _experience_from


def test_naive_state_round_trip():
    model = NaiveWorldModel()
    observation = make_world().observe()
    action = act(ActionType.MOVE_FORWARD)
    for _ in range(3):
        model.update(_experience_from(observation, action, success=False))

    restored = NaiveWorldModel()
    restored.load_state(model.dump_state())
    original = model.predict(observation, action)
    replayed = restored.predict(observation, action)
    assert replayed.predicted_success == original.predicted_success
    assert replayed.confidence == original.confidence


def test_similarity_state_round_trip():
    model = SimilarityWorldModel()
    observation = make_world().observe()
    action = act(ActionType.MOVE_FORWARD)
    for _ in range(3):
        model.update(_experience_from(observation, action, success=False))

    restored = SimilarityWorldModel()
    restored.load_state(model.dump_state())
    assert restored.record_count() == model.record_count()
    assert (
        restored.predict(observation, action).predicted_success
        == model.predict(observation, action).predicted_success
    )


def test_snapshot_store_round_trip(tmp_path):
    store = SnapshotStore(tmp_path / "snap.db")
    store.initialize()
    assert store.load("similarity") is None
    store.save("similarity", 42, '{"records": []}')
    snapshot = store.load("similarity")
    assert snapshot.last_rowid == 42
    assert snapshot.state_json == '{"records": []}'
    store.save("similarity", 99, '{"records": [1]}')  # upsert
    assert store.load("similarity").last_rowid == 99
    store.close()


def test_snapshot_plus_delta_equals_full_replay(tmp_path):
    experience_store = ExperienceStore(tmp_path / "delta.db")
    experience_store.initialize()
    observation = make_world().observe()
    action = act(ActionType.MOVE_FORWARD)

    for _ in range(3):
        experience_store.save(
            _experience_from(observation, action, success=False)
        )
    checkpoint = experience_store.max_rowid()

    snapshot_model = SimilarityWorldModel()
    snapshot_model.rehydrate(experience_store.iter_all())
    state = snapshot_model.dump_state()

    for _ in range(2):
        experience_store.save(
            _experience_from(observation, action, success=True)
        )

    full = SimilarityWorldModel()
    full.rehydrate(experience_store.iter_all())

    incremental = SimilarityWorldModel()
    incremental.load_state(state)
    replayed = incremental.rehydrate(
        experience_store.iter_since(checkpoint)
    )

    assert replayed == 2
    assert incremental.record_count() == full.record_count() == 5
    assert (
        incremental.predict(observation, action).predicted_reward
        == full.predict(observation, action).predicted_reward
    )
    experience_store.close()
