"""운영자 CLI(tools/ops.py): 상태 조회와 사람 이름을 남기는 정지 해제."""

import importlib.util
import os

from genesis.rookery.engine.auditor import HALT_FLAG, ISOLATION_HALT_FLAG
from genesis.rookery.engine.store import Store
from genesis.rookery.engine.worker import INFRA_BACKOFF_FLAG

HERE = os.path.dirname(os.path.abspath(__file__))
OPS = os.path.join(os.path.dirname(HERE), "tools", "ops.py")


def load():
    spec = importlib.util.spec_from_file_location("ops", OPS)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_status_and_resume_record_the_human(tmp_path):
    ops = load()
    db = tmp_path / "t" / "demo" / "engine.db"
    db.parent.mkdir(parents=True)
    s = Store(str(db))
    s.add_task("x1", "agent_fix", {})
    s.set_flag(HALT_FLAG, {"task_id": "x1", "findings": [{"code": "i4"}]})
    s.set_flag(ISOLATION_HALT_FLAG, {"task_id": "x1", "error": "esc"})
    s.set_flag(INFRA_BACKOFF_FLAG, 9_999_999_999)
    s.close()

    rows = ops.status(str(tmp_path), ["t"])
    assert rows[0]["repo"] == "demo" and rows[0]["pending"] == 1
    assert rows[0]["auditor_halt"] and rows[0]["isolation_halt"]
    assert rows[0]["infra_backoff_until"]

    out = ops.resume(str(tmp_path), "t", "demo", who="tester")
    assert out["before"]["auditor_halt"] and not out["after"]["auditor_halt"]
    assert not out["after"]["isolation_halt"]
    ops.clear_backoff(str(tmp_path), "t", "demo")
    s = Store(str(db))
    kinds = [e["kind"] for e in s.events()]
    assert "engine_resume" in kinds and "isolation_resume" in kinds
    assert "infra_backoff_cleared" in kinds
    assert not s.get_flag(INFRA_BACKOFF_FLAG)
    s.close()
    rows = ops.status(str(tmp_path), ["t"])
    assert not rows[0]["auditor_halt"] and rows[0]["infra_backoff_until"] is None
