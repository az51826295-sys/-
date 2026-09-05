"""Generic loop: registry, resume, and equivalence with mission 6."""

from __future__ import annotations

from genesis.loop.adapters.mission_clue import (
    ClueEnvironment,
    default_random_adapter,
)
from genesis.loop.interfaces import Evaluation
from genesis.loop.registry import Registry
from genesis.loop.runner import BlindSelector, Runner
from genesis.mission2.config import Mission2Config
from genesis.mission6.dsl import Protocol, ancestor_protocol
from genesis.mission6.evolution import evolve

CONFIG = Mission2Config()
TRAIN = [2001, 2002]
VALID = [2101, 2102]
SLACKS = (1.0, 1.25, 1.5)


def _runner(tmp_path, name="eq") -> Runner:
    env = ClueEnvironment(CONFIG, TRAIN, VALID, SLACKS)
    return Runner(
        environment=env,
        proposer=default_random_adapter(env, master_seed=0),
        selector=BlindSelector(),
        registry=Registry(str(tmp_path / f"{name}.json"), name),
        artifact_load=Protocol.model_validate,
        artifact_dump=lambda p: p.model_dump(),
        proposals_per_gen=CONFIG.n_agents,
    )


def test_selector_semantics():
    sel = BlindSelector()
    inc = Evaluation(score=0.5)
    assert sel.decide(inc, [Evaluation(score=0.49)]).adopted_index is None
    assert sel.decide(inc, [Evaluation(score=0.5)]).adopted_index is None
    assert sel.decide(inc, [Evaluation(score=0.51),
                            Evaluation(score=0.6)]).adopted_index == 1


def test_generic_loop_reproduces_mission6(tmp_path):
    """Same seeds, same proposer keys -> the generic runner must adopt
    the same protocols with the same scores as the frozen evolve()."""
    frozen = evolve("M", CONFIG, generations=2,
                    train_seeds=TRAIN, valid_seeds=VALID)
    runner = _runner(tmp_path)
    runner.run(ancestor_protocol(), generations=2)
    st = runner.registry.state
    for g_f, g_n in zip(frozen.generations, st.generations):
        assert abs(g_f.incumbent_score - g_n.incumbent_score) < 1e-9
        assert g_f.rolled_back == g_n.rolled_back
        assert ([c.op for c in g_f.candidates]
                == [c["op"] for c in g_n.candidates])
    frozen_final = frozen.final_protocol()
    new_final = Protocol.model_validate(st.versions[
        str(st.incumbent_version)])
    assert ([r.model_dump(exclude={"rule_id"}) for r in frozen_final.rules]
            == [r.model_dump(exclude={"rule_id"}) for r in new_final.rules])


def test_resume_continues_not_restarts(tmp_path):
    r1 = _runner(tmp_path, "resume")
    r1.run(ancestor_protocol(), generations=1)
    assert r1.registry.completed_generations() == 1

    r2 = _runner(tmp_path, "resume")
    r2.run(ancestor_protocol(), generations=3)
    st = r2.registry.state
    assert [g.gen for g in st.generations] == [1, 2, 3]

    # a fresh 3-generation run must produce the identical registry
    r3 = _runner(tmp_path, "fresh")
    r3.run(ancestor_protocol(), generations=3)
    a = [ (g.gen, g.incumbent_score, g.rolled_back)
          for g in st.generations ]
    b = [ (g.gen, g.incumbent_score, g.rolled_back)
          for g in r3.registry.state.generations ]
    assert a == b


def test_registry_rollback_and_lineage(tmp_path):
    runner = _runner(tmp_path, "lineage")
    runner.run(ancestor_protocol(), generations=2)
    reg = runner.registry
    v = reg.state.incumbent_version
    chain = reg.lineage_of(v)
    assert chain[0] == 0 and chain[-1] == v
    dump = reg.rollback_to(0)
    assert reg.state.incumbent_version == 0
    assert Protocol.model_validate(dump).rules[0].action == "SHARE_BEST"
    hist = reg.history_for_proposer()
    assert all("candidates" in h for h in hist)
