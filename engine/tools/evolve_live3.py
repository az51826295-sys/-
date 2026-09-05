"""Continuous autonomous live run, v3: v2 streams + the Rookie 2.0
agent loop with experience routing.

New over v2:

- every 10th cycle a two-function bug lands in its OWN small module
  (`agent_{n}.py` + `test_agent_{n}.py`) and becomes an `agent_fix`
  task with no explicit tier -> the experience router decides from
  the ledger. Separate small files keep the agent's read/write token
  cost flat over 8 hours (mod.py grows; agent modules do not).
- the seeder is now targeted at test_mod.py only, so the agent
  stream's failures are not double-seeded as one-shot fix tasks.
- a budget stop no longer ends the run: injection pauses and resumes
  when the daily ledger resets at midnight (the engine already
  restricts external work by itself).

Honest scope note: with bugs this small, fast(Haiku) is expected to
keep succeeding, so the measured outcome is (a) every ending lands on
the ledger and (b) routing stays fast when fast keeps winning - the
negative control. The failure->smart branch stays unit-tested; it
would need genuinely hard bugs to trigger live.

Usage:
    python tools/evolve_live3.py 28800       # real API, 8 hours
    python tools/evolve_live3.py 90 --mock   # pilot, no spend
"""
import json
import os
import re
import subprocess
import sys
import threading
import time
from types import SimpleNamespace

sys.path.insert(0, os.getcwd())

import genesis.rookery.engine.agentic as ag
from genesis.rookery.engine.auditor import Auditor
from genesis.rookery.engine.budget import BudgetGuard
from genesis.rookery.engine.config import ServiceConfig
from genesis.rookery.engine.handlers import code_fix_handler
from genesis.rookery.engine.handlers_extra import (
    add_docstring_handler, add_test_handler, data_convert_handler)
from genesis.rookery.engine.pr import PrPreparer
from genesis.rookery.engine.report import DailyReporter
from genesis.rookery.engine.seeder import FailureSeeder
from genesis.rookery.engine.store import Store
from genesis.rookery.engine.worker import Engine, HandlerSpec

LIVE = r"C:\Users\az518\Desktop\rookery-live"
REPO = os.path.join(LIVE, "repo")
BARE = os.path.join(LIVE, "remote.git")
DATA = os.path.join(LIVE, "data")
ENV_FILE = r"C:\Users\az518\Desktop\ai-workforce\.env.local"
GENV = {**os.environ, "GIT_AUTHOR_NAME": "demo",
        "GIT_AUTHOR_EMAIL": "d@d", "GIT_COMMITTER_NAME": "demo",
        "GIT_COMMITTER_EMAIL": "d@d"}

BUGS = [
    ("sq{n}", "def sq{n}(x):\n    return x + x\n",
     "def test_sq{n}():\n    assert mod.sq{n}(3) == 9\n"),
    ("tri{n}", "def tri{n}(n):\n    return n * n\n",
     "def test_tri{n}():\n    assert mod.tri{n}(4) == 10\n"),
    ("rev{n}", "def rev{n}(s):\n    return s\n",
     "def test_rev{n}():\n    assert mod.rev{n}('ab') == 'ba'\n"),
    ("mx{n}", "def mx{n}(a, b):\n    return a\n",
     "def test_mx{n}():\n    assert mod.mx{n}(2, 9) == 9\n"),
]
UTIL = "def util{n}(x):\n    return x * 3 + 1\n"

# agent stream: two functions, the bug in the helper - the loop must
# read the file to see the call chain before it can fix the right one
AGENT_SRC = ("def half{n}(x):\n    return x\n\n\n"
             "def avg{n}(a, b):\n    return half{n}(a + b)\n")
AGENT_FIXED = ("def half{n}(x):\n    return x / 2\n\n\n"
               "def avg{n}(a, b):\n    return half{n}(a + b)\n")
AGENT_TEST = ("import agent_{n} as m\n\n\n"
              "def test_avg{n}():\n"
              "    assert m.avg{n}(2, 4) == 3\n")

DATES = [("2026/8/6", "2026-08-06"), ("Aug 3 2026", "2026-08-03"),
         ("1 Jan 2026", "2026-01-01"), ("2025/12/31", "2025-12-31")]
SCHEMA = {"id": "int", "name": "str",
          "joined": {"type": "str",
                     "pattern": r"\d{4}-\d{2}-\d{2}"}}
NAMES = ["Kim", "Lee", "Park", "Choi"]


def load_key():
    if os.environ.get("ANTHROPIC_API_KEY"):
        return
    try:
        with open(ENV_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("ANTHROPIC_API_KEY="):
                    os.environ["ANTHROPIC_API_KEY"] = \
                        line.split("=", 1)[1].strip().strip('"')
                    return
    except OSError:
        pass


def sh(argv, cwd=REPO, check=True):
    return subprocess.run(argv, cwd=cwd, check=check, env=GENV,
                          capture_output=True, text=True)


def commit_all(msg):
    sh(["git", "add", "-A"])
    sh(["git", "commit", "-qm", msg])


def inject_bug(n):
    _, src, test = BUGS[n % len(BUGS)]
    with open(os.path.join(REPO, "mod.py"), "a", encoding="utf-8") as f:
        f.write("\n\n" + src.format(n=n))
    with open(os.path.join(REPO, "test_mod.py"), "a",
              encoding="utf-8") as f:
        f.write("\n\n" + test.format(n=n))
    commit_all(f"bug {n}")


def inject_agent_bug(n) -> dict:
    """Own module per task - flat token cost, no mod.py contention."""
    fname = f"agent_{n}.py"
    with open(os.path.join(REPO, fname), "w", encoding="utf-8") as f:
        f.write(AGENT_SRC.format(n=n))
    with open(os.path.join(REPO, f"test_agent_{n}.py"), "w",
              encoding="utf-8") as f:
        f.write(AGENT_TEST.format(n=n))
    commit_all(f"agent bug {n}")
    tid = f"test_agent_{n}.py::test_avg{n}"
    return {"file": fname, "repro_tests": [tid], "smoke_tests": [],
            "issue": f"avg{n}가 평균이 아니라 합을 돌려준다 - "
                     f"원인은 이 파일 안의 다른 함수일 수 있다",
            "test_id": tid, "symbol": f"avg{n}",
            "change_kind": "code", "files_in_scope": 1,
            "covered_by_tests": True}


def inject_util(n) -> str:
    name = f"util{n}"
    with open(os.path.join(REPO, "mod.py"), "a", encoding="utf-8") as f:
        f.write("\n\n" + UTIL.format(n=n))
    commit_all(f"util {n}")
    return name


def inject_csv(n) -> tuple[str, list]:
    fname = f"data_{n}.csv"
    rows = []
    for i in range(3):
        messy, iso = DATES[(n + i) % len(DATES)]
        rows.append((i + 1, NAMES[(n + i) % len(NAMES)], messy, iso))
    with open(os.path.join(REPO, fname), "w", encoding="utf-8",
              newline="") as f:
        f.write("id,name,joined\n")
        for rid, nm, messy, _ in rows:
            f.write(f"{rid},{nm},{messy}\n")
    commit_all(f"csv {n}")
    spots = [{"row": i, "field": "joined", "expect": iso}
             for i, (_, _, _, iso) in enumerate(rows)]
    return fname, spots


# ------------------------------------------------- mock (pilot only)


class MockClient:
    """Canned correct answers for the four one-shot kinds (as v2)."""

    usage = SimpleNamespace(cost_usd=0.0, tokens_in=0, tokens_out=0)

    def complete(self, prompt, **k):
        return SimpleNamespace(text=self._answer(prompt))

    def _answer(self, prompt):
        if "docstring을 추가하라" in prompt:
            m = re.search(r"```python\n(def (\w+)\(([^)]*)\):)\n(.*?)```",
                          prompt, re.S)
            defline, _, _, body = m.groups()
            return (f"# file: mod.py\n{defline}\n"
                    f'    """자동 생성 설명."""\n{body.rstrip()}\n')
        if "pytest 테스트" in prompt:
            m = re.search(r"함수 `(\w+)`", prompt)
            name = m.group(1)
            return (f"def test_{name}_char():\n"
                    f"    assert mod.{name}(2) == {2 * 3 + 1}\n")
        if "변환하라" in prompt:
            m = re.search(r"```\n(.*?)```", prompt, re.S)
            lines = m.group(1).strip().splitlines()[1:]
            date_map = dict(DATES)
            recs = []
            for ln in lines:
                rid, nm, messy = ln.split(",", 2)
                recs.append(f'{{"id": {rid}, "name": "{nm}", '
                            f'"joined": "{date_map[messy]}"}}')
            return "[" + ", ".join(recs) + "]"
        m = re.search(r"def test_((sq|tri|rev|mx)\d+)\(", prompt)
        name, kind = m.group(1), m.group(2)
        body = {"sq": "return x * x", "tri": "return n * (n + 1) // 2",
                "rev": "return s[::-1]", "mx": "return max(a, b)"}[kind]
        arg = {"sq": "x", "tri": "n", "rev": "s", "mx": "a, b"}[kind]
        return f"# file: mod.py\ndef {name}({arg}):\n    {body}\n"


class MockAgentCaller:
    """Scripted agent loop: read -> write the known fix -> run the
    repro test -> done. Validates the driver's agent_fix plumbing and
    the outcome recording without spending."""

    def __init__(self):
        self.step = 0
        self.file = None
        self.n = None
        self.repro = None

    def call(self, model, system, messages, tools):
        if self.file is None:
            brief = messages[0]["content"]
            m = re.search(r"수정 대상 파일: (agent_(\d+)\.py)", brief)
            self.file, self.n = m.group(1), m.group(2)
            m = re.search(r"통과시켜야 하는 테스트: \['([^']+)'\]",
                          brief)
            self.repro = m.group(1)
        self.step += 1
        if self.step == 1:
            content = [_tu(1, "read_file", path=self.file)]
        elif self.step == 2:
            content = [_tu(2, "write_file", path=self.file,
                           content=AGENT_FIXED.format(n=self.n))]
        elif self.step == 3:
            content = [_tu(3, "run_tests", test_ids=[self.repro])]
        else:
            content = [_tu(4, "done", summary="고침")]
        return {"content": content,
                "usage": {"input_tokens": 0, "output_tokens": 0}}


def _tu(i, name, **inp):
    return {"type": "tool_use", "id": f"t{i}", "name": name,
            "input": inp}


# ------------------------------------------------------------- setup


def _rmtree(path):
    import shutil
    import stat

    def onerror(func, p, exc):
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except OSError:
            pass
    if os.path.exists(path):
        shutil.rmtree(path, onerror=onerror)


def build_repo():
    assert LIVE.endswith("rookery-live")
    _rmtree(LIVE)
    os.makedirs(REPO)
    subprocess.run(["git", "init", "--bare", "-q", BARE], check=True)
    sh(["git", "init", "-q", "-b", "main"], check=True)
    open(os.path.join(REPO, "mod.py"), "w",
         encoding="utf-8").write("# growing module\n")
    open(os.path.join(REPO, "test_mod.py"), "w",
         encoding="utf-8").write("import mod\n")
    open(os.path.join(REPO, ".gitignore"), "w",
         encoding="utf-8").write("__pycache__/\n*.pyc\n")
    commit_all("seed")
    sh(["git", "remote", "add", "origin", BARE])
    sh(["git", "push", "-q", "origin", "main"])


def kind_counts(store):
    out = {}
    for r in store.conn.execute(
            "SELECT kind, state, COUNT(*) n FROM tasks "
            "GROUP BY kind, state"):
        out[f"{r[0]}/{r[1]}"] = r[2]
    return out


def experience_table(store):
    rows = store.conn.execute(
        "SELECT json_extract(data,'$.tier') t, COUNT(*) n,"
        " COALESCE(SUM(json_extract(data,'$.accepted')),0) w"
        " FROM events WHERE kind='agent_outcome' GROUP BY t").fetchall()
    return {r[0]: (r[2], r[1]) for r in rows}   # tier -> (wins, n)


def keep_awake(on: bool) -> None:
    """장기 런 중 시스템 절전 진입 차단 (4차 런 사고: 23:58 절전
    으로 8시간 중 3시간만 실행 - powercfg 대기 해제로도 못 막은
    경로가 있으므로 프로세스가 직접 선언한다). 화면 꺼짐은 허용."""
    if sys.platform != "win32":
        return
    import ctypes
    ES_CONTINUOUS = 0x80000000
    ES_SYSTEM_REQUIRED = 0x00000001
    flags = ES_CONTINUOUS | (ES_SYSTEM_REQUIRED if on else 0)
    ctypes.windll.kernel32.SetThreadExecutionState(flags)


def main():
    duration = float(sys.argv[1]) if len(sys.argv) > 1 else 28800.0
    mock = "--mock" in sys.argv
    inject_every = 2.0 if mock else 45.0
    keep_awake(True)

    if not mock:
        load_key()
        os.environ.setdefault("GENESIS_SPEND", "i-approve")
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print("ANTHROPIC_API_KEY 없음 - 중단", flush=True)
            return 1

    build_repo()
    config = ServiceConfig(
        repo=REPO, data_dir=DATA, work_root=os.path.join(DATA, "work"),
        workers=2, usd_krw=1400.0, fixed_monthly_krw=0.0,
        daily_krw=1000.0, task_krw=300.0,
        price_in_per_mtok=1.0, price_out_per_mtok=5.0)

    os.makedirs(DATA, exist_ok=True)
    store = Store(config.db_path())
    guard = BudgetGuard(store, config.budget_policy())
    auditor = Auditor(store)
    reporter = DailyReporter(store, guard, out_dir=config.reports_dir())

    if mock:
        def client_factory():
            return MockClient()
        ag.CALLER_FACTORY = lambda: MockAgentCaller()
    else:
        def client_factory():
            from genesis.mission7.proposers import AnthropicProvider
            from genesis.rookery.engine.api import GuardedClient
            p = AnthropicProvider(config.model, 1.0, max_tokens=1000)
            return GuardedClient(p, store, guard, 1.0, 5.0,
                                 default_max_tokens=1000)

    engine = Engine(
        store, guard, auditor, REPO, config.work_root,
        handlers={
            "fix": HandlerSpec(code_fix_handler, external=True),
            "doc": HandlerSpec(add_docstring_handler, external=True),
            "test_add": HandlerSpec(add_test_handler, external=True),
            "data": HandlerSpec(data_convert_handler, external=True),
            "agent_fix": HandlerSpec(ag.agent_fix_handler,
                                     external=True)},
        client_factory=client_factory, reporter=reporter,
        base_branch="main", workers=2,
        pr_preparer=PrPreparer(store, base="main"))
    engine.startup_recovery()

    workers = [threading.Thread(target=engine.run_worker, daemon=True)
               for _ in range(2)]
    for t in workers:
        t.start()

    label = "목 파일럿" if mock else "실 API"
    print(f"[진화 v3] {label} 시작 - {duration/60:.0f}분, "
          f"5 kind (fix/doc/test_add/data/agent_fix)", flush=True)
    seeder = FailureSeeder(REPO, store, repro_runs=1)
    t0 = time.time()
    n = 0
    utils: list[str] = []
    last_inject = -1e9
    paused = False
    while time.time() - t0 < duration and not engine.stopped:
        now = time.time()
        st = guard.status()
        if st.stage == "stopped":
            if not paused:
                print("[진화 v3] 예산 정지선 - 주입 중단, 일일 리셋"
                      " 대기 (엔진은 로컬 작업만)", flush=True)
                paused = True
        elif paused:
            print("[진화 v3] 예산 회복 - 주입 재개", flush=True)
            paused = False
        if not paused and now - last_inject >= inject_every:
            inject_bug(n)
            seeder.seed("test_mod.py")
            if n % 10 == 5:
                payload = inject_agent_bug(n)
                store.add_task(f"agent-{n}", "agent_fix", payload)
            slot = (n // 3) % 3 if n % 3 == 0 else None
            if slot == 0:
                name = inject_util(n)
                utils.append(name)
                store.add_task(f"doc-{n}", "doc", {
                    "file": "mod.py", "focus_symbols": [name],
                    "smoke_tests": [], "change_kind": "doc"})
            elif slot == 1 and utils:
                name = utils[-1]
                store.add_task(f"test-{n}", "test_add", {
                    "file": "mod.py", "focus_symbols": [name],
                    "test_file": "test_char.py", "module": "mod",
                    "change_kind": "test"})
            elif slot == 2:
                fname, spots = inject_csv(n)
                store.add_task(f"data-{n}", "data", {
                    "source_file": fname,
                    "target_file": fname[:-4] + ".json",
                    "target_format": "json", "schema": SCHEMA,
                    "preserve": ["id", "name"],
                    "spot_checks": spots,
                    "spec": "joined를 ISO 날짜(YYYY-MM-DD)로 정규화",
                    "change_kind": "data"})
            n += 1
            last_inject = now
        time.sleep(1 if mock else 5)
        try:
            open(os.path.join(config.reports_dir(), "today.txt"), "w",
                 encoding="utf-8").write(reporter.preview())
        except OSError:
            pass
        c = store.counts()
        if int(now - t0) % 30 < (1 if mock else 5):
            exp = experience_table(store)
            print(f"[{int(now-t0)}s] 주입 {n} | 성공 "
                  f"{c.get('succeeded',0)} 진행 {c.get('leased',0)} "
                  f"대기 {c.get('pending',0)} 실패 {c.get('failed',0)}"
                  f" | 지출 {st.settled_krw:.0f}원 단계 {st.stage}"
                  f" | 경험 {exp}", flush=True)

    deadline = time.time() + (30 if mock else 600)
    while time.time() < deadline:
        c = store.counts()
        if not c.get("leased") and not c.get("pending"):
            break
        time.sleep(2)
    engine.stop()
    for t in workers:
        t.join(timeout=60)

    print("\n[진화 v3 종료] kind별 결과:", flush=True)
    for k, v in sorted(kind_counts(store).items()):
        print(f"  {k}: {v}", flush=True)
    sp = store.spend_since(0)
    print(f"  지출 ${sp['cost_usd']:.4f}", flush=True)
    print(f"  감사 정지: {auditor.halted()}", flush=True)
    print(f"  에이전트 경험(성공, 시도): "
          f"{json.dumps(experience_table(store), ensure_ascii=False)}",
          flush=True)
    br = subprocess.run(["git", "branch", "-a"], cwd=BARE,
                        capture_output=True, text=True).stdout
    n_br = len([b for b in br.splitlines() if "rookery/" in b])
    print(f"  검토 대기 브랜치 {n_br}개", flush=True)
    store.close()
    keep_awake(False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
