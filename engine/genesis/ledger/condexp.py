"""조건 실험 하네스 (등록: docs/ledger-condexp-design.md 동결본).

조건 1(요약만)·조건 2(장부, 선택 측만)의 실행기. 계약 8항 준수:
장부 내용은 어떤 프롬프트에도 들어가지 않는다 - 개입 지점은
champion 선택뿐이다.

  python -m genesis.ledger.condexp --pilot-mock    # 지출 0
  python -m genesis.ledger.condexp --pilot         # 조건1 seed 901~903
  python -m genesis.ledger.condexp --run           # 본실험 (2주차)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os

from genesis.ledger.state import LookupKey, StateLedger

DATA = "data"
MODEL = "claude-haiku-4-5-20251001"
ENV_FILE = r"C:\Users\az518\Desktop\ai-workforce\.env.local"

ROUNDS = 8
CALLS_PER_ROUND = 8
SUCCESS_OBJ = 0.78
PILOT_SEEDS = [901, 902, 903]
MAIN_SEEDS = list(range(1, 21))

# 실제 게이트(genesis/mission/grammar/space.py check_constraints)와
# 1:1로 일치시킨 힌트. 1차 파일럿의 성공률 0은 이 힌트가 실제
# 제약과 달라(보드 3~8 오기, scoring 개수·SCORE_REACH k 범위 누락)
# 60/60 후보가 게이트에 걸린 계측기 사고였다 - 범위 하나라도
# 바꾸면 게이트 코드와 대조하라.
SCHEMA_HINT = """스펙은 아래 필드의 JSON 하나다 (닫힌 DSL - 제약을 어기면 0점 처리):
- spec_id: 아무 문자열 (시스템이 덮어씀), name: 게임 이름
- players_min/players_max: 2
- board: {"kind": "GRID", "width": 3~5, "height": 3~5} (반드시 3~5)
- tokens_per_player: 3~10
- shared_pool: TAKE_POOL을 쓰면 1 이상, 아니면 0
- actions: 1~4개, 종류 중복 금지.
  [{"kind": "PLACE|MOVE|CAPTURE|TAKE_POOL", "params": {...}}]
  (MOVE params: {"distance": n} - MOVE에는 PLACE 필수,
   CAPTURE params: {"condition": 0|1} - CAPTURE에는 보드 행동 필수,
   TAKE_POOL params: {"k": n})
- scoring: 1~2개만, 종류 중복 금지.
  [{"kind": "LINE|AREA_MAJORITY|CAPTURED|POOL_HELD", "params": {...}}]
  (LINE params: {"length": 3~4 (보드 크기 이내), "points": n};
   CAPTURED에는 CAPTURE 행동, POOL_HELD에는 TAKE_POOL 필수;
   LINE/AREA_MAJORITY에는 보드 행동 필수)
- win: "SCORE_REACH|MOST_AT_END|LAST_MOVER",
  win_params: SCORE_REACH면 {"k": 3~12} 필수
- end: "ROUNDS|BOARD_FULL|POOL_EMPTY|NO_LEGAL_MOVE",
  end_params: ROUNDS면 {"r": 6~20} 필수; BOARD_FULL에는 PLACE,
  POOL_EMPTY에는 TAKE_POOL 필수
- design_intent: 한 줄 (채점에 안 쓰임)"""


def build_prompt(champion_json: str | None, champion_obj: float | None,
                 rnd: int, n_cands: int, best: float,
                 mean: float) -> str:
    parts = [
        "너는 2인용 보드게임 설계자다. 재미있고 균형 잡힌 게임 스펙을"
        " 설계하라. 판정기는 기술 균형(실력이 운을 이기는가),"
        " 선택의 긴장(고민되는 수), 역전 가능성, 규칙 간결성을 본다.",
        SCHEMA_HINT,
        f"[현황] 라운드 {rnd}/{ROUNDS}, 지금까지 후보 {n_cands}개,"
        f" 최고 {best:.3f}, 평균 {mean:.3f}",
    ]
    if champion_json:
        parts.append("현재 최고 스펙 (objective "
                     f"{champion_obj:.3f}):\n{champion_json}\n"
                     "이보다 나은 스펙을 설계하라 - 그대로 베끼면"
                     " 무효 처리된다.")
    else:
        parts.append("아직 스펙이 없다. 첫 스펙을 설계하라.")
    parts.append("JSON 하나만 출력하라. 다른 텍스트 금지.")
    return "\n\n".join(parts)


def parse_spec(response: str, spec_id: str):
    from genesis.mission.models.gamespec import GameSpec
    text = response
    i, j = text.find("{"), text.rfind("}")
    if i < 0 or j <= i:
        return None
    try:
        d = json.loads(text[i:j + 1])
        d["spec_id"] = spec_id
        d.setdefault("est_minutes", 0.0)
        return GameSpec.model_validate(d)
    except Exception:                        # noqa: BLE001
        return None


def judge(spec, seed: int) -> float:
    from genesis.mission.config import MissionConfig
    from genesis.mission.engine.static_check import static_issues
    from genesis.mission.engine.playout import evaluate_spec
    from genesis.mission.evaluation.score import objective
    config = MissionConfig()
    issues = static_issues(spec)
    metrics = evaluate_spec(spec, config, f"judge:{seed}")
    return objective(spec, metrics, issues, config)


def norm_hash(spec) -> str:
    d = json.loads(spec.model_dump_json())
    for k in ("spec_id", "name", "design_intent"):
        d.pop(k, None)
    return hashlib.sha1(json.dumps(
        d, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]


def local_key(champion_hash: str | None, rnd: int) -> LookupKey:
    """조건 2의 조회 키: 현 champion(부모 상태)과 국면에서의 제안.
    규칙 문서의 local 정의를 이 도메인에 사상한 것 - 대상 = 현
    champion."""
    phase = "early" if rnd <= 3 else ("mid" if rnd <= 6 else "late")
    return LookupKey("local", champion_hash or "noChampion", phase,
                     "PROPOSE")


def run_one(seed: int, condition: str, provider, log) -> dict:
    ledger = StateLedger() if condition == "2" else None
    champion = None            # (spec, obj, norm_hash, json)
    cands: list[dict] = []
    rounds_log: list[dict] = []
    calls = 0
    success_round = None
    wrong_blocks = 0
    for rnd in range(1, ROUNDS + 1):
        n = len(cands)
        best = max((c["obj"] for c in cands if c["obj"] is not None),
                   default=0.0)
        mean_vals = [c["obj"] for c in cands if c["obj"] is not None]
        mean = sum(mean_vals) / len(mean_vals) if mean_vals else 0.0
        prompt = build_prompt(
            champion[3] if champion else None,
            champion[1] if champion else None, rnd, n, best, mean)
        round_cands = []
        for slot in range(CALLS_PER_ROUND):
            response = provider.complete(prompt, 1.0, calls, seed)
            calls += 1
            spec = parse_spec(response, f"cond{seed}-r{rnd}-c{slot}")
            row = {"call": calls, "round": rnd, "valid": spec
                   is not None, "obj": None, "hash": None,
                   "blocked": False}
            if spec is not None:
                row["hash"] = norm_hash(spec)
                row["obj"] = judge(spec, seed)
                row["spec_json"] = spec.model_dump_json()
            round_cands.append(row)
            log({"seed": seed, "condition": condition, "call": calls,
                 "round": rnd, "response": response[:4000],
                 "valid": row["valid"], "obj": row["obj"]})
        # ---- 선택 (조건 간 유일 차이) ----
        key = local_key(champion[2] if champion else None, rnd)
        eligible = [c for c in round_cands if c["obj"] is not None]
        if ledger is not None:
            entry = ledger.lookup(key)
            if entry is not None and entry.disposition() == "BLOCK":
                # BLOCK: 이 키의 제안은 champion 자격 박탈
                top = max(eligible, key=lambda c: c["obj"],
                          default=None)
                for c in eligible:
                    c["blocked"] = True
                if top is not None and champion is not None and \
                        top["obj"] > champion[1]:
                    wrong_blocks += 1
                eligible = []
        adopted = False
        for c in sorted(eligible, key=lambda c: -c["obj"]):
            if champion is None or c["obj"] > champion[1]:
                from genesis.mission.models.gamespec import GameSpec
                spec = GameSpec.model_validate_json(c["spec_json"])
                champion = (spec, c["obj"], c["hash"], c["spec_json"])
                adopted = True
            break
        if ledger is not None:
            ledger.record(key, failed=not adopted,
                          rollback_target=champion[2] if champion
                          else None, verifier="judge")
        rounds_log.append({
            "round": rnd, "key_sig": key.state_signature,
            "phase": key.phase, "adopted": adopted,
            "champion_obj": champion[1] if champion else None,
            "round_blocked": bool(eligible == [] and ledger
                                  is not None and round_cands)})
        cands.extend(round_cands)
        if champion is not None and champion[1] >= SUCCESS_OBJ:
            success_round = rnd
            break
    hashes = [c["hash"] for c in cands if c["hash"]]
    return {
        "seed": seed, "condition": condition, "calls": calls,
        "rounds_used": rnd, "success": success_round is not None,
        "success_round": success_round,
        "champion_obj": champion[1] if champion else None,
        "n_candidates": len(cands),
        "n_valid": sum(c["valid"] for c in cands),
        "dup_rate": round(1 - len(set(hashes)) / len(hashes), 4)
        if hashes else None,
        "unique_sigs": len(set(hashes)),
        "wrong_blocks": wrong_blocks,
        "rounds": rounds_log,
        "candidates": [{k: v for k, v in c.items()
                        if k != "spec_json"} for c in cands],
    }


# ------------------------------------------------------------ provider


_PROVIDER = None


def _provider():
    if _PROVIDER is None:
        raise SystemExit("provider 미초기화")
    return _PROVIDER


def _load_key() -> None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return
    try:
        with open(ENV_FILE, encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("ANTHROPIC_API_KEY="):
                    os.environ["ANTHROPIC_API_KEY"] = \
                        line.split("=", 1)[1].strip().strip('"')
                    return
    except OSError:
        pass


def _init_real():
    global _PROVIDER
    _load_key()
    os.environ.setdefault("GENESIS_SPEND", "i-approve")
    from genesis.mission7.proposers import AnthropicProvider
    _PROVIDER = AnthropicProvider(MODEL, 1.0, max_tokens=2000)
    return _PROVIDER


class MockSpecProvider:
    """플러밍 전용: 호출마다 조금씩 다른 유효 스펙. 가끔 무효
    출력도 섞어 파싱 실패 경로를 태운다."""

    usage = {"calls": 0}

    def complete(self, prompt, temperature, a, b):
        self.usage["calls"] += 1
        n = self.usage["calls"]
        if n % 7 == 0:
            return "스펙을 만들 수 없습니다"
        spec = {
            "spec_id": "m", "name": f"목게임{n}",
            "players_min": 2, "players_max": 2,
            "board": {"kind": "GRID", "width": 3 + n % 4,
                      "height": 4 + n % 3},
            "tokens_per_player": 4 + n % 5,
            "shared_pool": (n % 3) * 4,
            "actions": [{"kind": "PLACE", "params": {}},
                        {"kind": "MOVE",
                         "params": {"distance": 1 + n % 2}}],
            "scoring": [{"kind": "LINE",
                         "params": {"length": 3, "points": 2}}],
            "win": "MOST_AT_END", "win_params": {},
            "end": "ROUNDS", "end_params": {"r": 6 + n % 6},
            "design_intent": "목"}
        return json.dumps(spec, ensure_ascii=False)


def run_set(experiment: str, pairs: list[tuple[int, str]]) -> dict:
    from genesis.rookery.runner import run_experiment_resumable

    def make_arm(cond):
        def fn(task, rep, log):
            return run_one(task, cond, _provider(), log)
        return fn

    # runner는 (task, rep, arm) 구조 - seed를 task로, rep=0 고정
    conds = sorted({c for _, c in pairs})
    seeds = sorted({s for s, _ in pairs})
    return run_experiment_resumable(
        experiment=experiment,
        arms={f"C{c}": make_arm(c) for c in conds},
        tasks=seeds, reps=1,
        config={"model": MODEL, "rounds": ROUNDS,
                "calls_per_round": CALLS_PER_ROUND,
                "success_obj": SUCCESS_OBJ,
                "design": "docs/ledger-condexp-design.md"},
        summarize=lambda rows, _t: {
            "runs": len(rows),
            "success": {r_["arm"]: sum(
                1 for x in rows if x["arm"] == r_["arm"]
                and x.get("success")) for r_ in rows},
            "calls_total": sum(r_.get("calls", 0) for r_ in rows)},
        usage_of=lambda: dict(getattr(_PROVIDER, "usage", {})))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pilot-mock", action="store_true")
    ap.add_argument("--pilot", action="store_true")
    ap.add_argument("--run", action="store_true")
    args = ap.parse_args()
    global _PROVIDER

    if args.pilot_mock:
        _PROVIDER = MockSpecProvider()
        out = run_set("condexp_pilot_mock",
                      [(s, "1") for s in PILOT_SEEDS[:2]])
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return 0
    if args.pilot:
        _init_real()
        # 태그 2: 1차 파일럿은 스키마 힌트 결함으로 무효
        # (condexp_pilot_invalid_schemahint/ 격리) - 등록서 사고
        # 기록 1 참조
        out = run_set("condexp_pilot2",
                      [(s, "1") for s in PILOT_SEEDS])
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return 0
    if args.run:
        _init_real()
        pairs = [(s, c) for s in MAIN_SEEDS for c in ("1", "2")]
        out = run_set("condexp_main", pairs)
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return 0
    print("옵션: --pilot-mock / --pilot / --run")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
