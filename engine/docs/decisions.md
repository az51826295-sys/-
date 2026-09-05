<!-- provenance: {"source_id": "docs/decisions.md", "source_kind": "normative", "parent_ids": [], "parent_hash": {}, "as_of": "2026-07-30T02:25:33", "generator": "tools/stamp_provenance.py --normative", "status": null} -->
# Architecture Decisions

Decisions made in the first MVP session (2026-07-29). Each is intentionally
the simplest choice that keeps the door open for later phases.

## 1. Key pick-up range
`PICK_UP` works on a key **in the agent's own cell or the cell directly in
front** (checked in that order). One consistent rule for both cases; the
key entity becomes `visible=False` and its id goes into the inventory
(entities are never deleted, so `DROP` can restore them).

## 2. Door opening
Both `OPEN` and `USE` open the door **directly in front** of the agent when
its `key_id` is in the inventory. Opening sets `locked=False`,
`is_open=True`, `blocking=False`. The key is **not consumed**. Opening an
already-open door fails with a message (nothing to open).

## 3. Button effect
Pressing an unpressed button (own cell or directly in front) grants a
one-time reward of `+0.5`. Pressing it again succeeds but grants nothing.
Chosen over door-opening side effects to keep the key->door causality
unambiguous for the world model.

## 4. Observation range
Manhattan distance <= 2 from the agent (config: `observation_radius`).
Observations carry deep copies, so later world mutation can't leak through
retained references.

## 5. Prediction error
`error = 1.0*success_mismatch + 1.0*|reward_gap| + 0.5*manhattan(position_gap) + 1.0*terminal_mismatch`
Weights live in `GenesisConfig`. Always >= 0.

## 6. SQLite serialization
Whole Pydantic sub-objects as JSON text columns (`model_dump_json` /
`model_validate_json`), matching the prescribed schema. No ORM. Rows
round-trip exactly (verified by test).

## 7. Map generation
Not free-form random: outer boundary walls + one vertical dividing wall at
`x = width // 2` with a single locked door. Agent/key/button spawn on the
left, goal on the right, so solving always requires key -> door -> goal.
2-4 extra obstacle walls are added only if a BFS check (door treated as
passable) confirms key and goal remain reachable — **every generated map is
solvable by construction**.

## 8. Random seed handling
`reset(seed)` uses a local `random.Random(seed)` (never the global RNG).
`RandomAgent(seed)` likewise. `main --seed S` runs episode *i* with world
seed `S + i` and one agent RNG seeded with `S`, so a whole multi-episode
run is reproducible.

## 9. Reward scheme
Every action costs `-0.01` (step penalty), goal `+1.0`, button `+0.5` once.
Failed actions still pay the step penalty — failure must cost something or
a rule-free agent has no pressure to learn.

## 10. World-model state key
`(orientation, action type, entity type directly ahead, has-key)`. Coarse
on purpose: it generalizes across positions, which is what makes the
success-rate statistics fill up quickly in a 10x10 world. Position-aware
keys/similarity search are future work.

## 11. Curiosity score
`score = novelty_weight * 1/(1 + samples) + error_weight * mean_prediction_error`,
computed per world-model state key (weights in `GenesisConfig`). Never-tried
situations score 1.0 on novelty; situations the model keeps mispredicting
stay interesting regardless of visit count. `CuriousAgent` picks the
highest-scoring available action (seeded random tie-break) and shares the
world model instance with the loop, so curiosity decays live as experiences
are stored. The world model is agent-side knowledge built purely from
observations, so consulting it does not breach the environment/agent
boundary.

## 12. Experience similarity retrieval
`SimilarityWorldModel` (the default; `--model naive` switches back)
remembers each experience as a compact situation record and predicts from
the top-25 most similar records (similarity >= 0.75), weighting outcomes
by similarity. Similarity is a weighted feature match over: front-cell
kind 0.35, has-key 0.20, own-cell kind 0.15, position 0.25 (linear decay
to zero at Manhattan distance 8), orientation 0.05 — identical situations
score exactly 1.0, and a mismatched front kind alone is enough to fall
below the retrieval threshold. Cell kinds are state-aware
(`DOOR_OPEN`/`DOOR_CLOSED`, `BUTTON_PRESSED`/`BUTTON_UNPRESSED`), fixing
the naive model's two blind spots: open vs closed doors shared one key,
and pressed vs unpressed buttons shared one reward statistic.
`experience_stats` returns the summed similarity weight as a fractional
sample count, giving curiosity spatial resolution. Records are bucketed
by (action type, front kind) — lossless, because a front-kind mismatch
alone caps similarity at 0.65 < 0.75, so only one bucket ever needs
scanning (invariant guarded by a test).

## 13. Adaptive explore/exploit
`AdaptiveAgent` extends GreedyAgent with two curiosity hooks: before
committing to the plan it probes any available action whose curiosity
score is >= `adaptive_curiosity_threshold` (0.9) — but only while energy
exceeds `adaptive_energy_reserve` (50), so exploration can never starve
goal pursuit — and the no-plan fallback picks the most curious action
instead of a random one. Fresh model: spends the energy surplus building
the world model (solved 40/40 sweep episodes anyway). Trained model:
probes go quiet and it converges to pure goal-seeking (16/20 seeds needed
fewer or equal steps on a second visit to the same map).

## 14. Advanced difficulty
`--difficulty advanced` -> `num_door_sections=2` (chained keys/doors:
key-1 -> door-1 -> key-2 -> door-2 -> goal, staged BFS keeps every map
solvable), `num_hazards=2` (vertical patrol, bounce off walls, contact
costs 5 energy and -0.25 reward, never blocks), `slip_probability=0.1`
(MOVE_FORWARD fails with "slipped"; drawn from the same seeded RNG stream
as map generation, so a seed reproduces the whole episode), and
`initial_energy=150`. Basic defaults are unchanged. Measured: greedy
solves 20/20 advanced seeds; average prediction error rose from ~0.000
(basic, signal exhausted) to ~0.107 — the learning signal is back.

## 15. Model snapshotting
`model_snapshots` table stores each model's serialized state
(`dump_state`/`load_state`) plus the experiences-table rowid it has
absorbed. Startup loads the snapshot and replays only newer experiences
(`iter_since`); equivalence with a full replay is covered by a test.
Snapshots are keyed by model name ("naive"/"similarity") and updated at
the end of every run.

## 16. Similarity weights: measured, kept
Grid-compared weight variants (position-heavy, position-light, looser
retrieval threshold) on advanced difficulty, greedy agent, 20 seeds x 2
episodes: second-episode prediction error was identical to 3 decimal
places across variants (0.092) with 40/40 solved everywhere. Remaining
error is dominated by irreducible stochasticity (slips, hazard timing),
not by feature weighting — so the hand-set weights stay, and future error
reduction must come from time-aware features, not tuning.

## 17. Model-informed planning (learned hazard avoidance)
Three pieces, all evidence-gated (>= 3 samples) so a fresh agent behaves
exactly like before until experience teaches it otherwise:
- `hazard_near` joined the similarity features (weights rebalanced:
  key 0.20 -> 0.15, here 0.15 -> 0.10, hazard-near 0.10; old snapshots are
  padded on load). `hazard_context_reward()` aggregates the mean reward of
  acting with a hazard in view — the learned per-step cost of being in
  hazard territory.
- AdaptiveAgent's planner is uniform-cost search; cells on a remembered
  hazard's **patrol line** (its observed heading, +-4 cells — hazards only
  hit what stands in their path) cost an extra
  `(step_reward - learned_mean) * 10`. Crossing a patrol line
  perpendicular costs one zone cell; traveling along it costs many.
- Learned caution: exploration probes are suppressed while a hazard is in
  view once experience says that territory costs > 0.05 reward/step extra.

First attempts failed and taught the design: penalizing only the hazard's
current cell +-1 did nothing (patrols move), and with 5-energy hits the
expected loss was genuinely too small for a rational planner to detour —
the economy had to make hazards matter (advanced preset: 15 energy, -1.0
reward per hit). Measured after the fixes: episode 1 -> 2 solve rate
18/20 -> 20/20, hazard hits/step 0.027 -> 0.022 (-30% total hits).

## 18. Relative hazard geometry, and the error floor
Situation features now carry the nearest visible hazard's relative offset
and heading; when both situations see a hazard, geometry match gates the
whole similarity multiplicatively (0.5 + 0.5 * match — reduction only, so
the bucketing invariant holds), which cleanly separates "hazard closing
in" from "hazard off to the side" (unit-verified: the model predicts
-1.01 for the taught dangerous geometry and -0.01 for the harmless one at
the same spot). Aggregate sweeps stayed flat though, and the arithmetic
says why: with slip_probability 0.1, slips alone contribute an expected
~0.09 average prediction error — exactly what we observe. **Average
prediction error has hit its irreducible floor on advanced; solve rate
and hazard hits/step are the meaningful metrics now.** The geometry
features are kept: their per-situation anticipation is proven, and
cross-run snapshot accumulation gives them the sample density a 4-episode
sweep cannot.

## 19. Mission-world pruning + fun proxies (2026-07-30)

Review outcome before implementation of docs/mission-design.md:
- Traits reduced to 4 (novelty, risk, criticism, simplicity).
  `human_fun_estimation_bias` removed (no grounding = pure noise);
  `cooperation_tendency` removed (single gate, redundant variance source).
- "Fun" is never a code concept. Instead four structural correlates are
  first-class playout metrics: close_decision_rate (meaningful choice),
  lead_changes + decided_late (suspense), comeback_rate. Final arbiter of
  fun is reserved for human playtests (external grader, Genesis principle).
- GRID boards only; NONE (board-less) games cut from MVP.
- Vote lambda removed: final selection is objective argmax; endorsements
  are logged and analysis reports the counterfactual winner.
- `sample()` enforces hard constraints, but `mutate()` may produce
  invalid specs on purpose (only clone-gated): if mutation could never
  break a game, CRITIQUE would have nothing real to catch and its social
  value in arm C would be fake.
- Playout metrics are computed at 2 players in the MVP even when
  players_max > 2.
