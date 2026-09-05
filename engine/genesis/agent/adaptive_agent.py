"""AdaptiveAgent: exploit the known route, explore what the model doesn't know.

It behaves like GreedyAgent (map memory, BFS planning toward
key -> button -> door -> goal), with two curiosity-driven changes:

- Before committing to the plan, if some available action is nearly
  unknown to the world model (curiosity score above the configured
  threshold), it tries that action once — but only while energy stays
  above the reserve, so exploration can never starve goal pursuit.
- The no-plan fallback picks the most curious available action instead
  of a random one.
- Path planning is cost-based: cells at or next to a remembered hazard
  cost extra, with the size of the penalty learned from the world
  model's experience of moving toward hazards (`front_kind_reward`).
  A fresh model has no such evidence, so a fresh agent walks straight
  through hazard territory until reality teaches it otherwise —
  avoidance emerges from experience, not from hard-coded rules.

Because curiosity decays as experiences are stored (and the world model
is rehydrated from SQLite across runs), a well-trained AdaptiveAgent
converges to pure goal-seeking, while a fresh one spends its energy
surplus building the world model.
"""

from __future__ import annotations

import heapq
from itertools import count

from genesis.agent.greedy_agent import Cell, GreedyAgent
from genesis.config import GenesisConfig
from genesis.evaluation.curiosity import CuriosityScorer
from genesis.models.action import Action
from genesis.models.state import EntityType, Observation
from genesis.world_model.naive_model import NaiveWorldModel

_NEIGHBOR_DELTAS = ((0, 1), (0, -1), (1, 0), (-1, 0))
# Steps of detour the agent will accept per unit of expected reward loss
COST_SCALE = 10.0
# Evidence needed before hazard experience shapes the path
MIN_COST_SAMPLES = 3
# Entry costs are learned as 1/success-rate, capped so a never-passable
# reading cannot make a mandatory door look infinitely expensive
MAX_ENTRY_COST = 5.0
# How far along its observed heading a hazard's patrol is assumed to reach
PATROL_RANGE = 4
# Probes are suppressed near hazards once experience says being there
# costs at least this much reward per step beyond the normal step cost
CAUTION_MARGIN = 0.05


class AdaptiveAgent(GreedyAgent):
    def __init__(
        self,
        world_model: NaiveWorldModel,
        seed: int | None = None,
        observation_radius: int = 2,
        config: GenesisConfig | None = None,
    ):
        super().__init__(seed=seed, observation_radius=observation_radius)
        cfg = config or GenesisConfig()
        self._world_model = world_model
        self._config = cfg
        self._scorer = CuriosityScorer(world_model, cfg)
        self._curiosity_threshold = cfg.adaptive_curiosity_threshold
        self._energy_reserve = cfg.adaptive_energy_reserve

    def _exploration_probe(self, observation: Observation) -> Action | None:
        if observation.agent_state.energy <= self._energy_reserve:
            return None
        # Learned caution: no experiments while standing in territory that
        # experience says is expensive.
        hazard_in_view = any(
            e.entity_type == EntityType.HAZARD and e.visible
            for e in observation.visible_entities
        )
        if hazard_in_view:
            samples, mean_reward = self._world_model.hazard_context_reward()
            if (
                samples >= MIN_COST_SAMPLES
                and mean_reward
                < self._config.step_reward - CAUTION_MARGIN
            ):
                return None
        score, actions = self._most_curious(observation)
        if score >= self._curiosity_threshold:
            return self._rng.choice(actions)
        return None

    def _fallback(self, observation: Observation) -> Action:
        _, actions = self._most_curious(observation)
        return self._rng.choice(actions)

    def _bfs(
        self, start: Cell, targets: set[Cell], inventory: list[str]
    ) -> list[Cell] | None:
        """Uniform-cost search with learned hazard-zone penalties."""
        hazard_penalty = self._hazard_penalty()
        hazard_zone = self._hazard_zone() if hazard_penalty > 0 else set()

        tie_breaker = count()
        frontier: list[tuple[float, int, Cell]] = [(0.0, next(tie_breaker), start)]
        previous: dict[Cell, Cell | None] = {start: None}
        best_cost: dict[Cell, float] = {start: 0.0}
        while frontier:
            cost, _, current = heapq.heappop(frontier)
            if cost > best_cost.get(current, float("inf")):
                continue
            if current in targets:
                path: list[Cell] = []
                while current != start:
                    path.append(current)
                    current = previous[current]  # type: ignore[assignment]
                path.reverse()
                return path
            for dx, dy in _NEIGHBOR_DELTAS:
                neighbor = (current[0] + dx, current[1] + dy)
                if not self._passable(neighbor, inventory):
                    continue
                step_cost = self._entry_cost(neighbor)
                if neighbor in hazard_zone:
                    step_cost += hazard_penalty
                new_cost = cost + step_cost
                if new_cost < best_cost.get(neighbor, float("inf")):
                    best_cost[neighbor] = new_cost
                    previous[neighbor] = current
                    heapq.heappush(
                        frontier, (new_cost, next(tie_breaker), neighbor)
                    )
        return None

    def _entry_cost(self, cell: Cell) -> float:
        """Learned cost of stepping into a cell, by what occupies it.

        1 / (experienced MOVE_FORWARD success rate toward this kind of
        cell), evidence-gated and capped. A closed door prices in the
        failed bumps and opening overhead the agent has actually paid;
        slippery terrain prices in its retries. With no evidence the
        cost is the classic 1.0 — behavior is unchanged until
        experience says otherwise.
        """
        kind = self._known.get(cell)
        if kind == "door":
            door = self._doors.get(cell)
            model_kind = (
                "DOOR_OPEN" if door is not None and door.is_open
                else "DOOR_CLOSED"
            )
        else:
            model_kind = "NONE"
        samples, success_rate = self._world_model.front_kind_success(
            "MOVE_FORWARD", model_kind
        )
        if samples < MIN_COST_SAMPLES:
            return 1.0
        return min(
            MAX_ENTRY_COST, 1.0 / max(success_rate, 1.0 / MAX_ENTRY_COST)
        )

    def _hazard_zone(self) -> set[Cell]:
        """Cells a remembered hazard can plausibly reach: its patrol line.

        Hazards only ever hit an agent standing in their path, so the
        dangerous cells are the segment along the hazard's observed
        heading — crossing it perpendicularly costs one zone cell,
        walking along it costs many.
        """
        zone: set[Cell] = set()
        for hazard_id, (hx, hy) in self._hazards.items():
            direction = self._hazard_directions.get(hazard_id)
            if direction in ("NORTH", "SOUTH"):
                zone.update(
                    (hx, hy + d) for d in range(-PATROL_RANGE, PATROL_RANGE + 1)
                )
            elif direction in ("EAST", "WEST"):
                zone.update(
                    (hx + d, hy) for d in range(-PATROL_RANGE, PATROL_RANGE + 1)
                )
            else:
                zone.add((hx, hy))
                zone.update(
                    (hx + dx, hy + dy) for dx, dy in _NEIGHBOR_DELTAS
                )
        return zone

    def _hazard_penalty(self) -> float:
        """Extra path cost for hazard territory, learned from experience."""
        if not self._hazards:
            return 0.0
        samples, mean_reward = self._world_model.hazard_context_reward()
        if samples < MIN_COST_SAMPLES:
            return 0.0
        loss = self._config.step_reward - mean_reward
        return max(0.0, loss) * COST_SCALE

    def _most_curious(
        self, observation: Observation
    ) -> tuple[float, list[Action]]:
        candidates = [
            self._action(action_type)
            for action_type in observation.available_actions
        ]
        scored = [
            (self._scorer.score(observation, action), action)
            for action in candidates
        ]
        best = max(score for score, _ in scored)
        return best, [action for score, action in scored if score == best]
