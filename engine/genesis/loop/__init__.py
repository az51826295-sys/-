"""The generic observe-propose-verify-adopt loop (proposal section 7).

Extracted from missions 6/7A so that mission 7B (extended DSL) and
Rookery Minimum (real tasks) can swap environments, proposers, and
selectors without touching the frozen experiment code. The frozen
`genesis.mission6.evolution` stays byte-identical for replay; the
equivalence test in tests/test_loop.py proves this layer reproduces
its behavior through the adapter.

Design invariants (proposal section 11):
- proposal power and verification power stay separate components;
- every adoption passes a validator the proposer cannot modify;
- every state change is registered and rollback-able.
"""
