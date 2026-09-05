"""아이콘 레인 심판 CLI — SVG 후보를 스펙으로 채점하고 §4 리포트를 낸다.

설계: docs/icon-lane-design.md. 이 도구는 **심판만** 한다 — Proposer(외부 LLM)
호출은 여기 없다(지출 게이트). 문서의 결정 그대로 "우리 자산은 심판뿐".

  python -X utf8 tools/icon_judge.py --svg out/check.svg
  python -X utf8 tools/icon_judge.py --set-dir out/icons      # 세트 전체 + 중복·통일
  python -X utf8 tools/icon_judge.py --svg a.svg --prompt-spec   # 프롬프트용 공개 스펙

정직 조항: hidden 중 contrast·roundtrip은 **미측정**이다(색 문맥·래스터라이저
필요). 재는 척하지 않고 리포트 말미에 미측정으로 남긴다.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import yaml                                              # noqa: E402

from genesis import icon_lane                            # noqa: E402
from genesis import svg_raster                           # noqa: E402
from tools import artifact_adapter as aa                 # noqa: E402
from tools import judge_bench as jb                      # noqa: E402

SPEC_PATH = os.path.join(ROOT, "data", "icon_specs", "icon-24-line-v1.yaml")
ATOM_ID = "icon_spec_fit"
# 못 재는 항목은 래스터 경로가 없는 기계에서만 생긴다(도구 부재).
# contrast는 여기 없다 - 2026-08-26 사장님 결정 (b)로 **화면 층**으로 옮겼다.
# "못 쟀다"와 "여기서 잴 것이 아니다"는 다른 상태이고, 리포트도 그렇게 나눈다.
UNMEASURED_WITHOUT_RASTER = ("roundtrip", "optical_weight_delta")


def unmeasured(doc: dict) -> list:
    """이 기계에서 지금 **못 재는** hidden 항목(도구 부재). 리포트에 적는다."""
    if svg_raster.available():
        return []
    hidden = doc.get("hidden", {})
    return [n for n in UNMEASURED_WITHOUT_RASTER
            if n in hidden or n in hidden.get("set_consistency", {})
            or n == "optical_weight_delta"]


def deferred_to_screen(doc: dict) -> list:
    """자산이 아니라 화면이 답할 규칙들. 미측정과 섞지 않는다."""
    return sorted(doc.get("screen_layer", {}))


def load_spec(path: str = SPEC_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def spec_for_judge(doc: dict) -> dict:
    """문서 모양(public/hidden) → 심판이 읽는 평평한 spec.*"""
    p = doc["public"]
    return {
        "viewBox": p["viewBox"],
        "snap": p["grid"]["snap"],
        "stroke_width": p["stroke"]["width"],
        "stroke_linecap": p["stroke"]["linecap"],
        "stroke_linejoin": p["stroke"]["linejoin"],
        "fill_allowed": [p["fill"]] if isinstance(p["fill"], str) else p["fill"],
        "padding_min": p["padding"]["min"],
        "path_max_count": p["path"]["max_count"],
        "shape_max_count": p.get("shape", {}).get("max_count"),
        "path_max_commands": p["path"]["max_total_commands"],
        "allowed_elements": p["allowed_elements"],
        "forbidden_elements": p["forbidden_elements"],
        "max_bytes": p["size"]["max_bytes"],
    }


def public_prompt_spec(doc: dict) -> str:
    """프롬프트에 넣어도 되는 부분만 문자열로. hidden은 절대 들어가지 않는다."""
    return yaml.safe_dump(doc["public"], allow_unicode=True, sort_keys=False)


def atom(registry: list | None = None) -> dict:
    reg = registry if registry is not None else jb.load_registry()
    found = next((a for a in reg if a["id"] == ATOM_ID), None)
    if found is None:
        raise KeyError(f"{ATOM_ID} 원자가 레지스트리에 없다")
    return found


def judge_svg(svg: str, doc: dict | None = None, peers: list | None = None,
              registry: list | None = None) -> dict:
    """SVG 하나를 채점한다. peers를 주면 hidden 신규성(중복) 검사도 건다."""
    doc = doc or load_spec()
    a = atom(registry)
    spec = spec_for_judge(doc)
    measured = aa.ADAPTERS["svg_code"]({"svg": svg, "snap": spec["snap"]})
    sample = {"spec": spec, "measured": measured, "claim": {}}
    rows = jb.explain_conformance(a["judge"]["params"], sample)
    # hidden 왕복오차: 우리 파서가 읽은 그림과 렌더러가 그린 그림이 같은가.
    # 래스터 경로가 없는 기계에서는 규칙을 **걸지 않는다** — 도구가 없다는
    # 이유로 후보를 미정의로 떨어뜨리면 기계를 옮겼을 뿐인데 판정이 바뀐다.
    rt = doc.get("hidden", {}).get("roundtrip", {})
    if rt.get("max_pixel_diff") is not None and svg_raster.available():
        px = int(rt.get("render_px", svg_raster.RENDER_PX))
        diff = svg_raster.roundtrip_diff(svg, px=px)
        rows.append({"rule": "roundtrip.max_pixel_diff",
                     "ok": None if diff is None else diff <= rt["max_pixel_diff"],
                     "got": diff if diff is not None else "미측정(렌더 실패)",
                     "want": f'<= {rt["max_pixel_diff"]}', "hidden": True})
    if peers is not None:
        dup = icon_lane.structure_hash(svg, snap=spec["snap"]) in {
            icon_lane.structure_hash(p, snap=spec["snap"]) for p in peers}
        rows.append({"rule": "novelty.structure_hash", "ok": not dup,
                     "got": "duplicate" if dup else "unique",
                     "want": "세트 내 유일", "hidden": True})
    # 3값(심판대 규율 4·5): 재지 못한 규칙이 하나라도 있으면 탈락이 아니라
    # **미정의**다. judge_bench._spec_conformance가 undecided 앞에서 판정을
    # 멈추는 것과 같은 계약 — 여기서만 fail로 접으면 못 잰 것이 탈락이 된다.
    if any(r["ok"] is None for r in rows):
        verdict = "UNDEFINED"
    elif all(r["ok"] for r in rows):
        verdict = "PASS"
    else:
        verdict = "FAIL"
    return {"verdict": verdict, "rules": rows, "measured": measured,
            "structure_hash": measured.get("structure_hash")}


def report(result: dict, candidate: int | None = None) -> str:
    """설계 §4의 기계 리포트. hidden 규칙은 이름을 노출하지 않는다."""
    lines = [f'VERDICT: {result["verdict"]}']
    if candidate is not None:
        lines.append(f"candidate: {candidate}")
    bad = [r for r in result["rules"] if r["ok"] is False]
    unknown = [r for r in result["rules"] if r["ok"] is None]
    good = [r for r in result["rules"] if r["ok"]]
    if bad:
        lines.append("violations:")
        for r in bad:
            if r["hidden"]:                     # 사유를 알려주지 않는다
                lines += ["  - rule: internal_quality_gate",
                          "    where: whole", '    got: "-"', '    want: "-"']
            else:
                lines += [f'  - rule: {r["rule"]}',
                          f'    got: {json.dumps(r["got"], ensure_ascii=False)}',
                          f'    want: {json.dumps(r["want"], ensure_ascii=False)}']
    if unknown:
        # 못 잰 것은 위반이 아니다 - 고칠 것을 시키지 않고 사실만 적는다
        lines.append("undecided:")
        for r in unknown:
            if r["hidden"]:
                lines += ["  - rule: internal_quality_gate",
                          '    why: "-"']
            else:
                lines += [f'  - rule: {r["rule"]}',
                          f'    why: {json.dumps(r["want"], ensure_ascii=False)}']
    if good:
        lines.append("passed:")
        lines += [f'  - {r["rule"]}' for r in good if not r["hidden"]]
    return "\n".join(lines)


def judge_set(paths: list, doc: dict | None = None) -> dict:
    """세트 전체 — 개별 채점 + hidden 세트 규칙(중복·획 통일)."""
    doc = doc or load_spec()
    svgs = []
    for p in paths:
        with open(p, encoding="utf-8") as f:
            svgs.append(f.read())
    results = []
    for i, svg in enumerate(svgs):
        peers = svgs[:i]                        # 앞선 후보들과만 대조(결정적)
        results.append({"path": paths[i], **judge_svg(svg, doc, peers=peers)})
    cons = icon_lane.set_consistency(svgs)
    sc = doc.get("hidden", {}).get("set_consistency", {})
    delta_max = sc.get("optical_weight_delta_max")
    if svg_raster.available():
        delta = svg_raster.optical_weight_delta(svgs)
        cons["optical_weight_delta"] = delta
        cons["optical_weight_delta_ok"] = (
            None if (delta is None or delta_max is None) else delta <= delta_max)
        cons["optical_weight_delta_max"] = delta_max
    dups = icon_lane.duplicates(svgs)
    # 세트 규칙을 **재고도 판정에 안 물리면** 그건 장식이다(2026-08-27 00:2x:
    # 시각 무게 폭이 0.1696으로 관문 0.15를 넘는데 세트는 8/8 통과로 나왔다).
    set_rows = [
        {"rule": "set.stroke_width_variance_zero",
         "ok": bool(cons.get("variance_zero")),
         "got": cons.get("stroke_widths"), "want": "굵기 하나"},
        {"rule": "set.no_duplicate_structure", "ok": not dups,
         "got": dups, "want": "중복 없음"},
        {"rule": "set.optical_weight_delta_max",
         "ok": cons.get("optical_weight_delta_ok"),
         "got": cons.get("optical_weight_delta"),
         "want": cons.get("optical_weight_delta_max")},
        {"rule": "set.every_icon_passes",
         "ok": all(r["verdict"] == "PASS" for r in results),
         "got": sum(1 for r in results if r["verdict"] == "PASS"),
         "want": len(results)},
    ]
    if any(r["ok"] is None for r in set_rows):
        set_verdict = "UNDEFINED"
    elif all(r["ok"] for r in set_rows):
        set_verdict = "PASS"
    else:
        set_verdict = "FAIL"
    return {"results": results, "set_consistency": cons,
            "duplicates": dups,
            "set_verdict": set_verdict, "set_rules": set_rows,
            "passed": sum(1 for r in results if r["verdict"] == "PASS"),
            "total": len(results),
            "unmeasured": unmeasured(doc),
            "screen_layer": deferred_to_screen(doc)}


def main(argv=None):
    ap = argparse.ArgumentParser(description="아이콘 레인 심판 (J)")
    ap.add_argument("--svg", help="SVG 파일 하나")
    ap.add_argument("--set-dir", help="SVG 세트 디렉터리")
    ap.add_argument("--spec", default=SPEC_PATH)
    ap.add_argument("--prompt-spec", action="store_true",
                    help="프롬프트에 넣어도 되는 공개 스펙만 출력")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    doc = load_spec(args.spec)
    if args.prompt_spec:
        print(public_prompt_spec(doc))
        return 0
    if args.set_dir:
        paths = sorted(glob.glob(os.path.join(args.set_dir, "*.svg")))
        if not paths:
            print(f"SVG가 없다: {args.set_dir}")
            return 2
        res = judge_set(paths, doc)
        if args.json:
            print(json.dumps(res, ensure_ascii=False, indent=2))
        else:
            for i, r in enumerate(res["results"]):
                print(f'--- {os.path.basename(r["path"])}')
                print(report(r, candidate=i))
            c = res["set_consistency"]
            print(f'\n세트: 통과 {res["passed"]}/{res["total"]}, '
                  f'획 굵기 {c["stroke_widths"]} '
                  f'(통일={"예" if c["variance_zero"] else "아니오"}), '
                  f'중복쌍 {res["duplicates"]}')
            if c.get("optical_weight_delta") is None:
                weight = c["optical_weight"]        # 아직 못 잰다
            else:
                ok = c.get("optical_weight_delta_ok")
                mark = {True: "통과", False: "초과", None: "문턱 미동결"}[ok]
                weight = (f'폭 {c["optical_weight_delta"]} '
                          f'(<= {c["optical_weight_delta_max"]}: {mark})')
            print(f'미측정(도구 없음): {", ".join(res["unmeasured"]) or "없음"} '
                  f'/ 광학 무게: {weight}')
            if res["screen_layer"]:
                print(f'화면 층으로 이관(자산 심판 아님): '
                      f'{", ".join(res["screen_layer"])}')
        return 0 if res["passed"] == res["total"] else 1
    if not args.svg:
        ap.error("--svg 또는 --set-dir 이 필요하다")
    with open(args.svg, encoding="utf-8") as f:
        res = judge_svg(f.read(), doc)
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        print(report(res))
    return 0 if res["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main() or 0)
