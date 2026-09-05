"""What an agent perceives in one tick. Relative offsets only."""

from __future__ import annotations

from pydantic import BaseModel, Field

from genesis.society.models.action import ActionType
from genesis.society.models.agent import InternalState
from genesis.society.models.world import CellView, ResourceView


class ObservedAgent(BaseModel):
    agent_id: str
    dx: int
    dy: int
    last_action: ActionType | None = None
    visible_outcome: str | None = None   # "ATE", "TOOK_DAMAGE", "FLED", ...


class HeardSignal(BaseModel):
    sender_id: str
    token: int
    dx: int
    dy: int


class Observation(BaseModel):
    tick: int
    season: str
    self_state: InternalState
    inventory: list[ResourceView] = Field(default_factory=list)
    cells: list[CellView] = Field(default_factory=list)
    observed_agents: list[ObservedAgent] = Field(default_factory=list)
    heard_signals: list[HeardSignal] = Field(default_factory=list)

    def cell_at(self, dx: int, dy: int) -> CellView | None:
        for c in self.cells:
            if c.dx == dx and c.dy == dy:
                return c
        return None
