"""자산 파이프라인 — 요청 한 줄에서 **고를 후보들**까지, 전부 API로.

  python -X utf8 tools/asset_pipeline.py --want "주인공 마녀" --dry
  GENESIS_SPEND=i-approve python -X utf8 tools/asset_pipeline.py \
      --want "주인공 마녀" --n 4 --ground data/ground.png

2026-08-27 사장님: *"다 우리 엔진이면 다 API로 만들어야지."*

**사람이 손대는 자리는 마지막 하나뿐이다.**

  1 주문서 쓰기   GPT (API)          사양서를 시스템으로, 구조화 출력
    └ 검사        우리               금지 표현(§12). 어기면 거부
  2 그림 뽑기     GPT 이미지 (API)   n장을 한 번에 (§15: n=1은 도박)
  3 규격 맞추기   우리               격자·배경·팔레트 (gpt_intake)
  4 거르기        우리               규격 + **게임 화면 위 1:1** 경계 대비
  5 **고르기**    **사장님**         영구 human_gate — 기계는 순위도 안 매긴다

각 칸의 산출물과 판정 근거를 전부 남긴다. "고쳐서 통과"와 "그냥 통과"를 구분한다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import audition as au                             # noqa: E402
from tools import gpt_intake                                   # noqa: E402
from tools.artgen import openai_images as oi                   # noqa: E402
from tools.artgen import prompt_from_gpt as pfg                # noqa: E402


def run(want: str, target: str = "character", n: int = 4,
        profile: str = "character", ground: str | None = None,
        bible: str | None = None, quality: str = "low",
        root: str = ROOT) -> dict:
    log = {"want": want, "target": target, "n": n, "stages": []}

    # 1) 주문서 — GPT가 쓰고 우리가 검사한다
    orders = pfg.ask(want, target, n, root)
    accepted = pfg.accept(orders, target, root)
    log["stages"].append({"stage": "주문서", "by": f"openai:{pfg.MODEL}",
                          "asked": n, "kept": len(accepted["kept"]),
                          "rejected": accepted["rejected"],
                          "usage": orders.get("usage")})
    if not accepted["kept"]:
        log["verdict"] = "stopped"
        log["why"] = "GPT 주문서가 전부 검사에 걸렸다 - 사양서를 손봐야 한다"
        return log

    # 2~4) 변형마다 뽑고 → 규격 → 화면. **오디션이 n을 강제한다.**
    from genesis import prompt_book as pb
    kept = accepted["kept"]

    def make(i: int) -> dict:
        doc = pb.load(kept[i]["id"], root=root)
        g = oi.generate(doc["body"]["description"], 1, kept[i]["id"],
                        quality, root)
        if not g["paths"]:
            raise RuntimeError("이미지가 0장 왔다")
        r = gpt_intake.run(g["paths"][0], profile, name=kept[i]["id"],
                           ground=ground, bible=bible, root=root)
        return {"id": kept[i]["id"], "note": doc.get("note", ""),
                "raw": g["paths"][0], "final": r.get("final"),
                "intake": r, "usage": g.get("usage")}

    def judge(cand: dict) -> dict:
        v = cand["intake"]["verdict"]
        fail = [s for s in cand["intake"]["steps"]
                if s["step"] in ("규격", "화면") and s.get("ok") is False]
        why = []
        for s in cand["intake"]["steps"]:
            why += s.get("problems", []) + s.get("fail", [])
        return {"verdict": v, "fail": why, "undefined": []}

    res = au.audition(make, judge, n=len(kept), label=want,
                      allow_small=len(kept) < au.MIN_N)
    log["stages"].append({"stage": "뽑기·규격·화면", **res["counts"]})
    log["audition"] = res
    log["verdict"] = "ready_to_pick" if res["counts"]["passed"] else "none_passed"
    log["note"] = ("기계는 걸렀을 뿐 고르지 않았다. 통과분에 순위가 없다 — "
                   "마지막 칸은 사장님이 고르신다")
    return log


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--want", default="주인공 마녀")
    ap.add_argument("--target", default="character",
                    choices=["character", "tileset", "prop"])
    ap.add_argument("--profile", default="character",
                    choices=["character", "tile", "icon"])
    ap.add_argument("--n", type=int, default=4)
    ap.add_argument("--ground", help="게임 바닥 PNG(화면 판정용)")
    ap.add_argument("--bible", help="스타일 성경 이름")
    ap.add_argument("--quality", default="low",
                    choices=["low", "medium", "high"])
    ap.add_argument("--out", default="data/asset_pipeline.json")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args(argv)
    if a.dry:
        print(f'요청 "{a.want}" · 변형 {a.n}개')
        print("  1 주문서   GPT(API) → 우리 검사")
        print("  2 그림     GPT 이미지(API)")
        print("  3 규격     격자·배경·팔레트")
        print(f"  4 거르기   규격 + 화면{'(바닥 있음)' if a.ground else '(바닥 없음 → 미정)'}")
        print("  5 고르기   **사장님**")
        print("\n실제 실행은 GENESIS_SPEND=i-approve. 키: .secrets/openai.key")
        return 0
    if os.environ.get("GENESIS_SPEND") != "i-approve":
        print("지출 경로가 잠겨 있다. GENESIS_SPEND=i-approve 를 붙여라.")
        return 2
    r = run(a.want, a.target, a.n, a.profile, a.ground, a.bible, a.quality)
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(r, fh, ensure_ascii=False, indent=2, default=str)
    print(f'요청 "{r["want"]}" → {r["verdict"]}')
    for s in r["stages"]:
        print(f'  {s}')
    if r.get("audition"):
        print(au.summary(r["audition"]))
        for p in r["audition"]["passed"]:
            print(f'   ○ {p["cand"]["id"]}  {p["cand"]["final"]}')
    print(f'기록: {a.out}')
    return 0


if __name__ == "__main__":
    sys.exit(main())
