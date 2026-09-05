"""에이전트 도구 v2 (docs/agent-tools-v2-design.md): 줄 범위 읽기가 절단을
말하고, 검색이 정의를 찾고, 디렉터리 지도가 깊이를 지키며, 전부 격리
경계 안에서만 본다."""

import os
import subprocess

import pytest

from genesis.rookery.engine import agent_tools as t2
from genesis.rookery.engine.isolation import Workspace


@pytest.fixture()
def ws(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
           "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=repo, check=True)
    (repo / "pkg").mkdir()
    (repo / "pkg" / "__init__.py").write_text("", encoding="utf-8")
    big = "\n".join(f"line {i}" if i != 777 else "def needle(): pass"
                    for i in range(1, 1001)) + "\n"
    (repo / "pkg" / "big.py").write_text(big, encoding="utf-8")
    (repo / "pkg" / "sub").mkdir()
    (repo / "pkg" / "sub" / "deep.py").write_text("needle = 1\n",
                                                  encoding="utf-8")
    (repo / "README.md").write_text("needle in docs\n", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=repo, env=env,
                   check=True)
    w = Workspace(str(repo), "t1", str(tmp_path / "work")).create()
    yield w
    w.destroy()


def test_read_range_pages_and_announces_truncation(ws):
    out = t2.read_range(ws, "pkg/big.py", 1, 200)
    assert out.startswith("[pkg/big.py: 총 1000줄, 이번 1~200줄, 다음: start_line=201]")
    assert "1: line 1" in out and "200: line 200" in out
    assert "201: line 201" not in out
    out2 = t2.read_range(ws, "pkg/big.py", 901, 200)
    assert "이번 901~1000줄, 끝]" in out2
    assert "범위 밖" in t2.read_range(ws, "pkg/big.py", 5000)
    assert "오류" in t2.read_range(ws, "nope.py")
    assert "오류" in t2.read_range(ws, "../outside.py")     # 격리


def test_search_finds_definitions_across_the_tree(ws):
    out = t2.search(ws, r"def needle")
    assert "pkg/big.py:777: def needle(): pass" in out
    assert out.startswith("[search 'def needle' in **/*.py: 1건")
    all_py = t2.search(ws, "needle")
    assert "pkg/sub/deep.py:1:" in all_py and "README.md" not in all_py
    md = t2.search(ws, "needle", path_glob="*.md")
    assert "README.md:1: needle in docs" in md
    capped = t2.search(ws, "line", max_hits=5)
    assert "5건 (상한 도달)" in capped
    assert "정규식 불량" in t2.search(ws, "(")
    assert t2.search(ws, "zzz").endswith("(없음)")


def test_list_dir_respects_depth_and_isolation(ws):
    one = t2.list_dir(ws, ".", 1)
    assert "pkg/" in one and "README.md" in one and "deep.py" not in one
    two = t2.list_dir(ws, "pkg", 2)
    assert "pkg/sub/" in two and "pkg/sub/deep.py" in two
    assert "오류" in t2.list_dir(ws, "..")
    assert "디렉터리 아님" in t2.list_dir(ws, "README.md")


def test_exec_tool_dispatch_and_missing_args(ws):
    assert t2.exec_tool(ws, "edit_file", {}) is None, "v1 도구는 호출부로"
    assert "인자 누락" in t2.exec_tool(ws, "read_file", {})
    assert "인자 누락" in t2.exec_tool(ws, "search", {})
    assert t2.exec_tool(ws, "list_dir", {}).startswith("[. 깊이 1")
    assert "총 1000줄" in t2.exec_tool(ws, "read_file",
                                      {"path": "pkg/big.py",
                                       "start_line": 10, "max_lines": 5})
