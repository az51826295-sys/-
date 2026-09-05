"""Week 2 고객 저장소 온보딩: 패키지 탐지(root/src) + 재현 실행. 네트워크 없음."""

import os
import subprocess
import sys

from tools import customer_repo as cr


def _make_repo(tmp, layout, buggy=True):
    """buggy면 sq(x)=x+x(틀림), 아니면 x*x(맞음)."""
    root = tmp / "repo"
    pkgparent = root / "src" if layout == "src" else root
    pkg = pkgparent / "demo"
    pkg.mkdir(parents=True)
    (pkg / "__init__.py").write_text("", encoding="utf-8")
    body = "def sq(x):\n    return x + x\n" if buggy else \
        "def sq(x):\n    return x * x\n"
    (pkg / "core.py").write_text(body, encoding="utf-8")
    return str(root)


def test_find_package_root_and_src(tmp_path):
    root = _make_repo(tmp_path, "root")
    pkg, path = cr.find_package(root)
    assert pkg == "demo" and path == root

    (tmp_path / "s").mkdir()
    root2 = _make_repo(tmp_path / "s", "src")
    pkg2, path2 = cr.find_package(root2)
    assert pkg2 == "demo" and path2.endswith("src")


def test_reproduce_in_accepts_failing_test(tmp_path):
    root = _make_repo(tmp_path, "root", buggy=True)
    repo = {"dir": root, "pkg": "demo", "pythonpath": root, "importable": True}
    test = ("from demo.core import sq\n"
            "def test_sq():\n    assert sq(3) == 9\n")
    assert cr.reproduce_in(repo, test, "demo") == "accepted"


def test_reproduce_in_silent_when_passing(tmp_path):
    root = _make_repo(tmp_path, "root", buggy=False)   # 이미 맞음
    repo = {"dir": root, "pkg": "demo", "pythonpath": root, "importable": True}
    test = ("from demo.core import sq\n"
            "def test_sq():\n    assert sq(3) == 9\n")
    assert cr.reproduce_in(repo, test, "demo") == "not_reproducible"


def test_reproduce_in_needs_deps_when_not_importable(tmp_path):
    repo = {"dir": str(tmp_path), "pkg": "demo", "pythonpath": None,
            "importable": False}
    assert cr.reproduce_in(repo, "def test_x():\n    assert True\n", "d") == \
        "needs_deps"


def test_onboard_via_local_clone(tmp_path):
    """clone_repo는 github URL을 쓰지만, onboard의 나머지(탐지·임포트)는
    로컬 git 저장소로 검증한다."""
    src = _make_repo(tmp_path, "root", buggy=True)
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q"], cwd=src, check=True)
    subprocess.run(["git", "add", "-A"], cwd=src, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=src, env=env,
                   check=True)
    dest = tmp_path / "cloned"
    dest.mkdir()
    target = subprocess.run(["git", "clone", "-q", src, str(dest / "repo")],
                            capture_output=True)
    assert target.returncode == 0
    repo_dir = str(dest / "repo")
    pkg, path = cr.find_package(repo_dir)
    assert pkg == "demo"
    r = subprocess.run([sys.executable, "-c", "import demo"], cwd=repo_dir,
                       env={**os.environ, "PYTHONPATH": path},
                       capture_output=True)
    assert r.returncode == 0
