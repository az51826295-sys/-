"""TM plateau-breakthrough autopsy (post-hoc, run 2026-08-01).

Three layers, all from the preserved registries:
1. What was adopted at the breakthrough (rule diffs per version)?
2. Did T lack the structure? (count relaxation-rule proposals per run)
3. If both proposed it, did the DETAIL distributions differ?

Conclusion (see mission7b-results-brief.md): both tiers proposed the
relaxation structure in ~all generations; T's variants were dominated
by unreachable (P7 < deadlock's P8) or budget-blocked shapes and never
scored >= 0.84; TM's distribution shifted toward the winning family
(P9, low gain bar, no extra condition) — the score-trajectory history
changed WHAT the model sampled, even without rule content. A padding
control is needed in 7C to exclude mere prompt-perturbation effects.
"""

from __future__ import annotations

import json
from collections import Counter

DATA = "data"


def _reg(tag: str) -> dict:
    with open(f"{DATA}/mission7b_{tag}_registry.json",
              encoding="utf-8") as f:
        return json.load(f)


def rule_str(r: dict) -> str:
    conds = " AND ".join(f"{c['metric']} {c['op']} {c['value']}"
                         for c in r["conditions"]) or "ALWAYS"
    acts = "; ".join(a["name"] + (f" {a['mode']}"
                                  if a.get("mode") is not None else "")
                     for a in r["actions"])
    role = f" ROLE {r['role']}" if r.get("role") is not None else ""
    return f"IF {conds} THEN {acts}{role} P{r['priority']}"


def adoption_lineage(tag: str) -> list[str]:
    st = _reg(tag)
    out = [f"=== {tag}"]
    for g in st["generations"]:
        if g["rolled_back"]:
            continue
        v = g["incumbent_version_after"]
        out.append(f"  gen {g['gen']}: v{v} 채택, "
                   f"score {g['incumbent_score']:.4f}")
        for r in st["versions"][str(v)]["rules"]:
            out.append(f"    {r['rule_id']}: {rule_str(r)}")
    out.append(f"  최종: {st['generations'][-1]['incumbent_score']:.4f}")
    return out


def _is_relax(rule: dict) -> bool:
    metrics = [c["metric"] for c in rule["conditions"]]
    acts = [a["name"] for a in rule["actions"]]
    return "consecutive_all_pass" in metrics and "SHARE_BEST" in acts


def relax_stats(tag: str) -> tuple[int, float, int | None]:
    st = _reg(tag)
    n = 0
    best = 0.0
    adopted_gen = None
    for g in st["generations"]:
        for c in g["candidates"]:
            if c["op"] == "invalid":
                continue
            if any(_is_relax(r) for r in c["artifact"]["rules"]):
                n += 1
                best = max(best, c["score"])
                if c["adopted"]:
                    adopted_gen = g["gen"]
    return n, best, adopted_gen


def variant_distribution(kind: str) -> list[str]:
    variants = []
    for ms in range(5):
        st = _reg(f"{kind}_deadlock_ms{ms}")
        for g in st["generations"]:
            for c in g["candidates"]:
                if c["op"] == "invalid":
                    continue
                for r in c["artifact"]["rules"]:
                    if not _is_relax(r):
                        continue
                    metrics = {cc["metric"]: cc
                               for cc in r["conditions"]}
                    gain = metrics.get("my_best_gain", {}).get("value")
                    extra = tuple(sorted(
                        m for m in metrics
                        if m not in ("consecutive_all_pass",
                                     "my_best_gain")))
                    variants.append((gain, extra, r["priority"],
                                     c["score"]))
    gains = Counter(v[0] for v in variants)
    prios = Counter(v[2] for v in variants)
    extras = Counter(v[1] for v in variants)
    hi = sum(1 for v in variants if v[3] >= 0.84)
    return [
        f"== {kind}: 완화 변형 {len(variants)}개",
        f"  gain 문턱: {dict(sorted(gains.items(), key=lambda x: (x[0] is None, x[0])))}",
        f"  우선순위: {dict(sorted(prios.items()))} "
        f"(P7은 교착 규칙 P8에 가려 발화 불가)",
        f"  추가 조건: {extras.most_common(3)}",
        f"  score>=0.84 변형: {hi}개",
    ]


def main() -> None:
    lines = ["=== TM 고원 돌파 부검 ===", "", "[1] 채택 계보"]
    for tag in ("TM_deadlock_ms2", "TM_deadlock_ms4",
                "T_deadlock_ms2", "T_deadlock_ms4"):
        lines += adoption_lineage(tag)
    lines += ["", "[2] 완화 구조 제안 빈도 (구조 부재 가설 검증)"]
    for kind in ("T", "TM"):
        for ms in range(5):
            n, best, ag = relax_stats(f"{kind}_deadlock_ms{ms}")
            lines.append(f"  {kind} ms{ms}: 제안 {n}회, "
                         f"최고 score {best:.4f}, 채택 gen {ag}")
    lines += ["", "[3] 변형 세부 분포 (분포 이동 가설 검증)"]
    for kind in ("T", "TM"):
        lines += variant_distribution(kind)
    print("\n".join(lines))


if __name__ == "__main__":
    main()
