"""인테이크 필터 v1.3 소급 평가 (docs/live-intake-filter.md v1.3 제안, 지출 0).

이슈 본문을 무인증 GitHub API로 받아 두 신호로 F형(기능 요청)을 가른다:
 1. 기능 제안 어휘 (제목+본문),
 2. 본문 코드블록이 호출/임포트하는 이름이 헤드 체크아웃에 정의돼 있지 않음.
사람 라벨(--labels json: {"owner/repo#n": "bug"|"feature"})과 대조해 정밀도·
재현율·"버그→기능 오분류" 수를 낸다. 규칙 변경은 없다 - 측정만.

  python tools/intake_v13_eval.py --issues data/intake_v13_issues.json --labels data/intake_v13_labels.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPOS = os.path.join(ROOT, "data", "repos")
SLUG2DIR = {"mahmoud/boltons": "boltons", "dateutil/dateutil": "dateutil",
            "marshmallow-code/marshmallow": "marshmallow",
            "more-itertools/more-itertools": "more-itertools",
            "grantjenks/python-sortedcontainers": "sortedcontainers",
            "msiemens/tinydb": "tinydb", "pytoolz/toolz": "toolz"}
PKG = {"boltons": "boltons", "dateutil": "dateutil",
       "marshmallow": "marshmallow", "more-itertools": "more_itertools",
       "sortedcontainers": "sortedcontainers", "tinydb": "tinydb",
       "toolz": "toolz"}
FEATURE_WORDS = re.compile(
    r"would be nice|it would be|feature|proposal|add a\b|add an\b|"
    r"new function|suggest|enhancement|could we|can we have|"
    r"it'd be|would love|request", re.I)
CODE_BLOCK = re.compile(r"```(?:python|py)?\s*\n(.*?)```", re.S)


def fetch(slug: str, num: int) -> dict:
    req = urllib.request.Request(
        f"https://api.github.com/repos/{slug}/issues/{num}",
        headers={"User-Agent": "genesis-intake-eval",
                 "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def defined_names(repo_dir: str) -> set[str]:
    """헤드 체크아웃의 패키지 안에서 def/class 이름 + __all__ 항목."""
    names: set[str] = set()
    pkg = PKG[repo_dir]
    base = os.path.join(REPOS, f"{repo_dir}_head")
    rx = re.compile(r"^\s*(?:def|class)\s+([A-Za-z_]\w*)", re.M)
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")
                       and d not in ("tests", "test", "docs", "build")]
        for fn in filenames:
            if not fn.endswith(".py"):
                continue
            try:
                with open(os.path.join(dirpath, fn), encoding="utf-8",
                          errors="replace") as f:
                    names.update(rx.findall(f.read()))
            except OSError:
                pass
    names.add(pkg)
    return names


def undefined_calls(body: str, repo_dir: str, defined: set[str]) -> list[str]:
    pkg = PKG[repo_dir]
    used: set[str] = set()
    for block in CODE_BLOCK.findall(body or ""):
        for m in re.finditer(rf"\b{pkg}(?:\.\w+)*\.(\w+)\s*\(", block):
            used.add(m.group(1))
        for m in re.finditer(rf"from\s+{pkg}(?:\.\w+)*\s+import\s+([^\n]+)",
                             block):
            for n in re.split(r"[,\s]+", m.group(1).split("#")[0]):
                n = n.strip("()")
                if n and n != "as" and n.isidentifier():
                    used.add(n)
    import keyword, builtins
    skip = set(keyword.kwlist) | set(dir(builtins))
    return sorted(n for n in used if n not in defined
                  and not n.startswith("_") and n not in skip)


def classify(title: str, body: str, repo_dir: str, defined: set[str]) -> dict:
    words = bool(FEATURE_WORDS.search(title or "")) or \
        bool(FEATURE_WORDS.search((body or "")[:1500]))
    undef = undefined_calls(body, repo_dir, defined)
    return {"feature_words": words, "undefined": undef,
            "F": bool(words or undef)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--issues", required=True,
                    help='json: ["owner/repo#n", ...]')
    ap.add_argument("--labels", default="",
                    help='json: {"owner/repo#n": "bug"|"feature"}')
    ap.add_argument("--out", default=os.path.join(ROOT, "data",
                                                  "intake_v13_eval.json"))
    args = ap.parse_args(argv)
    with open(args.issues, encoding="utf-8") as f:
        issues = json.load(f)
    labels = {}
    if args.labels:
        with open(args.labels, encoding="utf-8") as f:
            labels = json.load(f)
    defined_cache: dict[str, set[str]] = {}
    rows = []
    for key in issues:
        slug, num = key.split("#")
        rd = SLUG2DIR[slug]
        if rd not in defined_cache:
            defined_cache[rd] = defined_names(rd)
        try:
            it = fetch(slug, int(num))
        except Exception as exc:                 # noqa: BLE001
            rows.append({"issue": key, "error": str(exc)[:80]})
            continue
        c = classify(it.get("title", ""), it.get("body", ""), rd,
                     defined_cache[rd])
        rows.append({"issue": key, "title": it.get("title", "")[:80],
                     "labels": [l["name"] for l in it.get("labels", [])],
                     **c, "human": labels.get(key)})
        time.sleep(0.5)
    # 집계
    tp = fp = fn = tn = 0
    for r in rows:
        if r.get("human") not in ("bug", "feature"):
            continue
        pred_f = r["F"]
        if r["human"] == "feature" and pred_f:
            tp += 1
        elif r["human"] == "feature":
            fn += 1
        elif pred_f:
            fp += 1
        else:
            tn += 1
    agg = {"labeled": tp + fp + fn + tn, "tp": tp, "fp": fp, "fn": fn,
           "tn": tn,
           "precision": round(tp / (tp + fp), 3) if tp + fp else None,
           "recall": round(tp / (tp + fn), 3) if tp + fn else None,
           "bug_misclassified_as_feature": fp}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"rows": rows, "aggregate": agg}, f, ensure_ascii=False,
                  indent=1)
    for r in rows:
        if "error" in r:
            print(f"  {r['issue']}: ERROR {r['error']}")
            continue
        print(f"  {r['issue']:28} F={str(r['F']):5} words={r['feature_words']!s:5} "
              f"undef={r['undefined'][:3]} human={r['human']} | {r['title'][:50]}")
    print(json.dumps(agg))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
