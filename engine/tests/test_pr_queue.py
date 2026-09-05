"""스테이지 1 ③: PR 후보 큐 - 채택 과제 → 초안·푸시 명령·compare 링크,
상태 추적, 저장소별 집계. 네트워크 없음."""

import json
import os
import subprocess

import pytest

from genesis.rookery.engine import prqueue
from genesis.rookery.engine.store import Store


@pytest.fixture()
def world(tmp_path):
    repos = tmp_path / "repos"
    head = repos / "demo_head"
    head.mkdir(parents=True)
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    run = lambda *a: subprocess.run(list(a), cwd=head, env=env, check=True,
                                    capture_output=True)
    run("git", "init", "-q", "-b", "main")
    (head / "mod.py").write_text("x = 1\n", encoding="utf-8")
    run("git", "add", "-A")
    run("git", "commit", "-qm", "init")
    run("git", "checkout", "-qb", "rookery/live-demo_7")
    (head / "mod.py").write_text("x = 2\n", encoding="utf-8")
    run("git", "commit", "-qam", "rookery-agent: fix live-demo_7")
    run("git", "checkout", "-q", "main")

    data = tmp_path / "data"
    db = data / "t" / "demo" / "engine.db"
    db.parent.mkdir(parents=True)
    store = Store(str(db))
    store.add_task("live-demo_7", "agent_fix", {
        "issue": "[x/demo#7] x should be 2",
        "repro_tests": ["test_intake_demo_7.py"]})
    task = store.claim("w")
    store.complete(task, {"adopted": True, "branch": "rookery/live-demo_7",
                          "tier": "smart", "steps": 5,
                          "changed_files": ["mod.py"]}, cost_usd=0.5)
    # a rejected task must not appear
    store.add_task("live-demo_8", "agent_fix", {"issue": "[x/demo#8] nope"},
                   max_attempts=1)
    t8 = store.claim("w")
    store.fail(t8, "validator rejected")
    store.close()
    return str(data), str(repos)


def test_collect_builds_drafts_from_adopted_tasks(world):
    data, repos = world
    cands = prqueue.collect(data, ["t"], repos, {"demo": "x/demo"},
                            fork_owner="me", base_of={"demo": "main"})
    assert [c.task_id for c in cands] == ["live-demo_7"]
    c = cands[0]
    assert c.issue == 7 and c.issue_title == "x should be 2"
    assert c.commit and c.files == ["mod.py"]
    assert c.draft_title == "x should be 2 (#7)"
    assert "test_intake_demo_7.py" in c.draft_body
    assert "Rookery Alpha" in c.draft_body
    assert c.push_cmd.endswith("push fork rookery/live-demo_7")
    assert c.compare_url.startswith(
        "https://github.com/x/demo/compare/main...me:demo:rookery/live-demo_7"
        "?quick_pull=1&title=")
    assert c.state == "new"


def test_state_marks_and_render(world, tmp_path):
    data, repos = world
    state_path = str(tmp_path / "state.json")
    state = prqueue.load_state(state_path)
    md = prqueue.render_markdown(prqueue.collect(
        data, ["t"], repos, {"demo": "x/demo"}, "me", state=state))
    assert "[new] x/demo#7" in md
    prqueue.mark(state, "live-demo_7", "submitted",
                 "https://github.com/x/demo/pull/1")
    prqueue.save_state(state, state_path)
    state2 = prqueue.load_state(state_path)
    cands = prqueue.collect(data, ["t"], repos, {"demo": "x/demo"}, "me",
                            state=state2)
    assert cands[0].state == "submitted"
    md2 = prqueue.render_markdown(cands)
    assert "(열린 후보 없음)" in md2 and "pull/1" in md2
    with pytest.raises(ValueError):
        prqueue.mark(state, "live-demo_7", "bogus")


def test_missing_branch_is_reported_not_hidden(world):
    data, repos = world
    subprocess.run(["git", "branch", "-D", "rookery/live-demo_7"],
                   cwd=os.path.join(repos, "demo_head"), check=True,
                   capture_output=True)
    c = prqueue.collect(data, ["t"], repos, {"demo": "x/demo"}, "me")[0]
    assert c.commit == "" and "브랜치 없음" in c.note


def test_summary_per_repo(world):
    data, repos = world
    rows = prqueue.summary(data, ["t"])
    assert len(rows) == 1
    r = rows[0]
    assert r["repo"] == "demo" and r["adopted"] == 1
    assert r["succeeded"] == 1 and r["failed"] == 1
    assert r["usd"] == 0.0 and r["halted"] is False
