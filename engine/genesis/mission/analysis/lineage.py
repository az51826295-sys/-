"""Information-transfer metrics: whose work reached the final design, and
through which channels (design 8, lineage)."""

from __future__ import annotations

from genesis.mission.rounds import RunResult


def lineage_metrics(result: RunResult) -> dict[str, float]:
    meta = {m.proposal_id: m for m in result.proposals_meta}

    chain_authors: set[str] = set()
    pid = result.final_proposal_id
    depth = 0
    while pid is not None and pid in meta:
        chain_authors.add(meta[pid].author_id)
        pid = meta[pid].parent_id
        depth += 1

    cross_modify = 0
    critique_links = 0
    sim_reuse = 0
    for e in result.events:
        if e.kind == "MODIFY" and e.refs:
            parent = meta.get(e.refs[0])
            if parent and parent.author_id != e.agent_id:
                cross_modify += 1
            for ref in e.refs[1:]:
                author = result.critique_authors.get(ref)
                if author and author != e.agent_id:
                    critique_links += 1
        if e.kind == "CRITIQUE":
            for ref in e.refs:
                author = result.sim_authors.get(ref)
                if author and author != e.agent_id:
                    sim_reuse += 1

    return {
        "lineage_depth": float(depth),
        "lineage_authors": float(len(chain_authors)),
        "cross_modify": float(cross_modify),
        "critique_links": float(critique_links),
        "sim_reuse": float(sim_reuse),
    }
