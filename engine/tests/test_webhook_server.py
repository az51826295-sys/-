"""Week 1 웹훅 수신기: 서명 검증 + 이벤트 파싱 + 디스패치 (발송·재현 없이)."""

import hashlib
import hmac
import importlib.util
import json
import os

from fastapi.testclient import TestClient

HERE = os.path.dirname(os.path.abspath(__file__))
SRV = os.path.join(os.path.dirname(HERE), "tools", "webhook_server.py")


def load():
    spec = importlib.util.spec_from_file_location("webhook_server", SRV)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def sign(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def test_health():
    m = load()
    r = TestClient(m.app).get("/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_signature_required_when_secret_set(monkeypatch):
    m = load()
    monkeypatch.setenv("WEBHOOK_SECRET", "s3cret")
    c = TestClient(m.app)
    body = json.dumps({"action": "opened"}).encode()
    # 서명 없음 → 401
    r = c.post("/webhook", content=body,
               headers={"X-GitHub-Event": "issues"})
    assert r.status_code == 401
    # 잘못된 서명 → 401
    r = c.post("/webhook", content=body,
               headers={"X-GitHub-Event": "issues",
                        "X-Hub-Signature-256": "sha256=deadbeef"})
    assert r.status_code == 401


def test_issue_opened_dispatches_supported_repo(monkeypatch):
    m = load()
    monkeypatch.setenv("WEBHOOK_SECRET", "s3cret")
    seen = {}
    # 실제 재현·발송 대신 디스패치만 확인 (스레드 타겟 교체)
    monkeypatch.setattr(m, "handle_issue_opened",
                        lambda repo, issue, post_back=True:
                        seen.update(repo=repo, issue=issue))
    c = TestClient(m.app)
    payload = {"action": "opened",
               "repository": {"full_name": "pytoolz/toolz"},
               "issue": {"number": 626}}
    body = json.dumps(payload).encode()
    r = c.post("/webhook", content=body,
               headers={"X-GitHub-Event": "issues",
                        "X-Hub-Signature-256": sign(body, "s3cret")})
    assert r.status_code == 200
    assert r.json() == {"dispatched": "issues", "repo": "pytoolz/toolz",
                        "issue": 626}
    import time
    time.sleep(0.1)
    assert seen == {"repo": "pytoolz/toolz", "issue": 626}


def test_uncloneable_repo_is_silent_not_crashed(monkeypatch):
    m = load()
    # 존재하지 않는 저장소 → 온보딩(클론) 실패를 우아하게 침묵 처리, 크래시 없음
    rp = m._mod("reproduce_and_post")
    monkeypatch.setattr(rp, "reproduce_generic",
                        lambda *a, **k: {"status": "silent",
                                         "reason": "onboard 실패"})
    out = m.handle_issue_opened("someone/does-not-exist-xyz", 5, post_back=False)
    assert out["status"] in ("silent", "error", "processed")


def test_non_issue_event_is_noop(monkeypatch):
    m = load()
    monkeypatch.delenv("WEBHOOK_SECRET", raising=False)
    c = TestClient(m.app)
    r = c.post("/webhook", content=b"{}",
               headers={"X-GitHub-Event": "ping"})
    assert r.status_code == 200 and r.json()["dispatched"] is None
