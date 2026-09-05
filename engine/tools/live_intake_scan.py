"""실전 투입 1단계 스캔 (docs/live-intake-repos.md 동결 프로토콜).

저장소당 최신 open 이슈 50건을 무인증 API로 받아 A/B/C 분류만
한다. 실행·수용 판정 없음 - 그건 2단계. 산출물: 1단계 수율.

  python tools/live_intake_scan.py
"""
import json
import re
import time
import urllib.request

REPOS = [
    "mahmoud/boltons", "dateutil/dateutil",
    "marshmallow-code/marshmallow", "more-itertools/more-itertools",
    "grantjenks/python-sortedcontainers", "msiemens/tinydb",
    "pytoolz/toolz",
]
EXCLUDE_LABELS = ("enhancement", "feature request", "documentation",
                  "question")
OUT = "data/live_intake_scan.json"

CODE_BLOCK = re.compile(r"```(?:python|py)?\s*\n(.*?)```", re.S)
FAIL_SIGNAL = re.compile(r"Traceback|Error|raise|assert", re.I)


def fetch_issues(slug: str, pages: int = 1) -> list[dict]:
    out = []
    for page in range(1, pages + 1):
        url = (f"https://api.github.com/repos/{slug}/issues"
               f"?state=open&per_page=50&page={page}")
        req = urllib.request.Request(url, headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "rookery-intake-scan"})
        with urllib.request.urlopen(req, timeout=60) as r:
            batch = json.load(r)
        out.extend(batch)
        if len(batch) < 50:
            break
        time.sleep(1)
    return out


def classify(issue: dict) -> str:
    labels = " ".join(l["name"].lower()
                      for l in issue.get("labels", []))
    if any(x in labels for x in EXCLUDE_LABELS):
        return "C"
    body = issue.get("body") or ""
    blocks = CODE_BLOCK.findall(body)
    py_blocks = [b for b in blocks
                 if re.search(r"import |def |>>> |assert ", b)]
    if not py_blocks:
        return "C"
    for b in py_blocks:
        if "def test_" in b or ("assert" in b
                                and FAIL_SIGNAL.search(body)):
            return "A"
    return "B"


def main() -> int:
    import argparse
    global OUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=1,
                    help="저장소당 페이지 수 (심화 스캔: 3)")
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()
    OUT = args.out
    rows = []
    per_repo = {}
    for slug in REPOS:
        try:
            issues = [i for i in fetch_issues(slug, args.pages)
                      if "pull_request" not in i]
        except Exception as exc:                 # noqa: BLE001
            per_repo[slug] = {"error": str(exc)[:120]}
            continue
        counts = {"A": 0, "B": 0, "C": 0}
        for i in issues:
            cls = classify(i)
            counts[cls] += 1
            rows.append({"repo": slug, "number": i["number"],
                         "title": i["title"][:100], "class": cls,
                         "labels": [l["name"] for l in
                                    i.get("labels", [])]})
        per_repo[slug] = {**counts, "scanned": len(issues)}
        time.sleep(1)
    scanned = sum(v.get("scanned", 0) for v in per_repo.values())
    a = sum(v.get("A", 0) for v in per_repo.values())
    b = sum(v.get("B", 0) for v in per_repo.values())
    out = {"scanned_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
           "protocol": "docs/live-intake-repos.md",
           "per_repo": per_repo,
           "totals": {"scanned": scanned, "A": a, "B": b,
                      "C": scanned - a - b,
                      "stage1_yield": round((a + b) / scanned, 4)
                      if scanned else None},
           "issues": rows}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps({"per_repo": per_repo,
                      "totals": out["totals"]},
                     ensure_ascii=False, indent=1))
    print(f"저장: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
