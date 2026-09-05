"""Alpha engine: task isolation (build order step 3).

Spec condition 8 (git temp branch / worktree isolation) and
acceptance condition 5 (zero file modifications outside isolation).

One task, one worktree, one throwaway branch `rookery/<task-id>`.
Nothing the engine does touches the checkout a human works in, and
every write goes through `resolve()`, which refuses any path that
escapes the workspace after symlinks are resolved - `..`, an absolute
path elsewhere, or a symlink pointing out all fail the same way.

`.git` inside the worktree is off limits too: a write to `.git/hooks`
would execute on the next git command, which is an escape with extra
steps.

Cleanup is idempotent and safe to run after a crash, because the
worktree is identified by the task id, not by in-memory state.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass

from genesis.rookery.engine.safety import (
    AuditedPolicy, SafetyPolicy, Verdict, C_ESCAPE)

BRANCH_PREFIX = "rookery/"


class IsolationError(RuntimeError):
    pass


def _run(argv: list[str], cwd: str, timeout: int = 300):
    return subprocess.run(argv, cwd=cwd, capture_output=True,
                          text=True, encoding="utf-8",
                          errors="replace", timeout=timeout)


@dataclass
class Diff:
    files: list[str]
    text: str
    insertions: int = 0
    deletions: int = 0


class Workspace:
    """A git worktree scoped to one task."""

    def __init__(self, repo: str, task_id: str, root: str,
                 base: str = "HEAD",
                 policy: SafetyPolicy | AuditedPolicy | None = None):
        self.repo = os.path.abspath(repo)
        self.task_id = task_id
        self.branch = BRANCH_PREFIX + task_id
        self.path = os.path.abspath(os.path.join(root, task_id))
        self.base = base
        self.policy = policy or SafetyPolicy()
        self._real: str | None = None

    # ------------------------------------------------------ lifecycle

    def create(self) -> "Workspace":
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        if os.path.exists(self.path):
            self._real = os.path.realpath(self.path)
            return self
        self.branch = self._free_branch()
        r = _run(["git", "worktree", "add", "--force", "-B",
                  self.branch, self.path, self.base], self.repo)
        if r.returncode != 0:
            raise IsolationError(
                f"worktree 생성 실패: {r.stderr[:300]}")
        self._real = os.path.realpath(self.path)
        return self

    def _free_branch(self) -> str:
        """같은 과제 id의 이전 런이 남긴 채택 브랜치를 덮어쓰지
        않는다. (b) 재검증: A팔의 `-B` 재설정이 B팔의 toolz#496
        채택 브랜치를 지워 댕글링 커밋에서 복구해야 했다. base 밖
        커밋이 있는 브랜치는 점유 중 - 접미사 -2, -3…으로 비킨다."""
        name = BRANCH_PREFIX + self.task_id
        cand, n = name, 1
        while True:
            exists = _run(["git", "rev-parse", "--verify", "--quiet",
                           "refs/heads/" + cand], self.repo)
            if exists.returncode != 0:
                return cand
            ahead = _run(["git", "rev-list", "--count",
                          f"{self.base}..{cand}"], self.repo)
            if (ahead.stdout or "").strip() in ("", "0"):
                return cand                      # 빈 브랜치 - 재사용
            n += 1
            cand = f"{name}-{n}"

    def destroy(self, delete_branch: bool = True) -> None:
        """Idempotent: safe to call on a workspace a crashed worker
        left behind."""
        _run(["git", "worktree", "remove", "--force", self.path],
             self.repo)
        if os.path.exists(self.path):
            shutil.rmtree(self.path, ignore_errors=True)
        _run(["git", "worktree", "prune"], self.repo)
        if delete_branch:
            _run(["git", "branch", "-D", self.branch], self.repo)

    def __enter__(self) -> "Workspace":
        return self.create()

    def __exit__(self, *exc) -> None:
        self.destroy()

    # ---------------------------------------------------- containment

    @property
    def real(self) -> str:
        if self._real is None:
            self._real = os.path.realpath(self.path)
        return self._real

    def contains(self, path: str) -> bool:
        """True only if `path` resolves inside the workspace and is
        not under .git. Resolution happens on the nearest existing
        ancestor, so a not-yet-created file is judged by where it
        would land."""
        target = path if os.path.isabs(path) \
            else os.path.join(self.path, path)
        probe = os.path.abspath(target)
        while not os.path.exists(probe):
            parent = os.path.dirname(probe)
            if parent == probe:
                break
            probe = parent
        real_probe = os.path.realpath(probe)
        rest = os.path.relpath(os.path.abspath(target),
                               os.path.abspath(probe))
        resolved = os.path.normpath(os.path.join(real_probe, rest))
        try:
            rel = os.path.relpath(resolved, self.real)
        except ValueError:                       # different drive
            return False
        if rel == os.pardir or rel.startswith(os.pardir + os.sep):
            return False
        parts = rel.replace("\\", "/").split("/")
        return ".git" not in parts

    def resolve(self, relative: str) -> str:
        """Workspace-relative path -> absolute, or refuse."""
        if not self.contains(relative):
            raise IsolationError(
                f"{C_ESCAPE}: 격리 밖 경로 거부 - {relative}")
        target = relative if os.path.isabs(relative) \
            else os.path.join(self.path, relative)
        return os.path.abspath(target)

    def write_text(self, relative: str, content: str) -> str:
        p = self.resolve(relative)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8", newline="") as f:
            f.write(content)
        return p

    def read_text(self, relative: str) -> str:
        with open(self.resolve(relative), encoding="utf-8",
                  errors="replace") as f:
            return f.read()

    # ---------------------------------------------------- execution

    def run(self, argv: list[str], task_id: str | None = None,
            timeout: int = 300):
        """Every subprocess passes the safety policy first and runs
        with the workspace as cwd."""
        check = self.policy.check_command
        verdict: Verdict = (check(argv, task_id=task_id or self.task_id)
                            if isinstance(self.policy, AuditedPolicy)
                            else check(argv))
        if not verdict.allowed:
            raise IsolationError(f"{verdict.code}: {verdict.reason}")
        return _run(argv, self.path, timeout=timeout)

    # --------------------------------------------------------- git

    def dirty_files(self) -> list[str]:
        r = _run(["git", "status", "--porcelain"], self.path)
        return sorted(line[3:].strip().strip('"')
                      for line in r.stdout.splitlines() if line.strip())

    def diff(self) -> Diff:
        _run(["git", "add", "-A"], self.path)
        r = _run(["git", "diff", "--cached"], self.path)
        stat = _run(["git", "diff", "--cached", "--numstat"], self.path)
        files, ins, dele = [], 0, 0
        for line in stat.stdout.splitlines():
            parts = line.split("\t")
            if len(parts) != 3:
                continue
            a, d, name = parts
            files.append(name)
            ins += int(a) if a.isdigit() else 0
            dele += int(d) if d.isdigit() else 0
        return Diff(files=files, text=r.stdout, insertions=ins,
                    deletions=dele)

    def commit(self, message: str) -> bool:
        _run(["git", "add", "-A"], self.path)
        r = _run(["git", "-c", "user.name=rookery-alpha",
                  "-c", "user.email=alpha@rookery.local",
                  "commit", "-m", message], self.path)
        return r.returncode == 0

    def reset(self) -> None:
        """Throw away everything the task did, keep the workspace."""
        _run(["git", "checkout", "--", "."], self.path)
        _run(["git", "clean", "-fdx"], self.path)


def recover_workspaces(repo: str, root: str,
                       active_task_ids: set[str]) -> list[str]:
    """Startup sweep: worktrees whose task is no longer active are
    residue from a killed worker. Returns the ids cleaned up."""
    if not os.path.isdir(root):
        return []
    cleaned = []
    for name in sorted(os.listdir(root)):
        if name in active_task_ids:
            continue
        ws = Workspace(repo, name, root)
        ws.destroy()
        cleaned.append(name)
    return cleaned


def open_pr_branch(ws: Workspace, remote: str = "origin") -> Verdict:
    """Push the isolation branch so a human can review a PR. Alpha
    never merges - `SafetyPolicy.check_merge` refuses by design."""
    argv = ["git", "push", remote, ws.branch]
    verdict = (ws.policy.check_command(argv, task_id=ws.task_id)
               if isinstance(ws.policy, AuditedPolicy)
               else ws.policy.check_command(argv))
    if not verdict.allowed:
        return verdict
    r = _run(argv, ws.path)
    if r.returncode != 0:
        return Verdict(False, "push_failed", r.stderr[:300])
    return Verdict(True, detail={"branch": ws.branch})
