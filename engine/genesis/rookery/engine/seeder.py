"""Alpha engine: pytest-failure task seeder (self-supply of work).

Turns real test failures in a repo into fix tasks - but only the ones
that survive the intake gates, so the engine never learns its own
flaky tests, environment breakage, or unlocalizable failures as work.

The honest hard part (the research series' §9 location problem):
a plain assertion failure - `assert add(2, 3) == 5` - raises inside
the TEST, so the traceback points at the test file, not the buggy
source. We locate the file to patch by, in order:

  1. the deepest non-test frame in the traceback (works when the
     source actually raises), then
  2. resolving the first call in the failing assertion (`mod.func(`)
     through the test file's imports to a source file.

If neither locates a source file, the failure is still submitted, and
intake's value gate drops it as not-actionable. That is correct: the
code-fix handler needs a file to patch, and a failure we cannot place
is not a task. Unlocated failures are reported, not silently dropped.

Smoke tests come for free: the other tests in the same file that pass
right now become the set the fix must keep green.
"""

from __future__ import annotations

import ast
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field

from genesis.rookery.engine.intake import (
    FailureIntake, FailureRecord, ReproResult)

# a frame footer: `path.py:LINE:` optionally followed by `in func` or
# an exception name. Format-independent across pytest --tb styles.
FRAME = re.compile(r"^(.+?\.py):(\d+):", re.MULTILINE)
SUMMARY = re.compile(r"^FAILED (\S+?)(?: - (.*))?$", re.MULTILINE)
CALL = re.compile(r"([A-Za-z_][\w.]*)\s*\(")


def _is_test_path(path: str) -> bool:
    p = path.replace("\\", "/")
    base = os.path.basename(p)
    return (base.startswith("test_") or base.endswith("_test.py")
            or base == "conftest.py" or "/test" in f"/{p}".lower())


def _norm(path: str, repo: str) -> str:
    """Repo-relative, forward-slash. The §9.1 lesson: mixing separator
    styles silently empties every comparison."""
    p = path.replace("\\", "/")
    r = os.path.abspath(repo).replace("\\", "/")
    ap = os.path.abspath(os.path.join(repo, p)).replace("\\", "/") \
        if not os.path.isabs(path) else p
    if ap.startswith(r + "/"):
        return ap[len(r) + 1:]
    return p


def _run(argv: list[str], cwd: str, timeout: int = 300):
    return subprocess.run(argv, cwd=cwd, capture_output=True,
                          text=True, encoding="utf-8",
                          errors="replace", timeout=timeout)


@dataclass
class TestFailure:
    test_id: str
    message: str
    traceback: str
    test_file: str
    file: str | None = None          # source file to patch
    symbol: str | None = None
    located_by: str = ""


# --------------------------------------------------------- collection


def collect_failures(repo: str, target: str = "") -> list[TestFailure]:
    argv = [sys.executable, "-m", "pytest", "-q", "--no-header",
            "--tb=long", "-o", "addopts="]
    if target:
        argv.append(target)
    r = _run(argv, repo)
    out = r.stdout + "\n" + r.stderr
    messages = {tid: (msg or "").strip()
                for tid, msg in SUMMARY.findall(out)}
    blocks = _failure_blocks(out)
    failures = []
    for tid, msg in messages.items():
        block = blocks.get(_block_key(tid), "")
        tf = tid.split("::")[0]
        f = TestFailure(test_id=tid, message=msg or _first_error(block),
                        traceback=block, test_file=_norm(tf, repo))
        _locate(f, repo)
        failures.append(f)
    return failures


def _block_key(test_id: str) -> str:
    return test_id.split("::")[-1]


def _failure_blocks(out: str) -> dict[str, str]:
    """Split the FAILURES section into per-test blocks keyed by the
    test function name in the `___ name ___` header."""
    blocks: dict[str, str] = {}
    header = re.compile(r"^_+ (\S+) _+$", re.MULTILINE)
    section = out.split("= FAILURES =")
    if len(section) < 2:
        return blocks
    body = section[1]
    matches = list(header.finditer(body))
    for i, m in enumerate(matches):
        name = m.group(1).split("::")[-1]
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        blocks[name] = body[m.end():end]
    return blocks


def _first_error(block: str) -> str:
    for line in block.splitlines():
        if line.startswith("E "):
            return line[2:].strip()[:300]
    return "test failed"


def _enclosing_symbol(repo: str, rel: str, line: int) -> str | None:
    """The function/method that encloses `line` in a source file -
    format-independent, unlike scraping the symbol from pytest's
    frame header, which varies by --tb style and pytest version."""
    try:
        with open(os.path.join(repo, rel), encoding="utf-8",
                  errors="replace") as fh:
            tree = ast.parse(fh.read())
    except (OSError, SyntaxError):
        return None
    best, best_span = None, 1 << 30
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            end = getattr(node, "end_lineno", node.lineno)
            if node.lineno <= line <= end and end - node.lineno < best_span:
                best, best_span = node.name, end - node.lineno
    return best


def _locate(f: TestFailure, repo: str) -> None:
    # 1) deepest non-test frame footer -> source file + line, then the
    #    enclosing def gives the symbol
    for path, line in reversed(FRAME.findall(f.traceback)):
        rel = _norm(path, repo)
        if not _is_test_path(rel) and os.path.isfile(
                os.path.join(repo, rel)):
            f.file = rel
            f.symbol = _enclosing_symbol(repo, rel, int(line))
            f.located_by = "traceback"
            return
    # 2) resolve the failing call through the test file's imports
    located = _locate_via_call(f, repo)
    if located:
        f.file, f.symbol, f.located_by = *located, "import"


def _locate_via_call(f: TestFailure, repo: str):
    names = CALL.findall(f.traceback)
    if not names:
        return None
    imports = _imports(os.path.join(repo, f.test_file))
    for call in names:
        head = call.split(".")[0]
        sym = call.split(".")[-1]
        module = imports.get(head)
        if not module:
            continue
        path = _module_to_path(module, repo)
        if path:
            return path, sym
    return None


def _imports(test_path: str) -> dict[str, str]:
    """name-in-code -> module path. `import a.b` -> {'a': 'a.b'};
    `from a.b import c` -> {'c': 'a.b.c'}; aliases honored."""
    try:
        with open(test_path, encoding="utf-8", errors="replace") as fh:
            tree = ast.parse(fh.read())
    except (OSError, SyntaxError):
        return {}
    out: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                out[a.asname or a.name.split(".")[0]] = a.name
        elif isinstance(node, ast.ImportFrom) and node.module:
            for a in node.names:
                out[a.asname or a.name] = f"{node.module}.{a.name}"
    return out


def _module_to_path(module: str, repo: str) -> str | None:
    parts = module.split(".")
    for take in range(len(parts), 0, -1):
        cand = os.path.join(*parts[:take]) + ".py"
        if os.path.isfile(os.path.join(repo, cand)):
            return cand.replace("\\", "/")
        pkg = os.path.join(*parts[:take], "__init__.py")
        if os.path.isfile(os.path.join(repo, pkg)):
            return pkg.replace("\\", "/")
    return None


def passing_tests(repo: str, test_file: str,
                  exclude: str, cap: int = 3) -> list[str]:
    """Sibling tests in the same file that pass now - the smoke set a
    fix must keep green."""
    r = _run([sys.executable, "-m", "pytest", "-q", "--no-header",
              "--tb=no", "-rA", "-o", "addopts=", test_file], repo)
    ids = []
    for line in r.stdout.splitlines():
        m = re.match(r"^PASSED (\S+)", line.strip())
        if m and m.group(1) != exclude:
            ids.append(m.group(1).replace("\\", "/"))
        if len(ids) >= cap:
            break
    return ids


# ------------------------------------------------------- seeding


@dataclass
class SeedSummary:
    collected: int = 0
    admitted: int = 0
    unlocated: int = 0
    rejected: dict = field(default_factory=dict)
    tasks: list = field(default_factory=list)


class FailureSeeder:
    def __init__(self, repo: str, store, intake: FailureIntake | None = None,
                 in_scope_prefixes: tuple[str, ...] = (),
                 repro_runs: int = 2):
        self.repo = repo
        self.store = store
        self.repro_runs = repro_runs
        self.intake = intake or FailureIntake(
            store, reproduce=self._reproduce)
        self._in_scope = in_scope_prefixes

    def _reproduce(self, f: FailureRecord) -> ReproResult:
        tid = f.test_id
        fails = 0
        for _ in range(self.repro_runs):
            r = _run([sys.executable, "-m", "pytest", "-x", "-q",
                      "--no-header", "--tb=no", "-o", "addopts=", tid],
                     self.repo)
            if r.returncode != 0:
                fails += 1
        return ReproResult(
            reproduced=fails > 0, runs=self.repro_runs, failures=fails,
            flaky=0 < fails < self.repro_runs)

    def _record(self, tf: TestFailure) -> FailureRecord:
        smoke = passing_tests(self.repo, tf.test_file, tf.test_id) \
            if tf.file else []
        return FailureRecord(
            source="test", kind="test_failure", message=tf.message,
            test_id=tf.test_id, file=tf.file,
            task_kind="fix" if tf.file else "fix_failure",
            task_payload={
                "file": tf.file, "repro_tests": [tf.test_id],
                "smoke_tests": smoke, "issue": tf.message,
                "focus_symbols": [tf.symbol] if tf.symbol else [],
                "symbol": tf.symbol, "test_id": tf.test_id,
                "change_kind": "code", "files_in_scope": 1,
                "covered_by_tests": True} if tf.file else {})

    def seed(self, target: str = "",
             priority: int = 0) -> SeedSummary:
        summary = SeedSummary()
        failures = collect_failures(self.repo, target)
        summary.collected = len(failures)
        for tf in failures:
            if tf.file is None:
                # no file to patch -> not a fix task by definition.
                # log it (reported, not silently dropped) and skip;
                # the code-fix handler has nothing to act on.
                summary.unlocated += 1
                self.store.log(None, None, "seed_unlocated",
                               {"test_id": tf.test_id,
                                "message": tf.message[:200]})
                continue
            rec = self._record(tf)
            decision = self.intake.submit(rec, priority=priority)
            if decision.admitted:
                summary.admitted += 1
                summary.tasks.append(decision.task_id)
            else:
                summary.rejected[decision.code] = \
                    summary.rejected.get(decision.code, 0) + 1
        self.store.log(None, None, "seed_run", {
            "collected": summary.collected,
            "admitted": summary.admitted,
            "unlocated": summary.unlocated,
            "rejected": summary.rejected})
        return summary
