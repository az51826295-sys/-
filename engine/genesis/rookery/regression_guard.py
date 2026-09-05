"""Regression protection layer for the Rookery engine.

Promoted from research to product on 2026-08-02 (design §8.5). What
§8.3 established, and what it did NOT:

- ESTABLISHED: on candidates that break previously-passing behavior,
  mapping the changed files/functions to existing repo tests and
  running them before champion selection excluded 4/4 such
  candidates with zero over-rejection.
- NOT ESTABLISHED: a final-outcome improvement (below the frozen
  threshold, confounded by proposer sampling).
- INFORMATION BOUNDARY: a candidate that breaks nothing old but
  leaves part of the new requirement unmet is undetectable here -
  its discriminating tests are the hidden ones, which must never
  reach the selector. That is a boundary, not a defect.

So this ships as a *guard*, not as a quality booster: it is expected
to catch regressions cheaply and to be silent about incompleteness.

    guard = RegressionGuard(run_tests=my_runner, list_tests=my_lister)
    verdict = guard.check(worktree, changed=[("pkg/mod.py", "func")],
                          smoke_ids=fixed_smoke)
    if verdict.blocked:
        ...  # candidate is not eligible to become champion
"""

from __future__ import annotations

import ast
import os
import time
from dataclasses import dataclass, field
from typing import Callable, Iterable

# defaults chosen from the §8.3 measurements (mapped sets ran 3-6
# tests; the arm cost +110% test executions, +42% wall)
MAX_MAPPED_TESTS = 6
MAX_SECONDS = 120.0


@dataclass
class GuardVerdict:
    blocked: bool                       # exclude from champion?
    reason: str
    mapped_ids: list[str] = field(default_factory=list)
    failed_ids: list[str] = field(default_factory=list)
    used_fallback: bool = False         # mapping failed -> smoke only
    seconds: float = 0.0
    tests_run: int = 0


def map_tests(worktree: str, changed: Iterable[tuple[str, str]],
              list_test_files: Callable[[str], list[str]],
              cap: int = MAX_MAPPED_TESTS) -> list[str]:
    """Changed (file, symbol) pairs -> existing test ids that
    reference those symbols. Deterministic order, capped. Never
    generates tests; only selects existing ones."""
    targets = {sym for _, sym in changed if sym}
    targets |= {os.path.basename(f).removesuffix(".py")
                for f, _ in changed}
    ids: list[str] = []
    for path in sorted(list_test_files(worktree)):
        try:
            with open(os.path.join(worktree, path), encoding="utf-8",
                      errors="replace") as f:
                tree = ast.parse(f.read())
        except (OSError, SyntaxError):
            continue

        def refs(node) -> set[str]:
            out = set()
            for sub in ast.walk(node):
                if isinstance(sub, ast.Name):
                    out.add(sub.id)
                elif isinstance(sub, ast.Attribute):
                    out.add(sub.attr)
            return out

        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                    and node.name.startswith("test") \
                    and refs(node) & targets:
                ids.append(f"{path}::{node.name}")
            elif isinstance(node, ast.ClassDef):
                for sub in node.body:
                    if isinstance(sub, (ast.FunctionDef,
                                        ast.AsyncFunctionDef)) \
                            and sub.name.startswith("test") \
                            and refs(sub) & targets:
                        ids.append(f"{path}::{node.name}::{sub.name}")
            if len(ids) >= cap:
                return ids[:cap]
    return ids[:cap]


class RegressionGuard:
    """run_tests(worktree, ids) -> (outcome, detail) with outcome
    'pass' on success; list_test_files(worktree) -> repo test paths.
    baseline_ok caches which tests passed BEFORE the patch: a test
    already failing on the clean tree cannot indict a candidate."""

    def __init__(self, run_tests: Callable[[str, list[str]], tuple],
                 list_test_files: Callable[[str], list[str]],
                 max_tests: int = MAX_MAPPED_TESTS,
                 max_seconds: float = MAX_SECONDS):
        self.run_tests = run_tests
        self.list_test_files = list_test_files
        self.max_tests = max_tests
        self.max_seconds = max_seconds
        self._baseline: dict[tuple[str, str], bool] = {}

    def baseline_ok(self, clean_worktree: str, test_id: str) -> bool:
        key = (clean_worktree, test_id)
        if key not in self._baseline:
            self._baseline[key] = self.run_tests(
                clean_worktree, [test_id])[0] == "pass"
        return self._baseline[key]

    def check(self, worktree: str,
              changed: Iterable[tuple[str, str]],
              smoke_ids: list[str],
              clean_worktree: str | None = None,
              prescreen_passed: bool = True) -> GuardVerdict:
        """Only candidates that already passed the public repro and
        the fixed smoke reach the mapped stage (§8.3 rule 1: spend
        extra tests only on candidates that are still in the race)."""
        t0 = time.time()
        if not prescreen_passed:
            return GuardVerdict(False, "not_prescreened")

        mapped = map_tests(worktree, changed, self.list_test_files,
                           self.max_tests)
        if clean_worktree:
            mapped = [t for t in mapped
                      if self.baseline_ok(clean_worktree, t)]
        if not mapped:
            # frozen fallback: fixed smoke only, never arbitrary tests
            failed = [t for t in smoke_ids
                      if self.run_tests(worktree, [t])[0] != "pass"]
            return GuardVerdict(
                blocked=bool(failed),
                reason="no_mapped_regression_test",
                failed_ids=failed, used_fallback=True,
                seconds=round(time.time() - t0, 1),
                tests_run=len(smoke_ids))

        failed, ran = [], 0
        for tid in mapped:
            if time.time() - t0 > self.max_seconds:
                return GuardVerdict(
                    blocked=bool(failed), reason="time_budget_exceeded",
                    mapped_ids=mapped, failed_ids=failed,
                    seconds=round(time.time() - t0, 1), tests_run=ran)
            ran += 1
            if self.run_tests(worktree, [tid])[0] != "pass":
                failed.append(tid)
        return GuardVerdict(
            blocked=bool(failed),
            reason="regression_detected" if failed else "clean",
            mapped_ids=mapped, failed_ids=failed,
            seconds=round(time.time() - t0, 1), tests_run=ran)


def champion_rank(public_pass: bool, verdict: GuardVerdict | None) -> int:
    """Frozen selection order: public+smoke+guard-clean > public+smoke
    > any valid patch. A guard-blocked candidate is never eligible."""
    if not public_pass:
        return 0
    if verdict is not None and verdict.blocked:
        return 0
    return 2 if (verdict is not None and not verdict.blocked
                 and verdict.mapped_ids) else 1
