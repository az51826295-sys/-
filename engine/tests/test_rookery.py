"""Rookery Minimum skeleton: procedure space, sim adapter, full loop."""

from __future__ import annotations

from genesis.loop.registry import Registry
from genesis.loop.runner import BlindSelector, Runner
from genesis.rookery.adapters.pyfix_sim import (
    SPACE,
    PyFixSimAdapter,
    default_procedure,
)
from genesis.rookery.procedure import Procedure
from genesis.rookery.proposers import RandomProcedureProposer
from genesis.rookery.task import TaskEnvironment


def test_procedure_validation():
    good = Procedure(steps=["run_tests_first"],
                     knobs={"max_attempts": 2})
    assert SPACE.validate_procedure(good) == []
    assert SPACE.validate_procedure(
        Procedure(steps=["hack_the_grader"])) != []
    assert SPACE.validate_procedure(
        Procedure(knobs={"max_attempts": 99})) != []
    assert SPACE.validate_procedure(
        Procedure(knobs={"unknown": 1})) != []


def test_adapter_is_deterministic_and_procedure_sensitive():
    adapter = PyFixSimAdapter()
    naive = default_procedure()
    skilled = Procedure(steps=["run_tests_first",
                               "check_boundary_conditions",
                               "compare_expected_actual"],
                        knobs={"max_attempts": 3,
                               "hypothesis_first": True})
    env = TaskEnvironment(adapter)
    a1, a2 = env.evaluate(naive), env.evaluate(naive)
    assert a1 == a2                                  # deterministic
    b = env.evaluate(skilled)
    assert b.metrics["mean_score"] > a1.metrics["mean_score"]
    # hidden split: train and validation instances differ
    train_ids = {x.instance_id for x in adapter.train_instances()}
    valid_ids = {x.instance_id for x in adapter.validation_instances()}
    assert not train_ids & valid_ids


def test_full_loop_improves_procedure(tmp_path):
    adapter = PyFixSimAdapter()
    env = TaskEnvironment(adapter)
    runner = Runner(
        environment=env,
        proposer=RandomProcedureProposer(SPACE, master_seed=0),
        selector=BlindSelector(),
        registry=Registry(str(tmp_path / "rookery.json"), "pyfix-sim"),
        artifact_load=Procedure.model_validate,
        artifact_dump=lambda p: p.model_dump(),
        proposals_per_gen=6,
    )
    runner.run(default_procedure(), generations=8)
    st = runner.registry.state
    assert len(st.generations) == 8
    scores = [g.incumbent_score for g in st.generations]
    assert all(b >= a - 1e-9 for a, b in zip(scores, scores[1:]))
    assert scores[-1] > scores[0]         # random search does improve here
    final = Procedure.model_validate(
        st.versions[str(st.incumbent_version)])
    assert SPACE.validate_procedure(final) == []
