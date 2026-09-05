"""취향 심판 시험대 — 사람 선택이 기계 규칙으로 서는지 본다.

사전 등록: docs/taste-judge-v0-design.md (판정식·수용 기준은 선택을 보기 전에
얼렸다). 이 파일은 그 문서를 **집행할 뿐** 새 기준을 만들지 않는다.

    규칙 꼴      단일 특징 문턱 하나 (`f >= t` 또는 `f <= t`) — 합산 금지
    분할         leave-one-concept-out (같은 개념이 훈련·시험에 섞이면 새는 것)
    지표         남겨둔 개념에서 top-1 적중(동점은 실패로 센다)
    관문         표본(개념≥8·후보≥40·개념당≥3) ∧ 적중률≥0.75 ∧ 순열 p<0.05
                 ∧ 무작위 기준선 초과
    미달이면     승격 없음. human_gate 유지 — "취향은 아직 기계 심판 없음"

  python -X utf8 tools/taste_bench.py --picks data/picks/pick-v1.json
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import taste_features as tf                 # noqa: E402

# 설계 §4 — 숫자 보기 전 동결
GATES = {"min_concepts": 8, "min_candidates": 40, "min_per_concept": 3,
         "min_accuracy": 0.75, "max_p": 0.05, "permutations": 200}
SEED = 20260826                      # 순열 검정 난수 고정(재현 가능해야 한다)


def load_session(path: str, root: str = ROOT) -> list:
    """선별 기록 → [{concept, items:[{path, picked, features}]}]."""
    with open(path, encoding="utf-8") as f:
        session = json.load(f)
    groups = []
    for g in session["groups"]:
        items = []
        for row in g["shown"]:
            if not row["path"].lower().endswith(".svg"):
                # 사전 등록된 특징 목록(설계 §2)은 SVG용이다. 그림(PNG)용 특징은
                # 아직 등록되지 않았다 — **등록 전에는 재지 않는다.** 여기서
                # 아무 숫자나 만들면 그게 사후 기준이 된다.
                continue
            with open(os.path.join(root, row["path"]), encoding="utf-8") as f:
                svg = f.read()
            items.append({"path": row["path"], "picked": bool(row["picked"]),
                          "features": tf.measure(svg)})
        if not items:
            continue
        picked_nos = g.get("picked_nos")
        if picked_nos is None:
            picked_nos = [] if g["picked_no"] is None else [g["picked_no"]]
        groups.append({"concept": g["group"], "items": items,
                       "picked_no": g["picked_no"], "picked_nos": picked_nos})
    # top-1 지표는 "그 자리에 하나"를 전제한다. 여러 개 고른 자리(타일처럼
    # 골라 담는 질문)는 이 지표로 못 재므로 **빼되, 뺐다고 적는다**.
    return [g for g in groups if len(g["picked_nos"]) == 1]


def skipped_groups(path: str, root: str = ROOT) -> list:
    """재지 못한 자리들. 이유를 적어 남긴다 — 조용히 빠지면 표본이 거짓말한다."""
    with open(path, encoding="utf-8") as f:
        session = json.load(f)
    out = []
    for g in session["groups"]:
        nos = g.get("picked_nos")
        if nos is None:
            nos = [] if g["picked_no"] is None else [g["picked_no"]]
        media = {os.path.splitext(r["path"])[1].lower() for r in g["shown"]}
        if media - {".svg"}:
            out.append({"concept": g["group"], "picked": len(nos),
                        "why": "사전 등록된 특징이 SVG용뿐 - {} 는 아직 못 잰다"
                               .format(", ".join(sorted(media - {".svg"})))})
        elif len(nos) != 1:
            out.append({"concept": g["group"], "picked": len(nos),
                        "why": "미선택" if not nos else "다중 선택(top-1 불가)"})
    return out


def _score(rule: dict, feats: dict):
    """규칙의 여유값. 클수록 규칙이 좋아하는 후보. 못 잰 특징이면 None."""
    v = feats.get(rule["feature"])
    if v is None:
        return None
    return (v - rule["threshold"] if rule["op"] == ">="
            else rule["threshold"] - v)


def candidate_rules(groups: list) -> list:
    """문턱 후보 = 관측된 값들의 중간점(설계 §3). 특징 순서가 동률 우선순위다."""
    rules = []
    for feature in tf.FEATURES:
        vals = sorted({it["features"][feature] for g in groups
                       for it in g["items"]
                       if it["features"].get(feature) is not None})
        mids = [round((a + b) / 2, 6) for a, b in zip(vals, vals[1:])]
        for t in mids:
            rules.append({"feature": feature, "op": ">=", "threshold": t})
            rules.append({"feature": feature, "op": "<=", "threshold": t})
    return rules


def _train_accuracy(rule: dict, groups: list) -> float:
    """훈련 정확도 = 채택본을 맞히고 비채택본을 떨어뜨린 비율(후보 단위)."""
    ok = total = 0
    for g in groups:
        for it in g["items"]:
            s = _score(rule, it["features"])
            if s is None:
                continue
            total += 1
            ok += int((s >= 0) == it["picked"])
    return ok / total if total else 0.0


def fit(groups: list, rules: list | None = None) -> dict:
    """훈련 분할에서 규칙 하나를 고른다. 동률은 특징 순서 → 작은 문턱 순."""
    rules = rules if rules is not None else candidate_rules(groups)
    best, best_key = None, None
    for r in rules:
        acc = _train_accuracy(r, groups)
        key = (-acc, tf.FEATURES.index(r["feature"]), r["op"] != ">=",
               r["threshold"])
        if best_key is None or key < best_key:
            best, best_key = dict(r, train_accuracy=round(acc, 6)), key
    return best


def top1_hit(rule: dict, group: dict) -> bool:
    """남겨둔 개념에서 규칙이 최고점으로 뽑은 후보가 실제 채택본인가.

    동점이 여럿이면 **실패로 센다**(설계 §3: 후하게 세지 않는다).
    """
    scored = [(_score(rule, it["features"]), it) for it in group["items"]]
    scored = [(s, it) for s, it in scored if s is not None]
    if not scored:
        return False
    top = max(s for s, _ in scored)
    winners = [it for s, it in scored if s == top]
    return len(winners) == 1 and winners[0]["picked"]


def loco(groups: list, rules: list | None = None) -> dict:
    """leave-one-concept-out. 개념마다 나머지로 규칙을 뽑아 그 개념에서 시험."""
    rules = rules if rules is not None else candidate_rules(groups)
    rows = []
    for i, held in enumerate(groups):
        train = [g for j, g in enumerate(groups) if j != i]
        rule = fit(train, rules)
        rows.append({"concept": held["concept"], "rule": rule,
                     "hit": top1_hit(rule, held) if rule else False,
                     "n_candidates": len(held["items"])})
    hits = sum(1 for r in rows if r["hit"])
    return {"rows": rows, "hits": hits, "n": len(rows),
            "accuracy": round(hits / len(rows), 6) if rows else 0.0}


def baseline(groups: list) -> float:
    """무작위로 하나 집었을 때의 기대 적중률(개념별 1/후보수의 평균)."""
    if not groups:
        return 0.0
    return round(sum(1 / len(g["items"]) for g in groups) / len(groups), 6)


def permutation_p(groups: list, observed: float, n: int, seed: int = SEED
                  ) -> float:
    """개념 **안에서** 라벨을 섞어 같은 절차를 반복. 우연히 나올 값인가."""
    rng = random.Random(seed)
    rules = candidate_rules(groups)
    ge = 0
    for _ in range(n):
        shuffled = []
        for g in groups:
            picks = [it["picked"] for it in g["items"]]
            rng.shuffle(picks)
            shuffled.append({"concept": g["concept"],
                             "picked_no": g["picked_no"],
                             "items": [dict(it, picked=p)
                                       for it, p in zip(g["items"], picks)]})
        if loco(shuffled, rules)["accuracy"] >= observed:
            ge += 1
    return round((ge + 1) / (n + 1), 6)


def load_sessions(paths, root: str = ROOT) -> list:
    """여러 선별 기록을 **이어 붙인다**(설계 §7의 '누적').

    판정 절차는 손대지 않는다 — LOCO도 순열 검정도 개념 목록 위에서 도는 것이라,
    개념을 이어 붙이는 것이 곧 누적이다. 개념 이름이 세션 간에 겹칠 수 있으므로
    세션 이름을 앞에 붙여 **다른 개념으로** 센다(같은 이름을 합치면 LOCO가
    샌다).
    """
    out = []
    for path in paths:
        with open(path, encoding="utf-8") as f:
            session_id = json.load(f).get("id") or os.path.basename(path)
        for g in load_session(path, root):
            out.append({**g, "concept": f'{session_id}:{g["concept"]}',
                        "session": session_id})
    return out


def run(paths, permutations: int = None, root: str = ROOT) -> dict:
    if isinstance(paths, str):
        paths = [paths]
    groups = load_sessions(paths, root)
    n_cand = sum(len(g["items"]) for g in groups)
    per = [len(g["items"]) for g in groups]
    sample_ok = (len(groups) >= GATES["min_concepts"]
                 and n_cand >= GATES["min_candidates"]
                 and all(p >= GATES["min_per_concept"] for p in per))
    res = loco(groups)
    base = baseline(groups)
    perms = GATES["permutations"] if permutations is None else permutations
    p = permutation_p(groups, res["accuracy"], perms) if groups else 1.0
    gates = {
        "sample": {"ok": sample_ok, "concepts": len(groups),
                   "candidates": n_cand, "min_per_concept": min(per or [0]),
                   "want": f'개념>={GATES["min_concepts"]}, '
                           f'후보>={GATES["min_candidates"]}, 개념당>='
                           f'{GATES["min_per_concept"]}'},
        "accuracy": {"ok": res["accuracy"] >= GATES["min_accuracy"],
                     "value": res["accuracy"],
                     "want": f'>= {GATES["min_accuracy"]}'},
        "permutation": {"ok": p < GATES["max_p"], "value": p,
                        "want": f'< {GATES["max_p"]}',
                        "permutations": perms},
        "baseline": {"ok": res["accuracy"] > base, "value": base,
                     "want": "적중률이 무작위 기준선보다 높을 것"},
    }
    promote = bool(groups) and all(g["ok"] for g in gates.values())
    return {"picks": [os.path.relpath(p, root).replace("\\", "/")
                      for p in paths],
            "concepts": [g["concept"] for g in groups],
            "skipped": [row for p in paths
                        for row in skipped_groups(p, root)],
            "loco": res, "gates": gates,
            "rule_on_all": fit(groups) if groups else None,
            "verdict": ("promote" if promote else
                        "not-measured" if not groups else "no-promote"),
            "note": ("관문 통과 - taste_fit_icon을 real로 승격할 수 있다"
                     if promote else
                     "잴 수 있는 자리가 없다 - 사전 등록된 특징이 없는 매체이거나 "
                     "top-1로 못 재는 선택뿐이다. 숫자를 만들지 않는다"
                     if not groups else
                     "관문 미달 - human_gate 유지. 취향은 아직 기계 심판이 없다")}


def _print(res: dict) -> None:
    print(f'취향 시험대 — {res["picks"]}  (사전 등록: '
          f'docs/taste-judge-v0-design.md)')
    print("=" * 68)
    print(f'개념 {len(res["concepts"])}건: {", ".join(res["concepts"])}')
    for sk in res.get("skipped", []):
        print(f'  (제외) {sk["concept"]}: {sk["why"]}')
    for row in res["loco"]["rows"]:
        r = row["rule"]
        rule = (f'{r["feature"]} {r["op"]} {r["threshold"]}'
                f' (훈련 {r["train_accuracy"]})') if r else "(규칙 없음)"
        print(f'  [{"적중" if row["hit"] else "빗나감"}] {row["concept"]:14s} '
              f'후보 {row["n_candidates"]:2d}  규칙: {rule}')
    print("-" * 68)
    for name, g in res["gates"].items():
        val = g.get("value", "")
        print(f'  {name:12s} {"OK " if g["ok"] else "미달"}  '
              f'{val}  ({g["want"]})')
    print("=" * 68)
    print(f'판정: {res["verdict"].upper()} — {res["note"]}')


def main(argv=None):
    ap = argparse.ArgumentParser(description="취향 심판 시험대")
    ap.add_argument("--picks", required=True, action="append",
                    help="선별 기록 경로. 여러 번 주면 **누적**된다(설계 §7)")
    ap.add_argument("--permutations", type=int, default=None)
    ap.add_argument("--record")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    res = run(args.picks, permutations=args.permutations)
    if args.record:
        os.makedirs(os.path.dirname(args.record) or ".", exist_ok=True)
        with open(args.record, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        _print(res)
    return 0 if res["verdict"] == "promote" else 1


if __name__ == "__main__":
    sys.exit(main() or 0)
