"""Real code-fix corpus: 16 buggy Python functions with public tests
(visible to the proposer and used for selection) and hidden tests
(final scoring only — never used for selection, never in prompts).

Hidden tests cover edges the public tests miss, so "passes public,
fails hidden" operationalizes regression/overfitting.

Safety: patches are statically checked (no imports, no exec/eval/open/
file/network) and run in a subprocess with a timeout. A rejected patch
consumes its budget slot.
"""

from __future__ import annotations

import ast
import subprocess
import sys
from pydantic import BaseModel, Field

TIMEOUT_S = 5


class FixTask(BaseModel):
    name: str
    description: str
    buggy_code: str
    public_tests: list[str]
    hidden_tests: list[str]


TASKS: list[FixTask] = [
    FixTask(
        name="sum_range",
        description="Return the sum of integers from a to b inclusive.",
        buggy_code="def sum_range(a, b):\n    return sum(range(a, b))\n",
        public_tests=["assert sum_range(1, 3) == 6",
                      "assert sum_range(2, 4) == 9"],
        hidden_tests=["assert sum_range(5, 5) == 5",
                      "assert sum_range(-2, 2) == 0"],
    ),
    FixTask(
        name="median",
        description="Return the median; average the two middle values "
                    "for even-length lists. Do not modify the input.",
        buggy_code=("def median(nums):\n    nums.sort()\n"
                    "    return nums[len(nums) // 2]\n"),
        public_tests=["assert median([1, 3, 2]) == 2",
                      "assert median([1, 2, 3, 4]) == 2.5"],
        hidden_tests=["assert median([1, 2, 3, 4]) == 2.5",
                      "x = [3, 1, 2]\nmedian(x)\nassert x == [3, 1, 2]"],
    ),
    FixTask(
        name="count_vowels",
        description="Count vowels (a, e, i, o, u) case-insensitively.",
        buggy_code=("def count_vowels(s):\n"
                    "    return sum(1 for ch in s if ch in 'aeiou')\n"),
        public_tests=["assert count_vowels('banana') == 3",
                      "assert count_vowels('Egg') == 1"],
        hidden_tests=["assert count_vowels('AeIoU') == 5",
                      "assert count_vowels('Apple') == 2"],
    ),
    FixTask(
        name="is_palindrome",
        description="True if the string reads the same forwards and "
                    "backwards, ignoring case.",
        buggy_code=("def is_palindrome(s):\n"
                    "    return s == s[::-1]\n"),
        public_tests=["assert is_palindrome('Aa') is True",
                      "assert is_palindrome('abc') is False"],
        hidden_tests=["assert is_palindrome('Abba') is True",
                      "assert is_palindrome('RaceCar') is True"],
    ),
    FixTask(
        name="fib",
        description="Return the n-th Fibonacci number with fib(0)=0, "
                    "fib(1)=1.",
        buggy_code=("def fib(n):\n    a, b = 1, 1\n"
                    "    for _ in range(n):\n        a, b = b, a + b\n"
                    "    return a\n"),
        public_tests=["assert fib(5) == 5", "assert fib(6) == 8"],
        hidden_tests=["assert fib(0) == 0", "assert fib(1) == 1",
                      "assert fib(2) == 1"],
    ),
    FixTask(
        name="flatten",
        description="Flatten one level: [[1,2],3,[4]] -> [1,2,3,4]. "
                    "Non-list items are kept as is.",
        buggy_code=("def flatten(lst):\n    out = []\n"
                    "    for item in lst:\n"
                    "        if isinstance(item, list):\n"
                    "            out.extend(item)\n"
                    "    return out\n"),
        public_tests=["assert flatten([[1, 2], [3]]) == [1, 2, 3]",
                      "assert flatten([[1], 2]) == [1, 2]"],
        hidden_tests=["assert flatten([[1], 2, [3]]) == [1, 2, 3]",
                      "assert flatten([1, 2]) == [1, 2]"],
    ),
    FixTask(
        name="clamp",
        description="Clamp x into the closed interval [lo, hi].",
        buggy_code=("def clamp(x, lo, hi):\n"
                    "    if x < lo:\n        return hi\n"
                    "    if x > hi:\n        return hi\n"
                    "    return x\n"),
        public_tests=["assert clamp(5, 1, 10) == 5",
                      "assert clamp(-3, 1, 10) == 1"],
        hidden_tests=["assert clamp(0, 1, 10) == 1",
                      "assert clamp(1, 1, 10) == 1"],
    ),
    FixTask(
        name="moving_average",
        description="Return the list of averages of every window of "
                    "size k (there are len(nums)-k+1 windows).",
        buggy_code=("def moving_average(nums, k):\n"
                    "    return [sum(nums[i:i + k]) / k\n"
                    "            for i in range(len(nums) - k)]\n"),
        public_tests=["assert moving_average([1, 2, 3, 4], 2) == "
                      "[1.5, 2.5, 3.5]"],
        hidden_tests=["assert moving_average([1, 2, 3], 3) == [2.0]",
                      "assert moving_average([4], 1) == [4.0]"],
    ),
    FixTask(
        name="dedup_preserve",
        description="Remove duplicates, keeping the FIRST occurrence "
                    "order.",
        buggy_code=("def dedup_preserve(lst):\n"
                    "    return sorted(set(lst))\n"),
        public_tests=["assert dedup_preserve([3, 1, 3]) == [3, 1]"],
        hidden_tests=["assert dedup_preserve([2, 2, 1, 2]) == [2, 1]",
                      "assert dedup_preserve([]) == []"],
    ),
    FixTask(
        name="word_count",
        description="Count words separated by any whitespace.",
        buggy_code=("def word_count(s):\n"
                    "    return len(s.split(' '))\n"),
        public_tests=["assert word_count('a b c') == 3",
                      "assert word_count('a  b') == 2"],
        hidden_tests=["assert word_count('a  b') == 2",
                      "assert word_count('a\\tb\\nc') == 3",
                      "assert word_count('') == 0"],
    ),
    FixTask(
        name="running_max",
        description="Return the running maximum list.",
        buggy_code=("def running_max(lst):\n    best = 0\n"
                    "    out = []\n"
                    "    for x in lst:\n"
                    "        best = max(best, x)\n"
                    "        out.append(best)\n"
                    "    return out\n"),
        public_tests=["assert running_max([1, 3, 2]) == [1, 3, 3]",
                      "assert running_max([-2, -1]) == [-2, -1]"],
        hidden_tests=["assert running_max([-5, -3, -4]) == [-5, -3, -3]",
                      "assert running_max([]) == []"],
    ),
    FixTask(
        name="binary_gap",
        description="Length of the longest run of zeros strictly "
                    "between two ones in the binary form of n.",
        buggy_code=("def binary_gap(n):\n    s = bin(n)[2:]\n"
                    "    best = cur = 0\n"
                    "    for ch in s:\n"
                    "        if ch == '0':\n            cur += 1\n"
                    "            best = max(best, cur)\n"
                    "        else:\n            cur = 0\n"
                    "    return best\n"),
        public_tests=["assert binary_gap(9) == 2",
                      "assert binary_gap(32) == 0"],
        hidden_tests=["assert binary_gap(20) == 1",
                      "assert binary_gap(15) == 0"],
    ),
    FixTask(
        name="merge_sorted",
        description="Merge two sorted lists into one sorted list.",
        buggy_code=("def merge_sorted(a, b):\n    out = []\n"
                    "    i = j = 0\n"
                    "    while i < len(a) and j < len(b):\n"
                    "        if a[i] <= b[j]:\n"
                    "            out.append(a[i]); i += 1\n"
                    "        else:\n"
                    "            out.append(b[j]); j += 1\n"
                    "    out.extend(a[i:])\n"
                    "    return out\n"),
        public_tests=["assert merge_sorted([1, 3], [2]) == [1, 2, 3]"],
        hidden_tests=["assert merge_sorted([1], [2, 3, 4]) == "
                      "[1, 2, 3, 4]",
                      "assert merge_sorted([], [1]) == [1]"],
    ),
    FixTask(
        name="caesar",
        description="Shift lowercase letters by k with wrap-around; "
                    "leave other characters unchanged.",
        buggy_code=("def caesar(s, k):\n"
                    "    out = ''\n"
                    "    for ch in s:\n"
                    "        if 'a' <= ch <= 'z':\n"
                    "            out += chr(ord(ch) + k)\n"
                    "        else:\n            out += ch\n"
                    "    return out\n"),
        public_tests=["assert caesar('abc', 1) == 'bcd'",
                      "assert caesar('z', 1) == 'a'"],
        hidden_tests=["assert caesar('xyz', 3) == 'abc'",
                      "assert caesar('a-b', 2) == 'c-d'"],
    ),
    FixTask(
        name="balanced_parens",
        description="True iff the parentheses string is balanced "
                    "(every ( closed by a later ), never negative).",
        buggy_code=("def balanced_parens(s):\n"
                    "    return s.count('(') == s.count(')')\n"),
        public_tests=["assert balanced_parens('(())') is True",
                      "assert balanced_parens('((') is False"],
        hidden_tests=["assert balanced_parens(')(') is False",
                      "assert balanced_parens('') is True"],
    ),
    FixTask(
        name="second_largest",
        description="Return the second largest DISTINCT value.",
        buggy_code=("def second_largest(lst):\n"
                    "    s = sorted(lst)\n    return s[-2]\n"),
        public_tests=["assert second_largest([1, 5, 3]) == 3"],
        hidden_tests=["assert second_largest([5, 5, 3]) == 3",
                      "assert second_largest([2, 9, 9, 4]) == 4"],
    ),
]


# ------------------------------------------------------------- execution


_FORBIDDEN_CALLS = {"open", "exec", "eval", "__import__", "compile",
                    "input", "breakpoint", "globals", "locals", "vars",
                    "getattr", "setattr", "delattr"}


def static_check(code: str) -> str | None:
    """Return an error string, or None if the patch is acceptable."""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return f"syntax error: {e}"
    if not any(isinstance(n, ast.FunctionDef) for n in tree.body):
        return "no function definition found"
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            return "imports are not allowed"
        if isinstance(node, ast.Name) and node.id in _FORBIDDEN_CALLS:
            return f"forbidden name: {node.id}"
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            return "dunder attribute access is not allowed"
    return None


def run_tests(patch_code: str, tests: list[str]) -> tuple[int, list[str]]:
    """Run each test snippet in isolation against the patch.
    Returns (passed_count, failure_messages)."""
    harness = [patch_code, "", "import traceback", "_fails = []"]
    for i, t in enumerate(tests):
        body = "\n".join("    " + line for line in t.splitlines())
        harness.append(
            f"try:\n{body}\nexcept Exception as e:\n"
            f"    _fails.append('test{i}: ' + repr(e)[:120])")
    harness.append("print('FAILS::' + '||'.join(_fails))")
    try:
        proc = subprocess.run(
            [sys.executable, "-c", "\n".join(harness)],
            capture_output=True, text=True, timeout=TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return 0, ["timeout"]
    out = proc.stdout.strip()
    if "FAILS::" not in out:
        err = (proc.stderr or "no output").strip().splitlines()
        return 0, [f"crashed: {err[-1] if err else 'unknown'}"[:160]]
    fails = [f for f in out.split("FAILS::", 1)[1].split("||") if f]
    return len(tests) - len(fails), fails


def normalize(code: str) -> str:
    """Structural signature for mechanical dedup."""
    try:
        return ast.dump(ast.parse(code))
    except SyntaxError:
        return "SYNTAX:" + code.strip()
