"""ablation11 집계기 (등록 v1.1의 1차 지표 5종).

골든 케이스(tests/fixtures/ablation_agg/) 통과 전에는 실로그에
적용하지 않는다 - 계측기 사고 4건이 전부 '정상 실행 + 틀린 숫자'
였다.

교차 조건 정의 (BF에는 가설이 없으므로 5종 모두 후보 수준으로
계산하고, BS 전용 가설 수준 지표는 연속성 참고로만 병기):

1. 오파일 재방문률 = 정답 아닌 파일 f를 포함하고, 같은 런의 앞선
   후보 중 f를 포함한 실패 후보(code_fail 또는 공개 미통과)가
   있는 후보 / 첫 후보 이후의 전체 후보. 중복(duplicate) 후보도
   분자·분모에 들어간다 - 같은 곳을 다시 파는 행위 자체가 지표다.
2. 정답 파일 포함률 = 기계 통과 후보 중 정답 파일을 만진 후보가
   있는 런의 비율.
3. 고유 파일 수 = 기계 통과 후보들이 만진 파일의 런당 평균 종수.
4. 기계 검증 통과율 = code_fail 없는 후보 / 전체 후보.
5. 공개 통과 후보 수 = 런당 public_pass 후보 수 (§6.12 정의 그대로).

BS 전용 병기: 2라운드 가설 재방문률(§6.12 공식 - negative 대조),
가설 심볼 해결률(런타임 validation 필드).

  python -m genesis.rookery.analyze_ablation
"""

from __future__ import annotations

import json
import os
from collections import defaultdict

DATA = "data"


def candidate_metrics(rows: list[dict],
                      answers: dict[str, set]) -> dict:
    """후보 수준 5지표. rows = 한 arm의 런 목록."""
    n = len(rows) or 1
    revisits = eligible = 0
    correct_runs = 0
    distinct_files = []
    mech_pass = cand_total = 0
    pub_cands = 0
    for r in rows:
        answer = answers[r["task"]]
        cands = sorted(r["candidates"], key=lambda c: c["call"])
        failed_files: set = set()
        for i, c in enumerate(cands):
            cand_total += 1
            if not c.get("code_fail"):
                mech_pass += 1
            if i > 0:
                eligible += 1
                wrong_files = [f for f in c.get("files") or []
                               if f not in answer]
                if any(f in failed_files for f in wrong_files):
                    revisits += 1
            failed = bool(c.get("code_fail")) or not c.get(
                "public_pass")
            if failed:
                failed_files.update(c.get("files") or [])
        valid = [c for c in cands if not c.get("code_fail")]
        files = {f for c in valid for f in c.get("files") or []}
        distinct_files.append(len(files))
        correct_runs += bool(files & answer)
        pub_cands += sum(bool(c.get("public_pass")) for c in valid)
    return {
        "n_runs": len(rows),
        "wrong_file_revisit_rate": round(revisits / (eligible or 1), 4),
        "wrong_file_revisits_abs": revisits,
        "revisit_eligible": eligible,
        "correct_file_rate": round(correct_runs / n, 4),
        "distinct_files_mean": round(
            sum(distinct_files) / n, 4),
        "mech_pass_rate": round(mech_pass / (cand_total or 1), 4),
        "candidates_total": cand_total,
        "public_cands_per_run": round(pub_cands / n, 4),
        "public_cands_abs": pub_cands,
        "full_rate": round(sum(
            r["final_status"] == "full" for r in rows) / n, 4),
        "status_counts": dict(sorted(
            (s, sum(r["final_status"] == s for r in rows))
            for s in {r["final_status"] for r in rows})),
    }


def bs_hypothesis_metrics(round_entries: list[dict]) -> dict:
    """BS 전용 병기 지표 (§6.12 공식 승계)."""
    by_run = defaultdict(list)
    for e in round_entries:
        by_run[(e["task"], e["rep"])].append(e)
    r2_hyps = r2_revisits = 0
    generated = resolved = 0
    for es in by_run.values():
        es.sort(key=lambda e: e["round"])
        for e in es:
            for v in e.get("validation", []):
                generated += 1
                if v.get("resolved") is not None:
                    resolved += 1
            if e["round"] >= 1:
                prev_neg = es[e["round"] - 1]["negative"]
                for h in e["hypotheses"]:
                    r2_hyps += 1
                    key = f"{h['file']}::{h['function']}"
                    if any(key in n for n in prev_neg):
                        r2_revisits += 1
    return {
        "hyp_revisit_rate_r2": round(r2_revisits / (r2_hyps or 1), 4),
        "hyp_r2_total": r2_hyps,
        "hyp_validation_rate": round(resolved / (generated or 1), 4),
        "hyp_generated": generated,
    }


def aggregate(rows: list[dict], round_entries: list[dict],
              answers: dict[str, set]) -> dict:
    out = {}
    for arm in ("BS", "BF"):
        arm_rows = [r for r in rows if r["arm"] == arm]
        out[arm] = candidate_metrics(arm_rows, answers)
    out["BS"].update(bs_hypothesis_metrics(
        [e for e in round_entries if e.get("arm") == "BS"]))
    return out


def main() -> int:
    report = os.path.join(DATA, "rookery3a_report_ablation11.json")
    with open(report, encoding="utf-8") as f:
        rows = json.load(f)["results"]
    entries = []
    import glob
    for p in glob.glob(os.path.join(
            DATA, "rookery3a_calls_ablation11.jsonl*")):
        with open(p, encoding="utf-8") as f:
            for line in f:
                e = json.loads(line)
                if "round" in e and "hypotheses" in e:
                    entries.append(e)
    from genesis.rookery.ablation import build_all
    tasks, _ = build_all()
    answers = {t.task_id: set(t.files_changed) for t in tasks}
    out = aggregate(rows, entries, answers)
    keys = [k for k in out["BS"] if k != "status_counts"]
    print(f"{'지표':28s} {'BS':>12s} {'BF':>12s}")
    for k in keys:
        print(f"{k:28s} {str(out['BS'].get(k)):>12s} "
              f"{str(out['BF'].get(k)):>12s}")
    print("BS status:", out["BS"]["status_counts"])
    print("BF status:", out["BF"]["status_counts"])
    with open(os.path.join(DATA, "ablation11_verdict.json"), "w",
              encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("저장: data/ablation11_verdict.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
