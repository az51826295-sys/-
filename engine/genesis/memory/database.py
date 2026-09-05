"""SQLite connection helper for Genesis."""

from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS experiences (
    experience_id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL,
    step INTEGER NOT NULL,
    observation_before_json TEXT NOT NULL,
    action_json TEXT NOT NULL,
    prediction_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    observation_after_json TEXT NOT NULL,
    prediction_error REAL NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_experiences_episode
    ON experiences (episode_id, step);
CREATE INDEX IF NOT EXISTS idx_experiences_created_at
    ON experiences (created_at);
CREATE TABLE IF NOT EXISTS episodes (
    episode_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    agent TEXT NOT NULL,
    model TEXT NOT NULL,
    world_seed INTEGER,
    total_steps INTEGER NOT NULL,
    total_reward REAL NOT NULL,
    success INTEGER NOT NULL,
    terminal_reason TEXT NOT NULL,
    average_prediction_error REAL NOT NULL,
    experiences_saved INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_episodes_run
    ON episodes (run_id);
CREATE INDEX IF NOT EXISTS idx_episodes_created_at
    ON episodes (created_at);
CREATE TABLE IF NOT EXISTS model_snapshots (
    model_name TEXT PRIMARY KEY,
    last_rowid INTEGER NOT NULL,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def connect(db_path: Path | str) -> sqlite3.Connection:
    path = Path(db_path)
    if path.parent and str(path.parent) not in ("", "."):
        path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(path))
    connection.row_factory = sqlite3.Row
    return connection


def initialize_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(SCHEMA)
    _ensure_column(
        connection, "episodes", "difficulty", "TEXT NOT NULL DEFAULT 'basic'"
    )
    _ensure_column(
        connection, "episodes", "hazard_hits", "INTEGER NOT NULL DEFAULT 0"
    )
    connection.commit()


def _ensure_column(
    connection: sqlite3.Connection, table: str, column: str, declaration: str
) -> None:
    """Additive migration for databases created before the column existed."""
    columns = [
        row[1] for row in connection.execute(f"PRAGMA table_info({table})")
    ]
    if column not in columns:
        connection.execute(
            f"ALTER TABLE {table} ADD COLUMN {column} {declaration}"
        )
