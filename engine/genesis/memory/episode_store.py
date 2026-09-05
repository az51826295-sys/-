"""SQLite-backed store for per-episode learning metrics."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from genesis.memory.database import connect, initialize_schema
from genesis.models.experience import EpisodeRecord


class EpisodeStore:
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

    def save(self, record: EpisodeRecord) -> None:
        conn = self._require_connection()
        conn.execute(
            """
            INSERT OR REPLACE INTO episodes (
                episode_id, run_id, agent, model, difficulty, world_seed,
                total_steps, total_reward, success, terminal_reason,
                average_prediction_error, experiences_saved, hazard_hits,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.episode_id,
                record.run_id,
                record.agent,
                record.model,
                record.difficulty,
                record.world_seed,
                record.total_steps,
                record.total_reward,
                1 if record.success else 0,
                record.terminal_reason,
                record.average_prediction_error,
                record.experiences_saved,
                record.hazard_hits,
                record.created_at.isoformat(),
            ),
        )
        conn.commit()

    def get_all(self) -> list[EpisodeRecord]:
        conn = self._require_connection()
        rows = conn.execute(
            "SELECT * FROM episodes ORDER BY created_at, rowid"
        ).fetchall()
        return [self._row_to_record(row) for row in rows]

    def count(self) -> int:
        conn = self._require_connection()
        row = conn.execute("SELECT COUNT(*) AS n FROM episodes").fetchone()
        return int(row["n"])

    def _require_connection(self) -> sqlite3.Connection:
        if self._connection is None:
            raise RuntimeError("store not initialized; call initialize() first")
        return self._connection

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> EpisodeRecord:
        return EpisodeRecord(
            episode_id=row["episode_id"],
            run_id=row["run_id"],
            agent=row["agent"],
            model=row["model"],
            difficulty=row["difficulty"],
            world_seed=row["world_seed"],
            total_steps=row["total_steps"],
            total_reward=row["total_reward"],
            success=bool(row["success"]),
            terminal_reason=row["terminal_reason"],
            average_prediction_error=row["average_prediction_error"],
            experiences_saved=row["experiences_saved"],
            hazard_hits=row["hazard_hits"],
            created_at=row["created_at"],
        )
