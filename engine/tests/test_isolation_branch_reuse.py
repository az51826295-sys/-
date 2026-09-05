"""(b) 재검증: 같은 과제 id의 두 런 - 두 번째 런의 워크트리 생성이
첫 런의 채택 브랜치를 재설정·삭제했다 (toolz#496, 댕글링에서
복구). 점유된 브랜치는 비켜 가야 한다."""

import os
import subprocess

import pytest

from genesis.rookery.engine.isolation import BRANCH_PREFIX, Workspace


@pytest.fixture()
def repo(tmp_path):
    path = tmp_path / "repo"
    path.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=path,
                   check=True)
    (path / "a.py").write_text("x = 1\n", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=path, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=path,
                   env=env, check=True)
    return str(path)


def branches(repo):
    out = subprocess.run(["git", "branch", "--list", "rookery/*"],
                         cwd=repo, capture_output=True, text=True).stdout
    return sorted(b.strip("* ").strip() for b in out.splitlines())


def test_second_run_does_not_clobber_an_adopted_branch(tmp_path, repo):
    ws1 = Workspace(repo, "t1", str(tmp_path / "w1")).create()
    ws1.write_text("a.py", "x = 2\n")
    assert ws1.commit("rookery-agent: fix t1")
    ws1.destroy(delete_branch=False)              # adopted: branch kept
    first = ws1.branch
    assert first == BRANCH_PREFIX + "t1"

    ws2 = Workspace(repo, "t1", str(tmp_path / "w2")).create()
    assert ws2.branch != first, "점유된 채택 브랜치를 덮어쓰면 안 된다"
    ws2.destroy()                                  # failed: own branch gone
    assert first in branches(repo), "첫 런의 채택 커밋은 살아 있어야"
    assert ws2.branch not in branches(repo)
    head = subprocess.run(["git", "rev-parse", first], cwd=repo,
                          capture_output=True, text=True).stdout.strip()
    shown = subprocess.run(["git", "show", "--format=%s", "-s", head],
                           cwd=repo, capture_output=True,
                           text=True).stdout
    assert "fix t1" in shown


def test_empty_leftover_branch_is_reused(tmp_path, repo):
    ws1 = Workspace(repo, "t1", str(tmp_path / "w1")).create()
    ws1.destroy(delete_branch=False)              # nothing committed
    ws2 = Workspace(repo, "t1", str(tmp_path / "w2")).create()
    assert ws2.branch == BRANCH_PREFIX + "t1"
    ws2.destroy()
