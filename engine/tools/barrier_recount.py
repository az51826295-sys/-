"""7C·7D 장벽 재집계 표 (기술 통계 전용, 호출 0).

30개 deadlock 레지스트리에서 런 단위 표를 기계 생성한다.
결론을 붙이지 않는다 - 수치와 기계적 정의만 저장한다.

사전 정의 (값 확인 이전에 고정):
- 장벽 A 통과 = incumbent 점수가 처음으로 THRESH_A(0.72) 이상이
  된 세대. 판정 불변 구간은 데이터에서 검증해 함께 기록한다.
- 장벽 B 돌파 = incumbent 점수가 처음으로 THRESH_B(0.80) 이상이
  된 세대. 기존 감사의 (0.7915, 0.8488) 불변 구간 재검증 포함.
- v0 기록 등급: registry_direct(롤백 세대의 incumbent_score로 직접
  기록) / null_candidate(gen1에 v0 점수와 일치하는 무변화 후보) /
  partial(런 내 v0 측정 기록 없음 - 추정 보간 금지, 분모에 명시).
- 고착 지점 = 마지막 채택 세대와 그 이후 점수(불변 유지 세대 수).

    python tools/barrier_recount.py
"""
import glob
import hashlib
import json
import os

DATA = r"C:\Users\az518\Desktop\genesis-project\data"
FOUNDING = 0.5056906611906613       # 직접 기록 17런에서 관측된 값
THRESH_A = 0.72
THRESH_B = 0.80
OUT_JSON = os.path.join(DATA, "barrier_recount.json")
OUT_MD = os.path.join(
    r"C:\Users\az518\Desktop\genesis-project\docs",
    "barrier-recount.md")


def arm_seed(exp: str) -> tuple[str, str]:
    # mission7b_{ARM}_deadlock_{msN}[_t0.3]
    name = exp.replace("mission7b_", "")
    parts = name.split("_deadlock_")
    arm = parts[0]
    seed = parts[1]
    if seed.endswith("_t0.3"):
        arm += "_t0.3"
        seed = seed[:-len("_t0.3")]
    return arm, seed


def incumbent_series(reg: dict) -> list[tuple[int, float, bool]]:
    """세대별 (gen, incumbent_score_after, adopted)."""
    out = []
    for g in reg["generations"]:
        out.append((g["gen"], g["incumbent_score"],
                    not g.get("rolled_back")))
    return out


def v0_record_class(reg: dict) -> str:
    for g in reg["generations"]:
        if g["incumbent_version_before"] != 0:
            break
        if g.get("rolled_back"):
            return "registry_direct"
        for c in g["candidates"]:
            if abs(c["score"] - FOUNDING) < 1e-9:
                return "null_candidate"
        break
    return "partial"


def first_crossing(series, thresh) -> int | None:
    for gen, score, _ in series:
        if score >= thresh:
            return gen
    return None


def main() -> int:
    paths = sorted(glob.glob(os.path.join(
        DATA, "mission7b_*_deadlock_*registry.json")))
    rows = []
    all_scores = set()
    for p in paths:
        with open(p, encoding="utf-8") as f:
            reg = json.load(f)
        arm, seed = arm_seed(reg["experiment"])
        series = incumbent_series(reg)
        g1 = reg["generations"][0]
        g1_adopt = None
        if not g1.get("rolled_back"):
            for c in g1["candidates"]:
                if c.get("adopted"):
                    g1_adopt = c["score"]
        adopt_gens = [g for g, _, ad in series if ad]
        last_adopt = adopt_gens[-1] if adopt_gens else None
        final = reg["incumbent_score"]
        plateau_gens = (series[-1][0] - last_adopt) if last_adopt \
            else len(series)
        for _, s, _ in series:
            all_scores.add(round(s, 10))
        v0h = hashlib.sha1(json.dumps(
            reg["versions"]["0"].get("rules"), sort_keys=True,
            ensure_ascii=False).encode()).hexdigest()[:10]
        rows.append({
            "run_id": reg["experiment"],
            "arm": arm, "seed": seed,
            "v0_hash": v0h,
            "v0_record": v0_record_class(reg),
            "gen1_adopted_score": g1_adopt,
            "gen1_rolled_back": bool(g1.get("rolled_back")),
            "barrier_A_gen": first_crossing(series, THRESH_A),
            "barrier_B_gen": first_crossing(series, THRESH_B),
            "final_score": round(final, 6),
            "final_version": reg["incumbent_version"],
            "last_adopt_gen": last_adopt,
            "plateau_gens_after_last_adopt": plateau_gens,
            "n_generations": len(series)})

    # 판정 불변 구간 검증: 문턱 좌우로 실제 관측 점수가 비었는가
    scores = sorted(all_scores)
    def invariance(thresh):
        lo = max((s for s in scores if s < thresh), default=None)
        hi = min((s for s in scores if s >= thresh), default=None)
        return lo, hi
    invA, invB = invariance(THRESH_A), invariance(THRESH_B)

    denom = {
        "v0_registry_direct": sum(1 for r in rows
                                  if r["v0_record"] == "registry_direct"),
        "v0_null_candidate": sum(1 for r in rows
                                 if r["v0_record"] == "null_candidate"),
        "v0_partial": sum(1 for r in rows
                          if r["v0_record"] == "partial"),
        "total": len(rows)}

    doc = {
        "purpose": "기술 통계 전용 - 결론 없음",
        "founding_observed": FOUNDING,
        "thresholds": {
            "A": THRESH_A,
            "A_invariance_interval_observed": invA,
            "B": THRESH_B,
            "B_invariance_interval_observed": invB},
        "denominators": denom,
        "rows": rows}
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)

    # 출처 헤더 (계약 v0): 파생 문서의 부모 = 30개 레지스트리,
    # as_of = 부모 확인 시점(지금), 생성기 명시 - 자동 생성 문서의
    # 첫 실전 적용
    import sys
    import time
    sys.path.insert(0, os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))))
    from genesis.provenance_scan import render_header, sha12
    parent_ids = [os.path.relpath(p, os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))).replace("\\", "/")
        for p in paths]
    header = {
        "source_id": "docs/barrier-recount.md",
        "source_kind": "derived",
        "parent_ids": parent_ids,
        "parent_hash": {pid: sha12(p)
                        for pid, p in zip(parent_ids, paths)},
        "as_of": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "generator": "tools/barrier_recount.py",
        "status": None}

    # markdown
    md = [render_header(header).rstrip(),
          "# 7C·7D 장벽 재집계 표 (기술 통계 전용)", "",
          "결론을 붙이지 않는다. 기계적 정의와 런별 수치만 기록한다.",
          "",
          f"- 관측 founding(직접 기록 17런): `{FOUNDING}`",
          f"- 장벽 A 문턱 {THRESH_A} — 인접 관측 점수 "
          f"({invA[0]}, {invA[1]}): 이 열린 구간 안 어떤 문턱도 동일 판정",
          f"- 장벽 B 문턱 {THRESH_B} — 인접 관측 점수 "
          f"({invB[0]}, {invB[1]}): 동일 판정 구간",
          f"- v0 기록 분모: 직접 {denom['v0_registry_direct']} + "
          f"무변화 후보 {denom['v0_null_candidate']} + partial "
          f"{denom['v0_partial']} = {denom['total']} "
          "(partial은 추정 보간 없이 미기록으로 집계)",
          "",
          "| run | arm | seed | v0기록 | gen1 채택 | A통과 세대 | "
          "B돌파 세대 | 최종 | v | 마지막 채택 | 고착 세대수 |",
          "|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in sorted(rows, key=lambda r: (r["arm"], r["seed"])):
        md.append(
            f"| {r['run_id'].replace('mission7b_', '')} | {r['arm']} "
            f"| {r['seed']} | {r['v0_record']} | "
            f"{r['gen1_adopted_score'] if r['gen1_adopted_score'] is not None else 'rollback'} | "
            f"{r['barrier_A_gen'] or '—'} | "
            f"{r['barrier_B_gen'] or '—'} | {r['final_score']:.4f} | "
            f"{r['final_version']} | {r['last_adopt_gen'] or '—'} | "
            f"{r['plateau_gens_after_last_adopt']} |")
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")

    print(f"런 {len(rows)}개, v0 해시 {len({r['v0_hash'] for r in rows})}종")
    print(f"A 불변 구간 {invA}, B 불변 구간 {invB}")
    print(f"분모 {denom}")
    print(f"저장: {OUT_JSON}\n      {OUT_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
