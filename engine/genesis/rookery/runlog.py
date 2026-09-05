"""Resumable run registry for Rookery experiments.

Motivation (2026-08-02): the §8.3 lane died at run 7 of 42 to a
laptop shutdown and had to restart from zero, because the micro-
experiment runners only wrote their report after the last run. The
mission7b loop had resume; Rookery did not.

Guarantees:
- **Atomic per-run persistence**: each completed run is appended and
  fsynced via write-temp + os.replace, so a kill at any instant
  leaves either the old file or the new one, never a torn file.
- **Unique key**: (experiment, arm, task, rep). Re-running skips
  completed keys.
- **Config restore**: seed and call settings (model, temperature,
  max_tokens, budgets) are stored once and re-checked on resume; a
  mismatch refuses to continue rather than silently mixing regimes.
- **Interrupted-log preservation**: the call log of an interrupted
  attempt is rotated to `<name>.attemptN` instead of being deleted,
  and the fresh attempt writes to a clean file, so partial and main
  logs never mix.
"""

from __future__ import annotations

import json
import os
from typing import Any

from pydantic import BaseModel, Field


class RunLogState(BaseModel):
    experiment: str
    config: dict[str, Any] = Field(default_factory=dict)
    runs: dict[str, Any] = Field(default_factory=dict)   # key -> row
    attempts: int = 0


def run_key(arm: str, task: str, rep: int) -> str:
    return f"{arm}|{task}|{rep}"


class RunLog:
    """Per-run registry with resume. `path` holds the JSON state; the
    call log lives beside it and is rotated per attempt."""

    def __init__(self, path: str, experiment: str,
                 config: dict[str, Any], calls_path: str | None = None):
        self.path = path
        self.calls_path = calls_path
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                self.state = RunLogState.model_validate(json.load(f))
            if self.state.experiment != experiment:
                raise ValueError(
                    f"run log at {path} belongs to "
                    f"{self.state.experiment!r}, not {experiment!r}")
            drift = {k: (self.state.config.get(k), v)
                     for k, v in config.items()
                     if self.state.config.get(k) != v}
            if drift:
                raise ValueError(
                    "refusing to resume with changed call settings "
                    f"(stored vs requested): {drift}")
        else:
            self.state = RunLogState(experiment=experiment,
                                     config=dict(config))
        self.state.attempts += 1
        if self.calls_path:
            self._rotate_calls()
        self._save()

    # ------------------------------------------------------------- calls

    def _rotate_calls(self) -> None:
        """Preserve the previous attempt's call log; start clean.

        A fresh attempt must not append to a log whose tail belongs to
        runs that were never recorded as completed - that is exactly
        how partial and main logs get mixed."""
        if not os.path.exists(self.calls_path):
            return
        keep = f"{self.calls_path}.attempt{self.state.attempts - 1}"
        if not os.path.exists(keep):
            os.replace(self.calls_path, keep)

    def log_call(self, entry: dict) -> None:
        if not self.calls_path:
            return
        with open(self.calls_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def all_call_logs(self) -> list[str]:
        """Main log plus every preserved attempt log, oldest first."""
        if not self.calls_path:
            return []
        out = [f"{self.calls_path}.attempt{i}"
               for i in range(1, self.state.attempts)]
        return [p for p in out if os.path.exists(p)] + (
            [self.calls_path] if os.path.exists(self.calls_path) else [])

    # -------------------------------------------------------------- runs

    def done(self, arm: str, task: str, rep: int) -> bool:
        return run_key(arm, task, rep) in self.state.runs

    def seed_for(self, arm: str, task: str, rep: int) -> int:
        """Deterministic per-run seed derived from the key and the
        stored master seed, so a resumed run uses the same value the
        interrupted attempt would have."""
        import hashlib

        base = str(self.state.config.get("master_seed", 0))
        digest = hashlib.sha256(
            f"{base}|{run_key(arm, task, rep)}".encode()).hexdigest()
        return int(digest[:8], 16)

    def record(self, arm: str, task: str, rep: int,
               row: dict[str, Any]) -> None:
        row = dict(row)
        row.update({"arm": arm, "task": task, "rep": rep,
                    "attempt": self.state.attempts})
        self.state.runs[run_key(arm, task, rep)] = row
        self._save()

    def rows(self) -> list[dict[str, Any]]:
        return [self.state.runs[k] for k in sorted(self.state.runs)]

    def completed(self) -> int:
        return len(self.state.runs)

    def _save(self) -> None:
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.state.model_dump(), f, ensure_ascii=False,
                      indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.path)
