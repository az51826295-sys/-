"""무효(invalid) 유도 테스트 원인 분류 (docs/live-intake-filter.md "사전 등록" 절).

verify 결과 파일의 outcome=invalid 행을 **임시 워크트리**(origin 기본 브랜치)에서
다시 실행해 pytest 수집 출력으로 (a)/(c)/(d)/(e)를 기계 분류한다. 헤드 워크트리
`data/repos/<repo>_head`는 드라이런 인테이크가 쓰므로 건드리지 않는다. 지출 0.

  python tools/invalid_triage.py --verify data/live_intake_verify2.json --out data/invalid_triage_v2.json
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPOS = os.path.join(ROOT, "data", "repos")
SLUG2DIR = {"mahmoud/boltons": "boltons", "dateutil/dateutil": "dateutil",
            "marshmallow-code/marshmallow": "marshmallow",
            "more-itertools/more-itertools": "more-itertools",
            "grantjenks/python-sortedcontainers": "sortedcontainers",
            "msiemens/tinydb": "tinydb", "pytoolz/toolz": "toolz"}
PKG = {"boltons": "boltons", "dateutil": "dateutil", "marshmallow": "marshmallow",
       "more-itertools": "more_itertools", "sortedcontainers": "sortedcontainers",
       "tinydb": "tinydb", "toolz": "toolz"}


def temp_worktree(repo_dir: str, root: str) -> str | None:
    base = os.path.join(REPOS, repo_dir)
    r = subprocess.run(["git", "remote", "show", "origin"], cwd=base,
                       capture_output=True, text=True)
    m = re.search(r"HEAD branch: (\S+)", r.stdout)
    if not m:
        return None
    wt = os.path.join(root, repo_dir)
    r = subprocess.run(["git", "worktree", "add", "--force", "--detach", wt,
                        f"origin/{m.group(1)}"], cwd=base,
                       capture_output=True, text=True)
    return wt if r.returncode == 0 else None


def drop_worktree(repo_dir: str, wt: str) -> None:
    subprocess.run(["git", "worktree", "remove", "--force", wt],
                   cwd=os.path.join(REPOS, repo_dir), capture_output=True)


def run(wt: str, src: str, tag: str) -> tuple[str, str]:
    fname = f"test_triage_{tag}.py"
    path = os.path.join(wt, fname)
    with open(path, "w", encoding="utf-8") as f:
        f.write(textwrap.dedent(src))
    env = dict(os.environ)
    # src 레이아웃 저장소는 워크트리 범위 PYTHONPATH=<wt>/src로 import 가능하게.
    # 전역 설치 없음 - 드라이런 인터프리터·전역 site-packages 불변 (08-22 부검).
    src_dir = os.path.join(wt, "src")
    if os.path.isdir(src_dir):
        env["PYTHONPATH"] = src_dir + os.pathsep + env.get("PYTHONPATH", "")
    try:
        r = subprocess.run([sys.executable, "-m", "pytest", "-q", "--no-header",
                            "--tb=short", "-rA", "-o", "addopts=", fname],
                           cwd=wt, capture_output=True, text=True, env=env,
                           encoding="utf-8", errors="replace", timeout=180)
        return (r.stdout or "") + "\n" + (r.stderr or ""), "ok"
    except subprocess.TimeoutExpired:
        return "", "timeout"
    finally:
        if os.path.exists(path):
            os.remove(path)


def classify(out: str, status: str, pkg: str) -> tuple[str, str]:
    """(축, 근거 한 줄)."""
    if status == "timeout":
        return "c_env", "timeout"
    if re.search(r"^FAILED ", out, re.M):
        return "reran_failed", "now FAILED (accepted on rerun)"
    if re.search(r"^PASSED ", out, re.M) and not re.search(r"^ERROR ", out, re.M):
        return "reran_passed", "now PASSED"
    if re.search(r"SyntaxError|IndentationError|TabError", out):
        return "d_test_defect", "syntax"
    m = re.search(r"ImportError: cannot import name '(\w+)' from '([\w\.]+)'", out)
    if m and m.group(2).split(".")[0] == pkg:
        return "a_fabricated_api", f"cannot import {m.group(1)} from {m.group(2)}"
    m = re.search(r"No module named '([\w\.]+)'", out)
    if m:
        mod = m.group(1)
        if mod == pkg:
            # 최상위 패키지 자체가 import 안 됨 = 설치/경로 문제(환경),
            # 허구 API가 아니다. src 레이아웃 저장소가 워크트리 cwd에서
            # import되지 않아 유도 테스트가 전부 여기서 죽는다 (08-22 부검).
            return "c_env_not_importable", f"top-level '{mod}' not importable"
        if mod.split(".")[0] == pkg:
            return "a_fabricated_api", f"no submodule {mod}"
        return "c_env", f"missing third-party {mod}"
    if re.search(r"AttributeError: module '[\w\.]+' has no attribute", out):
        return "a_fabricated_api", "module attribute missing at collection"
    if re.search(r"fixture '\w+' not found", out):
        return "d_test_defect", "fixture not found"
    if re.search(r"no tests ran|collected 0 items", out):
        return "d_test_defect", "no tests collected"
    if re.search(r"^ERROR ", out, re.M) or "error" in out.lower():
        first = next((ln for ln in out.splitlines() if "Error" in ln), "")[:120]
        return "e_other", first or "collection error"
    return "e_other", out.strip().splitlines()[-1][:120] if out.strip() else "empty output"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args(argv)
    rows = [r for r in json.load(open(args.verify, encoding="utf-8"))["rows"]
            if r.get("outcome") == "invalid"]
    if args.limit:
        rows = rows[:args.limit]
    tmp = tempfile.mkdtemp(prefix="triage_")
    wts: dict[str, str | None] = {}
    results = []
    t0 = time.time()
    try:
        for r in rows:
            rd = SLUG2DIR[r["repo"]]
            if rd not in wts:
                wts[rd] = temp_worktree(rd, tmp)
            wt = wts[rd]
            if wt is None:
                results.append({**{k: r[k] for k in ("repo", "number", "class")},
                                "axis": "c_env", "why": "no worktree"})
                continue
            out, status = run(wt, r.get("test_src", ""), f"{rd}_{r['number']}")
            axis, why = classify(out, status, PKG[rd])
            results.append({"repo": r["repo"], "number": r["number"],
                            "class": r.get("class"), "axis": axis, "why": why,
                            "head": out.strip()[:400]})
            print(f"  {r['repo']}#{r['number']} [{r.get('class')}] {axis}: {why}",
                  flush=True)
    finally:
        for rd, wt in wts.items():
            if wt:
                drop_worktree(rd, wt)
    agg = collections.Counter(x["axis"] for x in results)
    by_class = {c: collections.Counter(x["axis"] for x in results
                                       if x["class"] == c) for c in ("A", "B")}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"verify": args.verify, "n": len(results),
                   "aggregate": dict(agg),
                   "by_class": {k: dict(v) for k, v in by_class.items()},
                   "rows": results, "elapsed_s": round(time.time() - t0, 1)},
                  f, ensure_ascii=False, indent=1)
    print(json.dumps({"n": len(results), "aggregate": dict(agg),
                      "by_class": {k: dict(v) for k, v in by_class.items()}},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
