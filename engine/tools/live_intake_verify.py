"""실전 투입 2단계: 후보 이슈의 실행 확인 (docs/live-intake-filter.md).

A(동봉형)는 본문에서 테스트를 추출, B(유도형)는 모델 1회 호출로
유도한다. **수용 판정은 오직 실행에서 나온다**: 현행 HEAD에서
pytest가 'failed'(테스트 내부의 단언/런타임 실패)여야 수용.
'passed' = 재현 불가(이미 고쳐짐 등) 기각, 'error' = 테스트 자체
불량(수집·임포트 오류) 무효, 환경 불능은 env로 분류.

  python tools/live_intake_verify.py --mock    # 배관 검증, 지출 0
  python tools/live_intake_verify.py           # 실 유도 포함
"""
import argparse
import json
import os
import re
import subprocess
import sys
import textwrap
import time

sys.path.insert(0, os.getcwd())

REPO_DIR = os.path.join("data", "repos")
SCAN = os.path.join("data", "live_intake_scan.json")
OUT = os.path.join("data", "live_intake_verify.json")
ENV_FILE = r"C:\Users\az518\Desktop\ai-workforce\.env.local"
MODEL = "claude-haiku-4-5-20251001"

SLUG2DIR = {
    "mahmoud/boltons": "boltons",
    "dateutil/dateutil": "dateutil",
    "marshmallow-code/marshmallow": "marshmallow",
    "more-itertools/more-itertools": "more-itertools",
    "grantjenks/python-sortedcontainers": "sortedcontainers",
    "msiemens/tinydb": "tinydb",
    "pytoolz/toolz": "toolz",
}
CODE_BLOCK = re.compile(r"```(?:python|py)?\s*\n(.*?)```", re.S)
PAGES = 1


def head_worktree(repo: str) -> str | None:
    """현행 origin 기본 브랜치의 워크트리 (1회 생성, 재사용)."""
    path = os.path.join(REPO_DIR, repo)
    wt = os.path.join(REPO_DIR, f"{repo}_head")
    r = subprocess.run(["git", "remote", "show", "origin"],
                       cwd=path, capture_output=True, text=True)
    m = re.search(r"HEAD branch: (\S+)", r.stdout)
    if not m:
        return None
    ref = f"origin/{m.group(1)}"
    if os.path.exists(wt):
        subprocess.run(["git", "checkout", "--force", ref], cwd=wt,
                       capture_output=True, text=True)
        subprocess.run(["git", "clean", "-fd"], cwd=wt,
                       capture_output=True, text=True)
    else:
        r = subprocess.run(["git", "worktree", "add", "--force",
                            os.path.abspath(wt), ref], cwd=path,
                           capture_output=True, text=True)
        if r.returncode != 0:
            return None
    return wt


_BODY_CACHE: dict[str, dict[int, str]] = {}


def fetch_issue_body(slug: str, number: int) -> str:
    """무인증 한도(60/시) 보호: 개별 조회 대신 저장소당 목록 1회
    (본문 포함)를 캐시한다 - 7요청으로 61건을 덮는다."""
    import urllib.request
    if slug not in _BODY_CACHE:
        cache: dict[int, str] = {}
        for page in range(1, PAGES + 1):
            url = (f"https://api.github.com/repos/{slug}/issues"
                   f"?state=open&per_page=50&page={page}")
            req = urllib.request.Request(url, headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "rookery-intake-verify"})
            with urllib.request.urlopen(req, timeout=60) as r:
                batch = json.load(r)
            cache.update({i["number"]: (i.get("body") or "")
                          for i in batch})
            if len(batch) < 50:
                break
            time.sleep(1)
        _BODY_CACHE[slug] = cache
    return _BODY_CACHE[slug][number]


def build_test_from_body(body: str) -> str | None:
    """A형: def test_ 블록 그대로, 아니면 assert 블록을 테스트로
    래핑. 판정은 실행이 하므로 여기선 최선 노력만."""
    blocks = CODE_BLOCK.findall(body)
    for b in blocks:
        if "def test_" in b:
            return textwrap.dedent(b)
    for b in blocks:
        if "assert" in b:
            return ("def test_intake_issue():\n"
                    + textwrap.indent(textwrap.dedent(b), "    "))
    return None


DERIVE_PROMPT = """다음은 파이썬 라이브러리 {pkg}의 버그 이슈다.
이 버그를 재현하는 pytest 테스트 **하나만** 작성하라.
- 버그가 존재하면 실패하고, 고쳐지면 통과해야 한다
- 필요한 import 포함, 파일 하나로 완결
- 코드 블록 하나만 출력, 다른 텍스트 금지

[이슈 제목] {title}
[이슈 본문]
{body}"""


def derive_test(provider, pkg: str, title: str, body: str) -> str | None:
    text = provider.complete(
        DERIVE_PROMPT.format(pkg=pkg, title=title, body=body[:6000]),
        1.0, 0, 0)
    blocks = CODE_BLOCK.findall(text)
    if blocks:
        return textwrap.dedent(blocks[0])
    if "def test_" in text:
        return text
    return None


def run_test_at_head(wt: str, test_src: str, tag: str) -> str:
    """'accepted'(failed) / 'not_reproducible'(passed) /
    'invalid'(error) / 'env'(수집 불능)."""
    fname = f"test_intake_{tag}.py"
    path = os.path.join(wt, fname)
    with open(path, "w", encoding="utf-8") as f:
        f.write(test_src)
    try:
        r = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "--no-header",
             "--tb=no", "-rA", "-o", "addopts=", fname],
            cwd=wt, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=180)
    except subprocess.TimeoutExpired:
        os.remove(path)
        return "invalid"
    finally:
        if os.path.exists(path):
            os.remove(path)
    out = r.stdout
    if re.search(r"^FAILED ", out, re.M):
        return "accepted"
    if re.search(r"^PASSED ", out, re.M) and not re.search(
            r"^(ERROR|FAILED) ", out, re.M):
        return "not_reproducible"
    if "No module named" in out + r.stderr and "test_intake" not in \
            (out + r.stderr).split("No module named")[1][:80]:
        return "env"
    return "invalid"


class MockProvider:
    usage = {"calls": 0}

    def complete(self, prompt, t, a, b):
        self.usage["calls"] += 1
        m = re.search(r"라이브러리 (\S+)의", prompt)
        pkg = m.group(1) if m else "os"
        return (f"```python\nimport {pkg}\n\n"
                f"def test_mock():\n    assert False, '배관 검증'\n```")


def main() -> int:
    global OUT, PAGES
    ap = argparse.ArgumentParser()
    ap.add_argument("--mock", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--scan", default=SCAN)
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--pages", type=int, default=1,
                    help="본문 캐시 페이지 수 (스캔과 일치시켜라)")
    ap.add_argument("--skip-done", default="",
                    help="기존 verify json - 그 안의 이슈는 재검증 안함")
    args = ap.parse_args()
    OUT, PAGES = args.out, args.pages

    with open(args.scan, encoding="utf-8") as f:
        scan = json.load(f)
    done = set()
    if args.skip_done:
        with open(args.skip_done, encoding="utf-8") as f:
            done = {(r["repo"], r["number"])
                    for r in json.load(f)["rows"]}
    cands = [i for i in scan["issues"] if i["class"] in ("A", "B")
             and (i["repo"], i["number"]) not in done]
    if args.limit:
        cands = cands[:args.limit]

    provider = None
    if not args.mock and any(c["class"] == "B" for c in cands):
        if not os.environ.get("ANTHROPIC_API_KEY"):
            try:
                with open(ENV_FILE, encoding="utf-8") as f:
                    for line in f:
                        if line.strip().startswith(
                                "ANTHROPIC_API_KEY="):
                            os.environ["ANTHROPIC_API_KEY"] = \
                                line.split("=", 1)[1].strip().strip('"')
            except OSError:
                pass
        os.environ.setdefault("GENESIS_SPEND", "i-approve")
        from genesis.mission7.proposers import AnthropicProvider
        provider = AnthropicProvider(MODEL, 1.0, max_tokens=1500)
    elif args.mock:
        provider = MockProvider()

    wts: dict[str, str | None] = {}
    rows = []
    from collections import Counter
    outcome = Counter()
    for i, c in enumerate(cands):
        repo = SLUG2DIR[c["repo"]]
        if repo not in wts:
            wts[repo] = head_worktree(repo)
        wt = wts[repo]
        if wt is None:
            outcome["env"] += 1
            rows.append({**c, "outcome": "env",
                         "note": "worktree 불가"})
            continue
        try:
            body = fetch_issue_body(c["repo"], c["number"])
        except Exception as exc:                 # noqa: BLE001
            outcome["fetch_fail"] += 1
            rows.append({**c, "outcome": "fetch_fail",
                         "note": str(exc)[:80]})
            continue
        if c["class"] == "A":
            test_src = build_test_from_body(body)
        else:
            test_src = derive_test(provider, repo, c["title"], body) \
                if provider else None
        if not test_src:
            outcome["derive_fail"] += 1
            rows.append({**c, "outcome": "derive_fail"})
            continue
        res = run_test_at_head(wt, test_src,
                               f"{repo}_{c['number']}")
        outcome[res] += 1
        # 6000: tinydb#631이 2000자 절단으로 투입 불가였던 계측
        # 사고 계열의 수리 (docs/live-intake-filter.md v1.2)
        rows.append({**c, "outcome": res,
                     "test_src": test_src[:6000]})
        print(f"  [{i+1}/{len(cands)}] {c['repo']}#{c['number']} "
              f"({c['class']}): {res}", flush=True)
        time.sleep(0.5)

    accepted = outcome.get("accepted", 0)
    out = {"verified_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
           "mock": args.mock, "n_candidates": len(cands),
           "outcomes": dict(outcome),
           "stage2_yield": round(accepted / len(cands), 4)
           if cands else None,
           "rows": rows,
           "usage": dict(getattr(provider, "usage", {}) or {})}
    with open(OUT if not args.mock else OUT + ".mock", "w",
              encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in out.items()
                      if k != "rows"}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
