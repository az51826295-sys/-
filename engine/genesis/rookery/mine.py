"""Corpus-v2 mining (design section 8): machine-verified task
manifests, no model experiments.

  python -m genesis.rookery.mine --scan more-itertools
      Walk the repo's history for fix-shaped commits (1-4 source
      files, 5-80 changed lines, tests touched in the same commit),
      write data/mine_candidates_<repo>.json.

  python -m genesis.rookery.mine --verify more-itertools abc1234
      Build the mechanical manifest for one candidate: parent/fix
      worktrees, answer files+functions (AST diff), added-test
      expectation matrix (parent fail / fix pass), patch size, env
      timing, per-function partial-fix probe (selector-event proxy).
      Writes data/corpus_v2/<repo>_<commit>.json.

Archetype flags recorded per manifest:
- location_hard proxy: >= 2 answer source files, or the answer file
  is not the file the added tests' names point at.
- selector_event proxy: some strict subset of the answer functions,
  applied alone, passes the repro tests while >= 1 other added test
  fails (a machine-verified partial-fix decoy).
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import time

import subprocess
import sys


def _run(cmd: list[str], cwd: str, timeout: int = 300,
         env: dict | None = None):
    """UTF-8-safe subprocess wrapper (git output can contain UTF-8
    that the cp949 default chokes on; repo_tasks._run is left
    untouched for the experiment paths)."""
    return subprocess.run(cmd, cwd=cwd, capture_output=True,
                          text=True, encoding="utf-8",
                          errors="replace", timeout=timeout, env=env)


def run_pytest(wt: str, test_ids: list[str]) -> tuple[str, str]:
    """repo_tasks.run_pytest semantics, plus src-layout support:
    when the worktree ships the package under src/, PYTHONPATH gets
    src prepended (marshmallow-style repos)."""
    if not test_ids:
        return "pass", "no tests"
    env = None
    src = os.path.join(wt, "src")
    if os.path.isdir(src):
        env = dict(os.environ)
        env["PYTHONPATH"] = os.path.abspath(src) + os.pathsep \
            + env.get("PYTHONPATH", "")
    try:
        r = _run([sys.executable, "-m", "pytest", "-x", "-q",
                  "--no-header", "-o", "addopts=", *test_ids], wt,
                 env=env)
    except subprocess.TimeoutExpired:
        return "test_timeout", ""
    if r.returncode == 0:
        return "pass", r.stdout[-200:]
    if ("ERROR" in r.stdout and "collection" in r.stdout.lower()) or \
            "ImportError" in (r.stdout + r.stderr):
        return "env_setup_fail", (r.stdout + r.stderr)[-300:]
    return "fail", r.stdout[-300:]

DATA = "data"
CACHE = os.path.join(DATA, "repos")
OUT = os.path.join(DATA, "corpus_v2")

FIX_RE = re.compile(r"fix|bug|incorrect|wrong|regress|crash|error",
                    re.IGNORECASE)
SKIP_RE = re.compile(r"typo|doc|readme|changelog|lint|style|ci\b|"
                     r"format|spelling|comment", re.IGNORECASE)
# fix commits already consumed by the v3a corpus (design 6.5/6.6)
USED = {"958990e", "f51a53b", "edb3346", "d992be0", "dcf0a01",
        "781fb6c", "76d21d2", "f48e256", "424a438"}


def _repo(repo: str) -> str:
    path = os.path.join(CACHE, repo)
    if not os.path.isdir(path):
        raise SystemExit(f"repo not cloned: {path}")
    return path


def _is_test(path: str) -> bool:
    base = os.path.basename(path)
    return base.startswith("test_") or "/test" in f"/{path}".lower()


def _is_source(path: str) -> bool:
    return path.endswith(".py") and not _is_test(path) \
        and "setup" not in os.path.basename(path)


def scan(repo: str, limit: int = 4000) -> None:
    path = _repo(repo)
    r = _run(["git", "log", "--no-merges", f"-{limit}",
              "--pretty=%H %s"], path)
    rows = []
    for line in r.stdout.splitlines():
        sha, _, subject = line.partition(" ")
        if not FIX_RE.search(subject) or SKIP_RE.search(subject):
            continue
        if any(sha.startswith(u) for u in USED):
            continue
        d = _run(["git", "show", "--numstat", "--pretty=", sha], path)
        src, tests, lines = [], [], 0
        for stat in d.stdout.splitlines():
            parts = stat.split("\t")
            if len(parts) != 3:
                continue
            add, rem, fname = parts
            if not fname.endswith(".py"):
                continue
            n = (int(add) if add.isdigit() else 0) + \
                (int(rem) if rem.isdigit() else 0)
            if _is_test(fname):
                tests.append(fname)
            elif _is_source(fname):
                src.append(fname)
                lines += n
        if 1 <= len(src) <= 4 and tests and 5 <= lines <= 80:
            rows.append({"sha": sha, "subject": subject[:100],
                         "src_files": src, "test_files": tests,
                         "src_lines": lines,
                         "multi_file": len(src) >= 2})
    out = os.path.join(DATA, f"mine_candidates_{repo}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    multi = sum(r["multi_file"] for r in rows)
    print(f"{repo}: 후보 {len(rows)}건 (다중 파일 {multi}건) -> {out}")
    for row in rows[:25]:
        mark = "A?" if row["multi_file"] else "  "
        print(f"  {mark} {row['sha'][:9]} [{row['src_lines']:3d}줄 "
              f"src{len(row['src_files'])}] {row['subject']}")


# ------------------------------------------------------------- verify


def _wt(repo: str, sha: str, label: str) -> str:
    path = _repo(repo)
    wt = os.path.join(CACHE, f"mine_{repo}_{label}")
    if os.path.exists(wt):
        _run(["git", "checkout", "--force", sha], wt)
        _run(["git", "clean", "-fd"], wt)
    else:
        r = _run(["git", "worktree", "add", "--force",
                  os.path.abspath(wt), sha], path)
        if r.returncode != 0:
            raise SystemExit(f"worktree: {r.stderr[:200]}")
    return wt


def _defs(path: str) -> dict[str, str]:
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            source = f.read()
        tree = ast.parse(source)
    except (OSError, SyntaxError):
        return {}
    out = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            out[node.name] = ast.get_source_segment(source, node)
    return out


def _changed_tests(repo_path: str, sha: str,
                   test_files: list[str]) -> list[dict]:
    """Test functions ADDED OR MODIFIED by the commit, located by
    mapping diff-hunk line ranges onto the fix-side AST (bare-name
    matching mis-fired on files with fifty `test_basic` methods)."""
    out = []
    for tf in test_files:
        d = _run(["git", "show", "--unified=0", "--pretty=", sha,
                  "--", tf], repo_path)
        changed: set[int] = set()
        for m in re.finditer(
                r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@",
                d.stdout, re.MULTILINE):
            start = int(m.group(1))
            count = int(m.group(2)) if m.group(2) else 1
            changed.update(range(start, start + max(count, 1)))
        show = _run(["git", "show", f"{sha}:{tf}"], repo_path)
        try:
            tree = ast.parse(show.stdout)
        except SyntaxError:
            continue

        def hits(node) -> bool:
            return bool(set(range(node.lineno, node.end_lineno + 1))
                        & changed)

        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                    and node.name.startswith("test") and hits(node):
                out.append({"file": tf, "cls": None,
                            "name": node.name,
                            "id": f"{tf}::{node.name}"})
            elif isinstance(node, ast.ClassDef):
                for sub in node.body:
                    if isinstance(sub, (ast.FunctionDef,
                                        ast.AsyncFunctionDef)) \
                            and sub.name.startswith("test") \
                            and hits(sub):
                        out.append({
                            "file": tf, "cls": node.name,
                            "name": sub.name,
                            "id": f"{tf}::{node.name}::{sub.name}"})
    return out


def _abs_imports(source: str, tf: str) -> str:
    """Rewrite relative imports to absolute ones based on the test
    file's package path, so an extracted module can live at repo
    root (`from ._common import X` inside dateutil/test/ becomes
    `from dateutil.test._common import X`)."""
    pkg = os.path.dirname(tf).replace("\\", "/").split("/")

    def repl(m: re.Match) -> str:
        dots, module = m.group(1), m.group(2) or ""
        up = len(dots) - 1
        base = pkg[:len(pkg) - up] if up else pkg
        full = ".".join(base + ([module] if module else []))
        return f"from {full} import "

    return re.sub(r"from (\.+)([\w.]+)? import ", repl, source)


def _extract_module(source: str, cls: str | None, name: str) -> str | None:
    """Minimal standalone test module: top-level imports/constants +
    (for class tests) the class shell with fixtures/helpers and ONLY
    the target test method. Used when injecting the whole fix-side
    file into the parent tree fails on import (fix-era tests may
    reference symbols the parent does not have)."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return None
    parts = []
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom, ast.Assign)):
            seg = ast.get_source_segment(source, node)
            if seg:
                parts.append(seg)
    if cls is None:
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                    and node.name == name:
                parts.append(ast.get_source_segment(source, node))
                return "\n\n".join(parts)
        return None
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == cls:
            body = []
            for sub in node.body:
                is_target = (isinstance(sub, (ast.FunctionDef,
                                              ast.AsyncFunctionDef))
                             and sub.name == name)
                is_test = (isinstance(sub, (ast.FunctionDef,
                                            ast.AsyncFunctionDef))
                           and sub.name.startswith("test"))
                if is_target or not is_test:
                    seg = ast.get_source_segment(source, sub)
                    if seg:
                        body.append(seg)
            header = f"class {cls}("
            header += ", ".join(ast.unparse(b) for b in node.bases)
            header += "):"
            import textwrap
            parts.append(header + "\n"
                         + textwrap.indent("\n\n".join(body), "    "))
            return "\n\n".join(parts)
    return None


def _splice_func(wt: str, rel: str, name: str, new_code: str) -> bool:
    """Replace one function body in the parent worktree (used by the
    partial-fix probe)."""
    full = os.path.join(wt, rel)
    try:
        with open(full, encoding="utf-8", errors="replace") as f:
            source = f.read()
        tree = ast.parse(source)
    except (OSError, SyntaxError):
        return False
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                and node.name == name:
            lines = source.splitlines()
            start = node.lineno - 1
            if node.decorator_list:
                start = node.decorator_list[0].lineno - 1
            indent = " " * node.col_offset
            import textwrap
            body = textwrap.indent(textwrap.dedent(new_code), indent)
            new = "\n".join(lines[:start] + [body]
                            + lines[node.end_lineno:])
            with open(full, "w", encoding="utf-8", newline="") as f:
                f.write(new)
            return True
    return False


def verify(repo: str, sha: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    repo_path = _repo(repo)
    parent = _run(["git", "rev-parse", f"{sha}^"],
                  repo_path).stdout.strip()
    full_sha = _run(["git", "rev-parse", sha], repo_path).stdout.strip()
    d = _run(["git", "show", "--numstat", "--pretty=", sha], repo_path)
    src_files, test_files, patch_lines = [], [], 0
    for stat in d.stdout.splitlines():
        parts = stat.split("\t")
        if len(parts) != 3:
            continue
        add, rem, fname = parts
        if not fname.endswith(".py"):
            continue
        if _is_test(fname):
            test_files.append(fname)
        elif _is_source(fname):
            src_files.append(fname)
            patch_lines += (int(add) if add.isdigit() else 0) + \
                (int(rem) if rem.isdigit() else 0)

    wt_p = _wt(repo, parent, "parent")
    wt_f = _wt(repo, full_sha, "fix")

    # answer functions via AST diff
    answers: list[str] = []
    fix_bodies: dict[tuple[str, str], str] = {}
    for rel in src_files:
        a = _defs(os.path.join(wt_p, rel))
        b = _defs(os.path.join(wt_f, rel))
        for name in sorted(set(a) | set(b)):
            if a.get(name) != b.get(name):
                answers.append(f"{rel}::{name}")
                if name in b:
                    fix_bodies[(rel, name)] = b[name]

    changed = _changed_tests(repo_path, full_sha, test_files)
    t0 = time.time()
    matrix = {}
    env_fails = 0
    inject_mode: dict[str, tuple[str, str]] = {}   # id -> (path, pid)

    def _copy_test_files() -> None:
        """Inject the fix-side version of EVERY test-side file the
        commit touched (test infra like _common.py rides along with
        the tests that need it)."""
        for tf in test_files:
            src = os.path.join(wt_f, tf)
            if not os.path.isfile(src):
                continue
            dst = os.path.join(wt_p, tf)
            os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
            with open(src, encoding="utf-8", errors="replace") as f:
                content = f.read()
            with open(dst, "w", encoding="utf-8", newline="") as f:
                f.write(content)

    def _inject(meta: dict) -> tuple[str, str]:
        """Make the test runnable at parent; returns (mode, pytest id
        to use there). Whole-file injection first, minimal extraction
        (with absolute-import rewrite) as the fallback."""
        tf = meta["file"]
        with open(os.path.join(wt_f, tf), encoding="utf-8",
                  errors="replace") as f:
            content = f.read()
        content = _abs_imports(content, tf)
        got, _ = run_pytest(wt_p, [meta["id"]])
        if got != "env_setup_fail":
            return "file", meta["id"], got
        module = _extract_module(content, meta["cls"], meta["name"])
        if module is None:
            return "file", meta["id"], got
        ex = f"test_mine_{meta['cls'] or 'mod'}_{meta['name']}.py"
        with open(os.path.join(wt_p, ex), "w", encoding="utf-8",
                  newline="") as f:
            f.write(module)
        pid = ex + "::" + (f"{meta['cls']}::" if meta["cls"] else "") \
            + meta["name"]
        got, _ = run_pytest(wt_p, [pid])
        return "extract", pid, got

    _copy_test_files()
    for meta in changed:
        got_f, _ = run_pytest(wt_f, [meta["id"]])
        mode, pid, got_p = _inject(meta)
        matrix[meta["id"]] = {"parent": got_p, "fix": got_f,
                              "mode": mode}
        inject_mode[meta["id"]] = (mode, pid)
        if got_f == "env_setup_fail":
            env_fails += 1
    env_s = round(time.time() - t0, 1)
    repro = [t for t, m in matrix.items()
             if m["parent"] == "fail" and m["fix"] == "pass"]

    # partial-fix probe (selector-event proxy): apply each single
    # answer function alone at parent; event exists if repro passes
    # while another added test still fails
    selector_event = False
    probes = []
    if len(fix_bodies) >= 2 and repro:
        for (rel, name), code in fix_bodies.items():
            _run(["git", "checkout", "--force", parent], wt_p)
            _run(["git", "clean", "-fd"], wt_p)
            _copy_test_files()
            for meta in changed:       # rebuild extraction files
                if inject_mode[meta["id"]][0] == "extract":
                    _inject(meta)
            if not _splice_func(wt_p, rel, name, code):
                continue
            outcome = {m["id"]: run_pytest(
                wt_p, [inject_mode[m["id"]][1]])[0]
                for m in changed}
            passed_repro = [t for t in repro
                            if outcome.get(t) == "pass"]
            # a failing test only discriminates if the TRUE fix
            # passes it (fail->fail tests fail either way - counting
            # them made e0ee0c0f4 a false positive, design 8.3)
            still_failing = [t for t, got in outcome.items()
                             if got != "pass"
                             and matrix.get(t, {}).get("fix")
                             == "pass"]
            event = bool(passed_repro) and bool(still_failing)
            probes.append({"applied": f"{rel}::{name}",
                           "passes_repro": passed_repro,
                           "still_failing": still_failing,
                           "event": event})
            if event:
                selector_event = True

    location_hard = len({a.split("::")[0] for a in answers}) >= 2
    manifest = {
        "repo": repo,
        "fix_commit": full_sha,
        "parent_commit": parent,
        "answer_files": sorted({a.split("::")[0] for a in answers}),
        "answer_functions": answers,
        "patch_lines": patch_lines,
        "added_tests": matrix,
        "repro_tests": repro,
        "test_files": test_files,
        "location_hard_proxy": location_hard,
        "selector_event_proxy": selector_event,
        "partial_fix_probes": probes,
        "env_seconds": env_s,
        "env_error_tests": env_fails,
        "qualified": bool(repro) and env_fails == 0,
    }
    out = os.path.join(OUT, f"{repo}_{full_sha[:9]}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in manifest.items()
                      if k != "added_tests"},
                     ensure_ascii=False, indent=1))
    print(f"기대 행렬: { {t: (m['parent'] + '->' + m['fix']) for t, m in matrix.items()} }")
    print(f"-> {out}")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(prog="genesis.rookery.mine")
    parser.add_argument("--scan", metavar="REPO")
    parser.add_argument("--verify", nargs=2,
                        metavar=("REPO", "COMMIT"))
    args = parser.parse_args()
    if args.scan:
        scan(args.scan)
    elif args.verify:
        verify(*args.verify)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
