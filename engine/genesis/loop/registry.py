"""Version registry with lineage and resume (proposal sections 7, 8.B).

Artifacts are stored as opaque JSON (`artifact_dump`); the registry
never interprets them. Every generation appends one record; `resume`
restores the runner to the exact state after the last completed
generation, so a killed multi-hour run continues instead of restarting
(the operational lesson of the 7A network deaths).
"""

from __future__ import annotations

import json
import os
from typing import Any

from pydantic import BaseModel, Field

from genesis.loop.interfaces import Evaluation


class GenerationEntry(BaseModel):
    gen: int
    incumbent_version_before: int
    incumbent_version_after: int
    incumbent_score: float
    rolled_back: bool
    observation_metrics: dict[str, float] = Field(default_factory=dict)
    candidates: list[dict[str, Any]] = Field(default_factory=list)


class RegistryState(BaseModel):
    experiment: str
    versions: dict[str, Any] = Field(default_factory=dict)  # v -> dump
    generations: list[GenerationEntry] = Field(default_factory=list)
    incumbent_version: int = 0
    incumbent_score: float | None = None
    next_version: int = 1


class Registry:
    def __init__(self, path: str, experiment: str):
        self.path = path
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                self.state = RegistryState.model_validate(json.load(f))
            if self.state.experiment != experiment:
                raise ValueError(
                    f"registry at {path} belongs to "
                    f"{self.state.experiment!r}, not {experiment!r}")
        else:
            self.state = RegistryState(experiment=experiment)

    # ------------------------------------------------------------- write

    def register_founding(self, artifact_dump: Any) -> None:
        if "0" not in self.state.versions:
            self.state.versions["0"] = artifact_dump
            self._save()

    def register_generation(
        self,
        entry: GenerationEntry,
        adopted_dump: Any | None,
    ) -> int:
        """Returns the incumbent version after this generation."""
        if adopted_dump is not None:
            version = self.state.next_version
            self.state.next_version += 1
            self.state.versions[str(version)] = adopted_dump
            entry.incumbent_version_after = version
            self.state.incumbent_version = version
        else:
            entry.incumbent_version_after = self.state.incumbent_version
        self.state.incumbent_score = entry.incumbent_score
        self.state.generations.append(entry)
        self._save()
        return self.state.incumbent_version

    def rollback_to(self, version: int) -> Any:
        """Manual rollback: point the incumbent at an older version."""
        dump = self.state.versions[str(version)]
        self.state.incumbent_version = version
        self.state.incumbent_score = None    # must be re-evaluated
        self._save()
        return dump

    # -------------------------------------------------------------- read

    def incumbent_dump(self) -> Any:
        return self.state.versions[str(self.state.incumbent_version)]

    def completed_generations(self) -> int:
        return len(self.state.generations)

    def lineage_of(self, version: int) -> list[int]:
        """Chain of versions from founding to `version` via adoptions.
        Only adoption generations advance the chain — rollback entries
        have before == after and must be skipped."""
        by_after = {g.incumbent_version_after: g
                    for g in self.state.generations
                    if g.incumbent_version_after
                    != g.incumbent_version_before}
        chain = []
        v = version
        while v != 0:
            chain.append(v)
            entry = by_after.get(v)
            if entry is None:
                break
            v = entry.incumbent_version_before
        chain.append(0)
        return list(reversed(chain))

    def history_for_proposer(self, last_n: int = 10) -> list[dict]:
        """Structured adoption history (T-Memory raw material): what was
        tried, what happened — ops and outcomes only, no strategy."""
        out = []
        for g in self.state.generations[-last_n:]:
            out.append({
                "gen": g.gen,
                "rolled_back": g.rolled_back,
                "incumbent_score": g.incumbent_score,
                "candidates": [
                    {"op": c.get("op"), "score": c.get("score"),
                     "adopted": c.get("adopted", False),
                     "artifact": c.get("artifact")}
                    for c in g.candidates
                ],
            })
        return out

    def _save(self) -> None:
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.state.model_dump(), f, ensure_ascii=False,
                      indent=1)
        os.replace(tmp, self.path)
