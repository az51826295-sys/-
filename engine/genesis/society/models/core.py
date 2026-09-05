"""Shared primitive types for the society world."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class Position(BaseModel):
    x: int
    y: int

    def manhattan(self, other: "Position") -> int:
        return abs(self.x - other.x) + abs(self.y - other.y)


class Direction(str, Enum):
    N = "N"
    S = "S"
    E = "E"
    W = "W"


DIRECTION_DELTAS: dict[Direction, tuple[int, int]] = {
    Direction.N: (0, -1),
    Direction.S: (0, 1),
    Direction.E: (1, 0),
    Direction.W: (-1, 0),
}


class Season(str, Enum):
    SPRING = "spring"
    SUMMER = "summer"
    AUTUMN = "autumn"
    WINTER = "winter"


SEASON_ORDER = [Season.SPRING, Season.SUMMER, Season.AUTUMN, Season.WINTER]
