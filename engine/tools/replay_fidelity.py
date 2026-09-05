"""보드게임 원로그 판정 1: 결정론 재실행 충실도 (호출 0).

실험 1의 저장 로그는 시도별 스펙 전문을 담지 않는다. 전체 보드
해상도의 state_signature가 성립하려면 결정론 재실행이 저장 결과를
정확히 재현해야 한다 - 그 검증이 이 스크립트다. 원본 mission.db는
읽기만 한다 (단일 런 경로는 DB에 쓰지 않음).

표본: arm × removal 층화 + seed 무작위 아님(1, 7, 13, 20 고정).
비교: final_proposal_id, final_objective, n_proposals, 이벤트 수,
proposals_meta의 (id, objective) 전열.

  python tools/replay_fidelity.py
"""
import json
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))

from genesis.mission.config import MissionConfig
from genesis.mission.rounds import run_arm

DB = os.path.join("data", "mission.db")
SEEDS = [1, 7, 13, 20]
OUT = os.path.join("data", "replay_fidelity.json")


def stored_rows():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    rows = db.execute(
        "SELECT rowid, arm, seed, removal, result_json"
        " FROM runs").fetchall()
    db.close()
    return rows


def _sig(d: dict) -> dict:
    return {
        "final_proposal_id": d["final_proposal_id"],
        "final_objective": round(d["final_objective"], 12),
        "n_proposals": d["n_proposals"],
        "n_events": len(d["events"]),
        "proposals": [(p["proposal_id"], round(p["objective"], 12))
                      for p in d["proposals_meta"]],
    }


def main() -> int:
    """원로그 스키마 결함: (C, seed, 0) 키에 실제 C와 클론 대조 C가
    판별 컬럼 없이 2행씩 저장돼 있다. 재실행이 그중 정확히 한 행과
    일치하면 충실 판정이며, 일치한 행이 실제 C, 나머지가 클론 -
    재실행이 곧 판별기다. 원본 DB는 수정하지 않고 파생 색인만
    남긴다."""
    config = MissionConfig()
    groups: dict = {}
    for r in stored_rows():
        groups.setdefault((r["arm"], r["seed"], r["removal"]),
                          []).append(
            (r["rowid"], json.loads(r["result_json"])))
    print(f"저장 100행, 키 {len(groups)}개, "
          f"중복 키 {sum(1 for v in groups.values() if len(v) > 1)}개")

    checked = matched = 0
    mismatches = []
    clone_index = {}
    for (arm, seed, removal), cands in sorted(groups.items()):
        if seed not in SEEDS or arm not in ("A", "B", "C"):
            continue
        checked += 1
        res = run_arm(arm, config, seed, removal=bool(removal))
        replay = {
            "final_proposal_id": res.final_proposal_id,
            "final_objective": round(res.final_objective, 12),
            "n_proposals": res.n_proposals,
            "n_events": len(res.events),
            "proposals": [(p.proposal_id, round(p.objective, 12))
                          for p in res.proposals_meta],
        }
        hits = [rowid for rowid, stored in cands
                if _sig(stored) == replay]
        ok = len(hits) == 1
        matched += ok
        if len(cands) > 1 and ok:
            others = [rid for rid, _ in cands if rid != hits[0]]
            clone_index[f"{arm}/{seed}"] = {
                "real_rowid": hits[0], "clone_rowids": others}
        print(f"  {arm} seed{seed} removal{removal} "
              f"(행 {len(cands)}): {'일치' if ok else '불일치'}")
        if not ok:
            mismatches.append({"arm": arm, "seed": seed,
                               "removal": removal,
                               "candidates": len(cands),
                               "hits": len(hits)})
    verdict = ("재실행 충실 - 전체 보드 재구성 가능"
               if matched == checked and checked else "재실행 불충실")
    print(f"\n{matched}/{checked} 일치 -> {verdict}")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"checked": checked, "matched": matched,
                   "mismatches": mismatches,
                   "clone_row_index_sample": clone_index,
                   "verdict": verdict},
                  f, ensure_ascii=False, indent=1)
    print(f"저장: {OUT}")
    return 0 if matched == checked else 1


if __name__ == "__main__":
    raise SystemExit(main())
