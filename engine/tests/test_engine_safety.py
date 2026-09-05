"""Alpha step 3: safety policy and workspace isolation.

Acceptance conditions 5 (zero writes outside isolation) and 6 (zero
dangerous commands) are only credible if the refusals are tested
exhaustively, so the blocked cases are enumerated rather than
sampled.
"""

import os
import subprocess

import pytest

from genesis.rookery.engine.isolation import (
    IsolationError, Workspace, recover_workspaces)
from genesis.rookery.engine.safety import (
    AuditedPolicy, C_DEPLOY, C_DESTRUCTIVE, C_EXE, C_GIT, C_PAYMENT,
    C_PUSH, C_SECRET, C_SHELL, SafetyPolicy)
from genesis.rookery.engine.store import Store


@pytest.fixture()
def policy():
    return SafetyPolicy()


# ------------------------------------------------------ command policy


@pytest.mark.parametrize("cmd", [
    ["python", "-m", "pytest", "tests/test_x.py"],
    ["pytest", "-q"],
    ["git", "status", "--porcelain"],
    ["git", "diff", "--cached"],
    ["git", "add", "-A"],
    ["git", "commit", "-m", "fix"],
    ["git", "worktree", "prune"],
])
def test_allowed_commands(policy, cmd):
    assert policy.check_command(cmd).allowed, cmd


@pytest.mark.parametrize("cmd,code", [
    (["rm", "-rf", "/"], C_DESTRUCTIVE),
    (["python", "-c", "import os; rm -rf x"], C_DESTRUCTIVE),
    (["shutdown", "/s"], C_DESTRUCTIVE),
    (["dd", "if=/dev/zero", "of=/dev/sda"], C_DESTRUCTIVE),
    (["mkfs.ext4", "/dev/sda1"], C_DESTRUCTIVE),
    (["sudo", "pytest"], C_PAYMENT),
    (["chmod", "777", "/etc"], C_PAYMENT),
    (["useradd", "bob"], C_PAYMENT),
    (["docker", "push", "img"], C_DEPLOY),
    (["kubectl", "apply", "-f", "x.yaml"], C_DEPLOY),
    (["ssh", "host", "ls"], C_DEPLOY),
    (["curl", "https://example.com"], C_DEPLOY),
    (["npm", "publish"], C_DEPLOY),
    (["gh", "pr", "merge"], C_DEPLOY),
    (["bash", "-c", "ls"], C_EXE),
    (["powershell", "-Command", "ls"], C_EXE),
    (["make", "install"], C_EXE),
])
def test_blocked_commands(policy, cmd, code):
    v = policy.check_command(cmd)
    assert not v.allowed and v.code == code, (cmd, v)


@pytest.mark.parametrize("cmd", [
    "pytest -q | tee out.txt",
    "git status && rm -rf .",
    "pytest; shutdown",
    "python x.py > /etc/passwd",
    "python -c `whoami`",
])
def test_shell_metacharacters_blocked(policy, cmd):
    v = policy.check_command(cmd)
    assert not v.allowed and v.code == C_SHELL


@pytest.mark.parametrize("path", [
    ".env", "../.env.local", "~/.ssh/id_rsa", "/home/u/.aws/credentials",
    "secrets.yaml", "credentials.json", ".git-credentials",
    "service_account_key.json", ".npmrc",
])
def test_secret_paths_blocked(policy, path):
    assert not policy.check_path_arg(path).allowed
    v = policy.check_command(["python", path])
    assert not v.allowed and v.code == C_SECRET


@pytest.mark.parametrize("sub", [
    "remote", "config", "submodule", "filter-branch", "reset",
    "rebase", "cherry-pick", "reflog", "send-email", "credential",
])
def test_git_subcommands_blocked(policy, sub):
    v = policy.check_command(["git", sub, "x"])
    assert not v.allowed and v.code == C_GIT


def test_git_unknown_subcommand_blocked(policy):
    v = policy.check_command(["git", "bisect", "start"])
    assert not v.allowed and v.code == C_GIT


@pytest.mark.parametrize("argv", [
    ["git", "push", "origin", "main"],
    ["git", "push", "origin", "master"],
    ["git", "push", "origin", "HEAD:main"],
    ["git", "push", "--force", "origin", "rookery/t1"],
    ["git", "push", "--delete", "origin", "rookery/t1"],
    ["git", "push", "origin", "feature/x"],
    ["git", "push"],
])
def test_push_restrictions(policy, argv):
    v = policy.check_command(argv)
    assert not v.allowed and v.code == C_PUSH, argv


def test_push_to_isolation_branch_allowed(policy):
    assert policy.check_command(
        ["git", "push", "origin", "rookery/t1"]).allowed


def test_auto_merge_disabled_in_alpha(policy):
    assert policy.auto_merge is False
    v = policy.check_merge("main")
    assert not v.allowed and "자동 머지 비활성화" in v.reason
    assert not policy.check_merge("anything").allowed


def test_audited_policy_logs_every_decision(tmp_path):
    store = Store(str(tmp_path / "e.db"))
    audited = AuditedPolicy(SafetyPolicy(), store)
    assert audited.check_command(["pytest", "-q"], task_id="t1").allowed
    assert not audited.check_command(["rm", "-rf", "/"],
                                     task_id="t1").allowed
    kinds = [e["kind"] for e in store.events()]
    assert "command_allowed" in kinds and "command_blocked" in kinds
    assert audited.blocked_count() == 1
    store.close()


# ---------------------------------------------------------- workspace


@pytest.fixture()
def repo(tmp_path):
    path = tmp_path / "repo"
    path.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q"], cwd=path, check=True)
    (path / "mod.py").write_text("def f():\n    return 1\n",
                                 encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=path, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=path,
                   env=env, check=True)
    return str(path)


def test_workspace_is_separate_checkout(repo, tmp_path):
    with Workspace(repo, "t1", str(tmp_path / "work")) as ws:
        ws.write_text("mod.py", "def f():\n    return 2\n")
        assert "return 2" in ws.read_text("mod.py")
        # the human checkout is untouched
        assert "return 1" in open(os.path.join(repo, "mod.py"),
                                  encoding="utf-8").read()
        assert ws.branch == "rookery/t1"


@pytest.mark.parametrize("escape", [
    "../outside.py", "../../outside.py", "sub/../../outside.py",
    ".git/hooks/pre-commit", ".git/config", "sub/../.git/x",
])
def test_writes_outside_workspace_refused(repo, tmp_path, escape):
    with Workspace(repo, "t2", str(tmp_path / "work")) as ws:
        assert not ws.contains(escape)
        with pytest.raises(IsolationError):
            ws.write_text(escape, "x")


def test_absolute_outside_path_refused(repo, tmp_path):
    outside = str(tmp_path / "elsewhere.txt")
    with Workspace(repo, "t3", str(tmp_path / "work")) as ws:
        assert not ws.contains(outside)
        with pytest.raises(IsolationError):
            ws.write_text(outside, "x")
        assert not os.path.exists(outside)


def test_symlink_escape_refused(repo, tmp_path):
    target = tmp_path / "secret_dir"
    target.mkdir()
    with Workspace(repo, "t4", str(tmp_path / "work")) as ws:
        link = os.path.join(ws.path, "link")
        try:
            os.symlink(str(target), link, target_is_directory=True)
        except (OSError, NotImplementedError):
            pytest.skip("symlink creation not permitted here")
        assert not ws.contains("link/leak.txt")
        with pytest.raises(IsolationError):
            ws.write_text("link/leak.txt", "x")


def test_inside_paths_allowed(repo, tmp_path):
    with Workspace(repo, "t5", str(tmp_path / "work")) as ws:
        assert ws.contains("mod.py")
        assert ws.contains("pkg/sub/new.py")
        ws.write_text("pkg/sub/new.py", "x = 1\n")
        assert os.path.isfile(os.path.join(ws.path, "pkg", "sub",
                                           "new.py"))


def test_run_enforces_policy(repo, tmp_path):
    with Workspace(repo, "t6", str(tmp_path / "work")) as ws:
        with pytest.raises(IsolationError):
            ws.run(["rm", "-rf", "."])
        r = ws.run(["git", "status", "--porcelain"])
        assert r.returncode == 0


def test_diff_and_commit(repo, tmp_path):
    with Workspace(repo, "t7", str(tmp_path / "work")) as ws:
        ws.write_text("mod.py", "def f():\n    return 42\n")
        d = ws.diff()
        assert d.files == ["mod.py"] and d.insertions >= 1
        assert ws.commit("alpha: change f")
        assert ws.dirty_files() == []


def test_reset_discards_changes(repo, tmp_path):
    with Workspace(repo, "t8", str(tmp_path / "work")) as ws:
        ws.write_text("mod.py", "broken(")
        ws.write_text("junk.txt", "x")
        ws.reset()
        assert "return 1" in ws.read_text("mod.py")
        assert ws.dirty_files() == []


def test_destroy_is_idempotent_and_removes_branch(repo, tmp_path):
    ws = Workspace(repo, "t9", str(tmp_path / "work")).create()
    ws.destroy()
    ws.destroy()                                   # after a crash
    assert not os.path.exists(ws.path)
    branches = subprocess.run(["git", "branch", "--list", ws.branch],
                              cwd=repo, capture_output=True,
                              text=True).stdout
    assert branches.strip() == ""


def test_recover_workspaces_cleans_orphans(repo, tmp_path):
    root = str(tmp_path / "work")
    Workspace(repo, "live", root).create()
    Workspace(repo, "dead", root).create()
    cleaned = recover_workspaces(repo, root, active_task_ids={"live"})
    assert cleaned == ["dead"]
    assert os.path.exists(os.path.join(root, "live"))
    assert not os.path.exists(os.path.join(root, "dead"))
