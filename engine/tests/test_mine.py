"""Regression tests for the corpus-v2 mining verifier.

The v1 verifier falsely disqualified 13/14 candidates (bare-name test
matching, missing test-infra injection, relative imports in extracted
modules — design §8.1). These tests pin the v2 behavior with known
positive and negative cases so the false-negative class cannot
silently return. They run real git + pytest against the cloned repos
in data/repos and are skipped when those clones are absent.
"""

import os

import pytest

REPOS = os.path.join("data", "repos")

pytestmark = pytest.mark.skipif(
    not os.path.isdir(os.path.join(REPOS, "dateutil")),
    reason="mining repo clones not present")


def test_changed_tests_line_mapping_does_not_explode():
    """v1 matched every class's test_basic by bare name (50 ids from
    one commit); v2 maps diff-hunk lines onto the AST."""
    from genesis.rookery.mine import _changed_tests

    ids = _changed_tests(os.path.join(REPOS, "more-itertools"),
                         "4bd0bd876", ["tests/test_more.py"])
    assert 0 < len(ids) < 10
    names = {m["name"] for m in ids}
    assert "test_basic" not in names or len(ids) < 10


def test_abs_import_rewrite():
    from genesis.rookery.mine import _abs_imports

    src = "from ._common import unittest\nfrom .. import top\n"
    out = _abs_imports(src, "dateutil/test/test_x.py")
    assert "from dateutil.test._common import " in out
    assert "from dateutil import " in out or "from dateutil. import" \
        not in out


def test_known_positive_qualifies():
    """dateutil f42ee4c13 was a v1 false negative (env_setup_fail at
    parent because _common.py was not injected); v2 must qualify it
    with a clean fail->pass matrix and fire the selector-event
    probe."""
    from genesis.rookery.mine import verify

    m = verify("dateutil", "f42ee4c13")
    assert m["qualified"]
    assert m["selector_event_proxy"]
    assert all(v["parent"] == "fail" and v["fix"] == "pass"
               for v in m["added_tests"].values())


def test_event_requires_fix_passing_discriminator():
    """more-itertools e0ee0c0f4 was a selector-event FALSE POSITIVE:
    its only still-failing test fails at the fix commit too (fail->
    fail), so it discriminates nothing. The corrected rule must not
    fire (design 8.3)."""
    from genesis.rookery.mine import verify

    m = verify("more-itertools", "e0ee0c0f4")
    assert m["qualified"]
    assert not m["selector_event_proxy"]


def test_known_negative_stays_disqualified():
    """tinydb 1fa99fb3f: the changed test passes at parent too — not
    a behavioural repro. Must remain unqualified (a true negative,
    not the v1 false-negative class)."""
    from genesis.rookery.mine import verify

    m = verify("tinydb", "1fa99fb3f")
    assert not m["qualified"]
    assert m["env_error_tests"] == 0
