<!-- provenance: {"source_id": "docs/architecture.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-08-22T18:55:38", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# Architecture

> 연구 세계(미로)의 지도. 제품 엔진(Rookery, 스테이지 1)의 지도는
> [rookery-architecture.md](rookery-architecture.md).

## The loop

```
GenesisWorld.reset(seed)
        |
        v
  Observation  ---------------------------+
        |                                 |
        v                                 |
  RandomAgent.select_action(obs)          |
        |                                 |
        v                                 |
  NaiveWorldModel.predict(obs, action)    |
        |                                 |
        v                                 |
  GenesisWorld.step(action)               |
        |                                 |
        v                                 |
  (Observation', ActionResult)            |
        |                                 |
        v                                 |
  compute_prediction_error(...)           |
        |                                 |
        v                                 |
  Experience -> ExperienceStore (SQLite)  |
        |                                 |
        v                                 |
  NaiveWorldModel.update(experience)      |
        |                                 |
        +----- not terminal? -------------+
```

`AgentLoop.run_episode` drives this cycle and returns an `EpisodeSummary`.

## Package responsibilities

| Package | Responsibility | Depends on |
|---|---|---|
| `genesis.models` | Pure data (Pydantic): Position, Orientation, Entity, AgentState, Observation, Action, ActionResult, Prediction, Experience | nothing |
| `genesis.environment` | GenesisWorld, entity factories, deterministic map generator, shared spatial rules | models, config |
| `genesis.memory` | SQLite schema + ExperienceStore (JSON-serialized Pydantic columns) | models |
| `genesis.world_model` | NaiveWorldModel: rule predictions + per-state-key experience statistics | models, environment.rules, config |
| `genesis.agent` | BaseAgent protocol, RandomAgent, AgentLoop | everything above |
| `genesis.evaluation` | prediction error metric | models, config |

Dependency direction is strictly one-way: `models` knows nothing about the
environment; the environment knows nothing about agents; agents consume only
`Observation` objects.

## Information hiding

- `GenesisWorld.observe()` returns deep copies of entities within
  `observation_radius` (Manhattan distance 2). The full map is never exposed
  on the agent path.
- Full internal state is available only via `debug_entities()` /
  `load_debug_state()`, which exist for tests and debugging.
- `Entity`/`EntityType` are defined in `genesis.models.state` (not in the
  environment package) so `Observation` can reference them without a
  circular or reversed dependency; `genesis.environment.entities`
  re-exports them with factory helpers.

## Determinism

`reset(seed)` builds a `random.Random(seed)` used for all generation choices
in a fixed order, so identical seeds produce identical maps. `RandomAgent`
takes its own seed. Same (world seed, agent seed) pair reproduces an entire
episode; `tests/test_agent_loop.py::test_same_seeds_reproduce_episode`
guards this.

## Storage

One table, `experiences`, one row per step. Sub-objects are stored as JSON
columns (`Observation`, `Action`, `Prediction`, `ActionResult` via
`model_dump_json`) so rows fully round-trip back into Pydantic models.
Indexes on `(episode_id, step)` and `created_at`.
