"""보드게임 도메인: 서명 3해상도 + 재실행 기반 표 생성.

규칙 동결본(docs/ledger-boardgame-rules.md)의 기계 구현.
표 스키마: 시도 / 서명 3열 / 국면 / 선택 수 / 결과 / 원형 /
조회 키 일치?(해상도별) / 규칙상 차단? - 뒤 두 열은 사람 판단
없이 규칙이 산출한다.

동결 조작화 (규칙 문서 4·판정 노트):
- 시도 = PROPOSE/MODIFY/CRITIQUE/SIMULATE 이벤트 (투표 제외).
- 실패 = 생성 제안의 judged objective가 기준(MODIFY: 부모,
  PROPOSE: 그 시점 보드 최고)을 넘지 못함. CRITIQUE/SIMULATE는
  실패 신호 없음(탐침). judge는 사후 실행이므로 이 실패 신호는
  낙관 가정이다 - U_calls의 낙관 상한과 같은 방향이며, 그 상한
  조차 못 넘으면 진다는 취소 규칙의 논리에 부합한다.
- 원형(사후 전용, 조회 키 불포함): new / improved / flat /
  regressed / probe.
- 장부 수명 = 전 런 (런 경계를 넘어 지속 - 운영 장부의 실제
  수명). 런 내 일치와 전역 일치를 분리 집계한다.
- 범위 = 실제 80런 (A20·B20·C20·C제거20). 클론 대조 20행은
  제외 - 실험 통제용 인공 반복이라 U_saved를 부풀린다.

  python -m genesis.ledger.boardgame        # 표 생성 + 요약
"""

from __future__ import annotations

import hashlib
import json
import os
from collections import defaultdict

from genesis.ledger.state import (
    RESOLUTIONS, LedgerEntry, LookupKey, StateLedger)

DATA = "data"
OUT_TABLE = os.path.join(DATA, "ledger_boardgame_table.jsonl")
OUT_SUMMARY = os.path.join(DATA, "ledger_boardgame_summary.json")

ACTIONS = ("PROPOSE", "MODIFY", "CRITIQUE", "SIMULATE")


def _sha(text: str) -> str:
    return hashlib.sha1(text.encode()).hexdigest()[:12]


def spec_hash(spec_json: str) -> str:
    """스펙 정규화 해시: 식별자·이름·의도 필드를 비워 내용만 남긴다
    (판정기 judge_cache와 같은 정규화 방향)."""
    d = json.loads(spec_json)
    for k in ("spec_id", "name", "design_intent"):
        d.pop(k, None)
    return _sha(json.dumps(d, sort_keys=True, ensure_ascii=False))


def phase_of(rnd: int, total_rounds: int) -> str:
    third = max(1, total_rounds // 3)
    if rnd <= third:
        return "early"
    if rnd <= 2 * third:
        return "mid"
    return "late"


def obj_bucket(x: float, width: float = 0.05) -> int:
    return int(x / width)


def count_bucket(n: int) -> int:
    return min(n // 5, 8)


def full_sig(board: list[tuple[str, float]], phase: str) -> str:
    items = sorted((h, round(o, 6)) for h, o in board)
    return _sha(json.dumps([phase, items]))


def local_sig(target_hash: str | None, target_obj: float | None,
              parent_hash: str | None, open_crits: int,
              board_best_bucket: int, n_bucket: int) -> str:
    if target_hash is None:                    # PROPOSE - 대상 없음
        return _sha(json.dumps(["noTarget", board_best_bucket,
                                n_bucket]))
    return _sha(json.dumps([target_hash, obj_bucket(target_obj or 0.0),
                            parent_hash, min(open_crits, 5)]))


def stat_sig(phase: str, n_props: int, best: float,
             mean: float) -> str:
    return _sha(json.dumps([phase, count_bucket(n_props),
                            obj_bucket(best), obj_bucket(mean)]))


# ------------------------------------------------------------ 표 생성


def replay_run(arm: str, seed: int, removal: bool):
    from genesis.mission.config import MissionConfig
    from genesis.mission.rounds import run_arm
    collect: dict = {}
    res = run_arm(arm, MissionConfig(), seed, removal=removal,
                  collect=collect)
    return res, collect


def build_rows(arm: str, seed: int, removal: bool,
               total_rounds: int) -> list[dict]:
    res, collect = replay_run(arm, seed, removal)
    specs = collect["proposals"]
    owners = collect["board_owners"]
    meta = {m.proposal_id: m for m in res.proposals_meta}
    hashes = {pid: spec_hash(sj) for pid, sj in specs.items()}

    rows = []
    seen_props: list[str] = []            # 생성 순서의 제안 id
    crits_open: dict[str, set] = defaultdict(set)   # pid -> crit ids
    events = [ev.model_dump() if hasattr(ev, "model_dump") else ev
              for ev in res.events]
    for i, e in enumerate(events):
        if e["kind"] not in ACTIONS:
            continue
        aid = e["agent_id"]
        # 행위자가 보는 보드 (B는 자기 보드만)
        visible = [p for p in seen_props
                   if arm != "B" or aid in owners.get(p, [])]
        board = [(hashes[p], meta[p].objective) for p in visible]
        n = len(board)
        best = max((o for _, o in board), default=0.0)
        mean = (sum(o for _, o in board) / n) if n else 0.0
        phase = phase_of(e["round"], total_rounds)
        target = e["refs"][0] if e.get("refs") else None
        artifact = e["artifact_id"]

        if e["kind"] in ("PROPOSE", "MODIFY"):
            outcome = meta[artifact].objective
            parent = meta[artifact].parent_id
            ref_obj = (meta[parent].objective if parent in meta
                       else best)
            failed = outcome <= ref_obj if n or parent else False
            if e["kind"] == "PROPOSE":
                archetype = "new"
            elif outcome > ref_obj:
                archetype = "improved"
            elif outcome == ref_obj:
                archetype = "flat"
            else:
                archetype = "regressed"
            rollback = parent if parent in meta else (
                max(visible, key=lambda p: meta[p].objective)
                if visible else None)
        else:
            outcome = meta[target].objective if target in meta else None
            failed = False
            archetype = "probe"
            rollback = target if target in meta else None

        sigs = {
            "full": full_sig(board, phase),
            "local": local_sig(
                hashes.get(target),
                meta[target].objective if target in meta else None,
                hashes.get(meta[target].parent_id)
                if target in meta and meta[target].parent_id else None,
                len(crits_open.get(target, ())),
                obj_bucket(best), count_bucket(n)),
            "stat": stat_sig(phase, n, best, mean),
        }
        rows.append({
            "run": f"{arm}/{seed}/{int(removal)}",
            "try_index": i, "agent": aid, "action": e["kind"],
            "round": e["round"], "phase": phase,
            "sig_full": sigs["full"], "sig_local": sigs["local"],
            "sig_stat": sigs["stat"],
            "n_choices": n, "outcome": outcome,
            "archetype": archetype, "failed": failed,
            "rollback_target": rollback,
        })

        # 상태 전진
        if e["kind"] == "PROPOSE" or e["kind"] == "MODIFY":
            seen_props.append(artifact)
            for cid in list(meta[artifact].addressed_critique_ids):
                for pid in crits_open:
                    crits_open[pid].discard(cid)
        elif e["kind"] == "CRITIQUE" and target:
            crits_open[target].add(artifact)
    return rows


def real_runs() -> list[tuple[str, int, bool]]:
    """실제 80런 목록. (C, seed, 0) 중복은 재실행 판별로 실제 행만
    남는다 - 어차피 표는 재실행 궤적에서 만들므로 실제 C 궤적
    하나만 넣으면 된다."""
    out = []
    for arm in ("A", "B", "C"):
        for seed in range(1, 21):
            out.append((arm, seed, False))
    for seed in range(1, 21):
        out.append(("C", seed, True))
    return out


def machine_columns(rows: list[dict]) -> None:
    """뒤 두 열: 조회 키 일치?(해상도별, 전역/런내) + 규칙상 차단?.
    행 순서 = 시간 순서 (런 나열 순서 그대로 - 장부는 전 런 지속)."""
    ledger = StateLedger()
    seen_in_run: dict[tuple, int] = {}
    for row in rows:
        block = "NONE"
        for res in RESOLUTIONS:
            key = LookupKey(res, row[f"sig_{res}"], row["phase"],
                            row["action"])
            prior = ledger.lookup(key)
            row[f"match_{res}"] = prior is not None
            rk = (row["run"], res, row[f"sig_{res}"], row["phase"],
                  row["action"])
            row[f"match_{res}_in_run"] = rk in seen_in_run
            seen_in_run[rk] = 1
            if res == "local" and prior is not None:
                block = prior.disposition()   # 차단 판정 해상도 = local
            # 기록은 세 해상도 전부 - local만 기록하던 1차 구현은
            # full/stat의 전역 재매칭을 빈 장부에 조회해 0으로
            # 오산했다 (전역 < 런내 모순으로 자기 적발, 2026-08-08)
            ledger.record(key, failed=row["failed"],
                          rollback_target=row["rollback_target"],
                          evidence=row["run"])
        row["blocked"] = block


def recompute() -> int:
    """기계 열(match·blocked)만 표에서 재계산 - 서명·행 자체는
    재실행 없이 그대로. 집계기 수정 후 30분 재실행을 피하는 경로.
    전역 ≥ 런내 불변식을 저장 전에 강제 확인한다."""
    all_rows = []
    with open(OUT_TABLE, encoding="utf-8") as f:
        for line in f:
            all_rows.append(json.loads(line))
    machine_columns(all_rows)
    for res in RESOLUTIONS:
        g = sum(r[f"match_{res}"] for r in all_rows)
        i = sum(r[f"match_{res}_in_run"] for r in all_rows)
        assert g >= i, f"불변식 위반: {res} 전역 {g} < 런내 {i}"
    _write(all_rows)
    return 0


def main() -> int:
    from genesis.mission.config import MissionConfig
    total_rounds = MissionConfig().n_rounds
    all_rows: list[dict] = []
    for arm, seed, removal in real_runs():
        tr = total_rounds * MissionConfig().n_agents if arm == "A" \
            else total_rounds
        rows = build_rows(arm, seed, removal, tr)
        all_rows.extend(rows)
        print(f"  {arm}/{seed}/{int(removal)}: {len(rows)}행",
              flush=True)
    machine_columns(all_rows)
    _write(all_rows)
    return 0


def _write(all_rows: list[dict]) -> None:
    with open(OUT_TABLE, "w", encoding="utf-8") as f:
        for r in all_rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    summary: dict = {"rows": len(all_rows)}
    for res in RESOLUTIONS:
        uniq = len({(r[f"sig_{res}"], r["phase"], r["action"])
                    for r in all_rows})
        matches = sum(r[f"match_{res}"] for r in all_rows)
        in_run = sum(r[f"match_{res}_in_run"] for r in all_rows)
        summary[res] = {
            "unique_keys": uniq,
            "rematch": matches,
            "rematch_rate": round(matches / len(all_rows), 4),
            "rematch_in_run": in_run,
        }
    summary["blocked_counts"] = {
        s: sum(r["blocked"] == s for r in all_rows)
        for s in {"NONE", "CONDITIONAL", "PENALIZE", "BLOCK",
                  "APPROVAL_QUEUE"}}
    with open(OUT_SUMMARY, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    zero = all(summary[r]["rematch"] == 0 for r in RESOLUTIONS)
    if zero:
        print("판정: 세 해상도 전부 재매칭 0 - 서명 정의 재검토 필요")


if __name__ == "__main__":
    import sys
    if "--recompute" in sys.argv:
        raise SystemExit(recompute())
    raise SystemExit(main())
