"""B-corpus task freeze (design §8.3): the four machine-proven
selector-event tasks, built MECHANICALLY from their mining manifests.

Frozen partition rules:
- public repro = alphabetically first test among the passing sets of
  event-positive partial-fix probes
- hidden = every other fail->pass changed test
- smoke (selector regression) = first three test functions of the
  primary test file that exist at parent, are unchanged, and pass at
  parent (verified by selfcheck)
- regression_hidden = the changed test file(s), final validator only
- issue_summary = the public repro test's source with every answer-
  function name redacted (calibration-pilot convention)

  python -m genesis.rookery.tasks_b4 --selfcheck
      Mechanical admission check per task: repro fail->pass, hidden
      fail->pass, smoke passes at parent, and the selector event
      reproduces INSIDE the experiment harness (partial fix passes
      public+smoke while >= 1 hidden test fails).
"""

from __future__ import annotations

import ast
import json
import os
import re

from genesis.rookery.adapters.repo_tasks import (
    RepoTask, run_pytest, worktree_at)

DATA = "data"

# 8.3 re-registration (2026-08-02): three tasks - e0ee0c0f4 removed
# as a selector-event false positive (its discriminator fails at the
# fix commit too); module name kept for history
B4 = [
    ("b4_du_operators", "dateutil", "f42ee4c13",
     "https://github.com/dateutil/dateutil.git"),
    ("b4_mi_repeat", "more-itertools", "be5793a55",
     "https://github.com/more-itertools/more-itertools.git"),
    ("b4_mm_validationerror", "marshmallow", "99a2e4827",
     "https://github.com/marshmallow-code/marshmallow.git"),
]


def _manifest(repo: str, sha9: str) -> dict:
    import glob
    hits = glob.glob(os.path.join(DATA, "corpus_v2",
                                  f"{repo}_{sha9}*.json"))
    with open(hits[0], encoding="utf-8") as f:
        return json.load(f)


def _git_show(repo: str, ref_path: str) -> str:
    from genesis.rookery.mine import _run
    return _run(["git", "show", ref_path],
                os.path.join(DATA, "repos", repo)).stdout


def _redact(text: str, manifest: dict) -> str:
    for a in manifest["answer_functions"]:
        bare = a.split("::")[-1].lstrip("_")
        for variant in {a.split("::")[-1], bare, "_" + bare}:
            if variant:
                text = re.sub(rf"\b{re.escape(variant)}\b",
                              "target_function", text)
    return text


def _test_src(content: str, tid: str) -> str:
    name = tid.split("::")[-1]
    tree = ast.parse(content)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                and node.name == name:
            return ast.get_source_segment(content, node)
    return ""


def _smoke_ids(content: str, tf: str, changed: set[str],
               limit: int = 3) -> list[str]:
    """First test functions in file order, excluding changed names.
    Parent-side pass is enforced by selfcheck, not assumed."""
    tree = ast.parse(content)
    out = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                and node.name.startswith("test") \
                and node.name not in changed:
            out.append(f"{tf}::{node.name}")
        elif isinstance(node, ast.ClassDef):
            for sub in node.body:
                if isinstance(sub, (ast.FunctionDef,
                                    ast.AsyncFunctionDef)) \
                        and sub.name.startswith("test") \
                        and sub.name not in changed:
                    out.append(f"{tf}::{node.name}::{sub.name}")
        if len(out) >= limit:
            break
    return out[:limit]


def build_b4_tasks() -> list[RepoTask]:
    tasks = []
    for task_id, repo, sha9, url in B4:
        m = _manifest(repo, sha9)
        event_tests = sorted({
            t for p in m["partial_fix_probes"]
            if p.get("event_v2", p.get("event"))
            for t in p["passes_repro"]})
        public = event_tests[0]
        hidden = sorted(set(m["repro_tests"]) - {public})
        tf = public.split("::")[0]
        # ALL test-side files the commit touched ride along (the
        # dateutil event needs the fix-era _common.py; the
        # marshmallow decoy regresses a test in ANOTHER file)
        extra = {f: _git_show(repo, f"{m['fix_commit']}:{f}")
                 for f in m["test_files"]}
        fix_content = extra[tf]
        changed_names = {t.split("::")[-1] for t in m["added_tests"]}
        smoke = _smoke_ids(fix_content, tf, changed_names)
        # broad regression at CHANGED-TEST-CLASS granularity - whole
        # fix-era files can carry unrelated py-era failures
        broad = sorted({"::".join(t.split("::")[:2])
                        for t in m["added_tests"]})
        issue = ("다음 테스트가 실패한다 (테스트 대상 함수명은 "
                 "target_function으로 가려져 있다):\n"
                 + _redact(_test_src(fix_content, public), m))
        tasks.append(RepoTask(
            task_id=task_id,
            repo_url=url,
            repo_name=repo,
            parent_commit=m["parent_commit"],
            fix_commit=m["fix_commit"],
            files_changed=m["answer_files"],
            public_repro=[public],
            hidden=hidden,
            regression=smoke,
            regression_hidden=broad,
            extra_test_files=extra,
            issue_summary=issue,
        ))
    return tasks


# ------------------------------------------------------------ selfcheck


def _fix_bodies(repo: str,
                m: dict) -> dict[tuple[str, str | None, str], str]:
    """(rel, class_or_None, name) -> fix-side source segment. Class-
    aware: relativedelta.py defines __eq__ on TWO classes — a bare-
    name walk splices the wrong one (found via the 8.3 mock pilot)."""
    wanted = {tuple(a.split("::")) for a in m["answer_functions"]}
    out = {}
    for rel in {a.split("::")[0] for a in m["answer_functions"]}:
        def segments(content: str) -> dict[tuple, str]:
            tree = ast.parse(content)
            segs = {}
            for node in tree.body:
                if isinstance(node, (ast.FunctionDef,
                                     ast.AsyncFunctionDef)) \
                        and (rel, node.name) in wanted:
                    segs[(None, node.name)] = \
                        ast.get_source_segment(content, node)
                elif isinstance(node, ast.ClassDef):
                    for sub in node.body:
                        if isinstance(sub, (ast.FunctionDef,
                                            ast.AsyncFunctionDef)) \
                                and (rel, sub.name) in wanted:
                            segs[(node.name, sub.name)] = \
                                ast.get_source_segment(content, sub)
            return segs

        fix_segs = segments(_git_show(repo, f"{m['fix_commit']}:{rel}"))
        par_segs = segments(_git_show(repo,
                                      f"{m['parent_commit']}:{rel}"))
        for (cls, name), code in fix_segs.items():
            # keep only definitions the fix actually changed - name
            # collisions across classes (weekday.__eq__ vs
            # relativedelta.__eq__) otherwise pull in no-op bodies
            if par_segs.get((cls, name)) != code:
                out[(rel, cls, name)] = code
    return out


def selfcheck() -> None:
    from genesis.rookery.exp3a import _reset
    from genesis.rookery.mine import _splice_func

    print("=== B군 4과제 자체 검증 ===")
    problems = 0
    for task in build_b4_tasks():
        m = _manifest(task.repo_name, task.fix_commit[:9])
        wt_p = worktree_at(task, task.parent_commit, "work")
        wt_f = worktree_at(task, task.fix_commit, "fixcheck")
        _reset(wt_p, task)
        checks = []
        got, _ = run_pytest(wt_p, task.public_repro)
        checks.append(("공개 재현 부모 실패", got == "fail"))
        got, _ = run_pytest(wt_f, task.public_repro)
        checks.append(("공개 재현 정답 통과", got == "pass"))
        if task.hidden:
            got, _ = run_pytest(wt_p, task.hidden)
            checks.append(("hidden 부모 실패", got == "fail"))
            got, _ = run_pytest(wt_f, task.hidden)
            checks.append(("hidden 정답 통과", got == "pass"))
        got, _ = run_pytest(wt_p, task.regression)
        checks.append(("스모크 부모 통과", got == "pass"))
        got, _ = run_pytest(wt_f, task.regression_hidden)
        checks.append(("광역 회귀 정답 통과", got == "pass"))
        # the selector event inside the harness: apply the first
        # event probe's partial fix -> public+smoke pass, hidden fail
        event_probe = next(p for p in m["partial_fix_probes"]
                           if p.get("event_v2", p.get("event")))
        rel, name = event_probe["applied"].split("::")
        bodies = _fix_bodies(task.repo_name, m)
        code = next(c for (r, _, n), c in bodies.items()
                    if r == rel and n == name)
        _reset(wt_p, task)
        ok = _splice_func(wt_p, rel, name, code)
        checks.append(("부분 패치 적용", ok))
        if ok:
            got_pub, _ = run_pytest(wt_p, task.public_repro)
            got_smk, _ = run_pytest(wt_p, task.regression)
            checks.append(("사건: 부분패치 공개 통과",
                           got_pub == "pass"))
            checks.append(("사건: 부분패치 스모크 통과",
                           got_smk == "pass"))
            # the decoy must fail somewhere the FINAL validator sees:
            # hidden repro tests, or the broad changed-file regression
            fails = False
            if task.hidden:
                fails = run_pytest(wt_p, task.hidden)[0] == "fail"
            if not fails:
                fails = run_pytest(
                    wt_p, task.regression_hidden)[0] == "fail"
            checks.append(("사건: 부분패치 hidden/광역회귀 실패",
                           fails))
        _reset(wt_p, task)
        bad = [n for n, okc in checks if not okc]
        if bad:
            problems += len(bad)
            print(f"  !! {task.task_id}: {bad}")
        else:
            print(f"  {task.task_id}: OK "
                  f"(공개 1, hidden {len(task.hidden)}, "
                  f"스모크 {len(task.regression)})")
    print("판정:", "통과" if problems == 0 else f"실패 ({problems}건)")
    raise SystemExit(0 if problems == 0 else 1)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--selfcheck", action="store_true")
    args = parser.parse_args()
    if args.selfcheck:
        selfcheck()
    else:
        for t in build_b4_tasks():
            print(t.task_id, t.public_repro, len(t.hidden),
                  t.regression)
