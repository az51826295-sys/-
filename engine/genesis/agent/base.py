"""Agent interface. Agents only ever see Observations, never the world."""

from __future__ import annotations

from typing import Protocol

from genesis.models.action import Action
from genesis.models.state import Observation


class BaseAgent(Protocol):
    def select_action(self, observation: Observation) -> Action:
        ...
