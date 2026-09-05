"""INC-event reclassification of the existing corpus (design §9).

No API spend: this only re-runs pytest against the already-mined
manifests. For every partial-fix probe it checks the four frozen
conditions:

  (a) >= 1 public repro test passes
  (b) the fixed smoke set passes
  (c) EVERY repo-native test that passed at the parent still passes
      (no regression - this is what excludes the §8.3 mm archetype)
  (d) >= 1 fix-commit test fails, and that test passes under the
      true fix (discriminating power)

Operationalization of (c), recorded honestly: the "repo-native tests
that passed at the parent" are the commit's own test files, run in
full at the parent commit. That is the same granularity §8.3 used
for broad regression - bounded and repo-native, not the entire suite.

  python -m genesis.rookery.classify_inc            # all candidates
  python -m genesis.rookery.classify_inc --repo X --sha Y
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import subprocess
import sys

from genesis.rookery.mine import (
    _abs_imports, _changed_tests, _extract_module, _run, _splice_func,
    _wt)

DATA = "data"
OUT = os.path.join(DATA, "corpus_inc")
SMOKE_N = 3

# Reuse ban (§9) is enforced from the AUTO-DERIVED registry, never a
# hand-maintained array - that is what leaked in incident #3.
from genesis.rookery.spent import is_spent as _is_spent_sha  # noqa: E402


def _is_spent(m: dict) -> bool:
    return _is_spent_sha(m["repo"], m["fix_commit"])


def _norm(test_id: str) -> str:
    """pytest on Windows reports node ids with backslashes while the
    manifests store forward slashes; comparing them raw silently
    empties every set intersection (found 2026-08-02 when condition
    (a) failed on a case that provably should pass)."""
    head, sep, tail = test_id.partition("::")
    return head.replace("\\", "/") + sep + tail


def run_file(wt: str, path: str) -> dict[str, str]:
    """Run one test file WITHOUT -x and return {test_id: outcome},
    node ids normalized to forward slashes."""
    env = None
    src = os.path.join(wt, "src")
    if os.path.isdir(src):
        env = dict(os.environ)
        env["PYTHONPATH"] = os.path.abspath(src) + os.pathsep \
            + env.get("PYTHONPATH", "")
    try:
        r = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "--no-header",
             "--tb=no", "-rA", "-o", "addopts=", path],
            cwd=wt, capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=300, env=env)
    except subprocess.TimeoutExpired:
        return {}
    out = {}
    for line in r.stdout.splitlines():
        m = re.match(r"^(PASSED|FAILED|ERROR)\s+(\S+)", line.strip())
        if m:
            out[_norm(m.group(2))] = m.group(1).lower()
    return out


def _prepare_parent(repo: str, m: dict) -> tuple[str, str, list[str]]:
    """Parent worktree with the commit's fix-era test files injected
    (import-rewritten). Returns (parent_wt, fix_wt, test_paths)."""
    wt_p = _wt(repo, m["parent_commit"], "parent")
    wt_f = _wt(repo, m["fix_commit"], "fix")
    paths = []
    for tf in m["test_files"]:
        src = os.path.join(wt_f, tf)
        if not os.path.isfile(src):
            continue
        with open(src, encoding="utf-8", errors="replace") as f:
            content = _abs_imports(f.read(), tf)
        dst = os.path.join(wt_p, tf)
        os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
        with open(dst, "w", encoding="utf-8", newline="") as f:
            f.write(content)
        paths.append(tf)
    return wt_p, wt_f, paths


def _fix_segments(repo: str, m: dict) -> dict[str, str]:
    """'rel::name' -> fix-side source, restricted to definitions the
    commit actually changed (the §8.3 name-collision lesson)."""
    import ast

    wanted = {tuple(a.split("::")) for a in m["answer_functions"]}
    out = {}
    for rel in {a.split("::")[0] for a in m["answer_functions"]}:
        def segs(text: str) -> dict:
            tree = ast.parse(text)
            found = {}
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef,
                                     ast.AsyncFunctionDef)) \
                        and (rel, node.name) in wanted:
                    found.setdefault(
                        node.name, ast.get_source_segment(text, node))
            return found

        fix_src = _run(["git", "show", f"{m['fix_commit']}:{rel}"],
                       os.path.join(DATA, "repos", repo)).stdout
        par_src = _run(["git", "show", f"{m['parent_commit']}:{rel}"],
                       os.path.join(DATA, "repos", repo)).stdout
        fseg, pseg = segs(fix_src), segs(par_src)
        for name, code in fseg.items():
            if pseg.get(name) != code:
                out[f"{rel}::{name}"] = code
    return out


def classify(repo: str, sha9: str) -> dict:
    hits = glob.glob(os.path.join(DATA, "corpus_v2",
                                  f"{repo}_{sha9}*.json"))
    if not hits:
        # scan-driven candidates have no manifest yet; mine it first
        # (git + pytest only, no API spend)
        from genesis.rookery.mine import verify

        m = verify(repo, sha9)
    else:
        with open(hits[0], encoding="utf-8") as f:
            m = json.load(f)
    if not m.get("repro_tests") or not m.get("answer_functions"):
        # a skip IS a classification result: record it so a resumed
        # scan does not re-mine the same candidate
        result = {"repo": repo, "fix_commit": m.get("fix_commit", sha9),
                  "parent_commit": m.get("parent_commit", ""),
                  "answer_functions": m.get("answer_functions", []),
                  "repro_tests": [], "smoke": [],
                  "baseline_pass_count": 0, "probes": [],
                  "inc_event": False, "regression_event": False,
                  "skipped": "no repro or no answer functions"}
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, f"{repo}_{sha9[:9]}.json"), "w",
                  encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
        return result
    wt_p, wt_f, test_paths = _prepare_parent(repo, m)

    # clean-parent baseline: which repo-native tests pass before any
    # patch (condition (c)'s reference set)
    _run(["git", "checkout", "--force", m["parent_commit"]], wt_p)
    _run(["git", "clean", "-fd"], wt_p)
    wt_p, wt_f, test_paths = _prepare_parent(repo, m)
    baseline: dict[str, str] = {}
    for tf in test_paths:
        baseline.update(run_file(wt_p, tf))
    baseline_pass = {t for t, o in baseline.items() if o == "passed"}

    changed = {c["id"] for c in _changed_tests(
        os.path.join(DATA, "repos", repo), m["fix_commit"],
        m["test_files"])}
    repro = set(m["repro_tests"])
    fix_pass = {t for t, v in m["added_tests"].items()
                if v.get("fix") == "pass"}
    # fixed smoke: first N baseline-passing tests that the commit did
    # not touch, in file order
    smoke = [t for t in sorted(baseline_pass) if t not in changed
             ][:SMOKE_N]

    segments = _fix_segments(repo, m)
    events = []
    for key, code in segments.items():
        rel, name = key.split("::")
        _run(["git", "checkout", "--force", m["parent_commit"]], wt_p)
        _run(["git", "clean", "-fd"], wt_p)
        _prepare_parent(repo, m)
        if not _splice_func(wt_p, rel, name, code):
            continue
        after: dict[str, str] = {}
        for tf in test_paths:
            after.update(run_file(wt_p, tf))
        after_pass = {t for t, o in after.items() if o == "passed"}

        a = bool(repro & after_pass)
        b = all(t in after_pass for t in smoke)
        broke = sorted(baseline_pass - after_pass)
        c = not broke
        unmet = sorted((fix_pass & changed) - after_pass)
        d = bool(unmet)
        events.append({
            "applied": key, "a_repro_pass": a, "b_smoke_pass": b,
            "c_no_regression": c, "regressed": broke,
            "d_unmet": unmet, "inc_event": a and b and c and d})
    result = {
        "repo": repo, "fix_commit": m["fix_commit"],
        "parent_commit": m["parent_commit"],
        "answer_functions": m["answer_functions"],
        "repro_tests": sorted(repro), "smoke": smoke,
        "baseline_pass_count": len(baseline_pass),
        "probes": events,
        "inc_event": any(e["inc_event"] for e in events),
        "regression_event": any(e["a_repro_pass"] and e["regressed"]
                                for e in events),
    }
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f"{repo}_{m['fix_commit'][:9]}.json"),
              "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    return result


# ------------------------------- independent-multi-target scan (§9.2)


def _changed_funcs(repo: str, sha: str, parent: str,
                   src_files: list[str]) -> list[str]:
    """'rel::name' for every source function the commit changed.
    git + AST only, no worktree, no pytest."""
    import ast

    repo_path = os.path.join(DATA, "repos", repo)
    out = []
    for rel in src_files:
        def segs(text: str) -> dict:
            try:
                tree = ast.parse(text)
            except SyntaxError:
                return {}
            found = {}
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef,
                                     ast.AsyncFunctionDef)):
                    found.setdefault(
                        node.name, ast.get_source_segment(text, node))
            return found

        fix = segs(_run(["git", "show", f"{sha}:{rel}"],
                        repo_path).stdout)
        par = segs(_run(["git", "show", f"{parent}:{rel}"],
                        repo_path).stdout)
        for name, code in fix.items():
            if par.get(name) != code:
                out.append(f"{rel}::{name}")
    return out


def scan_signature(min_funcs: int = 2, min_tests: int = 2) -> list[dict]:
    """Pre-screen every mined candidate for the independent-multi-
    target shape: >= min_funcs changed source functions AND
    >= min_tests changed tests. Cheap enough to run over every repo;
    the expensive INC probe then runs only on the shortlist."""
    done = {os.path.basename(p).removesuffix(".json")
            for p in glob.glob(os.path.join(OUT, "*.json"))}
    rows = []
    for path in sorted(glob.glob(os.path.join(
            DATA, "mine_candidates_*.json"))):
        repo = os.path.basename(path)[len("mine_candidates_"):-len(
            ".json")]
        repo_path = os.path.join(DATA, "repos", repo)
        if not os.path.isdir(repo_path):
            continue
        with open(path, encoding="utf-8") as f:
            cands = json.load(f)
        for c in cands:
            sha = c["sha"]
            if f"{repo}_{sha[:9]}" in done:
                continue
            if _is_spent_sha(repo, sha):
                continue
            parent = _run(["git", "rev-parse", f"{sha}^"],
                          repo_path).stdout.strip()
            if not parent:
                continue
            funcs = _changed_funcs(repo, sha, parent, c["src_files"])
            if len(funcs) < min_funcs:
                continue
            tests = _changed_tests(repo_path, sha, c["test_files"])
            if len(tests) < min_tests:
                continue
            rows.append({"repo": repo, "sha": sha[:9],
                         "subject": c["subject"],
                         "n_funcs": len(funcs), "n_tests": len(tests),
                         "funcs": funcs,
                         "tests": [t["id"] for t in tests]})
    rows.sort(key=lambda r: (-min(r["n_funcs"], r["n_tests"]),
                             r["repo"]))
    with open(os.path.join(DATA, "corpus_inc_shortlist.json"), "w",
              encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    return rows


# --------------------------- §9.3 bounded recent-band scan (final)

RECENT_YEARS = 3
RECENT_MAX_COMMITS = 1000
PER_REPO_CAP = 200
TARGET_INC = 4


def recent_band(repo: str) -> list[dict]:
    """Fix-shaped candidates inside the smaller of {last 3 years,
    last 1000 commits}, signature-prescreened, spent-filtered, capped
    at 200 per repo. git + AST only."""
    from genesis.rookery.mine import FIX_RE, SKIP_RE, _is_source, _is_test

    repo_path = os.path.join(DATA, "repos", repo)
    if not os.path.isdir(repo_path):
        return []
    since = _run(["git", "log", f"--since={RECENT_YEARS} years ago",
                  "--no-merges", "--pretty=%H"], repo_path).stdout.split()
    last_n = _run(["git", "log", f"-{RECENT_MAX_COMMITS}", "--no-merges",
                   "--pretty=%H"], repo_path).stdout.split()
    band = since if len(since) <= len(last_n) else last_n
    done = {os.path.basename(p).removesuffix(".json")
            for p in glob.glob(os.path.join(OUT, "*.json"))}

    out = []
    for sha in band:
        if len(out) >= PER_REPO_CAP:
            break
        if f"{repo}_{sha[:9]}" in done or _is_spent_sha(repo, sha):
            continue
        subject = _run(["git", "log", "-1", "--pretty=%s", sha],
                       repo_path).stdout.strip()
        if not FIX_RE.search(subject) or SKIP_RE.search(subject):
            continue
        d = _run(["git", "show", "--numstat", "--pretty=", sha],
                 repo_path)
        src, tests, lines = [], [], 0
        for stat in d.stdout.splitlines():
            parts = stat.split("\t")
            if len(parts) != 3 or not parts[2].endswith(".py"):
                continue
            add, rem, fname = parts
            n = (int(add) if add.isdigit() else 0) + \
                (int(rem) if rem.isdigit() else 0)
            if _is_test(fname):
                tests.append(fname)
            elif _is_source(fname):
                src.append(fname)
                lines += n
        if not (1 <= len(src) <= 4 and tests and 5 <= lines <= 80):
            continue
        parent = _run(["git", "rev-parse", f"{sha}^"],
                      repo_path).stdout.strip()
        if not parent:
            continue
        funcs = _changed_funcs(repo, sha, parent, src)
        if len(funcs) < 2:
            continue
        changed = _changed_tests(repo_path, sha, tests)
        if len(changed) < 2:
            continue
        out.append({"repo": repo, "sha": sha[:9], "subject": subject,
                    "n_funcs": len(funcs), "n_tests": len(changed)})
    return out


def bounded_scan() -> None:
    """The final INC mining pass (§9.3, frozen). Stops the moment
    four valid INC tasks exist; otherwise the track closes."""
    repos = [os.path.basename(p)[len("mine_candidates_"):-len(".json")]
             for p in sorted(glob.glob(os.path.join(
                 DATA, "mine_candidates_*.json")))]
    have = sorted({os.path.basename(p).removesuffix(".json")
                   for p in glob.glob(os.path.join(OUT, "*.json"))
                   if json.load(open(p, encoding="utf-8")).get(
                       "inc_event")})
    have = [h for h in have
            if not _is_spent_sha(h.rsplit("_", 1)[0],
                                 h.rsplit("_", 1)[1])]
    print(f"기확보 INC {len(have)}/{TARGET_INC}: {have}")

    pool: list[dict] = []
    for repo in repos:
        band = recent_band(repo)
        print(f"  {repo:16s} 신형 대역 서명 부합 {len(band)}건",
              flush=True)
        pool.extend(band)
    with open(os.path.join(DATA, "corpus_inc_recent_pool.json"), "w",
              encoding="utf-8") as f:
        json.dump(pool, f, ensure_ascii=False, indent=1)
    print(f"검증 대상 {len(pool)}건 (저장소별 상한 {PER_REPO_CAP})\n")

    for c in pool:
        if len(have) >= TARGET_INC:
            print("목표 4건 확보 - 조기 중단")
            break
        try:
            r = classify(c["repo"], c["sha"])
        except Exception as exc:
            print(f"  ERR  {c['repo']:16s} {c['sha']} "
                  f"{str(exc)[:100]}", flush=True)
            continue
        if r.get("skipped"):
            print(f"  skip {c['repo']:16s} {c['sha']}", flush=True)
            continue
        mark = "INC" if r["inc_event"] else "-"
        print(f"  {mark:4s} {c['repo']:16s} {c['sha']}  "
              f"프로브 {len(r['probes'])} "
              f"기준선 {r['baseline_pass_count']}", flush=True)
        if r["inc_event"]:
            have.append(f"{c['repo']}_{c['sha']}")
    print(f"\n최종 유효 INC {len(have)}/{TARGET_INC}: {have}")
    print("판정:", "게이트 충족" if len(have) >= TARGET_INC
          else "불완전형 코퍼스 부족 - 트랙 종결")


def candidates() -> list[tuple[str, str]]:
    out = []
    for p in sorted(glob.glob(os.path.join(DATA, "corpus_v2",
                                           "*.json"))):
        with open(p, encoding="utf-8") as f:
            m = json.load(f)
        if not m["qualified"] or not m.get("partial_fix_probes"):
            continue
        if len(m["answer_functions"]) < 2 or _is_spent(m):
            continue
        out.append((m["repo"], m["fix_commit"][:9]))
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo")
    parser.add_argument("--sha")
    parser.add_argument("--scan", action="store_true",
                        help="§9.2 독립 다표적 서명 사전 선별 "
                             "(git+AST만, pytest 없음)")
    parser.add_argument("--limit", type=int, default=0,
                        help="--scan 후 상위 N건만 INC 검증")
    parser.add_argument("--bounded", action="store_true",
                        help="§9.3 최종 1회 신형 대역 스캔 (동결 조건)")
    args = parser.parse_args()

    if args.bounded:
        bounded_scan()
        return
    if args.scan:
        rows = scan_signature()
        print(f"독립 다표적 서명 후보 {len(rows)}건 "
              f"(변경 함수 ≥2 ∧ 변경 테스트 ≥2)")
        for r in rows[:40]:
            print(f"  {r['repo']:16s} {r['sha']} "
                  f"함수{r['n_funcs']:2d} 테스트{r['n_tests']:2d}  "
                  f"{r['subject'][:60]}")
        if not args.limit:
            return
        todo = [(r["repo"], r["sha"]) for r in rows[:args.limit]]
        print(f"\n상위 {len(todo)}건 INC 검증 시작")
    else:
        todo = [(args.repo, args.sha)] if args.repo else candidates()
    print(f"INC 재분류 대상 {len(todo)}건 (§8.3 소진분 제외)")
    inc = []
    for repo, sha in todo:
        try:
            r = classify(repo, sha)
        except Exception as exc:               # keep the batch going
            print(f"  ERR  {repo:16s} {sha}  {str(exc)[:120]}",
                  flush=True)
            continue
        if r.get("skipped"):
            print(f"  skip {repo:16s} {sha}  {r['skipped']}",
                  flush=True)
            continue
        mark = "INC" if r["inc_event"] else (
            "REG" if r["regression_event"] else "-")
        print(f"  {mark:4s} {repo:16s} {sha}  "
              f"프로브 {len(r['probes'])} "
              f"기준선 통과 {r['baseline_pass_count']}", flush=True)
        for e in r["probes"]:
            print(f"        {e['applied']}: a={e['a_repro_pass']} "
                  f"b={e['b_smoke_pass']} c={e['c_no_regression']} "
                  f"d={bool(e['d_unmet'])} -> "
                  f"{'INC-event' if e['inc_event'] else ''}")
        if r["inc_event"]:
            inc.append(f"{repo}_{sha}")
    print(f"\nINC 적격 {len(inc)}/4: {inc}")


if __name__ == "__main__":
    main()
