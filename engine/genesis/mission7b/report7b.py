"""Mission 7B verdicts (docs/mission7b-design.md section 3, P32-P37).

Operationalization notes (recorded honestly):
- P32/P33 target: the registration says "등록 목표 점수" without a
  number. We use the 7A convention — the random baseline's own result:
  P32 target = R's median final validation score across seeds; P33
  success bar = 0.85 (the LLM plateau's lower edge, chosen post hoc and
  labeled as such).
- P34 escape: the registered relative definition (+0.15 validation vs
  founding, adoption happened, +0.10 on the unseen test grid).
- Duplicate rate counts a candidate identical (rules + threshold) to
  any earlier candidate or incumbent within the same run.
"""

from __future__ import annotations

import json
import os
import statistics
from collections import Counter

from pydantic import BaseModel, Field

from genesis.mission2.config import Mission2Config
from genesis.mission6.evolution import TEST_SEEDS6, TRAIN_SLACKS6, UNSEEN_SLACKS6, build_pairs
from genesis.mission7b.attractors import deadlock_protocol7b
from genesis.mission7b.dsl7b import Protocol7B
from genesis.mission7b.environment import evaluate7b

DATA = "data"
SEEDS = (0, 1, 2, 3, 4)
TIERS = ("Z", "S", "T", "TM")
PER_GEN = 6
BUDGET = 120
SUCCESS_BAR = 0.85          # post-hoc label, see module docstring
ESCAPE_VALID_GAIN = 0.15
ESCAPE_TEST_GAIN = 0.10
DEADLOCK_VALID = 0.5057     # R deadlock runs, all seeds, gen 1..20


def _reg(tag: str) -> dict:
    with open(os.path.join(DATA, f"mission7b_{tag}_registry.json"),
              encoding="utf-8") as f:
        return json.load(f)


def _scores(reg: dict) -> list[float]:
    return [g["incumbent_score"] for g in reg["generations"]]


def _final_protocol(reg: dict) -> Protocol7B:
    return Protocol7B.model_validate(
        reg["versions"][str(reg["incumbent_version"])])


def _candidates_to(reg: dict, target: float) -> int | None:
    for g in reg["generations"]:
        if g["incumbent_score"] >= target - 1e-9:
            return g["gen"] * PER_GEN
    return None


def _protocol_key(dump: dict) -> str:
    p = Protocol7B.model_validate(dump)
    return json.dumps(
        [r.model_dump(exclude={"rule_id", "author_id", "created_gen"})
         for r in p.rules] + [p.init_threshold], sort_keys=True)


class Mission7BReport(BaseModel):
    finals: dict[str, float] = Field(default_factory=dict)
    test_accuracy: dict[str, dict[str, float]] = Field(
        default_factory=dict)
    hygiene: dict[str, dict[str, float]] = Field(default_factory=dict)
    usage: dict[str, float] = Field(default_factory=dict)
    verdicts: list[str] = Field(default_factory=list)


def build_report(config: Mission2Config) -> Mission7BReport:
    rep = Mission7BReport()
    regs: dict[str, dict] = {}
    for tier in ("R",) + TIERS:
        for ms in SEEDS:
            tag = f"{tier}_ms{ms}"
            regs[tag] = _reg(tag)
            rep.finals[tag] = _scores(regs[tag])[-1]
    for kind in ("R", "T", "TM"):
        for ms in SEEDS:
            tag = f"{kind}_deadlock_ms{ms}"
            regs[tag] = _reg(tag)
            rep.finals[tag] = _scores(regs[tag])[-1]

    # ---- proposal hygiene per tier (P36 needs T vs TM)
    for tier in TIERS:
        dup = invalid = removes = total = 0
        for ms in SEEDS:
            reg = regs[f"{tier}_ms{ms}"]
            seen = {_protocol_key(reg["versions"]["0"])}
            for g in reg["generations"]:
                for c in g["candidates"]:
                    total += 1
                    if c["op"] == "invalid":
                        invalid += 1
                    if c["op"] == "remove":
                        removes += 1
                    key = _protocol_key(c["artifact"])
                    if key in seen:
                        dup += 1
                    seen.add(key)
        rep.hygiene[tier] = {
            "invalid_rate": invalid / total,
            "duplicate_rate": dup / total,
            "remove_rate": removes / total,
        }

    # ---- test grid for unique final protocols (escape + best tiers)
    pairs = build_pairs(list(TEST_SEEDS6),
                        TRAIN_SLACKS6 + UNSEEN_SLACKS6, config,
                        cycle=False)
    by_slack_cache: dict[str, dict[str, float]] = {}

    def test_eval(label: str, protocol: Protocol7B) -> dict[str, float]:
        key = _protocol_key(protocol.model_dump())
        if key not in by_slack_cache:
            out = {}
            for slack in TRAIN_SLACKS6 + UNSEEN_SLACKS6:
                sp = [p for p in pairs if p[2] == slack]
                out[str(slack)] = evaluate7b(
                    sp, config, protocol).mean_accuracy
            by_slack_cache[key] = out
        rep.test_accuracy[label] = dict(by_slack_cache[key])
        return rep.test_accuracy[label]

    founding_test = test_eval("deadlock_founding", deadlock_protocol7b())
    for tier in TIERS:
        best_ms = max(SEEDS, key=lambda m: rep.finals[f"{tier}_ms{m}"])
        test_eval(f"{tier}_best(ms{best_ms})",
                  _final_protocol(regs[f"{tier}_ms{best_ms}"]))
    for kind in ("T", "TM"):
        for ms in SEEDS:
            test_eval(f"{kind}_deadlock_ms{ms}",
                      _final_protocol(regs[f"{kind}_deadlock_ms{ms}"]))

    # ---- usage (handles per-process counter resets on resume)
    import glob
    tin = tout = calls = 0
    for path in glob.glob(os.path.join(DATA, "mission7b_calls_*.jsonl")):
        prev_in = prev_out = seg_in = seg_out = 0
        for line in open(path, encoding="utf-8"):
            calls += 1
            u = json.loads(line).get("provider_usage", {})
            ci, co = u.get("input_tokens", 0), u.get("output_tokens", 0)
            if ci < prev_in:           # counter reset -> bank segment
                seg_in += prev_in
                seg_out += prev_out
            prev_in, prev_out = ci, co
        tin += seg_in + prev_in
        tout += seg_out + prev_out
    rep.usage = {"calls": calls, "input_tokens": tin,
                 "output_tokens": tout,
                 "usd": round(tin / 1e6 + tout / 1e6 * 5, 2)}

    rep.verdicts = _verdicts(rep, regs, founding_test)
    return rep


def _verdicts(rep: Mission7BReport, regs: dict,
              founding_test: dict[str, float]) -> list[str]:
    out = []
    r_finals = [rep.finals[f"R_ms{m}"] for m in SEEDS]
    target = statistics.median(r_finals)
    r_counts = [
        _candidates_to(regs[f"R_ms{m}"], target) or BUDGET for m in SEEDS]
    r_median_count = statistics.median(r_counts)

    # P32 sample efficiency
    for tier in ("T", "TM"):
        counts = [_candidates_to(regs[f"{tier}_ms{m}"], target) or BUDGET
                  for m in SEEDS]
        ok = sum(c <= 0.5 * r_median_count for c in counts)
        out.append(
            f"P32 ({tier} 표본 효율, 목표 score {target:.3f} = R 중앙값): "
            + ("충족" if ok >= 4 else "미충족")
            + f" - {ok}/5 (기준 ≥4), 후보 수 {counts} vs R 중앙 "
            f"{r_median_count:.0f}")

    # P33 success rate at the (post-hoc) 0.85 bar
    r_succ = sum(f >= SUCCESS_BAR for f in r_finals) / 5
    for tier in TIERS:
        s = sum(rep.finals[f"{tier}_ms{m}"] >= SUCCESS_BAR
                for m in SEEDS) / 5
        mark = "충족" if s - r_succ >= 0.4 else "미충족"
        out.append(f"P33 ({tier} 성공률 ≥{SUCCESS_BAR}): {mark} - "
                   f"{tier} {s:.0%} vs R {r_succ:.0%} "
                   f"(차이 {s - r_succ:+.0%}, 기준 ≥+40%p)")

    # P34 escape, relative definition
    founding_trained = statistics.fmean(
        founding_test[str(s)] for s in TRAIN_SLACKS6)
    for kind in ("T", "TM"):
        ok = 0
        detail = []
        for ms in SEEDS:
            tag = f"{kind}_deadlock_ms{ms}"
            adopted = any(c["adopted"] for g in regs[tag]["generations"]
                          for c in g["candidates"])
            valid_gain = rep.finals[tag] - DEADLOCK_VALID
            t = rep.test_accuracy[tag]
            test_gain = statistics.fmean(
                t[str(s)] for s in TRAIN_SLACKS6) - founding_trained
            cond = (valid_gain >= ESCAPE_VALID_GAIN and adopted
                    and test_gain >= ESCAPE_TEST_GAIN)
            ok += cond
            detail.append(f"ms{ms}:+{valid_gain:.2f}/+{test_gain:.2f}")
        out.append(
            f"P34 ({kind} 탈출, 상대 정의): "
            + ("충족" if ok >= 4 else "미충족")
            + f" - {ok}/5 (기준 ≥4; R 0/5) [{', '.join(detail)}]")

    # P35 T > S
    t_mean = statistics.fmean(rep.finals[f"T_ms{m}"] for m in SEEDS)
    s_mean = statistics.fmean(rep.finals[f"S_ms{m}"] for m in SEEDS)
    tie = abs(t_mean - s_mean) < 0.02
    out.append(
        f"P35 (T > S): {'미충족 (동률)' if tie else ('충족' if t_mean > s_mean else '미충족')}"
        f" - T {t_mean:.4f} vs S {s_mean:.4f}"
        + (" — 시조 출발에선 천장 재현; 궤적의 가치는 탈출 과제에서만 분리됨"
           if tie else ""))

    # P36 TM vs T hygiene
    t_h, tm_h = rep.hygiene["T"], rep.hygiene["TM"]
    def rel_drop(a: float, b: float) -> float:
        return (a - b) / a if a > 0 else 0.0
    dup_drop = rel_drop(t_h["duplicate_rate"], tm_h["duplicate_rate"])
    inv_note = (f"무효율 T {t_h['invalid_rate']:.3f} -> TM "
                f"{tm_h['invalid_rate']:.3f}")
    cond = (dup_drop >= 0.3 and tm_h["remove_rate"] > 0)
    out.append(
        f"P36 (TM 위생 개선): {'충족' if cond else '미충족'} - 중복률 "
        f"T {t_h['duplicate_rate']:.3f} -> TM {tm_h['duplicate_rate']:.3f} "
        f"(상대 {dup_drop:-.0%}), remove율 TM {tm_h['remove_rate']:.3f}, "
        + inv_note)

    # P37 generalization: unseen slacks on the best TM protocol
    best = rep.test_accuracy[
        [k for k in rep.test_accuracy if k.startswith("TM_best")][0]]
    r_ref = None   # C-딸 기준 없음: 시조(전면 공유)와 비교
    out.append(
        "P37 (일반화, 미관측 slack — 탐색 축 별도): 최고 TM 프로토콜 "
        + ", ".join(f"slack {s}: {best[str(s)]:.3f}"
                    for s in UNSEEN_SLACKS6))
    return out


def format_report(rep: Mission7BReport) -> str:
    lines = ["=== 실험 7B 판정 ===", "", "검증 score 최종 (seed 0-4):"]
    for tier in ("R",) + TIERS:
        row = "  ".join(f"{rep.finals[f'{tier}_ms{m}']:.4f}"
                        for m in SEEDS)
        lines.append(f"  {tier:3s}: {row}")
    lines.append("교착 탈출 최종:")
    for kind in ("R", "T", "TM"):
        row = "  ".join(f"{rep.finals[f'{kind}_deadlock_ms{m}']:.4f}"
                        for m in SEEDS)
        lines.append(f"  {kind:3s}: {row}")
    lines.append("")
    lines.append("시험 격자 (slack별 평균 정확도):")
    for label, by_slack in rep.test_accuracy.items():
        vals = "  ".join(f"{s}:{a:.3f}" for s, a in by_slack.items())
        lines.append(f"  {label}: {vals}")
    lines.append("")
    lines.append(f"비용: {rep.usage}")
    lines.append("")
    lines.append("사전 등록 판정:")
    lines += [f"  {v}" for v in rep.verdicts]
    return "\n".join(lines)


def main() -> None:
    config = Mission2Config()
    rep = build_report(config)
    print(format_report(rep))
    with open(os.path.join(DATA, "mission7b_report.json"), "w",
              encoding="utf-8") as f:
        json.dump(rep.model_dump(), f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
