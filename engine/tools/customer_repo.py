"""Week 2 — 임의 고객 저장소 온보딩 (docs/mvp-build-playbook.md 그림3).

앱이 설치된 저장소를 클론하고, 임포트 가능하게 만들고(root/src 레이아웃 자동),
그 안에서 재현 테스트를 실행한다. 지금 범위: **순수 파이썬 패키지**(빌드 불필요).
서드파티 의존성 부재 시 'needs_deps'로 정직하게 로그(venv 설치는 다음).

  from tools.customer_repo import onboard, reproduce_in
  repo = onboard("pytoolz/toolz", token=None)      # 공개면 토큰 없이
  outcome = reproduce_in(repo, test_src, "toolz_626")
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
import textwrap


def _run(argv, cwd=None, env=None, timeout=300):
    return subprocess.run(argv, cwd=cwd, env=env, capture_output=True,
                          text=True, encoding="utf-8", errors="replace",
                          timeout=timeout)


def clone_repo(full_name: str, dest: str, token: str | None = None,
               depth: int = 1) -> str:
    """설치 토큰(사설) 또는 공개 URL로 클론. dest/<name> 반환."""
    name = full_name.split("/")[1]
    target = os.path.join(dest, name)
    if os.path.exists(target):
        return target
    if token:
        url = f"https://x-access-token:{token}@github.com/{full_name}.git"
    else:
        url = f"https://github.com/{full_name}.git"
    r = _run(["git", "clone", "--depth", str(depth), url, target])
    if r.returncode != 0:
        raise RuntimeError(f"clone 실패 {full_name}: {r.stderr[:200]}")
    return target


def find_package(repo_dir: str) -> tuple[str | None, str | None]:
    """임포트 가능한 최상위 패키지와 그 경로(PYTHONPATH에 넣을 디렉터리).
    root 레이아웃(<repo>/<pkg>/__init__.py) 또는 src(<repo>/src/<pkg>/...)."""
    def pkg_in(base):
        try:
            for name in sorted(os.listdir(base)):
                d = os.path.join(base, name)
                if (os.path.isdir(d) and os.path.exists(
                        os.path.join(d, "__init__.py"))
                        and name not in ("tests", "test", "docs")):
                    return name
        except OSError:
            pass
        return None
    src = os.path.join(repo_dir, "src")
    if os.path.isdir(src):
        p = pkg_in(src)
        if p:
            return p, src
    p = pkg_in(repo_dir)
    if p:
        return p, repo_dir
    return None, None


def _env_with_path(path_dir: str | None) -> dict:
    env = dict(os.environ)
    if path_dir:
        env["PYTHONPATH"] = path_dir + os.pathsep + env.get("PYTHONPATH", "")
    return env


def onboard(full_name: str, token: str | None = None,
            dest: str | None = None) -> dict:
    """클론 + 패키지 탐지 + 임포트 확인. 반환: {dir, pkg, pythonpath, importable}."""
    dest = dest or tempfile.mkdtemp(prefix="cust_")
    repo_dir = clone_repo(full_name, dest, token)
    pkg, path_dir = find_package(repo_dir)
    importable = False
    detail = ""
    if pkg:
        r = _run([sys.executable, "-c", f"import {pkg}"],
                 cwd=repo_dir, env=_env_with_path(path_dir), timeout=60)
        importable = r.returncode == 0
        if not importable:
            m = re.search(r"No module named '([\w\.]+)'", r.stderr)
            detail = ("needs_deps: " + m.group(1)) if m else r.stderr[:120]
    return {"dir": repo_dir, "pkg": pkg, "pythonpath": path_dir,
            "importable": importable, "detail": detail, "full_name": full_name}


def reproduce_in(repo: dict, test_src: str, tag: str) -> str:
    """온보드된 저장소에서 재현 테스트 실행.
    'accepted'(HEAD에서 실패=재현) / 'not_reproducible'(통과) /
    'invalid'(수집·실행 오류) / 'needs_deps'(임포트 불가)."""
    if not repo.get("importable"):
        return "needs_deps"
    fname = f"test_repro_{tag}.py"
    path = os.path.join(repo["dir"], fname)
    with open(path, "w", encoding="utf-8") as f:
        f.write(textwrap.dedent(test_src))
    try:
        r = _run([sys.executable, "-m", "pytest", "-q", "--no-header",
                  "--tb=no", "-rA", "-o", "addopts=", fname],
                 cwd=repo["dir"], env=_env_with_path(repo["pythonpath"]),
                 timeout=180)
    except subprocess.TimeoutExpired:
        os.remove(path)
        return "invalid"
    finally:
        if os.path.exists(path):
            os.remove(path)
    out = (r.stdout or "") + (r.stderr or "")
    if re.search(r"^FAILED ", out, re.M):
        return "accepted"
    if re.search(r"^PASSED ", out, re.M) and not re.search(
            r"^(ERROR|FAILED) ", out, re.M):
        return "not_reproducible"
    return "invalid"
