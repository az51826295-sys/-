# Genesis MVP

A minimal, fully-runnable vertical slice of the Genesis learning system: an
agent that **observes, predicts, acts, compares the prediction against
reality, and stores the experience** — the core loop that later phases
(curiosity, world-model learning, evolution) will build on.

## What exists today

- **Genesis World** — a deterministic 10x10 grid with walls, a key, a locked
  door, a button, and a goal. Same seed, same map, same run.
- **Observation-limited agent** — the agent only sees entities within
  Manhattan distance 2; it never touches internal world state.
- **Two world models** — `SimilarityWorldModel` (default) predicts from
  the most similar past experiences using graded, state-aware features
  (door open/closed, button pressed/unpressed, spatial distance);
  `NaiveWorldModel` (`--model naive`) is the exact-state-key baseline.
  Both are **rehydrated from SQLite on startup**, so learning persists
  across runs.
- **Four agents** — `RandomAgent` (baseline walker); `GreedyAgent`, an
  observation-only planner that maps what it has seen, BFS-plans
  key -> button -> door -> goal, and explores frontiers (solves 20/20
  tested seeds); `CuriousAgent`, which picks whichever available action
  the world model is least sure about; and `AdaptiveAgent`
  (`--agent adaptive`), which exploits the known route and spends spare
  energy probing what the model still can't predict.
- **Learning report** — every episode's metrics are persisted;
  `python -m genesis.main --report` shows per-run success rates, a
  prediction-error chart, and the trend over time.
- **Experience Memory** — every step is stored as a structured Experience
  (observation before/after, action, prediction, result, prediction error)
  in SQLite (`data/genesis.db`).
- **AgentLoop** — wires it all together and produces an `EpisodeSummary`.

## Run it

```bash
python -m genesis.main
python -m genesis.main --episodes 3 --seed 42 --agent greedy
python -m genesis.main --episodes 3 --seed 42 --agent adaptive --difficulty advanced
python -m genesis.main --report
```

`--difficulty advanced` chains two locked doors behind separate keys,
adds patrolling hazards that damage on contact, and makes movement
slip 10% of the time — restoring a real prediction-learning signal.
`--scenario scenarios/gauntlet.json` (or any JSON of config fields)
runs a custom world; see [scenarios/](scenarios/).

## Test it

```bash
pytest
```

## Requirements

- Python 3.11+
- `pip install pydantic pytest` (or `pip install -e .[dev]`)

## Layout

```
genesis/
  config.py         # all tunables (world size, rewards, error weights, db path)
  models/           # Pydantic models: state, action, prediction, experience
  environment/      # GenesisWorld, entity factories, map generator, rules
  memory/           # SQLite ExperienceStore
  world_model/      # NaiveWorldModel
  agent/            # BaseAgent protocol, RandomAgent, AgentLoop
  evaluation/       # prediction error metric
tests/              # behavior-level tests (38 passing)
docs/               # architecture, decisions, progress
```

See [docs/architecture.md](docs/architecture.md) for how the pieces fit, and
[docs/progress.md](docs/progress.md) for what to build next.
