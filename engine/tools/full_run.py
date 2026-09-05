"""완주 시도 (docs/full-run-v0-design.md, 게이트 ⑤).

  python -X utf8 tools/full_run.py                       # 목(지출 0)
  GENESIS_SPEND=i-approve python -X utf8 tools/full_run.py \\
      --provider anthropic --max-usd 0.20

요청 문장 하나에서 게임까지 여덟 칸을 지나며 **어디서 사람이 필요한지**를 센다.
성공이 목표가 아니다 — 멈추는 지점을 찾는 것이 목표다.

개입은 세 종류로 나눈다:
  approval  승인만 하면 되는 것(지출 등)
  choice    사람이 골라야 하는 것(선별)
  fix       사람이 고쳐야 하는 것(결함)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tools import assemble_game                          # noqa: E402
from tools import blueprint_engine as be                 # noqa: E402
from tools import game_smoke                             # noqa: E402
from tools import icon_judge                             # noqa: E402
from tools import icon_lane_run as ilr                   # noqa: E402

WANT = "아이콘 세트 만들어줘"
CONCEPTS = [{"concept": "potion", "meaning": "회복 물약"},
            {"concept": "key", "meaning": "열쇠"},
            {"concept": "torch", "meaning": "횃불"}]


def _step(steps: list, no: int, name: str, status: str, **extra) -> dict:
    row = {"step": no, "name": name, "status": status, **extra}
    steps.append(row)
    return row


def run(provider_name: str = "mock", max_usd: float = 0.20,
        root: str = ROOT, model: str | None = None) -> dict:
    steps: list = []
    doc = icon_judge.load_spec()
    reg = be.load_registry()
    t0 = time.time()

    # 1. 요청 → 원자
    matched = be.intake(WANT, reg)
    _step(steps, 1, "요청 분해", "auto" if matched else "fix",
          atoms=[a["id"] for a in matched],
          why=None if matched else "레지스트리 밖 요청 - LLM Proposer 미탑재")

    # 2. 재구성 + 되묻기
    recon = be.reconstruct(matched, reg)
    ask = be.ask_back(WANT, recon)
    needs_ask = bool(recon["drops"])
    _step(steps, 2, "재구성·되묻기",
          "choice" if needs_ask else "auto",
          keep=[a["id"] for a in recon["keep"]],
          dropped=[d["dropped"] for d in recon["drops"]],
          question=(ask.splitlines()[0] if needs_ask else None))

    # 3. 설계도 + 견적
    bp = be.blueprint(recon, want=WANT)
    est = be.estimate(recon)
    _step(steps, 3, "설계도·견적", "approval",
          checklist=len(bp["checklist"]), human_gate=len(bp["human_gate"]),
          coins=est["total_coins"], won=est["won_equiv"],
          why="견적 승인은 사람 몫이다(코인이 돈이다)")

    # 4. 자산 생성
    provider = ilr.make_provider(provider_name, model or ilr.DEFAULT_MODEL,
                                 max_usd)
    made, gen_err = [], None
    for i, item in enumerate(CONCEPTS, 1):
        prompt = ilr.initial_prompt(item["concept"], item["meaning"],
                                    "fullrun", i, [], doc, ilr.DEFAULT_N)
        ilr._assert_no_hidden_leak(prompt, doc)
        try:
            raw = provider.generate(ilr.SYSTEM_PROMPT, prompt, 1.0,
                                    ilr.DEFAULT_N)
        except Exception as exc:
            gen_err = f"{type(exc).__name__}: {exc}"
            break
        made += [(item["concept"], svg) for svg in ilr.split_candidates(raw)]
    _step(steps, 4, "자산 생성",
          "fix" if gen_err else ("approval" if provider_name != "mock"
                                 else "auto"),
          provider=provider_name, candidates=len(made), why=gen_err,
          usd=round(getattr(provider, "spent_here", 0.0), 6))

    # 5. 낱개 심판
    passed = []
    for concept, svg in made:
        if icon_judge.judge_svg(svg, doc)["verdict"] == "PASS":
            passed.append((concept, svg))
    by_concept: dict = {}
    for concept, svg in passed:
        by_concept.setdefault(concept, []).append(svg)
    ok_concepts = [c for c in by_concept if by_concept[c]]
    _step(steps, 5, "낱개 심판",
          "auto" if passed else "fix",
          candidates=len(made), passed=len(passed),
          concepts_with_pass=sorted(ok_concepts),
          why=None if passed else "통과 후보가 0 - 다시 생성하거나 스펙을 고쳐야 한다")

    # 6. 세트 심판
    if len(ok_concepts) >= 2:
        import tempfile
        paths = []
        tmp = tempfile.mkdtemp(prefix="fullrun_")
        for c in sorted(ok_concepts):
            p = os.path.join(tmp, f"{c}.svg")
            with open(p, "w", encoding="utf-8") as fh:
                fh.write(by_concept[c][0])
            paths.append(p)
        res = icon_judge.judge_set(paths)
        _step(steps, 6, "세트 심판",
              "auto" if res["set_verdict"] == "PASS" else "fix",
              set_verdict=res["set_verdict"],
              rules={r["rule"]: r["ok"] for r in res["set_rules"]},
              why=None if res["set_verdict"] == "PASS"
              else "세트 규칙 미달 - 다시 고르거나 다시 생성해야 한다")
    else:
        _step(steps, 6, "세트 심판", "undefined",
              why="세트를 만들 통과 후보가 2개 미만이다")

    # 7. 선별 — 규율상 사람이 고른다
    _step(steps, 7, "선별", "choice",
          pool={c: len(v) for c, v in by_concept.items()},
          why="심판은 거를 뿐 고르지 않는다(2026-08-26 규율). "
              "취향 심판이 승격되기 전에는 여기서 항상 멈춘다")

    # 8. 조립 + 게임 확인 — 지금 게임에 들어 있는 것으로 확인만
    asm = assemble_game.assemble(apply=False)
    smoke = game_smoke.run()
    _step(steps, 8, "조립·게임 확인",
          "auto" if smoke.get("verdict") == "PASS" else
          ("undefined" if smoke.get("verdict") == "UNDEFINED" else "fix"),
          smoke=smoke.get("verdict"),
          icons=asm["icons"].get("count"),
          characters=len(asm["characters"]),
          why=smoke.get("why"))

    counts = {k: sum(1 for s in steps if s["status"] == k)
              for k in ("auto", "approval", "choice", "fix", "undefined")}
    stopped = [s for s in steps if s["status"] in ("choice", "fix")]
    if counts["fix"] or counts["choice"]:
        verdict = "stopped"
    elif counts["undefined"]:
        verdict = "undefined"
    elif counts["approval"]:
        verdict = "approval_only"
    else:
        verdict = "complete"
    return {"spec": "full-run-v0", "design": "docs/full-run-v0-design.md",
            "want": WANT, "provider": provider_name,
            "model": model or ilr.DEFAULT_MODEL,
            "verdict": verdict, "counts": counts,
            "stopped_at": [{"step": s["step"], "name": s["name"],
                            "status": s["status"], "why": s.get("why")}
                           for s in stopped],
            "seconds": round(time.time() - t0, 1), "steps": steps}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--provider", default="mock")
    ap.add_argument("--model", default=ilr.DEFAULT_MODEL,
                    help="티어를 바꿔 같은 완주를 돌린다(오늘 아침 티어 실험의 후속)")
    ap.add_argument("--max-usd", type=float, default=0.20)
    ap.add_argument("--out", default="data/full_run_v0.json")
    a = ap.parse_args(argv)
    res = run(a.provider, a.max_usd, model=a.model)
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)
    print(f'요청: "{res["want"]}"  제공자 {res["provider"]}  '
          f'{res["seconds"]}초')
    for s in res["steps"]:
        mark = {"auto": "  ", "approval": "승인", "choice": "선택",
                "fix": "수리", "undefined": "미정"}[s["status"]]
        line = f'  {s["step"]}. {mark} {s["name"]}'
        detail = {k: v for k, v in s.items()
                  if k not in ("step", "name", "status", "why") and v not in
                  (None, [], {}, 0)}
        if detail:
            line += f'  {detail}'
        print(line)
        if s.get("why"):
            print(f'        ↳ {s["why"]}')
    print(f'판정: {res["verdict"]}  {res["counts"]}')
    print(f'기록: {a.out}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
