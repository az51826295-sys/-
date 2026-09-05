"""루키 2.0 진화 2·3단계: 저장소 기억, 실패 승급, 대화 등록 경로.

The chat's create_task power belongs to the user, not the model: a
proposal only becomes a queued task through confirm() returning True.
"""

import os

import pytest

from genesis.rookery.chat import handle_tool_uses
from genesis.rookery.engine.agentic import pick_tier, repo_map
from genesis.rookery.engine.store import Store


# ------------------------------------------------------- tier routing


def test_explicit_tier_wins():
    assert pick_tier({"tier": "smart"}, attempts=1) == "smart"
    assert pick_tier({"tier": "fast"}, attempts=5) == "fast"


def test_first_try_fast_retry_smart():
    assert pick_tier({}, attempts=1) == "fast"
    assert pick_tier({}, attempts=2) == "smart"


def test_unknown_tier_falls_back_to_routing():
    assert pick_tier({"tier": "galaxy"}, attempts=1) == "fast"


# ----------------------------------------------------------- repo map


class WsStub:
    def __init__(self, path):
        self.path = str(path)


def test_repo_map_lists_files_and_skips_git(tmp_path):
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "config").write_text("x")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "a.py").write_text("print(1)")
    (tmp_path / "readme.md").write_text("hi")
    m = repo_map(WsStub(tmp_path))
    assert "src/a.py" in m and "readme.md" in m
    assert ".git" not in m


def test_repo_map_truncates(tmp_path):
    for i in range(200):
        (tmp_path / f"f{i:03d}.txt").write_text("x")
    m = repo_map(WsStub(tmp_path), max_entries=20)
    assert m.count("\n") <= 21 and "생략" in m


# ------------------------------------------------- chat create_task


def tool_use(name="create_task", **inp):
    return {"type": "tool_use", "id": "t1", "name": name,
            "input": inp}


def test_confirmed_proposal_becomes_task(tmp_path):
    db = str(tmp_path / "e.db")
    Store(db).close()                    # 스키마 생성
    results = handle_tool_uses(
        [tool_use(kind="agent_fix", issue="버그 수정",
                  file="mod.py")],
        db, confirm=lambda s: True)
    assert "등록됨" in results[0]["content"]
    s = Store(db)
    rows = s.conn.execute(
        "SELECT kind, payload FROM tasks").fetchall()
    s.close()
    assert len(rows) == 1 and rows[0]["kind"] == "agent_fix"
    assert "버그 수정" in rows[0]["payload"]


def test_denied_proposal_creates_nothing(tmp_path):
    db = str(tmp_path / "e.db")
    Store(db).close()
    results = handle_tool_uses(
        [tool_use(kind="fix", issue="위험한 일")],
        db, confirm=lambda s: False)
    assert "거부" in results[0]["content"]
    s = Store(db)
    n = s.conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
    s.close()
    assert n == 0


def test_confirm_sees_the_summary(tmp_path):
    db = str(tmp_path / "e.db")
    Store(db).close()
    seen = {}
    handle_tool_uses(
        [tool_use(kind="doc", issue="문서화 해줘", file="a.py")],
        db, confirm=lambda s: seen.setdefault("s", s) and False)
    assert "doc" in seen["s"] and "a.py" in seen["s"]
