"""Alpha engine: common Task/Run registry (build order step A).

Covers completion conditions 1 (registry), 2 (atomic per-unit
persistence), 3 (resume after interruption), 10 (every decision,
cost and failure logged) and the storage half of 11 (auto-resume
after a server reboot).

Why SQLite and not the JSON run log of §10.1: the engine runs
several workers at once (condition 5) and must survive a hard kill
mid-task (condition 11). SQLite gives a real transaction boundary
for claim-one-task-and-mark-it-mine, which a read-modify-write JSON
file cannot do safely across processes.

Crash model: a worker holds a **lease** with an expiry and renews it
by heartbeat. If the process dies - or the box reboots - the lease
simply expires, and `recover_orphans()` on startup returns the task
to the queue (or fails it, once attempts are exhausted). Nothing
depends on shutdown hooks running, because in a power loss they do
not run.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any, Iterable

PENDING, LEASED, SUCCEEDED, FAILED, CANCELLED = (
    "pending", "leased", "succeeded", "failed", "cancelled")
TERMINAL = (SUCCEEDED, FAILED, CANCELLED)

DEFAULT_LEASE_S = 900.0
DEFAULT_MAX_ATTEMPTS = 3

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    state TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    lease_owner TEXT,
    lease_expires_at REAL,
    not_before REAL NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    result TEXT,
    last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_claim
    ON tasks (state, not_before, priority DESC, created_at);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    worker TEXT NOT NULL,
    state TEXT NOT NULL,
    started_at REAL NOT NULL,
    ended_at REAL,
    cost_usd REAL NOT NULL DEFAULT 0,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    error TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_task ON runs (task_id);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    task_id TEXT,
    run_id INTEGER,
    kind TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events (kind, ts);
CREATE TABLE IF NOT EXISTS flags (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT,
    run_id INTEGER,
    worker TEXT,
    state TEXT NOT NULL,             -- held|settled|released|expired
    est_krw REAL NOT NULL,
    actual_krw REAL,
    delta_krw REAL,
    usd REAL,
    rate REAL NOT NULL,
    tokens_in INTEGER,
    tokens_out INTEGER,
    day_key TEXT NOT NULL,
    month_key TEXT NOT NULL,
    failure_code TEXT,
    created_at REAL NOT NULL,
    expires_at REAL NOT NULL,
    settled_at REAL
);
CREATE INDEX IF NOT EXISTS idx_res_month
    ON reservations (month_key, state);
CREATE INDEX IF NOT EXISTS idx_res_day
    ON reservations (day_key, state);
CREATE INDEX IF NOT EXISTS idx_res_task
    ON reservations (task_id, state);
CREATE TABLE IF NOT EXISTS reports (
    day TEXT PRIMARY KEY,
    created_at REAL NOT NULL,
    text TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}'
);
"""


@dataclass
class Task:
    id: str
    kind: str
    payload: dict
    state: str
    attempts: int
    max_attempts: int
    run_id: int | None = None
    worker: str | None = None

    @property
    def attempt(self) -> int:
        return self.attempts


class Store:
    """All writes are single transactions; readers never block on
    them (WAL). Safe for several worker processes on one host."""

    def __init__(self, path: str, timeout: float = 30.0):
        self.path = path
        self.timeout = timeout
        parent = os.path.dirname(os.path.abspath(path))
        os.makedirs(parent, exist_ok=True)
        self._local = threading.local()
        self._all: list[sqlite3.Connection] = []
        self._lock = threading.Lock()
        self._conn.executescript(SCHEMA)

    def _new_conn(self) -> sqlite3.Connection:
        """One connection per thread. A shared connection cannot hold
        two transactions at once, so worker threads sharing one would
        serialize - or corrupt - each other's BEGIN IMMEDIATE."""
        conn = sqlite3.connect(self.path, timeout=self.timeout,
                               isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=FULL")
        conn.execute(f"PRAGMA busy_timeout={int(self.timeout * 1000)}")
        with self._lock:
            self._all.append(conn)
        return conn

    @property
    def _conn(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = self._new_conn()
            self._local.conn = conn
        return conn

    def close(self) -> None:
        with self._lock:
            conns, self._all = self._all, []
        for c in conns:
            try:
                c.close()
            except sqlite3.Error:
                pass
        self._local = threading.local()

    @property
    def conn(self) -> sqlite3.Connection:
        """For components that need their own transaction boundary
        (the budget guard reserves inside BEGIN IMMEDIATE)."""
        return self._conn

    # ---------------------------------------------------------- write

    def add_task(self, task_id: str, kind: str,
                 payload: dict | None = None, priority: int = 0,
                 max_attempts: int = DEFAULT_MAX_ATTEMPTS,
                 not_before: float = 0.0) -> bool:
        """Idempotent: re-adding a known id is a no-op, so a crashed
        producer can safely replay its enqueue loop."""
        now = time.time()
        cur = self._conn.execute(
            "INSERT OR IGNORE INTO tasks (id, kind, payload, state,"
            " priority, max_attempts, not_before, created_at,"
            " updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (task_id, kind, json.dumps(payload or {},
                                       ensure_ascii=False),
             PENDING, priority, max_attempts, not_before, now, now))
        added = cur.rowcount > 0
        if added:
            self.log(task_id, None, "task_added",
                     {"kind": kind, "priority": priority})
        return added

    def claim(self, worker: str, kinds: Iterable[str] | None = None,
              lease_s: float = DEFAULT_LEASE_S) -> Task | None:
        """Atomically take the highest-priority runnable task."""
        now = time.time()
        kinds = list(kinds) if kinds else None
        where_kind = ""
        params: list[Any] = [PENDING, now]
        if kinds:
            where_kind = f" AND kind IN ({','.join('?' * len(kinds))})"
            params += kinds
        try:
            self._conn.execute("BEGIN IMMEDIATE")
            row = self._conn.execute(
                "SELECT * FROM tasks WHERE state = ? AND not_before <= ?"
                + where_kind +
                " ORDER BY priority DESC, created_at LIMIT 1",
                params).fetchone()
            if row is None:
                self._conn.execute("COMMIT")
                return None
            attempt = row["attempts"] + 1
            self._conn.execute(
                "UPDATE tasks SET state=?, attempts=?, lease_owner=?,"
                " lease_expires_at=?, updated_at=? WHERE id=?",
                (LEASED, attempt, worker, now + lease_s, now,
                 row["id"]))
            cur = self._conn.execute(
                "INSERT INTO runs (task_id, attempt, worker, state,"
                " started_at) VALUES (?,?,?,?,?)",
                (row["id"], attempt, worker, "running", now))
            run_id = cur.lastrowid
            self._conn.execute("COMMIT")
        except Exception:
            self._conn.execute("ROLLBACK")
            raise
        self.log(row["id"], run_id, "claimed",
                 {"worker": worker, "attempt": attempt})
        return Task(id=row["id"], kind=row["kind"],
                    payload=json.loads(row["payload"]), state=LEASED,
                    attempts=attempt, max_attempts=row["max_attempts"],
                    run_id=run_id, worker=worker)

    def heartbeat(self, task: Task, lease_s: float = DEFAULT_LEASE_S
                  ) -> bool:
        """Extend the lease. False means the lease was lost (another
        worker recovered the task) - the caller must stop working."""
        now = time.time()
        cur = self._conn.execute(
            "UPDATE tasks SET lease_expires_at=?, updated_at=?"
            " WHERE id=? AND state=? AND lease_owner=?",
            (now + lease_s, now, task.id, LEASED, task.worker))
        return cur.rowcount > 0

    def complete(self, task: Task, result: dict | None = None,
                 cost_usd: float = 0.0, tokens_in: int = 0,
                 tokens_out: int = 0) -> None:
        now = time.time()
        self._conn.execute(
            "UPDATE tasks SET state=?, result=?, lease_owner=NULL,"
            " lease_expires_at=NULL, updated_at=? WHERE id=?",
            (SUCCEEDED, json.dumps(result or {}, ensure_ascii=False),
             now, task.id))
        self._finish_run(task, "succeeded", now, cost_usd, tokens_in,
                         tokens_out, None)
        self.log(task.id, task.run_id, "succeeded",
                 {"cost_usd": cost_usd})

    def requeue(self, task: Task, error: str,
                retry_in: float = 60.0) -> str:
        """Infra failure: the work never ran, so the attempt is given
        back (attempts-1) and the task waits. (b) 재검증 B팔 1차:
        크레딧 소진 400이 13건의 시도를 2분 만에 전부 태웠다 -
        인프라 오류는 과제의 실패가 아니다."""
        now = time.time()
        self._conn.execute(
            "UPDATE tasks SET state=?, last_error=?, lease_owner=NULL,"
            " lease_expires_at=NULL, not_before=?, updated_at=?,"
            " attempts=MAX(attempts-1, 0) WHERE id=?",
            (PENDING, error[:2000], now + retry_in, now, task.id))
        self._finish_run(task, "requeued", now, 0.0, 0, 0,
                         error[:2000])
        self.log(task.id, task.run_id, "infra_requeue",
                 {"error": error[:500], "attempt": task.attempts})
        return PENDING

    def fail(self, task: Task, error: str, retry_in: float = 60.0,
             cost_usd: float = 0.0, tokens_in: int = 0,
             tokens_out: int = 0) -> str:
        """Retry until max_attempts, then park in `failed`. Returns
        the resulting task state."""
        now = time.time()
        exhausted = task.attempts >= task.max_attempts
        state = FAILED if exhausted else PENDING
        self._conn.execute(
            "UPDATE tasks SET state=?, last_error=?, lease_owner=NULL,"
            " lease_expires_at=NULL, not_before=?, updated_at=?"
            " WHERE id=?",
            (state, error[:2000], 0 if exhausted else now + retry_in,
             now, task.id))
        self._finish_run(task, "failed", now, cost_usd, tokens_in,
                         tokens_out, error[:2000])
        self.log(task.id, task.run_id,
                 "failed_final" if exhausted else "failed_retry",
                 {"error": error[:500], "attempt": task.attempts})
        return state

    def cancel(self, task_id: str, reason: str) -> None:
        now = time.time()
        self._conn.execute(
            "UPDATE tasks SET state=?, last_error=?, lease_owner=NULL,"
            " lease_expires_at=NULL, updated_at=? WHERE id=?"
            " AND state NOT IN (?,?)",
            (CANCELLED, reason[:2000], now, task_id, SUCCEEDED,
             CANCELLED))
        self.log(task_id, None, "cancelled", {"reason": reason[:500]})

    def _finish_run(self, task: Task, state: str, now: float,
                    cost_usd: float, tokens_in: int, tokens_out: int,
                    error: str | None) -> None:
        self._conn.execute(
            "UPDATE runs SET state=?, ended_at=?, cost_usd=?,"
            " tokens_in=?, tokens_out=?, error=? WHERE id=?",
            (state, now, cost_usd, tokens_in, tokens_out, error,
             task.run_id))

    # -------------------------------------------------------- resume

    def recover_orphans(self, now: float | None = None) -> list[str]:
        """Startup recovery (conditions 3 and 11). Leases whose owner
        died - including everything in flight when the box lost power
        - are returned to the queue, or failed if attempts are gone.
        Runs left 'running' are closed as orphaned so the ledger has
        no dangling rows."""
        now = now if now is not None else time.time()
        rows = self._conn.execute(
            "SELECT * FROM tasks WHERE state=? AND"
            " (lease_expires_at IS NULL OR lease_expires_at <= ?)",
            (LEASED, now)).fetchall()
        recovered = []
        for row in rows:
            exhausted = row["attempts"] >= row["max_attempts"]
            state = FAILED if exhausted else PENDING
            self._conn.execute(
                "UPDATE tasks SET state=?, lease_owner=NULL,"
                " lease_expires_at=NULL, updated_at=?,"
                " last_error=COALESCE(last_error, 'lease expired')"
                " WHERE id=?", (state, now, row["id"]))
            self._conn.execute(
                "UPDATE runs SET state='orphaned', ended_at=?,"
                " error='worker lost (lease expired)'"
                " WHERE task_id=? AND state='running'",
                (now, row["id"]))
            self.log(row["id"], None, "recovered",
                     {"previous_owner": row["lease_owner"],
                      "new_state": state,
                      "attempts": row["attempts"]})
            recovered.append(row["id"])
        return recovered

    # --------------------------------------------------------- read

    def log(self, task_id: str | None, run_id: int | None, kind: str,
            data: dict | None = None) -> None:
        """Condition 10: decisions, costs and failure causes all land
        here, append-only."""
        self._conn.execute(
            "INSERT INTO events (ts, task_id, run_id, kind, data)"
            " VALUES (?,?,?,?,?)",
            (time.time(), task_id, run_id, kind,
             json.dumps(data or {}, ensure_ascii=False)))

    def set_flag(self, key: str, value: Any) -> None:
        """Durable engine state (e.g. 'budget stop tripped'). Must
        survive a reboot, so it lives in the database, not memory."""
        self._conn.execute(
            "INSERT INTO flags (key, value, updated_at) VALUES (?,?,?)"
            " ON CONFLICT(key) DO UPDATE SET value=excluded.value,"
            " updated_at=excluded.updated_at",
            (key, json.dumps(value, ensure_ascii=False), time.time()))

    def get_flag(self, key: str, default: Any = None) -> Any:
        row = self._conn.execute("SELECT value FROM flags WHERE key=?",
                                 (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def clear_flag(self, key: str) -> None:
        self._conn.execute("DELETE FROM flags WHERE key=?", (key,))

    def save_report(self, day: str, text: str,
                    data: dict | None = None) -> bool:
        """Idempotent per day: a re-run never overwrites a delivered
        report, and the row is what makes a missing day detectable."""
        cur = self._conn.execute(
            "INSERT OR IGNORE INTO reports (day, created_at, text,"
            " data) VALUES (?,?,?,?)",
            (day, time.time(), text,
             json.dumps(data or {}, ensure_ascii=False)))
        return cur.rowcount > 0

    def get_report(self, day: str) -> dict | None:
        row = self._conn.execute("SELECT * FROM reports WHERE day=?",
                                 (day,)).fetchone()
        return dict(row) if row else None

    def report_days(self) -> list[str]:
        return [r["day"] for r in self._conn.execute(
            "SELECT day FROM reports ORDER BY day")]

    def first_activity_ts(self) -> float | None:
        row = self._conn.execute(
            "SELECT MIN(ts) t FROM events").fetchone()
        return row["t"] if row and row["t"] else None

    def get(self, task_id: str) -> dict | None:
        row = self._conn.execute("SELECT * FROM tasks WHERE id=?",
                                 (task_id,)).fetchone()
        return dict(row) if row else None

    def counts(self) -> dict[str, int]:
        rows = self._conn.execute(
            "SELECT state, COUNT(*) n FROM tasks GROUP BY state")
        return {r["state"]: r["n"] for r in rows}

    def pending_count(self) -> int:
        return self.counts().get(PENDING, 0)

    def spend_since(self, since: float) -> dict[str, float]:
        row = self._conn.execute(
            "SELECT COALESCE(SUM(cost_usd),0) c,"
            " COALESCE(SUM(tokens_in),0) ti,"
            " COALESCE(SUM(tokens_out),0) tokens_out_,"
            " COUNT(*) n FROM runs WHERE started_at >= ?",
            (since,)).fetchone()
        return {"cost_usd": row["c"], "tokens_in": row["ti"],
                "tokens_out": row["tokens_out_"], "runs": row["n"]}

    def events(self, kind: str | None = None, limit: int = 200
               ) -> list[dict]:
        if kind:
            rows = self._conn.execute(
                "SELECT * FROM events WHERE kind=? ORDER BY id DESC"
                " LIMIT ?", (kind, limit))
        else:
            rows = self._conn.execute(
                "SELECT * FROM events ORDER BY id DESC LIMIT ?",
                (limit,))
        return [dict(r) for r in rows]


def new_worker_id(prefix: str = "w") -> str:
    return f"{prefix}-{os.getpid()}-{uuid.uuid4().hex[:6]}"
