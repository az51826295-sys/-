"""Week 3 — 검토 큐 저장소 + 대시보드 승인/기각."""

import importlib.util
import os

from fastapi.testclient import TestClient

from tools.review_store import ReviewStore

HERE = os.path.dirname(os.path.abspath(__file__))
SRV = os.path.join(os.path.dirname(HERE), "tools", "webhook_server.py")


def load_srv():
    spec = importlib.util.spec_from_file_location("webhook_server", SRV)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_review_store_crud_and_idempotent(tmp_path):
    p = str(tmp_path / "q.json")
    rs = ReviewStore(p)
    rid = rs.add("pytoolz/toolz", 626, "comment body", title="tail")
    assert rid == rs.add("pytoolz/toolz", 626, "again")  # 멱등
    assert len(rs.pending()) == 1
    assert rs.mark(rid, "posted", "http://x")
    assert rs.pending() == [] and rs.counts()["posted"] == 1
    assert ReviewStore(p).get(rid)["state"] == "posted"  # 영속


def test_dashboard_shows_pending_and_actions(tmp_path, monkeypatch):
    qpath = str(tmp_path / "q.json")
    ReviewStore(qpath).add("pytoolz/toolz", 626,
                           "reproduction comment here", title="tail")
    m = load_srv()
    monkeypatch.setattr(m, "_review_store", lambda: ReviewStore(qpath))
    c = TestClient(m.app)
    r = c.get("/")
    assert r.status_code == 200
    assert "pytoolz/toolz#626" in r.text
    assert "승인" in r.text and "reproduction comment here" in r.text


def test_approve_marks_posted_without_creds(tmp_path, monkeypatch):
    qpath = str(tmp_path / "q.json")
    rid = ReviewStore(qpath).add("pytoolz/toolz", 626, "c")
    m = load_srv()
    monkeypatch.setattr(m, "_review_store", lambda: ReviewStore(qpath))
    monkeypatch.delenv("GITHUB_APP_ID", raising=False)
    monkeypatch.delenv("GITHUB_APP_KEY", raising=False)
    c = TestClient(m.app)
    r = c.post(f"/review/{rid}/approve", follow_redirects=False)
    assert r.status_code == 303
    assert ReviewStore(qpath).get(rid)["state"] == "posted"


def test_dismiss(tmp_path, monkeypatch):
    qpath = str(tmp_path / "q.json")
    rid = ReviewStore(qpath).add("pytoolz/toolz", 626, "c")
    m = load_srv()
    monkeypatch.setattr(m, "_review_store", lambda: ReviewStore(qpath))
    c = TestClient(m.app)
    c.post(f"/review/{rid}/dismiss", follow_redirects=False)
    assert ReviewStore(qpath).get(rid)["state"] == "dismissed"
