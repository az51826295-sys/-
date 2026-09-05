"""루키 채팅 쓰기 경로 v1 (스테이지 1): 저장소별 원장 등록은 재현 테스트가
HEAD에서 실패해야 하고, 사장님 확인 뒤에만 일어난다. 테스트 없는 지시는
인박스에만 적힌다. 모델 호출 없음 - tool_use 블록을 직접 준다."""

import json
import os
import subprocess

import pytest

from genesis.rookery.chat import handle_tool_uses, snapshot_stage1
from genesis.rookery.engine.store import Store

BUGGY = "def sq(x):\n    return x + x\n"
FAILING = "import mod\n\n\ndef test_sq():\n    assert mod.sq(3) == 9\n"
PASSING = "import mod\n\n\ndef test_zero():\n    assert mod.sq(0) == 0\n"


def tool_use(**inp):
    return {"type": "tool_use", "id": "t1", "name": "create_task",
            "input": {"kind": "agent_fix", **inp}}


@pytest.fixture()
def stage1(tmp_path):
    repos = tmp_path / "repos"
    head = repos / "demo_head"
    head.mkdir(parents=True)
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=head, check=True)
    (head / "mod.py").write_text(BUGGY, encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=head, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=head, env=env,
                   check=True)
    data = tmp_path / "data"
    data.mkdir()
    return {"tag": "t", "data_root": str(data), "repos_root": str(repos),
            "slug_of": {"demo": "x/demo"},
            "inbox": str(data / "chat_inbox.json")}


def tasks(stage1, repo="demo"):
    db = os.path.join(stage1["data_root"], stage1["tag"], repo, "engine.db")
    if not os.path.exists(db):
        return []
    s = Store(db)
    rows = [dict(r) for r in s.conn.execute("SELECT id, payload FROM tasks")]
    s.close()
    return rows


def test_failing_test_plus_confirm_enqueues_into_repo_ledger(stage1):
    seen = {}

    def confirm(summary):
        seen["s"] = summary
        return True

    res = handle_tool_uses([tool_use(repo="demo", issue="sq가 제곱이 아니다",
                                     test_src=FAILING)],
                           "unused.db", confirm, stage1=stage1)
    assert "등록됨" in res[0]["content"], res
    assert "HEAD에서 실패 확인됨" in seen["s"]
    rows = tasks(stage1)
    assert len(rows) == 1 and rows[0]["id"].startswith("live-demo_chat")
    payload = json.loads(rows[0]["payload"])
    assert payload["repro_tests"][0].startswith("test_intake_demo_chat")
    assert "sq가 제곱이 아니다" in payload["issue"]


def test_passing_test_is_refused_without_registering(stage1):
    res = handle_tool_uses([tool_use(repo="demo", issue="이미 된 것",
                                     test_src=PASSING)],
                           "unused.db", lambda s: True, stage1=stage1)
    assert "재현 안 됨" in res[0]["content"]
    assert tasks(stage1) == []


def test_denied_confirm_registers_nothing(stage1):
    res = handle_tool_uses([tool_use(repo="demo", issue="x", test_src=FAILING)],
                           "unused.db", lambda s: False, stage1=stage1)
    assert "거부" in res[0]["content"]
    assert tasks(stage1) == []


def test_no_test_goes_to_inbox_only(stage1):
    res = handle_tool_uses([tool_use(repo="demo", issue="sq 고쳐줘")],
                           "unused.db", lambda s: True, stage1=stage1)
    assert "인박스" in res[0]["content"] and "등록 아님" in res[0]["content"]
    assert tasks(stage1) == []
    inbox = json.load(open(stage1["inbox"], encoding="utf-8"))
    assert inbox[0]["repo"] == "demo" and inbox[0]["status"] == "awaiting_test"


def test_unknown_repo_is_refused(stage1):
    res = handle_tool_uses([tool_use(repo="nope", issue="x", test_src=FAILING)],
                           "unused.db", lambda s: True, stage1=stage1)
    assert "모르는 저장소" in res[0]["content"]


def test_stage1_snapshot_reads_ledgers_and_inbox(stage1):
    handle_tool_uses([tool_use(repo="demo", issue="sq 고쳐줘")],
                     "unused.db", lambda s: True, stage1=stage1)
    handle_tool_uses([tool_use(repo="demo", issue="sq 제곱", test_src=FAILING)],
                     "unused.db", lambda s: True, stage1=stage1)
    ctx = snapshot_stage1(stage1["data_root"], stage1["tag"])
    assert "demo: 대기 1" in ctx
    assert "인박스(재현 테스트 대기): 1건" in ctx
