"""pr_prepare의 순수 부분: 회귀 테스트 초안 변환과 테스트 파일 찾기."""

import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(os.path.dirname(HERE), "tools", "pr_prepare.py")


def load():
    spec = importlib.util.spec_from_file_location("pr_prepare", TOOL)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


INTAKE = '''import pytest
from toolz import compose


def test_compose_type_hints():
    assert compose is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
'''


def test_draft_regression_renames_and_strips_main():
    m = load()
    out = m.draft_regression(INTAKE, 496, "pytoolz/toolz")
    assert "def test_issue_496_compose_type_hints():" in out
    assert "__main__" not in out and "pytest.main" not in out
    assert "regression test for pytoolz/toolz#496" in out
    assert "from toolz import compose" in out


def test_find_test_file_matches_changed_module(tmp_path):
    m = load()
    (tmp_path / "toolz" / "tests").mkdir(parents=True)
    (tmp_path / "toolz" / "tests" / "test_functoolz.py").write_text("", encoding="utf-8")
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "test_x.py").write_text("", encoding="utf-8")
    assert m.find_test_file(str(tmp_path), ["toolz/functoolz.py"]) == \
        "toolz/tests/test_functoolz.py"
    assert m.find_test_file(str(tmp_path), ["toolz/other.py"]) is None
    assert m.find_test_file(str(tmp_path), ["toolz/__init__.py"]) is None
