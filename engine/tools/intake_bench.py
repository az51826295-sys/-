"""분해기 벤치 — 선언한 별칭이 실제로 걸리는가.

사전 등록: `docs/intake-bench-v0-design.md`.

`blueprint_engine.intake()`는 자기 한계를 "거칠다"고 적어놨다. 이 도구는 그
문장에 숫자를 붙이되, **내 판단이 안 들어가는 것만** 잰다 — 정답의 출처가
레지스트리에 선언된 별칭이므로 순환이 없다.

    별칭 재현율   맨 별칭 / 운반 문장에서 그 원자가 나오나      기대 1.0
    다중 언급     별칭 둘을 한 문장에 넣으면 둘 다 나오나       기대 1.0
    충돌 후보     별칭이 다른 별칭의 진부분문자열인 경우        **미판정**

충돌은 세되 **틀렸다고 부르지 않는다**. "그 문장이 그 능력을 요청하는가"는
사람이 정할 일이라 후보 목록으로만 남긴다.

  python -X utf8 tools/intake_bench.py
  python -X utf8 tools/intake_bench.py --strict --record data/intake_bench.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tools import blueprint_engine as be                  # noqa: E402

CARRIER = "{alias} 만들어줘"          # 운반 문장(동결)
PAIR = "{a} 하고 {b}"                # 다중 언급 문장(동결)
EXPECTED = 1.0                       # 성능이 아니라 계약이다(설계 §4)


def alias_recall(registry: list) -> dict:
    """선언된 모든 별칭이 자기 원자를 찾아내나. 실패는 전부 이름과 함께 남긴다."""
    bare_miss, carried_miss, n = [], [], 0
    for atom in registry:
        for alias in atom.get("aliases", []):
            n += 1
            hit_bare = {a["id"] for a in be.intake(alias, registry)}
            hit_carried = {a["id"] for a in
                           be.intake(CARRIER.format(alias=alias), registry)}
            if atom["id"] not in hit_bare:
                bare_miss.append({"atom": atom["id"], "alias": alias})
            if atom["id"] not in hit_carried:
                carried_miss.append({"atom": atom["id"], "alias": alias,
                                     "sentence": CARRIER.format(alias=alias)})
    return {
        "n_aliases": n,
        "bare_recall": round((n - len(bare_miss)) / n, 4) if n else 0.0,
        "carried_recall": round((n - len(carried_miss)) / n, 4) if n else 0.0,
        "bare_misses": bare_miss, "carried_misses": carried_miss,
    }


def multi_mention(registry: list) -> dict:
    """별칭 둘을 한 문장에 — 둘 다 나와야 한다. 쌍은 기계가 만든다."""
    atoms = [a for a in registry if a.get("aliases")]
    rows, misses = 0, []
    for i in range(len(atoms)):
        for j in range(i + 1, len(atoms)):
            a, b = atoms[i], atoms[j]
            sentence = PAIR.format(a=a["aliases"][0], b=b["aliases"][0])
            found = {x["id"] for x in be.intake(sentence, registry)}
            rows += 1
            missing = [x["id"] for x in (a, b) if x["id"] not in found]
            if missing:
                misses.append({"sentence": sentence, "missing": missing,
                               "found": sorted(found)})
    return {"n_pairs": rows,
            "recall": round((rows - len(misses)) / rows, 4) if rows else 0.0,
            "misses": misses}


def collision_candidates(registry: list) -> list:
    """별칭이 **다른 별칭의 진부분문자열**인 경우. 판정하지 않는다 - 후보다.

    이게 왜 재료인가: `intake("아이콘 세트")`가 `아이콘`만 등록한 원자까지
    끌어오는 것이 옳은지는 문맥이 정한다. 기계는 "겹친다"까지만 말할 수 있다.
    """
    owned = [(a["id"], al.lower())
             for a in registry for al in a.get("aliases", [])]
    out = []
    for aid, alias in owned:
        for other_id, other in owned:
            if aid == other_id or alias == other:
                continue
            if alias in other:
                out.append({"short": alias, "short_atom": aid,
                            "long": other, "long_atom": other_id,
                            "note": "짧은 별칭이 긴 별칭 안에 들어 있다 - "
                                    "긴 쪽을 요청하면 짧은 쪽도 함께 걸린다"})
    return out


def run(registry: list | None = None) -> dict:
    reg = registry if registry is not None else be.load_registry()
    recall = alias_recall(reg)
    multi = multi_mention(reg)
    collisions = collision_candidates(reg)
    gates = {
        "bare_recall": recall["bare_recall"] >= EXPECTED,
        "carried_recall": recall["carried_recall"] >= EXPECTED,
        "multi_recall": multi["recall"] >= EXPECTED,
    }
    return {
        "expected": EXPECTED, "carrier": CARRIER, "pair_sentence": PAIR,
        "alias_recall": recall, "multi_mention": multi,
        "collision_candidates": collisions,
        "n_collision_candidates": len(collisions),
        "collision_state": "미판정 - 사람이 정할 일(설계 §3)",
        "gates": gates, "passes": all(gates.values()),
    }


def _print(res: dict) -> None:
    r, m = res["alias_recall"], res["multi_mention"]
    print("=" * 66)
    print("분해기 벤치 — 선언한 별칭이 실제로 걸리나")
    print("=" * 66)
    print(f'  별칭 {r["n_aliases"]}개')
    print(f'    맨 별칭  재현율 {r["bare_recall"]:.4f} '
          f'{"OK" if res["gates"]["bare_recall"] else "미달"}')
    print(f'    운반 문장 재현율 {r["carried_recall"]:.4f} '
          f'{"OK" if res["gates"]["carried_recall"] else "미달"}')
    print(f'  다중 언급 {m["n_pairs"]}쌍  재현율 {m["recall"]:.4f} '
          f'{"OK" if res["gates"]["multi_recall"] else "미달"}')
    for row in r["bare_misses"][:10]:
        print(f'    · 못 찾음(맨): {row["atom"]} ← "{row["alias"]}"')
    for row in r["carried_misses"][:10]:
        print(f'    · 못 찾음(문장): {row["atom"]} ← "{row["sentence"]}"')
    for row in m["misses"][:10]:
        print(f'    · 다중 누락: "{row["sentence"]}" → 빠진 것 {row["missing"]}')
    print("-" * 66)
    print(f'  부분문자열 충돌 후보 {res["n_collision_candidates"]}건 '
          f'({res["collision_state"]})')
    for row in res["collision_candidates"][:8]:
        print(f'    · "{row["short"]}"({row["short_atom"]}) ⊂ '
              f'"{row["long"]}"({row["long_atom"]})')
    print("=" * 66)
    print(f'  판정: {"통과" if res["passes"] else "미달"} '
          f'(셋 다 {res["expected"]}이어야 한다 - 성능이 아니라 계약이다)')


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="분해기 벤치")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--record")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    res = run()
    if a.record:
        os.makedirs(os.path.dirname(a.record) or ".", exist_ok=True)
        with open(a.record, "w", encoding="utf-8", newline="\n") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
    if a.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        _print(res)
    return 0 if (not a.strict or res["passes"]) else 1


if __name__ == "__main__":
    sys.exit(main() or 0)
