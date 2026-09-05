"""스테이지 1 ①: 인테이크 파이프라인의 멱등성 (docs/rookery-stage1-infra-design.md).

수용 기준: 같은 코퍼스로 두 번 enqueue하면 2회차 추가 0건. 네트워크·
모델 호출 없이 가짜 헤드 저장소와 동결 코퍼스만으로 검사한다."""

import importlib.util
import os
import subprocess

import pytest

from genesis.rookery.engine.store import Store

HERE = os.path.dirname(os.path.abspath(__file__))
PIPE = os.path.join(os.path.dirname(HERE), "tools", "intake_pipeline.py")

BUGGY = "def sq(x):\n    return x + x\n"
TEST_SRC = "import mod\n\n\ndef test_sq():\n    assert mod.sq(3) == 9\n"
PASSING_SRC = "import mod\n\n\ndef test_ok():\n    assert mod.sq(0) == 0\n"


def load_pipeline():
    spec = importlib.util.spec_from_file_location("intake_pipeline", PIPE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def repos(tmp_path):
    root = tmp_path / "repos"
    head = root / "demo_head"
    head.mkdir(parents=True)
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=head, check=True)
    (head / "mod.py").write_text(BUGGY, encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=head, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=head, env=env,
                   check=True)
    return str(root)


SLUGS = {"demo/demo": "demo"}


def rows():
    return [
        {"repo": "demo/demo", "number": 1, "title": "sq is wrong",
         "outcome": "accepted", "test_src": TEST_SRC},
        {"repo": "demo/demo", "number": 2, "title": "How do I square?",
         "outcome": "accepted", "test_src": TEST_SRC},      # 제목 필터
        {"repo": "demo/demo", "number": 3, "title": "already fixed",
         "outcome": "accepted", "test_src": PASSING_SRC},   # 헤드에서 통과
        {"repo": "demo/demo", "number": 4, "title": "rejected upstream",
         "outcome": "not_reproducible", "test_src": TEST_SRC},
    ]


def test_enqueue_is_idempotent(tmp_path, repos):
    pipe = load_pipeline()
    data = str(tmp_path / "data")
    seen = {}
    first = pipe.enqueue(rows(), "t", data_root=data, repos_root=repos,
                         slug2dir=SLUGS, seen=seen)
    assert first["added"] == 1 and first["added_ids"] == ["live-demo_1"]
    assert first["title_filtered"] == 1
    assert first["no_longer_fails"] == 1
    second = pipe.enqueue(rows(), "t", data_root=data, repos_root=repos,
                          slug2dir=SLUGS, seen=seen)
    assert second["added"] == 0, "2회차 추가 0건이 수용 기준"
    assert second["existing"] == 1
    store = Store(os.path.join(data, "t", "demo", "engine.db"))
    assert [r[0] for r in store.conn.execute("SELECT id FROM tasks")] == \
        ["live-demo_1"]
    store.close()
    # 레지스트리: 넣은 것과 더는 재현 안 되는 것이 남는다
    assert seen["demo/demo#1"]["outcome"] == "queued"
    assert seen["demo/demo#3"]["outcome"] == "no_longer_fails"
    # 헤드 저장소에 인테이크 테스트가 한 번만 커밋됐다
    log = subprocess.run(["git", "log", "--oneline"],
                         cwd=os.path.join(repos, "demo_head"),
                         capture_output=True, text=True).stdout
    assert log.count("intake test for #1") == 1


def test_queued_task_payload_matches_the_runner(tmp_path, repos):
    pipe = load_pipeline()
    data = str(tmp_path / "data")
    pipe.enqueue(rows()[:1], "t", data_root=data, repos_root=repos,
                 slug2dir=SLUGS, attempts=2)
    store = Store(os.path.join(data, "t", "demo", "engine.db"))
    row = store.get("live-demo_1")
    import json
    p = json.loads(row["payload"])
    assert p["repro_tests"] == ["test_intake_demo_1.py"]
    assert p["change_kind"] == "code" and p["files_in_scope"] == 1
    assert row["max_attempts"] == 2 and row["state"] == "pending"
    store.close()


def test_freeze_dedupes_within_a_day(tmp_path):
    pipe = load_pipeline()
    out = str(tmp_path)
    p1 = pipe.freeze(rows(), source="x", out_dir=out)
    p2 = pipe.freeze(rows(), source="x", out_dir=out)
    import json
    assert p1 == p2
    frozen = json.load(open(p1, encoding="utf-8"))["rows"]
    assert [r["number"] for r in frozen] == [1, 2, 3], \
        "수용된 행만, 같은 날 재실행은 중복 없이"
