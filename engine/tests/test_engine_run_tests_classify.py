"""(b) 재검증 목 파일럿: toolz#529의 재현 테스트는 FAILED인데 실패
메시지의 'ImportError' 때문에 error로 오분류돼 I4 환경 의심 정지를
일으켰다. 분류는 pytest의 요약 줄이 결정한다."""

from genesis.rookery.engine.handlers import classify_pytest

FAILED_WITH_IMPORT_ERROR = """F
================================== FAILURES ===================================
>       from toolz import mapacc
E       ImportError: cannot import name 'mapacc' from 'toolz'

test_intake_toolz_529.py:8: ImportError
=========================== short test summary info ===========================
FAILED test_intake_toolz_529.py::test_mapacc_combination_of_map_and_accumulate
1 failed in 1.30s
"""

COLLECTION_ERROR = """
==================================== ERRORS ====================================
_________________ ERROR collecting test_intake_x.py _________________
ImportError while importing test module 'test_intake_x.py'.
=========================== short test summary info ===========================
ERROR test_intake_x.py
!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
1 error in 0.20s
"""


def test_failed_test_that_raises_import_error_is_fail():
    assert classify_pytest(1, FAILED_WITH_IMPORT_ERROR) == "fail"


def test_collection_error_is_error():
    assert classify_pytest(2, COLLECTION_ERROR) == "error"


def test_pass_and_no_tests_collected():
    assert classify_pytest(0, "1 passed in 0.1s") == "pass"
    assert classify_pytest(5, "no tests ran in 0.1s") == "error"
