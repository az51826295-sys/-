"""48시간 무인 드라이런 (4개월차 2주차 — 7일 직행 금지).

- 과제 공급 = **자기 실패 로그**: FailureSeeder가 저장소의 pytest
  실패를 주기 스캔해 과제화한다 (외부 채굴 없음). 자극원으로
  30분마다 버그 1개를 주입한다 - 이는 '들어오는 일'의 모사이며
  라우팅·채굴 장치가 아니다 (기록됨).
- 계측기 자기감시 1급: 매 틱 pending·승인 큐·실패 수를 기록하고
  **3틱 연속 상승 시 알람 이벤트** (조용한 적체 금지). 6시간마다
  stale률·unknown률 스캔 기록.
- 매일 자동 기록: 호출 수·완료·승인 큐 길이·stale률·격리 이벤트
  -> data/dryrun_daily_*.json.
- 격리 위반 = 즉시 내구 정지 (엔진에 배선됨). 감사 정지 동일.
- 개입 0 판정: 이 드라이버는 관찰만 한다. 도중 사람 조작은 곧
  시도 종료로 기록된다 (판정은 사람 몫).

  python tools/dryrun48.py --mock          # 2분 목 파일럿
  python tools/dryrun48.py 172800          # 실 48시간
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

from genesis.rookery.engine.auditor import engine_halted
from genesis.rookery.engine.config import ServiceConfig
from genesis.rookery.engine.seeder import FailureSeeder
from genesis.rookery.engine.service import build_engine

LIVE = r"C:\Users\az518\Desktop\rookery-dryrun"
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
    ("rev{n}", "def rev{n}(s):\n    return s\n",
     "def test_rev{n}():\n    assert mod.rev{n}('ab') == 'ba'\n"),
    ("mx{n}", "def mx{n}(a, b):\n    return a\n",
     "def test_mx{n}():\n    assert mod.mx{n}(2, 9) == 9\n"),
]


def sh(argv, cwd=REPO):
    return subprocess.run(argv, cwd=cwd, check=True, env=GENV,
                          capture_output=True, text=True)


def build_repo():
    import shutil
    import stat

    def onerror(func, p, exc):
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except OSError:
            pass
    assert LIVE.endswith("rookery-dryrun")
    if os.path.exists(LIVE):
        shutil.rmtree(LIVE, onerror=onerror)
    os.makedirs(REPO)
    subprocess.run(["git", "init", "--bare", "-q", BARE], check=True)
    sh(["git", "init", "-q", "-b", "main"])
    open(os.path.join(REPO, "mod.py"), "w",
         encoding="utf-8").write("# growing module\n")
    open(os.path.join(REPO, "test_mod.py"), "w",
         encoding="utf-8").write("import mod\n")
    open(os.path.join(REPO, ".gitignore"), "w",
         encoding="utf-8").write("__pycache__/\n*.pyc\n")
    sh(["git", "add", "-A"])
    sh(["git", "commit", "-qm", "seed"])
    sh(["git", "remote", "add", "origin", BARE])
    sh(["git", "push", "-q", "origin", "main"])


def inject_bug(n: int) -> None:
    _, src, test = BUGS[n % len(BUGS)]
    with open(os.path.join(REPO, "mod.py"), "a",
              encoding="utf-8") as f:
        f.write("\n\n" + src.format(n=n))
    with open(os.path.join(REPO, "test_mod.py"), "a",
              encoding="utf-8") as f:
        f.write("\n\n" + test.format(n=n))
    sh(["git", "add", "-A"])
    sh(["git", "commit", "-qm", f"bug {n}"])


def keep_awake() -> None:
    if sys.platform != "win32":
        return
    import ctypes
    ctypes.windll.kernel32.SetThreadExecutionState(
        0x80000000 | 0x00000001)


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


class MockClient:
    usage = SimpleNamespace(cost_usd=0.0, tokens_in=0, tokens_out=0)

    def complete(self, prompt, **k):
        m = re.search(r"def test_((sq|rev|mx)\d+)\(", prompt)
        name, kind = m.group(1), m.group(2)
        body = {"sq": "return x * x", "rev": "return s[::-1]",
                "mx": "return max(a, b)"}[kind]
        arg = {"sq": "x", "rev": "s", "mx": "a, b"}[kind]
        return SimpleNamespace(
            text=f"# file: mod.py\ndef {name}({arg}):\n    {body}\n")


class SelfCheck:
    """연속 상승 알람은 **pending 적체에만** 건다. 승인 큐(검토
    브랜치)는 성공의 산출물이라 단조 증가가 정상이다 - 확정 규칙
    (2026-08-09): 큐 적체는 개입도 알람도 아닌 관찰 지표. 목
    파일럿에서 pr_queue 알람 2건 오보로 실증된 조정."""

    def __init__(self, store, engine):
        self.store = store
        self.engine = engine
        self.rising = {"pending": 0}
        self.prev = {"pending": -1}
        self.alarms = 0

    def tick(self) -> dict:
        counts = self.store.counts()
        metrics = {
            "pending": counts.get("pending", 0),
            "leased": counts.get("leased", 0),
            "succeeded": counts.get("succeeded", 0),
            "failed": counts.get("failed", 0),
            "pr_queue": len(self.engine.pr_preparer.pending(
                limit=1000)),
            "halted": engine_halted(self.store),
        }
        for key in ("pending",):
            if metrics[key] > self.prev[key] >= 0:
                self.rising[key] += 1
            else:
                self.rising[key] = 0
            self.prev[key] = metrics[key]
            if self.rising[key] >= 3:
                self.alarms += 1
                self.store.log(None, None, "selfcheck_alarm",
                               {"metric": key,
                                "value": metrics[key],
                                "consecutive_rises":
                                    self.rising[key]})
                self.rising[key] = 0
        return metrics


def provenance_rates() -> dict:
    try:
        cwd = os.getcwd()
        from genesis.provenance_scan import scan
        result = scan()
        return {"stale_rate": result["aggregate"]["stale_rate"],
                "unknown_rate": result["aggregate"]["unknown_rate"]}
    except Exception as exc:                     # noqa: BLE001
        return {"error": str(exc)[:100]}
    finally:
        os.chdir(cwd)


def main() -> int:
    mock = "--mock" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    duration = float(args[0]) if args else (120.0 if mock else 172800.0)
    inject_every = 5.0 if mock else 1800.0
    tick_every = 2.0 if mock else 60.0

    if not mock:
        load_key()
        os.environ.setdefault("GENESIS_SPEND", "i-approve")
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print("ANTHROPIC_API_KEY 없음", flush=True)
            return 1
    keep_awake()
    build_repo()
    config = ServiceConfig(
        repo=REPO, data_dir=DATA,
        work_root=os.path.join(DATA, "work"),
        workers=2, usd_krw=1400.0, fixed_monthly_krw=0.0,
        daily_krw=1000.0, task_krw=300.0)     # 사람 설정 상한 1개
    client_factory = (lambda: MockClient()) if mock else None
    store, guard, auditor, reporter, engine = build_engine(
        config, client_factory=client_factory)
    engine.startup_recovery()
    workers = [threading.Thread(target=engine.run_worker,
                                daemon=True) for _ in range(2)]
    for t in workers:
        t.start()

    seeder = FailureSeeder(REPO, store, repro_runs=1)
    check = SelfCheck(store, engine)
    t0 = time.time()
    n = 0
    last_inject = -1e9
    last_prov = 0.0
    last_daily = t0
    day = 0
    print(f"[dryrun] {'목' if mock else '실'} 시작 - "
          f"{duration/3600:.1f}시간", flush=True)
    while time.time() - t0 < duration:
        now = time.time()
        if engine_halted(store):
            print("[dryrun] 엔진 정지 감지 - 관찰 유지 (개입 없음)",
                  flush=True)
        elif now - last_inject >= inject_every:
            # 절전 기상 직후에는 절전 동안 만료된 subprocess
            # 데드라인이 음수 타임아웃 예외로 터진다 - 소크 1차가
            # 잔여 1.9h를 남기고 이 비포획 경로에서 죽었다
            # (2026-08-20 13:20 절전 -> 기상 크래시). 주입·시딩
            # 실패는 한 주기 건너뛰면 되는 일이지 시도를 끝낼
            # 일이 아니다.
            try:
                inject_bug(n)
                seeder.seed("test_mod.py")
                n += 1
            except Exception as exc:             # noqa: BLE001
                store.log(None, None, "driver_exception",
                          {"error": str(exc)[:300]})
                print(f"[dryrun] 주입/시딩 예외 흡수: "
                      f"{str(exc)[:120]}", flush=True)
            last_inject = now
        metrics = check.tick()
        if now - last_prov >= (30 if mock else 21600):
            metrics["provenance"] = provenance_rates()
            last_prov = now
        if int(now - t0) % (10 if mock else 600) < tick_every:
            print(f"[{int(now-t0)}s] {json.dumps(metrics, ensure_ascii=False)}",
                  flush=True)
        if now - last_daily >= (60 if mock else 86400):
            day += 1
            spend = store.spend_since(t0)
            iso = store.events(kind="isolation_halt", limit=10)
            snap = {"day": day, "metrics": metrics, "spend": spend,
                    "injected": n, "alarms": check.alarms,
                    "isolation_events": len(iso),
                    "provenance": provenance_rates()}
            with open(os.path.join(
                    DATA, f"dryrun_daily_{day}.json"), "w",
                    encoding="utf-8") as f:
                json.dump(snap, f, ensure_ascii=False, indent=1)
            print(f"[dryrun] 일일 기록 {day} 저장", flush=True)
            last_daily = now
        time.sleep(tick_every)

    engine.stop()
    for t in workers:
        t.join(timeout=60)
    counts = store.counts()
    spend = store.spend_since(0)
    summary = {
        "duration_h": round(duration / 3600, 2),
        "injected": n, "counts": counts,
        "spend_usd": round(spend["cost_usd"], 4),
        "runs": spend["runs"],
        "alarms": check.alarms,
        "audit_halted": auditor.halted(),
        "isolation_halt": bool(store.get_flag("isolation_halt")),
        "pr_queue": len(engine.pr_preparer.pending(limit=1000)),
    }
    print("\n[dryrun 종료] " + json.dumps(summary,
                                          ensure_ascii=False,
                                          indent=1), flush=True)
    with open(os.path.join(DATA, "dryrun_summary.json"), "w",
              encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)
    store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
