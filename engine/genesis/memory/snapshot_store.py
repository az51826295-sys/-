"""SQLite store for world-model snapshots.

A snapshot is the model's serialized state plus the experiences-table
rowid it has absorbed up to, so startup can load the snapshot and replay
only the experiences stored since.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple

from genesis.memory.database import connect, initialize_schema


class ModelSnapshot(NamedTuple):
    model_name: str
    last_rowid: int
    state_json: str


class SnapshotStore:
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

    def save(self, model_name: str, last_rowid: int, state_json: str) -> None:
        conn = self._require_connection()
        conn.execute(
            """
            INSERT OR REPLACE INTO model_snapshots (
                model_name, last_rowid, state_json, updated_at
            ) VALUES (?, ?, ?, ?)
            """,
            (
                model_name,
                last_rowid,
                state_json,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()

    def load(self, model_name: str) -> ModelSnapshot | None:
        conn = self._require_connection()
        row = conn.execute(
            "SELECT * FROM model_snapshots WHERE model_name = ?",
            (model_name,),
        ).fetchone()
        if row is None:
            return None
        return ModelSnapshot(
            model_name=row["model_name"],
            last_rowid=row["last_rowid"],
            state_json=row["state_json"],
        )

    def _require_connection(self) -> sqlite3.Connection:
        if self._connection is None:
            raise RuntimeError("store not initialized; call initialize() first")
        return self._connection
