"""SQLite-backed persistent store for Experience records."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from genesis.memory.database import connect, initialize_schema
from genesis.models.action import Action, ActionResult
from genesis.models.experience import Experience
from genesis.models.prediction import Prediction
from genesis.models.state import Observation


class ExperienceStore:
    def __init__(self, db_path: Path | str):
        self.db_path = Path(db_path)
        self._connection: sqlite3.Connection | None = None

    def initialize(self) -> None:
        self._connection = connect(self.db_path)
        initialize_schema(self._connection)

    def close(self) -> None:
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    def save(self, experience: Experience) -> None:
        conn = self._require_connection()
        conn.execute(
            """
            INSERT INTO experiences (
                experience_id, episode_id, step,
                observation_before_json, action_json, prediction_json,
                result_json, observation_after_json,
                prediction_error, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                experience.experience_id,
                experience.episode_id,
                experience.step,
                experience.observation_before.model_dump_json(),
                experience.action.model_dump_json(),
                experience.prediction.model_dump_json(),
                experience.result.model_dump_json(),
                experience.observation_after.model_dump_json(),
                experience.prediction_error,
                experience.created_at.isoformat(),
            ),
        )
        conn.commit()

    def get_by_episode(self, episode_id: str) -> list[Experience]:
        conn = self._require_connection()
        rows = conn.execute(
            "SELECT * FROM experiences WHERE episode_id = ? ORDER BY step",
            (episode_id,),
        ).fetchall()
        return [self._row_to_experience(row) for row in rows]

    def get_recent(self, limit: int = 100) -> list[Experience]:
        conn = self._require_connection()
        rows = conn.execute(
            "SELECT * FROM experiences ORDER BY created_at DESC, rowid DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [self._row_to_experience(row) for row in rows]

    def iter_all(self):
        """Yield every stored experience in chronological order."""
        conn = self._require_connection()
        rows = conn.execute(
            "SELECT * FROM experiences ORDER BY created_at, rowid"
        ).fetchall()
        for row in rows:
            yield self._row_to_experience(row)

    def iter_since(self, min_rowid: int):
        """Yield experiences inserted after the given rowid, in order."""
        conn = self._require_connection()
        rows = conn.execute(
            "SELECT rowid, * FROM experiences WHERE rowid > ? ORDER BY rowid",
            (min_rowid,),
        ).fetchall()
        for row in rows:
            yield self._row_to_experience(row)

    def max_rowid(self) -> int:
        conn = self._require_connection()
        row = conn.execute(
            "SELECT COALESCE(MAX(rowid), 0) AS m FROM experiences"
        ).fetchone()
        return int(row["m"])

    def count(self) -> int:
        conn = self._require_connection()
        row = conn.execute("SELECT COUNT(*) AS n FROM experiences").fetchone()
        return int(row["n"])

    def _require_connection(self) -> sqlite3.Connection:
        if self._connection is None:
            raise RuntimeError("store not initialized; call initialize() first")
        return self._connection

    @staticmethod
    def _row_to_experience(row: sqlite3.Row) -> Experience:
        return Experience(
            experience_id=row["experience_id"],
            episode_id=row["episode_id"],
            step=row["step"],
            observation_before=Observation.model_validate_json(
                row["observation_before_json"]
            ),
            action=Action.model_validate_json(row["action_json"]),
            prediction=Prediction.model_validate_json(row["prediction_json"]),
            result=ActionResult.model_validate_json(row["result_json"]),
            observation_after=Observation.model_validate_json(
                row["observation_after_json"]
            ),
            prediction_error=row["prediction_error"],
            created_at=row["created_at"],
        )
