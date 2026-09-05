"""Task adapters. `pyfix_sim` is the skeleton's end-to-end exercise: a
deterministic simulated bug-fixing domain (no model calls, no exec of
untrusted code). The real-repository adapter replaces the simulated
worker behind the same TaskAdapterP contract — and must sandbox test
execution before any LLM-written patch is ever run.
"""
