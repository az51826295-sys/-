"""v3a task mining & verification (docs/rookery-exp3a-design.md §7.1).

A task is a manifest pointing at a real repository's past bug: the
parent (buggy) commit is the working state; the fix commit is the
sealed answer key. Every test id carries a registered EXPECTATION at
the parent and fix commits, and `verify_task` enforces all of them
before a task may enter the corpus:

  public_pass  — parent PASS (pre-existing related tests)
  public_repro — parent FAIL, fix PASS (the visible symptom)
  hidden       — parent FAIL, fix PASS (fix-commit regression tests
                 + 1-3 independent variants; new-feature tests banned)
  regression   — parent PASS (must survive any patch)

Failure codes are kept distinct end-to-end (design §4): environment
failures must never be counted as model failures.
"""

from __future__ import annotations

import os
import subprocess
import sys

from pydantic import BaseModel, Field

CACHE = os.path.join("data", "repos")
TEST_TIMEOUT_S = 180

FAILURE_CODES = ("env_setup_fail", "test_timeout", "patch_parse_fail",
                 "patch_apply_fail", "public_fail", "hidden_fail",
                 "regression")


class RepoTask(BaseModel):
    task_id: str
    repo_url: str
    repo_name: str
    parent_commit: str           # buggy state the agent works on
    fix_commit: str              # sealed answer key
    files_changed: list[str]
    public_pass: list[str] = Field(default_factory=list)   # pytest ids
    public_repro: list[str] = Field(default_factory=list)
    hidden: list[str] = Field(default_factory=list)
    regression: list[str] = Field(default_factory=list)
    # standalone test files written into the worktree by the harness
    # (repro snippets + hidden variants live here so they run at BOTH
    # commits; fix-commit test ids don't exist at the parent)
    extra_test_files: dict[str, str] = Field(default_factory=dict)
    issue_summary: str = ""      # what the agent is told (no fix info)
    # symbols shown to the agent: "func", "Class" or "Class.method" per
    # files_changed order — windowing for multi-thousand-line files
    focus_symbols: list[str] = Field(default_factory=list)
    # broad module-level regression, FINAL validator only (the small
    # `regression` ids double as the selector's public smoke tests
    # since the 2026-08-02 A/B revision)
    regression_hidden: list[str] = Field(default_factory=list)
    license_note: str = ""


def _run(cmd: list[str], cwd: str, timeout: int = TEST_TIMEOUT_S,
         env: dict | None = None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True,
                          timeout=timeout, env=env)


def ensure_clone(task: RepoTask) -> str:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, task.repo_name)
    if not os.path.exists(path):
        r = _run(["git", "clone", "--quiet", task.repo_url,
                  task.repo_name], CACHE, timeout=600)
        if r.returncode != 0:
            raise RuntimeError(f"env_setup_fail: clone: {r.stderr[:200]}")
    return path


def worktree_at(task: RepoTask, commit: str, label: str) -> str:
    repo = ensure_clone(task)
    wt = os.path.join(CACHE, f"{task.task_id}_{label}")
    if not os.path.exists(wt):
        r = _run(["git", "worktree", "add", "--force",
                  os.path.abspath(wt), commit], repo)
        if r.returncode != 0:
            raise RuntimeError(
                f"env_setup_fail: worktree: {r.stderr[:200]}")
    for name, content in task.extra_test_files.items():
        with open(os.path.join(wt, name), "w", encoding="utf-8") as f:
            f.write(content)
    return wt


def run_pytest(wt: str, test_ids: list[str]) -> tuple[str, str]:
    """Returns (outcome, detail): outcome in {'pass','fail',
    'test_timeout','env_setup_fail'}. Repos shipping the package
    under src/ (marshmallow-style, corpus v2) get src prepended to
    PYTHONPATH; flat repos are unaffected."""
    if not test_ids:
        return "pass", "no tests"
    env = None
    src = os.path.join(wt, "src")
    if os.path.isdir(src):
        env = dict(os.environ)
        env["PYTHONPATH"] = os.path.abspath(src) + os.pathsep \
            + env.get("PYTHONPATH", "")
    try:
        # -o addopts= neutralizes repo pytest.ini extras (e.g. tinydb
        # forces --cov, which would demand pytest-cov in our env)
        r = _run([sys.executable, "-m", "pytest", "-x", "-q",
                  "--no-header", "-o", "addopts=", *test_ids], wt,
                 env=env)
    except subprocess.TimeoutExpired:
        return "test_timeout", ""
    if r.returncode == 0:
        return "pass", r.stdout[-200:]
    if ("ERROR" in r.stdout and "collection" in r.stdout.lower()) or \
            "ImportError" in (r.stdout + r.stderr):
        return "env_setup_fail", (r.stdout + r.stderr)[-300:]
    return "fail", r.stdout[-300:]


def verify_task(task: RepoTask) -> list[str]:
    """Every registered expectation, checked at both commits.
    Returns a list of violations (empty = task admitted)."""
    problems = []
    parent = worktree_at(task, task.parent_commit, "parent")
    fix = worktree_at(task, task.fix_commit, "fix")
    expectations = [
        ("public_pass", task.public_pass, parent, "pass"),
        ("public_repro", task.public_repro, parent, "fail"),
        ("public_repro@fix", task.public_repro, fix, "pass"),
        ("hidden", task.hidden, parent, "fail"),
        ("hidden@fix", task.hidden, fix, "pass"),
        ("regression", task.regression, parent, "pass"),
    ]
    for name, ids, wt, want in expectations:
        for tid in ids:
            got, detail = run_pytest(wt, [tid])
            if got in ("test_timeout", "env_setup_fail"):
                problems.append(f"{name}: {tid}: {got}")
            elif got != want:
                problems.append(
                    f"{name}: {tid}: expected {want}, got {got}")
    return problems


_MI_URL = "https://github.com/more-itertools/more-itertools.git"

TASKS_V3A: list[RepoTask] = [
    RepoTask(
        task_id="mi_sliced_negative",
        regression_hidden=['tests/test_recipes.py'],
        focus_symbols=['sliced'],
        repo_url=_MI_URL,
        repo_name="more-itertools",
        parent_commit="ed86a1528aa015f219f8d3385ea2ebd3f63a5212",
        fix_commit="958990e",
        files_changed=["more_itertools/more.py"],
        public_pass=["tests/test_more.py::SlicedTests"],
        public_repro=["test_rk_public.py"],
        hidden=["test_rk_hidden.py"],
        regression=["tests/test_more.py::ChunkedTests"],
        extra_test_files={
            "test_rk_public.py": (
                "import pytest\n"
                "import more_itertools as mi\n\n\n"
                "def test_sliced_negative_raises():\n"
                "    with pytest.raises(ValueError):\n"
                "        list(mi.sliced('ABCDEFG', -1))\n"
            ),
            "test_rk_hidden.py": (
                "import pytest\n"
                "import more_itertools as mi\n\n\n"
                "def test_sliced_negative_strict():\n"
                "    with pytest.raises(ValueError):\n"
                "        list(mi.sliced('ABCDEFG', -1, strict=True))\n\n\n"
                "def test_sliced_negative_other_sizes():\n"
                "    with pytest.raises(ValueError):\n"
                "        list(mi.sliced(list(range(10)), -3))\n\n\n"
                "def test_sliced_positive_still_works():\n"
                "    assert list(mi.sliced('ABCDEF', 2)) == "
                "['AB', 'CD', 'EF']\n"
            ),
        },
        issue_summary=(
            "sliced(seq, n)에 음수 n을 주면 조용히 잘못된 결과를 "
            "돌려준다. 잘못된 크기는 명시적으로 거부되어야 한다."),
        license_note="MIT",
    ),
    RepoTask(
        task_id="mi_interleave_empty",
        regression_hidden=['tests/test_recipes.py'],
        focus_symbols=['interleave_evenly'],
        repo_url=_MI_URL,
        repo_name="more-itertools",
        parent_commit="5d946b3590bfe92f1465c1b9b9830dd434745c84",
        fix_commit="f51a53b",
        files_changed=["more_itertools/more.py"],
        public_pass=["tests/test_more.py::InterleaveEvenlyTests"],
        public_repro=["test_rk_public.py"],
        hidden=["test_rk_hidden.py"],
        regression=["tests/test_more.py::SlicedTests"],
        extra_test_files={
            "test_rk_public.py": (
                "import more_itertools as mi\n\n\n"
                "def test_interleave_evenly_empty():\n"
                "    assert list(mi.interleave_evenly([])) == []\n"
            ),
            "test_rk_hidden.py": (
                "import more_itertools as mi\n\n\n"
                "def test_empty_with_lengths():\n"
                "    assert list(mi.interleave_evenly([], lengths=[]))"
                " == []\n\n\n"
                "def test_nonempty_still_works():\n"
                "    assert list(mi.interleave_evenly([[1, 2], [3]]))"
                " == [1, 2, 3]\n"
            ),
        },
        issue_summary=(
            "interleave_evenly에 빈 iterable 목록을 주면 예외가 "
            "발생한다. 빈 입력은 빈 결과를 내야 한다."),
        license_note="MIT",
    ),
    RepoTask(
        task_id="mi_numeric_range_reversed",
        regression_hidden=['tests/test_recipes.py'],
        focus_symbols=['numeric_range'],
        repo_url=_MI_URL,
        repo_name="more-itertools",
        parent_commit="247e15b3a489d5805375c95dfa79486c9bd0eb1b",
        fix_commit="edb3346",
        files_changed=["more_itertools/more.py"],
        public_pass=["tests/test_more.py::NumericRangeTests"],
        public_repro=["test_rk_public.py"],
        hidden=["test_rk_hidden.py"],
        regression=["tests/test_more.py::SlicedTests"],
        extra_test_files={
            "test_rk_public.py": (
                "import more_itertools as mi\n\n\n"
                "def test_empty_reversed():\n"
                "    assert list(reversed(mi.numeric_range(0))) == []\n"
            ),
            "test_rk_hidden.py": (
                "import more_itertools as mi\n\n\n"
                "def test_reversed_empty_bounds():\n"
                "    assert list(reversed(mi.numeric_range(5, 5)))"
                " == []\n\n\n"
                "def test_reversed_nonempty():\n"
                "    assert list(reversed(mi.numeric_range(3)))"
                " == [2, 1, 0]\n"
            ),
        },
        issue_summary=(
            "빈 numeric_range를 reversed()로 뒤집으면 잘못된 동작을 "
            "한다. 빈 범위의 역순은 빈 결과여야 한다."),
        license_note="MIT",
    ),
    RepoTask(
        task_id="mi_running_minmax_stability",
        regression_hidden=['tests/test_recipes.py'],
        focus_symbols=['running_min', 'running_max'],
        repo_url=_MI_URL,
        repo_name="more-itertools",
        parent_commit="cb75bb9c55f7ed3e77ce599097e1ba8da411746d",
        fix_commit="d992be0",
        files_changed=["more_itertools/recipes.py"],
        public_pass=["tests/test_more.py::TestRunningMin"],
        public_repro=["test_rk_public.py"],
        hidden=["test_rk_hidden.py"],
        regression=["tests/test_more.py::TestRunningMax"],
        extra_test_files={
            "test_rk_public.py": (
                "from fractions import Fraction\n"
                "import more_itertools as mi\n\n\n"
                "def test_running_min_stability_maxlen():\n"
                "    # min(x, y) returns x when x == y\n"
                "    data = [0, 0.0, Fraction(0)]\n"
                "    assert list(map(type, mi.running_min(data,"
                " maxlen=2))) == [\n"
                "        type(min(data[0:1])), type(min(data[0:2])),"
                " type(min(data[1:3]))]\n"
            ),
            "test_rk_hidden.py": (
                "from fractions import Fraction\n"
                "import more_itertools as mi\n\n\n"
                "def test_running_max_stability_maxlen():\n"
                "    data = [0, 0.0, Fraction(0)]\n"
                "    assert list(map(type, mi.running_max(data,"
                " maxlen=2))) == [\n"
                "        type(max(data[0:1])), type(max(data[0:2])),"
                " type(max(data[1:3]))]\n\n\n"
                "def test_running_max_tie_keeps_first_type():\n"
                "    assert list(map(type, mi.running_max([1, 1.0])))"
                " == [int, int]\n"
            ),
        },
        issue_summary=(
            "running_min/running_max가 동률일 때 파이썬의 min/max "
            "규약(동률이면 앞의 값 유지)을 지키지 않는다."),
        license_note="MIT",
    ),
]

_TDB_URL = "https://github.com/msiemens/tinydb.git"

TASKS_V3A += [
    RepoTask(
        task_id="tdb_lru_falsy",
        regression_hidden=['tests/test_tinydb.py'],
        focus_symbols=['LRUCache'],
        repo_url=_TDB_URL,
        repo_name="tinydb",
        parent_commit="10644a0e07ad180c5b756aba272ee6b0dbd12df8",
        fix_commit="dcf0a01",
        files_changed=["tinydb/utils.py"],
        public_pass=["tests/test_utils.py"],
        public_repro=["test_rk_public.py"],
        hidden=["test_rk_hidden.py"],
        regression=["tests/test_operations.py"],
        extra_test_files={
            "test_rk_public.py": (
                "from tinydb.utils import LRUCache\n\n\n"
                "def test_falsy_update_moves_to_end():\n"
                "    cache = LRUCache(capacity=3)\n"
                "    cache['a'] = 0\n"
                "    cache['b'] = 1\n"
                "    cache['c'] = 2\n"
                "    cache.set('a', 3)\n"
                "    assert cache.lru == ['b', 'c', 'a']\n"
            ),
            "test_rk_hidden.py": (
                "from tinydb.utils import LRUCache\n\n\n"
                "def test_none_value_update():\n"
                "    cache = LRUCache(capacity=2)\n"
                "    cache['x'] = None\n"
                "    cache['y'] = 1\n"
                "    cache.set('x', 5)\n"
                "    assert cache.lru == ['y', 'x']\n"
                "    cache['z'] = 9\n"
                "    assert 'y' not in cache.lru\n\n\n"
                "def test_falsy_get_refreshes_order():\n"
                "    cache = LRUCache(capacity=2)\n"
                "    cache['a'] = 0\n"
                "    cache['b'] = ''\n"
                "    assert cache['a'] == 0\n"
                "    assert cache.lru == ['b', 'a']\n"
            ),
        },
        issue_summary=(
            "LRUCache가 falsy 값(0, None, '')을 가진 키를 없는 키처럼 "
            "취급해 LRU 순서 갱신이 깨진다."),
        license_note="MIT",
    ),
    RepoTask(
        task_id="tdb_lru_set_update",
        regression_hidden=['tests/test_tinydb.py'],
        focus_symbols=['LRUCache'],
        repo_url=_TDB_URL,
        repo_name="tinydb",
        parent_commit="87e7ed360fa0cb64d166e3bbe35d0bfb15b4adeb",
        fix_commit="781fb6c",
        files_changed=["tinydb/utils.py"],
        public_pass=["tests/test_utils.py"],
        public_repro=["test_rk_public.py"],
        hidden=["test_rk_hidden.py"],
        regression=["tests/test_operations.py"],
        extra_test_files={
            "test_rk_public.py": (
                "from tinydb.utils import LRUCache\n\n\n"
                "def test_set_updates_existing_value():\n"
                "    cache = LRUCache(capacity=3)\n"
                "    cache['a'] = 1\n"
                "    cache['a'] = 2\n"
                "    assert cache['a'] == 2\n"
            ),
            "test_rk_hidden.py": (
                "from tinydb.utils import LRUCache\n\n\n"
                "def test_update_does_not_grow():\n"
                "    cache = LRUCache(capacity=3)\n"
                "    cache['a'] = 1\n"
                "    cache['a'] = 9\n"
                "    assert len(cache.lru) == 1\n\n\n"
                "def test_update_refreshes_order():\n"
                "    cache = LRUCache(capacity=2)\n"
                "    cache['a'] = 1\n"
                "    cache['b'] = 2\n"
                "    cache['a'] = 7\n"
                "    cache['c'] = 3\n"
                "    assert cache['a'] == 7\n"
                "    assert 'b' not in cache.lru\n"
            ),
        },
        issue_summary=(
            "LRUCache에 이미 있는 키를 다시 set하면 값이 갱신되지 "
            "않는다."),
        license_note="MIT",
    ),
    RepoTask(
        task_id="tdb_doc_ids_missing",
        regression_hidden=['tests/test_utils.py'],
        focus_symbols=['Table.update', 'Table.remove'],
        repo_url=_TDB_URL,
        repo_name="tinydb",
        parent_commit="8a2dc204c265c07ce8506a3599a28e720b6dcdd7",
        fix_commit="76d21d2",
        files_changed=["tinydb/table.py"],
        public_pass=["tests/test_operations.py"],
        public_repro=["test_rk_public.py"],
        hidden=["test_rk_hidden.py"],
        regression=["tests/test_utils.py"],
        extra_test_files={
            "test_rk_public.py": (
                "from tinydb import TinyDB\n"
                "from tinydb.storages import MemoryStorage\n\n\n"
                "def _db():\n"
                "    db = TinyDB(storage=MemoryStorage)\n"
                "    db.insert_multiple({'n': i} for i in range(3))\n"
                "    return db\n\n\n"
                "def test_remove_missing_id_is_silent():\n"
                "    db = _db()\n"
                "    assert db.remove(doc_ids=[99]) == []\n"
                "    assert len(db) == 3\n"
            ),
            "test_rk_hidden.py": (
                "from tinydb import TinyDB\n"
                "from tinydb.storages import MemoryStorage\n\n\n"
                "def _db():\n"
                "    db = TinyDB(storage=MemoryStorage)\n"
                "    db.insert_multiple({'n': i} for i in range(3))\n"
                "    return db\n\n\n"
                "def test_remove_mixed_ids():\n"
                "    db = _db()\n"
                "    assert sorted(db.remove(doc_ids=[1, 99])) == [1]\n"
                "    assert len(db) == 2\n"
                "    assert db.get(doc_id=1) is None\n\n\n"
                "def test_update_missing_id_is_silent():\n"
                "    db = _db()\n"
                "    assert db.update({'n': 9}, doc_ids=[99]) == []\n"
                "    assert len(db) == 3\n\n\n"
                "def test_update_mixed_ids():\n"
                "    db = _db()\n"
                "    assert sorted(db.update({'n': 9},"
                " doc_ids=[2, 99])) == [2]\n"
                "    assert db.get(doc_id=2)['n'] == 9\n"
            ),
        },
        issue_summary=(
            "remove/update에 존재하지 않는 doc_id를 주면 예외로 "
            "터진다. get(doc_id=N)의 조용한 동작과 일관되게, 없는 "
            "ID는 건너뛰고 실제 처리된 ID만 반환해야 한다."),
        license_note="MIT",
    ),
]

_DU_URL = "https://github.com/dateutil/dateutil.git"

TASKS_V3A += [
    RepoTask(
        task_id="du_isotime_midnight",
        regression_hidden=['dateutil/test/test_easter.py'],
        focus_symbols=['isoparser.parse_isotime', 'isoparser._parse_isotime'],
        repo_url=_DU_URL,
        repo_name="dateutil",
        parent_commit="a134fb4e7ba17de472371ba7c6bf0dd1e9fc6794",
        fix_commit="f48e256",
        files_changed=["dateutil/parser/isoparser.py"],
        public_pass=["dateutil/test/test_isoparser.py::test_year_only"],
        public_repro=[
            "dateutil/test/test_isoparser.py::test_isotime_midnight"],
        hidden=["test_rk_hidden.py"],
        regression=["dateutil/test/test_isoparser.py::test_year_month"],
        extra_test_files={
            "test_rk_hidden.py": (
                "from datetime import time\n"
                "from dateutil.parser import isoparser\n\n\n"
                "def test_midnight_short_form():\n"
                "    assert isoparser().parse_isotime('24:00')"
                " == time(0, 0)\n\n\n"
                "def test_midnight_compact_form():\n"
                "    assert isoparser().parse_isotime('2400')"
                " == time(0, 0)\n\n\n"
                "def test_normal_time_unchanged():\n"
                "    assert isoparser().parse_isotime('23:30')"
                " == time(23, 30)\n"
            ),
        },
        issue_summary=(
            "ISO 시각 문자열 '24:00'(자정 표기)을 parse_isotime이 "
            "처리하지 못하고 실패한다. 24:00은 자정으로 해석되어야 "
            "한다."),
        license_note="Apache-2.0/BSD-3",
    ),
    RepoTask(
        task_id="du_isoparse_t24_rollover",
        regression_hidden=['dateutil/test/test_easter.py'],
        focus_symbols=['isoparser'],
        repo_url=_DU_URL,
        repo_name="dateutil",
        parent_commit="86e33512c41a04b989b14966a722608035a87b51",
        fix_commit="424a438",
        files_changed=["dateutil/parser/isoparser.py"],
        public_pass=["dateutil/test/test_isoparser.py::test_year_only"],
        public_repro=["test_rk_public.py"],
        hidden=["test_rk_hidden.py"],
        regression=["dateutil/test/test_isoparser.py::test_year_month"],
        extra_test_files={
            "test_rk_public.py": (
                "from datetime import datetime\n"
                "from dateutil.parser import isoparse\n\n\n"
                "def test_t2400_rolls_to_next_day():\n"
                "    assert isoparse('2014-04-10T24:00')"
                " == datetime(2014, 4, 11, 0, 0)\n"
            ),
            "test_rk_hidden.py": (
                "from datetime import datetime\n"
                "from dateutil.parser import isoparse\n\n\n"
                "def test_t24_full_form():\n"
                "    assert isoparse('2014-04-10T24:00:00')"
                " == datetime(2014, 4, 11, 0, 0)\n\n\n"
                "def test_t24_month_end():\n"
                "    assert isoparse('2019-01-31T24:00')"
                " == datetime(2019, 2, 1, 0, 0)\n\n\n"
                "def test_normal_datetime_unchanged():\n"
                "    assert isoparse('2014-04-10T23:59')"
                " == datetime(2014, 4, 10, 23, 59)\n"
            ),
        },
        issue_summary=(
            "isoparse가 'T24:00'(하루의 끝 표기)을 같은 날 00:00으로 "
            "잘못 해석한다. 다음 날 00:00이 되어야 한다."),
        license_note="Apache-2.0/BSD-3",
    ),
]
