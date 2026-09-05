"""Alpha engine: pull-request preparation (push-only, human opens PR).

Spec: the engine may open a PR but never merges to an operating
branch. The chosen shape (operator decision 2026-08-04) is stronger:
the engine does not even create the PR. It pushes the isolation
branch and hands a human everything needed to open one - the branch,
the base, a title, a body with the test evidence, and the GitHub
"compare" URL that opens the PR form pre-filled.

Nothing here calls `gh` or the GitHub API (both are on the safety
denylist / require credentials the engine must not hold). The only
outward action is `git push` of a rookery/* branch, which the safety
policy already permits and re-checks.

A push failure does not fail the task. Validation and audit already
decided the change is good; delivery is a separate step, and a branch
that could not be pushed is still recorded as pending so a human can
push it by hand. The daily report lists every branch awaiting review.
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass, field

from genesis.rookery.engine.isolation import Workspace
from genesis.rookery.engine.safety import AuditedPolicy


def _run(argv: list[str], cwd: str, timeout: int = 120):
    return subprocess.run(argv, cwd=cwd, capture_output=True,
                          text=True, encoding="utf-8",
                          errors="replace", timeout=timeout)


def compare_url(remote_url: str | None, base: str,
                branch: str) -> str | None:
    """GitHub 'open a PR' URL from a remote. Supports ssh and https
    forms; returns None for hosts we do not recognise so we never
    hand out a wrong link."""
    if not remote_url:
        return None
    u = remote_url.strip()
    m = re.match(r"git@github\.com:(.+?)(?:\.git)?$", u) or \
        re.match(r"https://github\.com/(.+?)(?:\.git)?$", u)
    if not m:
        return None
    slug = m.group(1)
    return (f"https://github.com/{slug}/compare/"
            f"{base}...{branch}?expand=1")


@dataclass
class PrRequest:
    task_id: str
    branch: str
    base: str
    title: str
    body: str
    commit: str = ""
    pushed: bool = False
    remote_url: str | None = None
    compare_url: str | None = None
    reason: str = ""

    def to_dict(self) -> dict:
        return {"task_id": self.task_id, "branch": self.branch,
                "base": self.base, "title": self.title,
                "body": self.body, "commit": self.commit,
                "pushed": self.pushed, "compare_url": self.compare_url,
                "reason": self.reason}


class LocalOnlyPrPreparer:
    """외부(남의) 저장소용: 푸시 절대 없음. 채택 브랜치는 로컬에 보존되고
    `pr_ready` 이벤트(pushed=False)로 사람 검토 큐에 남는다 - 스테이지 1
    ③의 PR 후보 큐가 이 이벤트를 읽는다. 08-22까지 tools/live_run0.py가
    임시 객체로 하던 일을 엔진 안으로."""

    def __init__(self, store=None, base: str = "HEAD"):
        self.store = store
        self.base = base

    def prepare(self, ws: Workspace, task_id: str, title: str,
                body: str) -> PrRequest:
        commit = _run(["git", "rev-parse", "HEAD"], ws.path
                      ).stdout.strip()
        req = PrRequest(task_id=task_id, branch=ws.branch, base=self.base,
                        title=title, body=body, commit=commit,
                        pushed=False,
                        reason="외부 저장소 - 푸시 없음, 사람 검토 대기")
        if self.store is not None:
            self.store.log(task_id, None, "pr_ready", req.to_dict())
        return req

    def pending(self, limit: int = 200) -> list[dict]:
        if self.store is None:
            return []
        return [json.loads(e["data"])
                for e in self.store.events("pr_ready", limit=limit)]


class PrPreparer:
    def __init__(self, store=None, remote: str = "origin",
                 base: str = "main"):
        self.store = store
        self.remote = remote
        self.base = base

    def _remote_url(self, repo: str) -> str | None:
        # read-only, engine-internal: not routed through the command
        # policy (which is for model-driven commands in the sandbox)
        r = _run(["git", "config", "--get",
                  f"remote.{self.remote}.url"], repo)
        url = r.stdout.strip()
        return url or None

    def build(self, ws: Workspace, task_id: str, title: str,
              body: str) -> PrRequest:
        commit = _run(["git", "rev-parse", "HEAD"], ws.path
                      ).stdout.strip()
        url = self._remote_url(ws.repo)
        return PrRequest(
            task_id=task_id, branch=ws.branch, base=self.base,
            title=title, body=body, commit=commit, remote_url=url,
            compare_url=compare_url(url, self.base, ws.branch))

    def prepare(self, ws: Workspace, task_id: str, title: str,
                body: str) -> PrRequest:
        """Push the branch and record a review-ready manifest. Never
        opens the PR."""
        req = self.build(ws, task_id, title, body)

        argv = ["git", "push", self.remote, ws.branch]
        verdict = (ws.policy.check_command(argv, task_id=task_id)
                   if isinstance(ws.policy, AuditedPolicy)
                   else ws.policy.check_command(argv))
        if not verdict.allowed:
            req.reason = f"push 거부: {verdict.reason}"
        elif req.remote_url is None:
            req.reason = "원격 없음 - 로컬 브랜치로 보존"
        else:
            r = _run(argv, ws.path)
            if r.returncode == 0:
                req.pushed = True
            else:
                req.reason = f"push 실패: {r.stderr[:200]}"

        if self.store is not None:
            self.store.log(task_id, None, "pr_ready", req.to_dict())
        return req

    # --------------------------------------------------------- report

    def pending(self, limit: int = 200) -> list[dict]:
        """Branches the engine pushed (or preserved) that a human has
        not yet turned into a merged PR. The engine cannot see merge
        state, so this lists what it produced; a human clears the
        backlog by opening and merging PRs."""
        if self.store is None:
            return []
        out = []
        for e in self.store.events("pr_ready", limit=limit):
            out.append(json.loads(e["data"]))
        return out


def pr_body(task_id: str, result: dict, verdict) -> str:
    """A review-ready description: what changed, and the machine
    evidence a reviewer would otherwise reconstruct by hand."""
    lines = [
        f"자동 생성 브랜치 (Rookery Alpha, 작업 {task_id})",
        "",
        "**변경 파일**: " + ", ".join(
            result.get("changed_files", [])) or "(없음)",
        "",
        "**검증 근거** (validator + auditor 통과):",
    ]
    for tid in getattr(verdict, "evidence_tests", []):
        before = verdict.before.get(tid, "?")
        after = verdict.after.get(tid, "?")
        lines.append(f"- `{tid}`: {before} → {after}")
    lines += [
        "",
        "이 브랜치는 사람이 검토 후 PR을 열어 병합해야 합니다. "
        "엔진은 운영 브랜치에 자동 병합하지 않습니다.",
    ]
    return "\n".join(lines)
