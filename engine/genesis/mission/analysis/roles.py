"""Functional role differentiation, measured from the behavior log only.

Traits are never an input here (design 8): if roles exist, the log alone
must show them.
"""

from __future__ import annotations

import math

from genesis.mission.models import ACTION_KINDS, BoardEvent


def action_distribution(
    events: list[BoardEvent], agent_ids: list[str]
) -> dict[str, list[float]]:
    counts = {aid: [0.0] * len(ACTION_KINDS) for aid in agent_ids}
    for e in events:
        if e.kind in ACTION_KINDS and e.agent_id in counts:
            counts[e.agent_id][ACTION_KINDS.index(e.kind)] += 1
    out = {}
    for aid, vec in counts.items():
        total = sum(vec)
        out[aid] = [v / total for v in vec] if total else [0.0] * len(ACTION_KINDS)
    return out


def _kl(p: list[float], q: list[float]) -> float:
    return sum(pi * math.log(pi / qi) for pi, qi in zip(p, q) if pi > 0 and qi > 0)


def jsd(p: list[float], q: list[float]) -> float:
    """Jensen-Shannon divergence, normalized to 0..1 (natural log / ln 2)."""
    m = [(pi + qi) / 2 for pi, qi in zip(p, q)]
    return (0.5 * _kl(p, m) + 0.5 * _kl(q, m)) / math.log(2)


def differentiation(events: list[BoardEvent], agent_ids: list[str]) -> float:
    """Mean pairwise JSD between agents' action distributions."""
    dists = action_distribution(events, agent_ids)
    active = [aid for aid in agent_ids if sum(dists[aid]) > 0]
    if len(active) < 2:
        return 0.0
    pairs = [
        jsd(dists[a], dists[b])
        for i, a in enumerate(active)
        for b in active[i + 1 :]
    ]
    return sum(pairs) / len(pairs)


def context_responsiveness(
    events: list[BoardEvent], agent_ids: list[str], total_rounds: int
) -> float:
    """Does the same agent behave differently early vs late? (design 8-4:
    if roles were only trait echoes, this stays near zero)."""
    half = total_rounds / 2
    early = [e for e in events if e.round <= half]
    late = [e for e in events if e.round > half]
    d_early = action_distribution(early, agent_ids)
    d_late = action_distribution(late, agent_ids)
    vals = []
    for aid in agent_ids:
        if sum(d_early[aid]) > 0 and sum(d_late[aid]) > 0:
            vals.append(jsd(d_early[aid], d_late[aid]))
    return sum(vals) / len(vals) if vals else 0.0


def cluster_roles(
    events: list[BoardEvent], agent_ids: list[str], k: int = 3
) -> dict[str, str]:
    """Hand-rolled deterministic k-means; clusters named by dominant action.
    Labels are for reporting only, never for verdicts (design 8-3)."""
    dists = action_distribution(events, agent_ids)
    aids = [a for a in sorted(agent_ids) if sum(dists[a]) > 0]
    if not aids:
        return {}
    k = min(k, len(aids))
    centroids = [list(dists[aids[i * (len(aids) - 1) // max(1, k - 1)]]) for i in range(k)]
    assign = {aid: 0 for aid in aids}
    for _ in range(20):
        changed = False
        for aid in aids:
            best = min(
                range(k),
                key=lambda c: sum(
                    (a - b) ** 2 for a, b in zip(dists[aid], centroids[c])
                ),
            )
            if assign[aid] != best:
                assign[aid] = best
                changed = True
        for c in range(k):
            members = [dists[a] for a in aids if assign[a] == c]
            if members:
                centroids[c] = [
                    sum(vec[i] for vec in members) / len(members)
                    for i in range(len(ACTION_KINDS))
                ]
        if not changed:
            break
    label_names = {
        "PROPOSE": "제안자",
        "MODIFY": "통합자",
        "CRITIQUE": "비평가",
        "SIMULATE": "실험자",
    }
    out = {}
    for aid in aids:
        c = assign[aid]
        dominant = ACTION_KINDS[max(range(len(ACTION_KINDS)), key=lambda i: centroids[c][i])]
        out[aid] = label_names[dominant]
    return out
