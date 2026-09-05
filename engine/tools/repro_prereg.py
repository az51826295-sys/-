"""사전 등록된 재현 분류 규칙 (docs/live-intake-filter.md; 데이터 보기 전 동결).

이 파일은 **새 데이터를 가져오기 전에** 커밋된다. classify()는 이후 어떤 결과가
나와도 바뀌지 않는다 — 사후 게이트 낚시(gate-fishing) 제거가 목적. 숫자는 규칙의
대리 한계를 그대로 안고 가되, 유리한 게이트를 골라 얻은 값이 아니다.

동결된 규칙 (대칭: 값-단언과 예외에 같은 심볼 게이트, 기능요청은 양쪽에서 제외):

  입력: pytest 출력, 패키지명 pkg, 이슈 본문 issue_text, 테스트 소스 test_src
  1. PASSED (실패·오류 없음)                         -> not_reproducible   (분모 O)
  2. SyntaxError/IndentationError/TabError
     또는 'NameError: name X is not defined'          -> broken_test        (분모 O, 미스)
  3. "cannot import name .. from <pkg>"
     또는 AssertionError에 hasattr/'has no attribute'/
     'should exist'/'not defined'                      -> feature_request    (분모 X)
  4. "No module named <pkg>" / FileNotFoundError       -> env_blocked        (분모 X)
  5. 그 외 실패(값-단언 또는 예외)에 대해 **심볼 게이트**:
     test_src가 호출하는 pkg API 심볼 중 하나라도 issue_text에 나오면 -> reproduction
     아니면                                             -> offtopic_fail     (분모 O, 미스)

  metric = reproduction / (reproduction + not_reproducible + broken_test + offtopic_fail)
         = reproduction / (분모: feature_request·env_blocked 제외)

새 데이터: 7개 저장소에서 **146건에 없던** open 이슈 중 A형(본문에 def test_ 또는
assert 블록). B형(모델 유도)은 지출이 있어 제외 — 이번 사전등록 표본은 A형 한정.
"""
from __future__ import annotations

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
REPO_SLUGS = ["mahmoud/boltons", "dateutil/dateutil",
              "marshmallow-code/marshmallow", "more-itertools/more-itertools",
              "grantjenks/python-sortedcontainers", "msiemens/tinydb",
              "pytoolz/toolz"]
S2D = {s: s.split("/")[1] for s in REPO_SLUGS}
S2D["grantjenks/python-sortedcontainers"] = "sortedcontainers"
PKG = {"boltons": "boltons", "dateutil": "dateutil", "marshmallow": "marshmallow",
       "more-itertools": "more_itertools", "sortedcontainers": "sortedcontainers",
       "tinydb": "tinydb", "toolz": "toolz"}
CODE_BLOCK = re.compile(r"```(?:python|py)?\s*\n(.*?)```", re.S)
EXC_WORD = {"TypeError": "typeerror", "AttributeError": "attribute",
            "ValueError": "valueerror", "KeyError": "keyerror",
            "IndexError": "index", "OverflowError": "overflow"}


# ---- FROZEN: 데이터 보기 전 동결. 수정 금지. ----------------------------

def symbols_used(test_src: str, pkg: str) -> set[str]:
    s = set()
    for m in re.finditer(rf"\b{pkg}(?:\.\w+)*\.(\w+)\s*\(", test_src):
        s.add(m.group(1))
    for m in re.finditer(rf"from\s+{pkg}(?:\.\w+)*\s+import\s+([^\n]+)", test_src):
        for n in re.split(r"[,\s()]+", m.group(1).split("#")[0]):
            if n.isidentifier() and n != "as":
                s.add(n)
    for m in re.finditer(r"\.(\w{4,})\s*\(", test_src):
        s.add(m.group(1))
    return {x for x in s if len(x) >= 3 and not x.startswith("test")}


def classify(out: str, pkg: str, issue_text: str, test_src: str) -> str:
    if re.search(r"\d+ passed", out) and "failed" not in out and \
            "error" not in out.lower():
        return "not_reproducible"
    if re.search(r"SyntaxError|IndentationError|TabError", out) or \
            re.search(r"^E\s+NameError: name '\w+' is not defined", out, re.M):
        return "broken_test"
    if re.search(rf"cannot import name '\w+' from '{pkg}", out):
        return "feature_request"
    if re.search(r"^E\s+(AssertionError|assert)", out, re.M) and \
            re.search(r"hasattr|has no attribute|should exist|should be defined"
                      r"|is not defined", out):
        return "feature_request"
    if re.search(rf"No module named '{pkg}", out) or \
            re.search(r"FileNotFoundError", out):
        return "env_blocked"
    if re.search(r"^E\s+", out, re.M) or "TIMEOUT" in out:
        syms = symbols_used(test_src, pkg)
        it = (issue_text or "").lower()
        on = any(sym.lower() in it for sym in syms)
        # 예외면 예외-단어도 인정(대칭 유지: 두 신호 OR)
        m = re.search(r"^E\s+(\w+Error)\b", out, re.M)
        if m and not re.search(r"^E\s+AssertionError", out, re.M):
            w = EXC_WORD.get(m.group(1))
            on = on or (w and w in it) or (m.group(1).lower() in it)
        return "reproduction" if on else "offtopic_fail"
    return "offtopic_fail"

# ---- END FROZEN --------------------------------------------------------


def _get(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "genesis-prereg", "Accept": "application/vnd.github+json"})
    return json.load(urllib.request.urlopen(req, timeout=30))


def collect_fresh(seen: set, per_repo_pages=(1, 2, 3, 4, 5), limit=200):
    """146에 없던 open 이슈 중 A형(본문에 def test_ 또는 assert 블록)."""
    fresh = []
    for slug in REPO_SLUGS:
        for pg in per_repo_pages:
            try:
                batch = _get(f"https://api.github.com/repos/{slug}/issues"
                             f"?state=open&per_page=50&page={pg}")
            except Exception:
                break
            if not batch:
                break
            for it in batch:
                if "pull_request" in it:
                    continue
                num = it["number"]
                if (slug, num) in seen:
                    continue
                body = it.get("body") or ""
                test = None
                for b in CODE_BLOCK.findall(body):
                    if "def test_" in b:
                        test = textwrap.dedent(b)
                        break
                    if "assert" in b and test is None:
                        test = ("def test_intake_issue():\n"
                                + textwrap.indent(textwrap.dedent(b), "    "))
                if test and len(test) < 6000:
                    fresh.append({"slug": slug, "number": num,
                                  "title": it.get("title", "")[:100],
                                  "issue_text": (it.get("title", "") + " " + body),
                                  "test_src": test})
                    if len(fresh) >= limit:
                        return fresh
            time.sleep(0.5)
    return fresh


def head_wt(rd, root):
    base = os.path.join(REPOS, rd)
    r = subprocess.run(["git", "remote", "show", "origin"], cwd=base,
                       capture_output=True, text=True)
    m = re.search(r"HEAD branch: (\S+)", r.stdout)
    w = os.path.join(root, rd)
    subprocess.run(["git", "worktree", "add", "--force", "--detach", w,
                    f"origin/{m.group(1)}"], cwd=base, capture_output=True)
    return w


def run_test(rd, w, src):
    env = dict(os.environ)
    sd = os.path.join(w, "src")
    if os.path.isdir(sd):
        env["PYTHONPATH"] = sd + os.pathsep + env.get("PYTHONPATH", "")
    fn = "test_pr.py"
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


def main():
    seen = set()
    for vf in ("data/live_intake_verify.json", "data/live_intake_verify2.json"):
        for r in json.load(open(vf, encoding="utf-8"))["rows"]:
            seen.add((r["repo"], r["number"]))
    fresh = collect_fresh(seen)
    print(f"fresh A형 후보: {len(fresh)}")
    tmp = tempfile.mkdtemp(prefix="pr_")
    wts = {}
    rows = []
    import collections
    agg = collections.Counter()
    try:
        for c in fresh:
            rd = S2D[c["slug"]]
            if rd not in wts:
                wts[rd] = head_wt(rd, tmp)
            out = run_test(rd, wts[rd], c["test_src"])
            cat = classify(out, PKG[rd], c["issue_text"], c["test_src"])
            agg[cat] += 1
            rows.append({"slug": c["slug"], "number": c["number"],
                         "title": c["title"], "cat": cat})
    finally:
        for rd, w in wts.items():
            subprocess.run(["git", "worktree", "remove", "--force", w],
                           cwd=os.path.join(REPOS, rd), capture_output=True)
    repro = agg["reproduction"]
    denom = repro + agg["not_reproducible"] + agg["broken_test"] + agg["offtopic_fail"]
    out = {"n_fresh": len(fresh), "by_cat": dict(agg),
           "feature_request": agg["feature_request"], "env_blocked": agg["env_blocked"],
           "denominator": denom, "reproduction": repro,
           "prereg_reproduction_rate": round(repro / denom, 3) if denom else None,
           "rows": rows}
    json.dump(out, open(os.path.join(DATA, "repro_prereg_result.json"), "w"),
              ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != "rows"},
                     ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
