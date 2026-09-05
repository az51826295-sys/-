"""The 20x20 world: terrain, resources, agents, and physical bookkeeping.

The world holds truth. Perception (with misperception) is applied on the
simulation side; nothing here reaches into agent minds.
"""

from __future__ import annotations

import random

from genesis.society.config import SocietyConfig
from genesis.society.models import (
    Agent,
    Cell,
    Position,
    Resource,
    ResourceType,
    Season,
    TerrainType,
)
from genesis.society.world.entities import make_stone, make_wood, random_food


class SignalOut(
    tuple
):  # (sender_id, token, x, y) — position snapshot at send time
    pass


class World:
    def __init__(self, config: SocietyConfig):
        self.config = config
        self.size = config.grid_size
        self.grid: list[list[Cell]] = []
        self.agents: dict[str, Agent] = {}
        self.season: Season = Season.SPRING
        self.poison_color: str | None = None
        self.blockades: dict[tuple[int, int], int] = {}  # (x, y) -> expire tick
        self.water_cells: list[tuple[int, int]] = []
        self.initial_plain: list[tuple[int, int]] = []
        # perception carry-over from the previous tick
        self.last_actions: dict[str, str] = {}
        self.last_outcomes: dict[str, str] = {}
        self.signals_outbox: list[tuple[str, int, int, int]] = []
        self.signals_current: list[tuple[str, int, int, int]] = []
        self._res_seq = 0

    # ---------- generation ----------

    def generate(self, rng: random.Random) -> None:
        n = self.size
        self.grid = [[Cell() for _ in range(n)] for _ in range(n)]

        for _ in range(self.config.n_water_blobs):
            seed = (rng.randrange(n), rng.randrange(n))
            blob = {seed}
            frontier = [seed]
            while len(blob) < self.config.water_blob_size and frontier:
                bx, by = frontier[rng.randrange(len(frontier))]
                nxt = [
                    (bx + dx, by + dy)
                    for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0))
                    if 0 <= bx + dx < n and 0 <= by + dy < n
                ]
                if not nxt:
                    frontier.remove((bx, by))
                    continue
                pick = nxt[rng.randrange(len(nxt))]
                if pick not in blob:
                    blob.add(pick)
                    frontier.append(pick)
            for x, y in blob:
                self.grid[y][x].terrain = TerrainType.WATER

        for _ in range(self.config.n_hazard_zones):
            hx, hy = rng.randrange(n), rng.randrange(n)
            zone = {(hx, hy)}
            while len(zone) < self.config.hazard_zone_size:
                zx, zy = sorted(zone)[rng.randrange(len(zone))]
                cx, cy = zx + rng.choice((-1, 0, 1)), zy + rng.choice((-1, 0, 1))
                if 0 <= cx < n and 0 <= cy < n:
                    zone.add((cx, cy))
            for x, y in zone:
                if self.grid[y][x].terrain == TerrainType.PLAIN:
                    self.grid[y][x].hazard = True

        def place_on_plain(make):
            for _ in range(200):
                x, y = rng.randrange(n), rng.randrange(n)
                cell = self.grid[y][x]
                if cell.terrain == TerrainType.PLAIN and not cell.resources:
                    cell.resources.append(make())
                    return

        for _ in range(self.config.n_stones):
            place_on_plain(lambda: make_stone(self.next_res_id()))
        for _ in range(self.config.n_wood):
            place_on_plain(lambda: make_wood(self.next_res_id()))
        for _ in range(self.config.food_target_count):
            place_on_plain(lambda: random_food(self.next_res_id(), rng, self.config))

        self.water_cells = sorted(
            (x, y)
            for y in range(n)
            for x in range(n)
            if self.grid[y][x].terrain == TerrainType.WATER
        )
        self.initial_plain = sorted(
            (x, y)
            for y in range(n)
            for x in range(n)
            if self.grid[y][x].terrain == TerrainType.PLAIN
        )

    def next_res_id(self) -> str:
        self._res_seq += 1
        return f"r{self._res_seq:05d}"

    # ---------- queries ----------

    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.size and 0 <= y < self.size

    def cell(self, x: int, y: int) -> Cell:
        return self.grid[y][x]

    def cell_at(self, pos: Position) -> Cell:
        return self.grid[pos.y][pos.x]

    def food_count(self) -> int:
        return sum(
            1
            for row in self.grid
            for cell in row
            for r in cell.resources
            if r.resource_type == ResourceType.FOOD
        )

    def free_spawn_cells(self) -> list[tuple[int, int]]:
        return [
            (x, y)
            for y in range(self.size)
            for x in range(self.size)
            if self.grid[y][x].walkable
            and self.grid[y][x].occupant_id is None
            and not self.grid[y][x].hazard
        ]

    def living_agents(self) -> list[Agent]:
        return [a for a in self.agents.values() if a.alive]

    # ---------- mutations ----------

    def place_agent(self, agent: Agent) -> None:
        self.agents[agent.agent_id] = agent
        self.cell_at(agent.position).occupant_id = agent.agent_id

    def move_agent(self, agent: Agent, to: Position) -> None:
        self.cell_at(agent.position).occupant_id = None
        agent.position = to
        self.cell_at(to).occupant_id = agent.agent_id

    def remove_agent(self, agent: Agent) -> None:
        cell = self.cell_at(agent.position)
        if cell.occupant_id == agent.agent_id:
            cell.occupant_id = None
        cell.resources.extend(agent.inventory)
        agent.inventory = []
        agent.alive = False

    def eat_effect(self, resource: Resource) -> dict[str, float]:
        """Direct internal-state deltas of eating this resource now."""
        deltas: dict[str, float] = {"energy": resource.energy_value}
        if (
            self.poison_color is not None
            and resource.features.get("color") == self.poison_color
        ):
            deltas["health"] = self.config.poison_health_delta
        return deltas
