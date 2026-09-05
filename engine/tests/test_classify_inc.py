"""Guards for the INC classifier's id handling.

The first classification pass returned INC 0/9 because pytest reports
Windows node ids with backslashes while the manifests store forward
slashes, so every set intersection came out empty and conditions (a)
and (d) were meaningless. These pin the fix.
"""

from genesis.rookery.classify_inc import _norm


def test_norm_converts_path_separators():
    raw = r"more_itertools\tests\test_more.py::OnlyTests::test_x"
    assert _norm(raw) == \
        "more_itertools/tests/test_more.py::OnlyTests::test_x"


def test_norm_is_idempotent_on_posix_ids():
    posix = "tests/test_more.py::ChunkedTests::test_even"
    assert _norm(posix) == posix


def test_norm_leaves_test_name_untouched():
    """Only the path segment is normalized - a backslash inside a
    parametrized id must survive."""
    raw = r"tests\test_x.py::test_p[a\b]"
    assert _norm(raw) == r"tests/test_x.py::test_p[a\b]"


def test_v3a_tasks_are_banned_from_reuse():
    """§9 bans reusing spent tasks. The first scan admitted
    d992be0de = mi_running_minmax_stability, which had run in five
    earlier experiments."""
    from genesis.rookery.classify_inc import _is_spent_sha

    assert _is_spent_sha("more-itertools", "d992be0de1234")
    assert _is_spent_sha("dateutil", "424a438bcdef")
    assert _is_spent_sha("dateutil", "f42ee4c13c09")   # §8.3 sample

    # The negative side: the ban must not degenerate into "everything
    # is spent". The two §9.2 INC tasks that were fresh on 08-03 -
    # dateutil 15fc1fa8c and marshmallow d057cb976 - were consumed by
    # ablation 11 on 08-08 (data/rookery3a_report_ablation11.json runs
    # both), and the registry started resolving abl_<repo>_<sha9> ids
    # on 08-22 (5c7053b), so they are correctly spent now. The tasks
    # that are still unspent are the two ablation 11 rejected at
    # admission and therefore never ran - same pair pinned by
    # tests/test_spent.py::test_fresh_inc_tasks_are_not_spent.
    assert not _is_spent_sha("marshmallow", "ff18e782b000")
    assert not _is_spent_sha("more-itertools", "e0ee0c0f4000")
    # An unmined sha can never become spent, so this half of the
    # guarantee cannot go stale the way the pair above did.
    assert not _is_spent_sha("dateutil", "0123456789ab")


def test_normalized_ids_intersect_manifest_ids():
    manifest = {"more_itertools/tests/test_more.py::OnlyTests::test_x"}
    reported = {_norm(r"more_itertools\tests\test_more.py"
                      r"::OnlyTests::test_x")}
    assert manifest & reported, "intersection must not be empty"
