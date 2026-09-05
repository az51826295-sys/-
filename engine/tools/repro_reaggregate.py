"""기능요청 필터 후 순수 버그 재현율 재집계 (docs/live-intake-filter.md).

146건 후보의 유도 테스트를 PYTHONPATH=src로 전수 재실행해 실행 신호로 분류:
  passed            → 재현 불가 (분모 유지, 미스)
  feature_import    → 기능요청 (없는 이름 import) — 분모에서 제외
  feature_hasattr   → 기능요청 (없는 속성 hasattr 단언) — 분모에서 제외
  broken_test       → 유도 테스트 결함 (SyntaxError / 테스트 내 NameError) — 미스
  env_data          → 데이터파일 부재 등 (FileNotFoundError) — 미스
  bug_assertion     → 값 비교 AssertionError = 버그 재현 후보 (분자)
  other_exception   → 모호 (TypeError 등) → 이슈 증상에 그 예외 언급되면 재현으로

집계: 순수 버그 재현율 = (bug_assertion + 확인된 other) / (후보 − 기능요청).
지출 0. 격리 임시 워크트리, 헤드 워크트리 불변.
"""
from __future__ import annotations

import collections
import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
import time
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPOS = os.path.join(ROOT, "data", "repos")
DATA = os.path.join(ROOT, "data")
S2D = {"mahmoud/boltons": "boltons", "dateutil/dateutil": "dateutil",
       "marshmallow-code/marshmallow": "marshmallow",
       "more-itertools/more-itertools": "more-itertools",
       "grantjenks/python-sortedcontainers": "sortedcontainers",
       "msiemens/tinydb": "tinydb", "pytoolz/toolz": "toolz"}
PKG = {"boltons": "boltons", "dateutil": "dateutil", "marshmallow": "marshmallow",
       "more-itertools": "more_itertools", "sortedcontainers": "sortedcontainers",
       "tinydb": "tinydb", "toolz": "toolz"}
EXC_WORDS = {"TypeError": "typeerror", "AttributeError": "attribute",
             "ValueError": "valueerror", "KeyError": "keyerror",
             "IndexError": "index", "OverflowError": "overflow",
             "RecursionError": "recursion", "ImportError": "import"}


def temp_wt(rd, root):
    base = os.path.join(REPOS, rd)
    r = subprocess.run(["git", "remote", "show", "origin"], cwd=base,
                       capture_output=True, text=True)
    m = re.search(r"HEAD branch: (\S+)", r.stdout)
    w = os.path.join(root, rd)
    subprocess.run(["git", "worktree", "add", "--force", "--detach", w,
                    f"origin/{m.group(1)}"], cwd=base, capture_output=True)
    return w


def run(rd, w, src):
    env = dict(os.environ)
    sd = os.path.join(w, "src")
    if os.path.isdir(sd):
        env["PYTHONPATH"] = sd + os.pathsep + env.get("PYTHONPATH", "")
    fn = "test_ra.py"
    p = os.path.join(w, fn)
    open(p, "w", encoding="utf-8").write(textwrap.dedent(src))
    try:
        r = subprocess.run([sys.executable, "-m", "pytest", "-q", "--no-header",
                            "--tb=long", "-o", "addopts=", fn], cwd=w,
                           capture_output=True, text=True, env=env,
                           encoding="utf-8", errors="replace", timeout=180)
        return (r.stdout or "") + (r.stderr or "")
    except subprocess.TimeoutExpired:
        return "TIMEOUT"
    finally:
        if os.path.exists(p):
            os.remove(p)


def classify(out, pkg):
    if out == "TIMEOUT":
        return "env_data", "timeout"
    if re.search(r"\d+ passed", out) and "failed" not in out and \
            "error" not in out.lower():
        return "passed", "passed"
    if re.search(r"SyntaxError|IndentationError|TabError", out):
        return "broken_test", "syntax"
    if re.search(r"^E\s+NameError: name '\w+' is not defined", out, re.M):
        return "broken_test", "NameError in test"
    if re.search(rf"cannot import name '\w+' from '{pkg}", out):
        return "feature_import", "cannot import requested name"
    if re.search(r"No module named", out):
        return "env_data", "module missing"
    if re.search(r"FileNotFoundError", out):
        return "env_data", "data file missing"
    # hasattr/should-exist style feature assertions
    if re.search(r"^E\s+AssertionError", out, re.M) or re.search(r"^E\s+assert", out, re.M):
        if re.search(r"hasattr|should exist|should be defined|not defined|"
                     r"has no attribute", out):
            return "feature_hasattr", "absent-API assertion"
        return "bug_assertion", "value assertion"
    m = re.search(r"^E\s+(\w+Error)\b", out, re.M)
    if m:
        return "other_exception", m.group(1)
    return "other_exception", "unknown"


def issue_mentions_exc(slug, num, exc):
    try:
        req = urllib.request.Request(
            f"https://api.github.com/repos/{slug}/issues/{num}",
            headers={"User-Agent": "g", "Accept": "application/vnd.github+json"})
        d = json.load(urllib.request.urlopen(req, timeout=30))
        text = (d.get("title", "") + " " + (d.get("body") or "")).lower()
    except Exception:
        return None
    if exc.lower() in text:
        return True
    w = EXC_WORDS.get(exc)
    return bool(w and w in text)


def main():
    cands = []
    for vf, tag in (("data/live_intake_verify.json", "v1"),
                    ("data/live_intake_verify2.json", "v2")):
        for r in json.load(open(vf, encoding="utf-8"))["rows"]:
            if r["class"] in ("A", "B") and r.get("test_src"):
                cands.append((tag, r["repo"], r["number"], r["test_src"]))
    tmp = tempfile.mkdtemp(prefix="ra_")
    wts = {}
    rows = []
    t0 = time.time()
    try:
        for tag, slug, num, src in cands:
            rd = S2D[slug]
            if rd not in wts:
                wts[rd] = temp_wt(rd, tmp)
            out = run(rd, wts[rd], src)
            cat, why = classify(out, PKG[rd])
            rows.append({"tag": tag, "slug": slug, "number": num,
                         "cat": cat, "why": why})
    finally:
        for rd, w in wts.items():
            subprocess.run(["git", "worktree", "remove", "--force", w],
                           cwd=os.path.join(REPOS, rd), capture_output=True)
    # other_exception: 이슈 증상 대조
    for r in rows:
        if r["cat"] == "other_exception":
            hit = issue_mentions_exc(r["slug"], r["number"], r["why"])
            r["symptom_match"] = hit
            time.sleep(0.3)
    agg = collections.Counter(r["cat"] for r in rows)
    other_match = sum(1 for r in rows if r["cat"] == "other_exception"
                      and r.get("symptom_match"))
    other_total = agg["other_exception"]
    n = len(rows)
    features = agg["feature_import"] + agg["feature_hasattr"]
    denom = n - features
    bug_repro_low = agg["bug_assertion"]
    bug_repro_high = agg["bug_assertion"] + other_total
    bug_repro_mid = agg["bug_assertion"] + other_match
    out = {"candidates": n, "by_cat": dict(agg),
           "feature_requests_excluded": features,
           "bug_candidate_denominator": denom,
           "other_exception_symptom_matched": other_match,
           "pure_bug_repro": {
               "low_assertion_only": round(bug_repro_low / denom, 3),
               "mid_plus_matched_exc": round(bug_repro_mid / denom, 3),
               "high_plus_all_other": round(bug_repro_high / denom, 3),
               "counts": f"{bug_repro_low}/{bug_repro_mid}/{bug_repro_high} of {denom}"},
           "elapsed_s": round(time.time() - t0, 1), "rows": rows}
    json.dump(out, open(os.path.join(DATA, "repro_reaggregate.json"), "w"),
              ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != "rows"},
                     ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
