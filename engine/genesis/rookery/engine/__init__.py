"""Rookery Alpha engine (design §11).

Build order: A registry/resume -> B queue/scheduler/worker ->
C validator/selector/rollback -> D budget guard + safety policy ->
E deploy -> F seven-day unattended soak.
"""
