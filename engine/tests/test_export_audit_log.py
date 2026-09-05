"""감사 로그 내보내기: 원장의 기계 기록만, 모델 응답 원문은 제외."""

import importlib.util
import os

from genesis.rookery.engine.store import Store

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(os.path.dirname(HERE), "tools", "export_audit_log.py")


def load():
    spec = importlib.util.spec_from_file_location("export_audit_log", TOOL)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_export_contains_machine_record_not_model_text(tmp_path):
    mod = load()
    db = tmp_path / "t" / "demo" / "engine.db"
    db.parent.mkdir(parents=True)
    s = Store(str(db))
    s.add_task("live-demo_1", "agent_fix", {
        "issue": "[x/demo#1] sq wrong", "repro_tests": ["test_intake_demo_1.py"]})
    t = s.claim("w")
    s.log(t.id, t.run_id, "command_allowed", {"command": "python -m pytest x"})
    s.log(t.id, t.run_id, "agent_response", {"text": "SECRET MODEL TEXT"})
    s.log(t.id, t.run_id, "audit_pass", {"accepted": True, "findings": []})
    s.log(t.id, t.run_id, "agent_outcome", {"tier": "fast", "attempt": 1,
                                             "accepted": True, "steps": 3,
                                             "usd": 0.01})
    s.complete(t, {"adopted": True, "branch": "rookery/live-demo_1",
                   "tier": "fast", "steps": 3, "changed_files": ["mod.py"]})
    s.close()
    md = mod.export("live-demo_1", str(db), "t")
    assert "Rookery audit trail" in md and "AI agent" in md
    assert "python -m pytest x" in md and "audit_pass" in md
    assert "SECRET MODEL TEXT" not in md
    assert "model response texts (1 turns)" in md
    assert "adopted: True" in md and "`rookery/live-demo_1`" in md
