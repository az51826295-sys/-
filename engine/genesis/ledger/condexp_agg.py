"""조건 실험 집계기 (등록 지표의 기계 구현, 골든 선행).

- 성공당 총호출 = 조건 총호출(실패 런 포함) / 성공 런 수.
  성공 0 → None (파일럿 게이트가 본실험 진입을 막았어야 하는 상태).
- 부트스트랩 CI: 런 단위 복원추출 1,000회, 성공 0인 표본은 제외
  하고 제외 수를 보고한다 (통계량 미정의 표본을 0으로 뭉개지
  않는다).
- 실패 원형 반복 = 런 내에서, 이전에 실패한 key_sig와 같은 키로
  다시 실패한 라운드 수.
- 잘못 확정된 판단 = wrong_blocks 합 (조건 2 전용 신호).
- 상태 복구 호출 = champion이 하락한 라운드의 호출 합 — 조건
  1·2에서는 채택 규칙상 구조적으로 0이며, 그 사실 자체를 기록
  한다 (조건 3의 롤백에서만 유의미).
"""

from __future__ import annotations

import random
from collections import defaultdict

BOOT_N = 1000


def calls_per_success(rows: list[dict]) -> float | None:
    succ = sum(1 for r in rows if r.get("success"))
    if not succ:
        return None
    return round(sum(r["calls"] for r in rows) / succ, 2)


def bootstrap_ci(rows: list[dict], rng_seed: int = 0,
                 n: int = BOOT_N) -> dict:
    rng = random.Random(rng_seed)
    vals = []
    skipped = 0
    for _ in range(n):
        sample = [rows[rng.randrange(len(rows))]
                  for _ in range(len(rows))]
        v = calls_per_success(sample)
        if v is None:
            skipped += 1
        else:
            vals.append(v)
    if not vals:
        return {"lo": None, "hi": None, "skipped": skipped}
    vals.sort()
    return {"lo": vals[int(0.025 * len(vals))],
            "hi": vals[min(int(0.975 * len(vals)),
                           len(vals) - 1)],
            "skipped": skipped}


def failure_repeats(row: dict) -> int:
    failed_keys = set()
    repeats = 0
    for r in row.get("rounds", []):
        if r["adopted"]:
            continue
        if r["key_sig"] in failed_keys:
            repeats += 1
        failed_keys.add(r["key_sig"])
    return repeats


def recovery_calls(row: dict, calls_per_round: int = 8) -> int:
    prev = None
    total = 0
    for r in row.get("rounds", []):
        cur = r.get("champion_obj")
        if prev is not None and cur is not None and cur < prev:
            total += calls_per_round
        if cur is not None:
            prev = cur
    return total


def aggregate(rows: list[dict]) -> dict:
    by_cond = defaultdict(list)
    for r in rows:
        by_cond[r["condition"]].append(r)
    out = {}
    for cond, rs in sorted(by_cond.items()):
        n = len(rs)
        dups = [r["dup_rate"] for r in rs
                if r.get("dup_rate") is not None]
        out[cond] = {
            "n_runs": n,
            "calls_total": sum(r["calls"] for r in rs),
            "successes": sum(1 for r in rs if r.get("success")),
            "success_rate": round(
                sum(1 for r in rs if r.get("success")) / n, 4),
            "calls_per_success": calls_per_success(rs),
            "ci": bootstrap_ci(rs),
            "failure_repeats": sum(failure_repeats(r) for r in rs),
            "wrong_confirmed": sum(r.get("wrong_blocks", 0)
                                   for r in rs),
            "recovery_calls": sum(recovery_calls(r) for r in rs),
            "dup_rate_mean": round(sum(dups) / len(dups), 4)
            if dups else None,
            "unique_sigs_mean": round(sum(
                r.get("unique_sigs", 0) for r in rs) / n, 2),
        }
    return out
