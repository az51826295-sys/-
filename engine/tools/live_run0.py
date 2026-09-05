"""0단계: 루키 실전 투입 런 (docs/live-intake-filter.md v1.1 일감).

- 일감 = 2단계 수용분에 v1.1 제목 표지 필터를 기계 적용한 목록.
- 과제 셋업마다 재현 테스트를 HEAD에서 **재확인**(실패해야 진행;
  잘림(2000자) 의심 시 재유도).
- 엔진은 기존 제도 그대로(격리·예산·검증·감사·경험 라우팅) +
  **로컬 전용 PR**: 남의 저장소에 푸시하지 않는다 - 채택 패치는
  로컬 브랜치로만 남고 사람이 검토한다.
- 저장소별 독립 원장 (claim 혼선 방지).

  python tools/live_run0.py --mock     # 배관 검증, 지출 0
  python tools/live_run0.py            # 실 런
"""
import argparse
import json
import os
import re
import subprocess
import sys
import textwrap
import time
from types import SimpleNamespace

sys.path.insert(0, os.getcwd())

import genesis.rookery.engine.agentic as ag
from genesis.rookery.engine.auditor import Auditor
from genesis.rookery.engine.budget import BudgetGuard, BudgetPolicy
from genesis.rookery.engine.store import Store
from genesis.rookery.engine.worker import Engine, HandlerSpec

DATA = "data"
VERIFY = os.path.join(DATA, "live_intake_verify.json")
OUT_ROOT = os.path.join(DATA, "live_run0")
REPO_DIR = os.path.join(DATA, "repos")
ENV_FILE = r"C:\Users\az518\Desktop\ai-workforce\.env.local"

# v1.2 제목 표지 (동결) - 기능 소망 + 질문형 제외
# (docs/live-intake-filter.md v1.2, 510 교훈)
WISH = re.compile(
    r"RFE|Feature|Idea|proposal|question|^Faster|\?\s*$"
    r"|^(how|why|what|when|where|which|does|do|is|are|can|could"
    r"|should|would)\b", re.I)
TIER, ATTEMPTS, SKIP = None, 2, set()
DAILY_KRW, TASK_KRW = 1000.0, 300.0
SEED: list[dict] = []

SLUG2DIR = {
    "mahmoud/boltons": "boltons",
    "dateutil/dateutil": "dateutil",
    "marshmallow-code/marshmallow": "marshmallow",
    "more-itertools/more-itertools": "more-itertools",
    "grantjenks/python-sortedcontainers": "sortedcontainers",
    "msiemens/tinydb": "tinydb",
    "pytoolz/toolz": "toolz",
}


def worklist() -> list[dict]:
    with open(VERIFY, encoding="utf-8") as f:
        rows = json.load(f)["rows"]
    out = []
    for r in rows:
        if r["outcome"] != "accepted":
            continue
        if WISH.search(r["title"]):
            continue
        key = f"{SLUG2DIR[r['repo']]}_{r['number']}"
        if key in SKIP:
            continue
        out.append(r)
    return out


def head_repo(repo: str) -> str:
    return os.path.join(REPO_DIR, f"{repo}_head")


def verify_fails(repo_path: str, test_src: str, tag: str) -> bool:
    fname = f"test_intake_{tag}.py"
    path = os.path.join(repo_path, fname)
    with open(path, "w", encoding="utf-8") as f:
        f.write(test_src)
    try:
        r = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "--no-header",
             "--tb=no", "-rA", "-o", "addopts=", fname],
            cwd=repo_path, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=180)
    except subprocess.TimeoutExpired:
        os.remove(path)
        return False
    os.remove(path)
    return bool(re.search(r"^FAILED ", r.stdout, re.M))


from genesis.rookery.engine.pr import LocalOnlyPrPreparer as LocalOnlyPr  # noqa: E402


def load_key() -> None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return
    try:
        with open(ENV_FILE, encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("ANTHROPIC_API_KEY="):
                    os.environ["ANTHROPIC_API_KEY"] = \
                        line.split("=", 1)[1].strip().strip('"')
                    return
    except OSError:
        pass


class MockCaller:
    """배관 검증: 읽기 1회 후 done (오라클이 기각 - 채택 경로는
    이미 검증돼 있으므로 여기선 과제 변환·격리·로컬PR만 본다)."""

    def __init__(self):
        self.n = 0

    def call(self, model, system, messages, tools):
        self.n += 1
        if self.n == 1:
            return {"content": [{"type": "tool_use", "id": "t1",
                                 "name": "read_file",
                                 "input": {"path": "README.md"}}],
                    "usage": {"input_tokens": 0, "output_tokens": 0}}
        return {"content": [{"type": "tool_use", "id": "t2",
                             "name": "done",
                             "input": {"summary": "목"}}],
                "usage": {"input_tokens": 0, "output_tokens": 0}}


def run_repo(repo: str, items: list[dict], mock: bool) -> list[dict]:
    root = os.path.join(OUT_ROOT, repo)
    os.makedirs(root, exist_ok=True)
    store = Store(os.path.join(root, "engine.db"))
    # (b) 재검증 A팔: 과거 실측 결말을 원장에 시딩 - 선택(라우팅)
    # 에만 작용, 프롬프트 불주입 (docs/ledger-retest-live.md)
    for s in SEED:
        store.log(None, None, "agent_outcome", s)
    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1400.0, fixed_monthly_krw=0.0,
        daily_krw=DAILY_KRW, task_krw=TASK_KRW))
    auditor = Auditor(store)
    engine = Engine(
        store, guard, auditor, head_repo(repo),
        os.path.join(root, "work"),
        handlers={"agent_fix": HandlerSpec(ag.agent_fix_handler,
                                           external=True)},
        base_branch="HEAD", workers=1,
        pr_preparer=LocalOnlyPr())

    repo_path = head_repo(repo)
    queued = []
    for it in items:
        tag = f"{repo}_{it['number']}"
        test_src = it.get("test_src", "")
        if len(test_src) >= 1990:
            it["note"] = "truncated_test_skip"
            continue
        test_src = textwrap.dedent(test_src)
        if not verify_fails(repo_path, test_src, tag):
            it["note"] = "no_longer_fails"
            continue
        fname = f"test_intake_{tag}.py"
        with open(os.path.join(repo_path, fname), "w",
                  encoding="utf-8") as f:
            f.write(test_src)
        subprocess.run(["git", "add", fname], cwd=repo_path,
                       capture_output=True)
        subprocess.run(
            ["git", "-c", "user.name=intake",
             "-c", "user.email=i@i", "commit", "-qm",
             f"intake test for #{it['number']}"],
            cwd=repo_path, capture_output=True)
        payload = {
            "file": "(미지정 - 직접 찾아라)",
            "repro_tests": [f"{fname}"],
            "smoke_tests": [],
            "issue": f"[{it['repo']}#{it['number']}] {it['title']}",
            "change_kind": "code", "files_in_scope": 1,
            "covered_by_tests": True}
        if TIER:
            payload["tier"] = TIER
        store.add_task(f"live-{tag}", "agent_fix", payload,
                       max_attempts=ATTEMPTS)
        queued.append(it)

    if mock:
        ag.CALLER_FACTORY = lambda: MockCaller()
    # 재시도 창(60초)을 기다리며 전 과제가 종국 상태가 될 때까지
    # 배수한다 - 1차 런에서 drain 1회가 재시도 대기 5건을 남긴 채
    # 종료한 결함의 수리
    for _ in range(20):
        engine.drain()
        c = store.counts()
        if not c.get("pending") and not c.get("leased"):
            break
        if auditor.halted():
            # 감사 정지는 내구적이고 사람만 푼다 - 65초 x 20을
            # 헛돌지 말고 즉시 다음 저장소로 (잔여 과제는 pending
            # 으로 보고에 남는다). B팔 0차 부검.
            print(f"[live_run0] {repo}: 감사 정지 - "
                  f"{auditor.halt_reason()}", flush=True)
            break
        time.sleep(10 if mock else 65)

    results = []
    for it in queued:
        row = store.get(f"live-{repo}_{it['number']}")
        results.append({
            "repo": it["repo"], "number": it["number"],
            "title": it["title"][:80], "state": row["state"],
            "result": json.loads(row["result"])
            if row["result"] else None,
            "error": row["last_error"]})
    # 에이전트 지출은 runs가 아니라 reservations 원장에 있다 -
    # 1차 보고의 spend 0.0은 이 표를 잘못 읽은 것
    row = store.conn.execute(
        "SELECT COALESCE(SUM(usd),0) FROM reservations"
        " WHERE state='settled'").fetchone()
    usd = row[0] or 0.0
    store.close()
    return results, usd, [
        {"repo": it["repo"], "number": it["number"],
         "note": it.get("note")} for it in items if it.get("note")]


def main() -> int:
    global DAILY_KRW, TASK_KRW, VERIFY, SEED
    global OUT_ROOT, TIER, ATTEMPTS, SKIP
    ap = argparse.ArgumentParser()
    ap.add_argument("--mock", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--tag", default="live_run0",
                    help="원장·보고 이름 (능력 실험은 live_run1)")
    ap.add_argument("--tier", default=None,
                    help="계층 고정 (능력 실험 2: smart)")
    ap.add_argument("--attempts", type=int, default=2)
    ap.add_argument("--skip", default="",
                    help="제외 목록: repo약칭_이슈번호 콤마 구분")
    ap.add_argument("--daily-krw", type=float, default=1000.0)
    ap.add_argument("--task-krw", type=float, default=300.0)
    ap.add_argument("--verify", default=VERIFY,
                    help="일감 파일 ((b) 재검증: data/corpus_b.json)")
    ap.add_argument("--seed", default="",
                    help="원장 시드 json (A팔 전용)")
    args = ap.parse_args()
    DAILY_KRW, TASK_KRW = args.daily_krw, args.task_krw
    VERIFY = args.verify
    if args.seed:
        with open(args.seed, encoding="utf-8") as f:
            SEED = json.load(f)["outcomes"]
    OUT_ROOT = os.path.join(DATA, args.tag)
    TIER, ATTEMPTS = args.tier, args.attempts
    SKIP = set(x.strip() for x in args.skip.split(",") if x.strip())
    if not args.mock:
        load_key()
        os.environ.setdefault("GENESIS_SPEND", "i-approve")
    items = worklist()
    if args.limit:
        items = items[:args.limit]
    by_repo: dict[str, list] = {}
    for it in items:
        by_repo.setdefault(SLUG2DIR[it["repo"]], []).append(it)
    print(f"[live_run0] {'목' if args.mock else '실'} - 일감 "
          f"{len(items)}건 / {len(by_repo)}저장소", flush=True)

    all_results, skipped = [], []
    total_usd = 0.0
    for repo, its in sorted(by_repo.items()):
        res, usd, skip = run_repo(repo, its, args.mock)
        all_results.extend(res)
        skipped.extend(skip)
        total_usd += usd
        for r in res:
            print(f"  {r['repo']}#{r['number']}: {r['state']}",
                  flush=True)
    out = {"ran_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
           "mock": args.mock,
           "results": all_results, "skipped": skipped,
           "solved": sum(1 for r in all_results
                         if r["state"] == "succeeded"),
           "attempted": len(all_results),
           "spend_usd": round(total_usd, 4)}
    path = os.path.join(DATA, f"{args.tag}_report.json"
                        + (".mock" if args.mock else ""))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in out.items()
                      if k != "results"}, ensure_ascii=False))
    print(f"저장: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
