"""The two registered attractors for the 7B escape experiment
(docs/mission7b-design.md P34).

- full-share attractor: the ancestor itself (ALWAYS SHARE_BEST). The
  main runs already start there, so no separate escape runs are needed.
- suppression attractor: the direct 7B port of the deadlock protocol
  that mission 6's ms2 society adopted and mission 7A's escape runs
  started from (`consecutive_low_gain < 3 -> RAISE_THRESHOLD`, no share
  rule). Verified a local optimum by the same mechanism as before:
  suppressing everything beats sharing everything, and only a
  conditional-share structure beats suppression.
"""

from __future__ import annotations

from genesis.mission7b.dsl7b import Action, Condition, Protocol7B, Rule7B


def deadlock_protocol7b() -> Protocol7B:
    return Protocol7B(version=0, rules=[
        Rule7B(
            rule_id="g1-agent4-4",
            conditions=[Condition(metric="consecutive_low_gain", op="<",
                                  value=3.0)],
            actions=[Action(name="RAISE_THRESHOLD")],
            priority=8, author_id="agent4", created_gen=1,
        ),
    ])
