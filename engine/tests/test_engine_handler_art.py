"""Alpha: the art handler - a second, non-LLM AI employee.

The institutions must treat the artist exactly like the coder: work
lands only if the intake oracle passes, spend goes through the
ledger, and the auditor re-doubts the validator with different
invariants. The artist here is a fake so tests run without network
or spend.
"""

import io
import os
import subprocess

import pytest

PIL = pytest.importorskip("PIL")
from PIL import Image  # noqa: E402

import genesis.rookery.engine.handlers_art as ha  # noqa: E402
from genesis.rookery.engine.auditor import (  # noqa: E402
    Auditor, ValidatorVerdict)
from genesis.rookery.engine.budget import (  # noqa: E402
    BudgetGuard, BudgetPolicy)
from genesis.rookery.engine.store import Store  # noqa: E402
from genesis.rookery.engine.worker import (  # noqa: E402
    Engine, HandlerSpec)

SPEC = {"width": 16, "height": 16, "max_colors": 8,
        "require_alpha": True}


def png(w=16, h=16, colors=4, alpha_hole=True) -> bytes:
    img = Image.new("RGBA", (w, h))
    palette = [(40 * i, 30 * i, 20 * i, 255) for i in range(colors)]
    img.putdata([palette[(x + y) % colors]
                 for y in range(h) for x in range(w)])
    if alpha_hole:
        img.putpixel((0, 0), (0, 0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


class FakeArtist:
    def __init__(self, files):
        self._files = files

    def order(self, payload):
        if isinstance(self._files, Exception):
            raise self._files
        return self._files


@pytest.fixture()
def repo(tmp_path):
    path = tmp_path / "repo"
    path.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "t",
           "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=path,
                   check=True)
    (path / "README.md").write_text("game", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=path, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=path,
                   env=env, check=True)
    return str(path)


class Client:
    usage = type("U", (), {"cost_usd": 0.0, "tokens_in": 0,
                           "tokens_out": 0})()


def engine_with(tmp_path, repo, files, monkeypatch):
    monkeypatch.setattr(ha, "ARTIST_FACTORY",
                        lambda: FakeArtist(files))
    store = Store(str(tmp_path / "e.db"))
    guard = BudgetGuard(store, BudgetPolicy(
        usd_krw=1000.0, fixed_monthly_krw=0.0, daily_krw=1e9,
        task_krw=1e9))
    eng = Engine(
        store, guard, Auditor(store), repo, str(tmp_path / "work"),
        handlers={"art": HandlerSpec(ha.art_handler, external=True)},
        client_factory=lambda: Client())
    return store, eng


def payload(**over):
    base = {"asset": "image", "description": "a sword icon",
            "out_dir": "assets/icons", "spec": dict(SPEC),
            "est_generations": 1, "change_kind": "art"}
    base.update(over)
    return base


def test_good_art_adopted(tmp_path, repo, monkeypatch):
    store, eng = engine_with(tmp_path, repo,
                             {"sword.png": png()}, monkeypatch)
    store.add_task("a1", "art", payload())
    eng.drain()
    row = store.get("a1")
    assert row["state"] == "succeeded", row["last_error"]
    assert not eng.auditor.halted()
    store.close()


@pytest.mark.parametrize("bad,label", [
    ({"sword.png": png(w=17)}, "wrong size"),
    ({"sword.png": png(colors=12)}, "too many colors"),
    ({"sword.png": png(alpha_hole=False)}, "no transparency"),
    ({}, "no files delivered"),
])
def test_nonconforming_art_rejected(tmp_path, repo, monkeypatch,
                                    bad, label):
    store, eng = engine_with(tmp_path, repo, bad, monkeypatch)
    store.add_task("a1", "art", payload(), max_attempts=1)
    eng.drain()
    assert store.get("a1")["state"] == "failed", label
    assert not eng.auditor.halted(), \
        f"{label}: honest rejection must not halt"
    assert not os.path.exists(os.path.join(repo, "assets")), label
    store.close()


def test_artist_failure_releases_budget(tmp_path, repo, monkeypatch):
    store, eng = engine_with(tmp_path, repo,
                             RuntimeError("api down"), monkeypatch)
    store.add_task("a1", "art", payload(), max_attempts=1)
    eng.drain()
    assert store.get("a1")["state"] == "failed"
    rows = store.conn.execute(
        "SELECT state, COUNT(*) n FROM reservations "
        "GROUP BY state").fetchall()
    states = {r[0]: r[1] for r in rows}
    assert states.get("held", 0) == 0, "죽은 예약이 남아 있음"
    store.close()


def test_spend_is_on_the_ledger(tmp_path, repo, monkeypatch):
    store, eng = engine_with(tmp_path, repo,
                             {"sword.png": png()}, monkeypatch)
    store.add_task("a1", "art", payload())
    eng.drain()
    r = store.conn.execute(
        "SELECT COUNT(*) n, SUM(actual_krw) k FROM reservations "
        "WHERE state='settled'").fetchone()
    assert r[0] == 1 and r[1] and r[1] > 0, \
        "아트 지출이 원장에 없음 - 직원 차별 금지"
    store.close()


# ---------------------------------------------------- auditor direct


def _ok():
    return {"files_present": True, "spec_ok": True}


def test_auditor_accepts_clean_art():
    v = ValidatorVerdict("x", True, kind="art",
                         changed_files=["assets/icons/sword.png"],
                         checks=_ok())
    assert Auditor(None).audit(v).agree


def test_auditor_rejects_art_touching_tests():
    v = ValidatorVerdict("x", True, kind="art",
                         changed_files=["tests/sneaky.png"],
                         checks=_ok())
    assert not Auditor(None).audit(v).agree


def test_auditor_rejects_accepted_without_spec():
    checks = _ok()
    checks["spec_ok"] = False
    v = ValidatorVerdict("x", True, kind="art",
                         changed_files=["assets/icons/sword.png"],
                         checks=checks)
    assert not Auditor(None).audit(v).agree


def test_auditor_rejects_accepted_with_no_files():
    v = ValidatorVerdict("x", True, kind="art", changed_files=[],
                         checks=_ok())
    assert not Auditor(None).audit(v).agree
