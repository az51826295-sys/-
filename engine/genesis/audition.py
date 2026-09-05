"""오디션 — 엔진의 본체. **여러 개 뽑고, 기계가 거르고, 사람이 고른다.**

`docs/measurement-rules.md` §15. 2026-08-27 게임 실험이 남긴 결론이다:

  같은 설정이 다른 결과를 낸다. 타일에서도(08-07 네 단어 주문이 공들인 주문보다
  좋았다), 캐릭터에서도(hero 색 10.5 / merchant 21.0인데 `metadata.json` 대조
  결과 설정이 완전히 같았다). 그런데 **게임의 모든 자산이 n=1이었다.**
  품질이 낮았던 진짜 이유는 프롬프트도 파라미터도 아니라 **선택지가 없었다는 것**.

그래서 이 모듈은 `n=1` 을 기본값으로 두지 않는다. 한 번 뽑아 쓰는 경로는
**실험이 아니라 도박**이고, 엔진은 도박을 팔지 않는다.

**세 칸으로 나눈다. 섞지 않는다.**

  뽑기(generate)  제공자가 확률적으로 낸다. 우리는 몇 번 부를지만 정한다.
  거르기(judge)   기계가 사양 대비로 떨어뜨린다. **고르지 않는다.**
  고르기(pick)    사람이 한다. 영구 human_gate (2026-08-26 확정).

거르기와 고르기를 섞으면 기계가 취향을 대신 정하게 된다. 그건 이 제품이 하지
않기로 한 일이다.
"""
from __future__ import annotations

import json
import os
from typing import Callable

MIN_N = 3          # 이보다 적게 뽑는 것은 오디션이 아니다


class NotAnAudition(ValueError):
    """n이 너무 작아 고를 수 없을 때. **조용히 넘어가지 않는다.**"""


def audition(make: Callable[[int], dict], judge: Callable[[dict], dict],
             n: int, label: str = "", allow_small: bool = False) -> dict:
    """`make(i)` 를 n번 부르고 `judge` 로 거른다. **고르기는 하지 않는다.**

    `make(i)` 는 후보 하나를 만들어 dict로 돌려준다(`{"id":..., "paths":[...]}` 등).
    실패하면 예외를 던져도 된다 - 그 회차는 `errors` 에 기록되고 나머지는 계속한다.
    `judge(cand)` 는 `{"verdict": "PASS"|"FAIL"|"UNDEFINED", ...}` 를 돌려준다.

    돌려주는 것:
      passed     사람에게 보여줄 것들. **순위를 매기지 않는다** - 순서는 뽑은 순서다.
      rejected   왜 떨어졌는지와 함께
      undefined  못 잰 것. fail이 아니다(3값 규율).
      errors     주문 자체가 실패한 회차
    """
    if n < MIN_N and not allow_small:
        raise NotAnAudition(
            f"n={n}은 오디션이 아니다(최소 {MIN_N}). 하나만 뽑아 쓰는 것은 "
            f"판정이 아니라 도박이다 - measurement-rules §15. "
            f"정말 의도한 것이면 allow_small=True 를 명시하라")
    passed, rejected, undefined, errors = [], [], [], []
    for i in range(n):
        try:
            cand = make(i)
        except Exception as exc:                     # 한 회차 실패가 전체를 안 죽인다
            errors.append({"i": i, "error": f"{type(exc).__name__}: {exc}"})
            continue
        try:
            v = judge(cand)
        except Exception as exc:
            undefined.append({"i": i, "cand": cand,
                              "why": [f"심판이 터졌다: {exc}"]})
            continue
        row = {"i": i, "cand": cand, "judgement": v}
        if v.get("verdict") == "PASS":
            passed.append(row)
        elif v.get("verdict") == "UNDEFINED":
            undefined.append(row)
        else:
            rejected.append(row)
    return {"label": label, "n": n,
            "passed": passed, "rejected": rejected,
            "undefined": undefined, "errors": errors,
            "counts": {"passed": len(passed), "rejected": len(rejected),
                       "undefined": len(undefined), "errors": len(errors)},
            "note": ("기계는 걸렀을 뿐 고르지 않았다. 마지막 칸은 사람이 고른다 "
                     "(2026-08-26 확정 · 영구 human_gate)")}


def summary(res: dict) -> str:
    c = res["counts"]
    lines = [f"오디션 {res['label']} — {res['n']}회 뽑아 "
             f"통과 {c['passed']} · 탈락 {c['rejected']} · "
             f"미정 {c['undefined']} · 주문실패 {c['errors']}"]
    for r in res["rejected"]:
        why = "; ".join(r["judgement"].get("fail", []))
        lines.append(f"  ✖ #{r['i']}  {why}")
    for r in res["undefined"]:
        why = "; ".join(r.get("why") or r.get("judgement", {}).get("undefined", []))
        lines.append(f"  ? #{r['i']}  {why}")
    if c["passed"] == 0:
        lines.append("  통과가 0이다 — 더 뽑거나 사양을 다시 본다. "
                     "**떨어진 것 중에서 고르지 않는다.**")
    else:
        lines.append(f"  → 사장님께 {c['passed']}개를 나란히 보여드린다 "
                     f"(순위 없음 - 고르는 것은 사람이다)")
    return "\n".join(lines)


def save(res: dict, path: str) -> str:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2, default=str)
    return path
