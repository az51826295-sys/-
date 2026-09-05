"""스테이지 1 ②: 상주 서비스의 다중 저장소 모드
(docs/rookery-stage1-infra-design.md).

- 인테이크 파이프라인이 enqueue한 저장소별 원장을 서비스가 그대로 열어
  처리한다 (같은 <data>/<tag>/<name>/engine.db 배치).
- 저장소마다 엔진 하나: 한 저장소의 감사 정지가 다른 저장소를 막지
  않는다.
- 외부 저장소는 로컬 전용 PR (pushed=False, pr_ready 이벤트).
- exit_when_idle: 큐가 비면(또는 정지면) 스스로 끝난다.
전부 가짜 모델 - 지출 0."""

import importlib.util
import os
import subprocess

import pytest

import genesis.rookery.engine.agentic as ag
from genesis.rookery.engine.auditor import HALT_FLAG
from genesis.rookery.engine.config import ServiceConfig
from genesis.rookery.engine.service import serve
from genesis.rookery.engine.store import Store

HERE = os.path.dirname(os.path.abspath(__file__))
PIPE = os.path.join(os.path.dirname(HERE), "tools", "intake_pipeline.py")

BUGGY = "def sq(x):\n    return x + x\n"
FIXED = "def sq(x):\n    return x * x\n"
TEST_SRC = "import mod\n\n\ndef test_sq():\n    assert mod.sq(3) == 9\n"
SLUGS = {"x/demo1": "demo1", "x/demo2": "demo2"}


def tu(i, name, **inp):
    return {"type": "tool_use", "id": f"t{i}", "name": name, "input": inp}


class FakeCaller:
    def __init__(self):
        self.script = [
            [tu(1, "write_file", path="mod.py", content=FIXED)],
            [tu(2, "run_tests", test_ids=["test_intake_demo1_1.py",
                                          "test_intake_demo2_1.py"])],
            [tu(3, "done", summary="끝")],
        ]

    def call(self, model, system, messages, tools):
        content = self.script.pop(0) if self.script else \
            [tu(9, "done", summary="끝")]
        return {"content": content,
                "usage": {"input_tokens": 100, "output_tokens": 50}}


def load_pipeline():
    spec = importlib.util.spec_from_file_location("intake_pipeline", PIPE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def git_repo(path):
    path.mkdir(parents=True)
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=path, check=True)
    (path / "mod.py").write_text(BUGGY, encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=path, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=path, env=env,
                   check=True)


@pytest.fixture()
def world(tmp_path, monkeypatch):
    repos = tmp_path / "repos"
    for n in ("demo1", "demo2"):
        git_repo(repos / f"{n}_head")
    data = tmp_path / "data"
    pipe = load_pipeline()
    rows = [{"repo": "x/demo1", "number": 1, "title": "sq wrong",
             "outcome": "accepted", "test_src": TEST_SRC},
            {"repo": "x/demo2", "number": 1, "title": "sq wrong too",
             "outcome": "accepted", "test_src": TEST_SRC}]
    r = pipe.enqueue(rows, "t", data_root=str(data), repos_root=str(repos),
                     slug2dir=SLUGS)
    assert r["added"] == 2
    monkeypatch.setattr(ag, "CALLER_FACTORY", lambda: FakeCaller())
    env = {"ROOKERY_REPOS": "demo1,demo2", "ROOKERY_REPOS_ROOT": str(repos),
           "ROOKERY_DATA": str(data), "ROOKERY_TAG": "t",
           "ROOKERY_WORKERS": "1", "ROOKERY_TICK_SECONDS": "0.3",
           "ROOKERY_EXIT_WHEN_IDLE": "1",
           "ROOKERY_MONTH_KRW": "1000000000", "ROOKERY_STOP_KRW": "900000000",
           "ROOKERY_RESTRICT_KRW": "800000000", "ROOKERY_WARN_KRW": "700000000",
           "ROOKERY_DAILY_KRW": "1000000000", "ROOKERY_TASK_KRW": "1000000000",
           "ROOKERY_FIXED_KRW": "0"}
    cfg = ServiceConfig.from_env(env)
    return cfg, str(data), str(repos)


def test_config_multi_mode_parses_and_validates(world, tmp_path):
    cfg, data, repos = world
    assert cfg.multi and cfg.repo_names == ("demo1", "demo2")
    assert cfg.repo_db_path("demo1") == os.path.join(data, "t", "demo1",
                                                      "engine.db")
    assert cfg.validate(require_api=False) == []
    bad = ServiceConfig.from_env({"ROOKERY_REPOS": "nope",
                                  "ROOKERY_REPOS_ROOT": str(tmp_path),
                                  "ROOKERY_DATA": str(tmp_path / "d")})
    assert any("nope" in p for p in bad.validate(require_api=False))


def test_service_drains_every_repo_ledger(world):
    cfg, data, repos = world
    ticks = serve(cfg, client_factory=lambda: None, stop_after=90,
                  install_signals=False)
    assert ticks >= 2
    for n in ("demo1", "demo2"):
        store = Store(cfg.repo_db_path(n))
        row = store.get(f"live-{n}_1")
        assert row["state"] == "succeeded", (n, row["last_error"])
        ready = store.events("pr_ready")
        assert ready and '"pushed": false' in ready[0]["data"], \
            "외부 저장소는 푸시 없이 사람 검토 큐에만"
        store.close()
        branches = subprocess.run(
            ["git", "branch", "--list", "rookery/*"],
            cwd=os.path.join(repos, f"{n}_head"),
            capture_output=True, text=True).stdout
        assert f"rookery/live-{n}_1" in branches


def test_one_repo_halt_does_not_block_the_other(world):
    cfg, data, repos = world
    s1 = Store(cfg.repo_db_path("demo1"))
    s1.set_flag(HALT_FLAG, {"task_id": "x", "findings": []})
    s1.close()
    serve(cfg, client_factory=lambda: None, stop_after=90,
          install_signals=False)
    s1 = Store(cfg.repo_db_path("demo1"))
    s2 = Store(cfg.repo_db_path("demo2"))
    assert s1.get("live-demo1_1")["state"] == "pending", "정지 저장소는 손대지 않음"
    assert s2.get("live-demo2_1")["state"] == "succeeded", \
        "다른 저장소는 계속 돈다"
    s1.close()
    s2.close()


def test_mock_mode_runs_without_api_or_spend(world, monkeypatch):
    """④ 48h 목 드라이런의 전제: ROOKERY_MOCK=1이면 키 없이 돌고, 호출은
    전부 가짜, 지출 0, 과제는 기각으로 끝난다 (예외 0)."""
    cfg, data, repos = world
    monkeypatch.setattr(ag, "CALLER_FACTORY", ag.default_caller)  # 실제 기본값
    cfg.mock = True
    assert cfg.validate(require_api=False) == []
    serve(cfg, client_factory=None, stop_after=90, install_signals=False)
    for n in ("demo1", "demo2"):
        store = Store(cfg.repo_db_path(n))
        row = store.get(f"live-{n}_1")
        # 진짜 불변식(타이밍 무관): 목은 실제 수정을 못 만드니 절대 채택
        # 안 됨(기각). failed(최종)든 pending(재시도 대기)든 둘 다 기각 상태 -
        # 90초 창에 60초 재시도 백오프가 겹치면 2시도가 안 끝날 뿐.
        assert row["state"] in ("failed", "pending"),             (n, row["state"], row["last_error"])
        assert row["state"] != "succeeded"
        assert not store.events("worker_exception")
        spent = store.conn.execute(
            "SELECT COALESCE(SUM(usd),0) FROM reservations").fetchone()[0]
        assert spent == 0
        store.close()
