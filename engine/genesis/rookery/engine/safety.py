"""Alpha engine: safety policy (build order step 3).

Spec: dangerous commands, secret access, external deployment and
payment/permission changes are blocked; acceptance requires zero
dangerous commands executed and zero files modified outside the
isolation workspace.

**Allowlist, not denylist.** A denylist of `rm -rf` patterns loses to
the first spelling nobody thought of. Here an executable must be on
the allowlist to run at all, and the few allowlisted tools that can
still do damage (git) get their subcommands checked as well. Anything
unrecognised is denied, and a denial is a logged decision - never a
silent skip.

The policy is pure: it takes an argv and returns a verdict, so it can
be unit-tested exhaustively and reused by any executor.
"""

from __future__ import annotations

import os
import re
import shlex
from dataclasses import dataclass, field

# codes, kept distinct so the daily report can group refusals
C_OK = "allowed"
C_EXE = "exe_not_allowlisted"
C_GIT = "git_subcommand_blocked"
C_PUSH = "git_push_blocked"
C_SECRET = "secret_access_blocked"
C_DEPLOY = "external_deploy_blocked"
C_PAYMENT = "payment_or_permission_blocked"
C_DESTRUCTIVE = "destructive_command_blocked"
C_ESCAPE = "path_outside_workspace"
C_SHELL = "shell_metacharacter_blocked"

ALLOWED_EXES = frozenset({
    "python", "python3", "python.exe", "py",
    "pytest", "git", "git.exe",
})

GIT_ALLOWED = frozenset({
    "status", "diff", "add", "commit", "checkout", "switch",
    "worktree", "branch", "log", "show", "rev-parse", "ls-files",
    "stash", "apply", "restore", "clean", "fetch", "merge-base",
    "cat-file", "symbolic-ref", "push",          # push is re-checked
})
GIT_BLOCKED = frozenset({
    "remote", "config", "submodule", "filter-branch", "filter-repo",
    "reset", "rebase", "cherry-pick", "gc", "prune", "reflog",
    "update-ref", "am", "format-patch", "request-pull", "daemon",
    "credential", "credential-store", "instaweb", "send-email",
})

# operating branches the engine must never write to (Alpha: no auto
# merge to any of these, and no push to them at all)
PROTECTED_BRANCHES = frozenset({
    "main", "master", "develop", "release", "prod", "production",
})

SECRET_PATTERNS = tuple(re.compile(p, re.IGNORECASE) for p in (
    r"(^|[\\/])\.env(\.|$)", r"(^|[\\/])\.aws([\\/]|$)",
    r"(^|[\\/])\.ssh([\\/]|$)", r"id_rsa", r"id_ed25519",
    r"(^|[\\/])\.netrc$", r"(^|[\\/])\.npmrc$",
    r"(^|[\\/])\.pypirc$", r"credentials?\.(json|ya?ml|ini|txt)$",
    r"secrets?\.(json|ya?ml|ini|txt|env)$",
    r"(^|[\\/])\.git-credentials$", r"service[-_]account.*\.json$",
    r"(^|[\\/])\.claude([\\/]|$)", r"ANTHROPIC_API_KEY",
))

DEPLOY_TOKENS = frozenset({
    "docker", "kubectl", "helm", "terraform", "ansible", "ssh",
    "scp", "rsync", "aws", "gcloud", "az", "heroku", "fly",
    "vercel", "netlify", "npm", "yarn", "pnpm", "twine", "gh",
    "curl", "wget", "nc", "ncat", "telnet", "ftp",
})
PAYMENT_TOKENS = frozenset({
    "sudo", "su", "doas", "useradd", "usermod", "adduser",
    "chown", "chmod", "icacls", "setfacl", "passwd", "visudo",
    "stripe", "billing", "payment",
})
DESTRUCTIVE_PATTERNS = tuple(re.compile(p, re.IGNORECASE) for p in (
    r"\brm\b.*-[a-z]*[rf]", r"\brmdir\b", r"\bdel\b\s+/[sq]",
    r"\bformat\b", r"\bmkfs", r"\bdd\b\s+if=", r"\bshutdown\b",
    r"\breboot\b", r"\bhalt\b", r"\bkillall\b", r"\btaskkill\b",
    r"Remove-Item.*-Recurse", r"\bfdisk\b", r"\bdiskpart\b",
    r">\s*/dev/sd", r"\bchkdsk\b.*\/f",
))
SHELL_METACHARS = tuple("|&;`$><")


@dataclass
class Verdict:
    allowed: bool
    code: str = C_OK
    reason: str = ""
    detail: dict = field(default_factory=dict)

    def __bool__(self) -> bool:                # `if policy.check(...)`
        return self.allowed


def _base(exe: str) -> str:
    return os.path.basename(exe).lower()


@dataclass
class SafetyPolicy:
    """Alpha defaults. `auto_merge` is a constant False by spec - the
    engine may open a PR but never merges to an operating branch."""

    workspace: str | None = None
    allow_push: bool = True
    auto_merge: bool = False          # spec: disabled in Alpha
    allowed_exes: frozenset[str] = ALLOWED_EXES

    # ---------------------------------------------------------- api

    def check_command(self, argv: list[str] | str) -> Verdict:
        if isinstance(argv, str):
            raw = argv
            try:
                argv = shlex.split(argv, posix=False)
            except ValueError:
                return Verdict(False, C_SHELL,
                               "명령 파싱 실패 (따옴표 불균형)")
            for ch in SHELL_METACHARS:
                if ch in raw:
                    return Verdict(False, C_SHELL,
                                   f"셸 메타문자 {ch!r} 금지 "
                                   f"(파이프·리다이렉트로 우회 가능)")
        if not argv:
            return Verdict(False, C_EXE, "빈 명령")

        joined = " ".join(argv)
        exe = _base(argv[0])

        for pat in DESTRUCTIVE_PATTERNS:
            if pat.search(joined):
                return Verdict(False, C_DESTRUCTIVE,
                               f"파괴적 명령 패턴: {pat.pattern}")
        stem = exe.removesuffix(".exe")
        if stem in PAYMENT_TOKENS:
            return Verdict(False, C_PAYMENT,
                           f"권한·결제 관련 명령 차단: {exe}")
        if stem in DEPLOY_TOKENS:
            return Verdict(False, C_DEPLOY,
                           f"외부 배포·네트워크 명령 차단: {exe}")
        if exe not in self.allowed_exes and \
                stem not in {e.removesuffix('.exe')
                             for e in self.allowed_exes}:
            return Verdict(False, C_EXE,
                           f"허용 목록에 없는 실행 파일: {exe}")

        for arg in argv[1:]:
            v = self.check_path_arg(arg)
            if not v.allowed:
                return v

        if stem == "git":
            return self._check_git(argv)
        return Verdict(True)

    def check_path_arg(self, arg: str) -> Verdict:
        for pat in SECRET_PATTERNS:
            if pat.search(arg):
                return Verdict(False, C_SECRET,
                               f"비밀정보 경로 접근 차단: {arg}")
        return Verdict(True)

    def _check_git(self, argv: list[str]) -> Verdict:
        sub = next((a for a in argv[1:] if not a.startswith("-")),
                   None)
        if sub is None:
            return Verdict(True)
        if sub in GIT_BLOCKED:
            return Verdict(False, C_GIT,
                           f"git {sub} 차단 (원격·이력 조작 위험)")
        if sub not in GIT_ALLOWED:
            return Verdict(False, C_GIT,
                           f"허용되지 않은 git 하위 명령: {sub}")
        if sub == "push":
            return self._check_push(argv)
        return Verdict(True)

    def _check_push(self, argv: list[str]) -> Verdict:
        if not self.allow_push:
            return Verdict(False, C_PUSH, "push 비활성화")
        if any(a in ("-f", "--force", "--force-with-lease",
                     "--mirror", "--delete", "-d") for a in argv):
            return Verdict(False, C_PUSH,
                           "강제·삭제 push 금지")
        rest = [a for a in argv[2:] if not a.startswith("-")]
        refs = rest[1:] if len(rest) > 1 else []
        for ref in refs:
            target = ref.split(":")[-1].removeprefix("refs/heads/")
            if target.lower() in PROTECTED_BRANCHES:
                return Verdict(False, C_PUSH,
                               f"보호 브랜치 push 금지: {target}")
            if not target.startswith("rookery/"):
                return Verdict(False, C_PUSH,
                               f"격리 브랜치(rookery/*)만 push 가능: "
                               f"{target}")
        if not refs:
            return Verdict(False, C_PUSH,
                           "push 대상 브랜치를 명시해야 함 "
                           "(기본 refspec 금지)")
        return Verdict(True)

    # ------------------------------------------------------ merging

    def check_merge(self, target_branch: str) -> Verdict:
        """Alpha never merges to an operating branch - PR only."""
        if not self.auto_merge:
            return Verdict(False, C_PUSH,
                           "Alpha에서 운영 브랜치 자동 머지 비활성화 "
                           "(PR 생성까지만)")
        if target_branch.lower() in PROTECTED_BRANCHES:
            return Verdict(False, C_PUSH,
                           f"보호 브랜치 머지 금지: {target_branch}")
        return Verdict(True)


class AuditedPolicy:
    """SafetyPolicy + the ledger. Every decision is an event, so
    'zero dangerous commands executed' is auditable after the fact
    rather than asserted."""

    def __init__(self, policy: SafetyPolicy, store=None):
        self.policy = policy
        self.store = store

    def check_command(self, argv, task_id: str | None = None,
                      run_id: int | None = None) -> Verdict:
        v = self.policy.check_command(argv)
        if self.store is not None:
            shown = argv if isinstance(argv, str) else " ".join(argv)
            self.store.log(
                task_id, run_id,
                "command_allowed" if v.allowed else "command_blocked",
                {"command": shown[:500], "code": v.code,
                 "reason": v.reason})
        return v

    def blocked_count(self) -> int:
        if self.store is None:
            return 0
        return len(self.store.events("command_blocked", limit=10_000))
