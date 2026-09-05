"""골든 케이스 = 심판의 심판 (자산 심판 초안 §7).

이빨(반례 명세 자기검증)과 골든(실물 표본)은 다른 검사다. 이빨은 "심판이 자기
반례를 거절하나", 골든은 "**실제 파일**로 돌렸을 때 세 통제가 서는가"를 본다.

  positive_control  사람이 지정한 표본        통과율 >= 0.90
  negative_control  한 곳만 어긋낸 위반본      탈락률 >= 0.90
  null_control      스펙-자산 무작위 재짝지음  통과율 <= 0.05
  spec_sensitivity  잰 값에서 구성한 위반 스펙  뒤집힘률 >= 0.90  ★ 진짜 관문
  inspec_control    합법 영역 안에서만 움직인 변이  통과율 == 1.0    ★ 과보수 검사
  legal_control     스펙에서 직접 뽑은 무작위 합법본  통과율 == 1.0    ★ 암묵 조건 검사

2026-08-26 재등록(docs/golden-decisions-20260826.md):
- positive는 **출처**가 계약이다(`positive_source`). 우리 심판이 통과시킨 것을
  positive로 쓰면 통과율은 구조상 1.0이고, 그건 UNDEFINED이지 통과가 아니다.
- null은 `model_based` 필드 전용 관문이다. 그 필드가 0건인 심판(예: 아이콘)에서는
  N/A이며 go/no-go 집계에서 빠진다. 결정론 심판에서 자산이 다른 스펙을 진짜로
  만족하는 일은 흔하다(브리프 §3).
- 그 자리를 대신할 진짜 관문이 spec_sensitivity다 - 심판이 스펙을 읽지 않고
  통과 도장만 찍는다면 여기서 0이 나온다.

표본은 **먼저 매니페스트에 고정**하고(사후 표집 금지, 초안 §11) 그 다음에 돌린다.
매니페스트에 없는 파일은 집계에 못 들어온다.

  python -X utf8 tools/golden_bench.py --manifest data/goldens/icon-v1.json
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tools import icon_judge                             # noqa: E402

THRESHOLDS = {"positive": 0.90, "negative": 0.90, "null": 0.05,
              "sensitivity": 0.90, "inspec": 1.0, "legal": 1.0}
N_MIN = {"positive": 10, "negative": 10, "null": 20, "sensitivity": 20,
         "inspec": 20, "legal": 200}


# --------------------------------------------------------------- 위반본 만들기

def _sub_once(svg: str, old: str, new: str) -> str | None:
    """한 곳만 바꾼다. 바꿀 자리가 없으면 None(그 위반본은 만들지 못한 것)."""
    return svg.replace(old, new, 1) if old in svg else None


def mutations(svg: str) -> list:
    """positive 한 장에서 **한 곳만** 어긋낸 위반본들(짚인형 방지).

    통째로 다시 쓴 가짜가 아니라 원본에서 한 지점만 옮긴 것이라야 반례다.
    """
    out = []
    m = re.search(r'd="M\s*(\d+(?:\.\d+)?)', svg)
    if m:                                     # 좌표 하나만 격자 밖으로
        bad = str(round(float(m.group(1)) + 0.37, 2))
        out.append(("grid.snap", _sub_once(svg, m.group(0),
                                           'd="M ' + bad)))
    out += [
        ("stroke.width", _sub_once(svg, 'stroke-width="1.5"',
                                   'stroke-width="2"')),
        ("palette", _sub_once(svg, 'stroke="currentColor"',
                              'stroke="#3b82f6"')),
        ("fill", _sub_once(svg, 'fill="none"', 'fill="#111111"')),
        ("viewBox", _sub_once(svg, 'viewBox="0 0 24 24"',
                              'viewBox="0 0 32 32"')),
        ("stroke.linecap", _sub_once(svg, 'stroke-linecap="round"',
                                     'stroke-linecap="butt"')),
        ("stroke.linejoin", _sub_once(svg, 'stroke-linejoin="round"',
                                      'stroke-linejoin="miter"')),
        ("forbidden_elements", _sub_once(svg, "</svg>", "<script/></svg>")),
        ("padding.min", _sub_once(svg, 'd="M', 'd="M 0.5 0.5 L 1 1 M')),
        ("size.max_bytes", _sub_once(svg, "</svg>",
                                     "<!--" + "x" * 2100 + "--></svg>")),
    ]
    return [{"rule": r, "svg": s} for r, s in out if s and s != svg]


def null_specs(doc: dict) -> list:
    """자산이 맞춰 만들어지지 않은 스펙들 — 무작위 재짝지음의 상대.

    한 항목씩만 어긋낸 것이 아니라 **다른 스펙**이다(다른 격자·다른 굵기 등).
    심판이 스펙을 실제로 읽는다면 여기서 통과가 나오면 안 된다.
    """
    out = []
    for name, patch in [
            ("grid-1.0", {"grid": {"snap": 1.0}}),
            ("stroke-2.0", {"stroke": {"width": 2.0, "linecap": "round",
                                       "linejoin": "round"}}),
            ("viewBox-32", {"viewBox": "0 0 32 32"}),
            ("padding-5", {"padding": {"min": 5}}),
            ("one-path", {"path": {"max_count": 1, "max_total_commands": 8}}),
            ("tiny", {"size": {"max_bytes": 120}})]:
        variant = copy.deepcopy(doc)
        variant["public"].update(copy.deepcopy(patch))
        out.append({"spec_name": name, "doc": variant})
    return out


def violating_specs(doc: dict, measured: dict) -> list:
    """이 자산이 **정의상 어기는** 스펙들을 잰 값에서 기계적으로 구성한다.

    "어긴다"를 우리 판정으로 정하면 순환이므로, `measured.*`에서 한 칸씩
    비틀어 만든다(설계 docs/golden-decisions-20260826.md §G2). 심판이 스펙을
    실제로 읽는다면 이 짝들은 전부 FAIL이어야 한다.
    """
    out = []

    def variant(name, patch):
        v = copy.deepcopy(doc)
        for key, val in patch.items():
            cur = copy.deepcopy(v["public"].get(key))
            if isinstance(cur, dict) and isinstance(val, dict):
                cur.update(val)
                v["public"][key] = cur
            else:
                v["public"][key] = val
        out.append({"spec_name": name, "doc": v})

    widths = measured.get("stroke_widths") or []
    if widths:
        variant("stroke_width+0.5",
                {"stroke": {"width": round(max(widths) + 0.5, 3)}})
    if measured.get("path_count"):
        variant("path_max_count-1",
                {"path": {"max_count": measured["path_count"] - 1}})
    if measured.get("command_count"):
        variant("command_max-1",
                {"path": {"max_total_commands":
                          measured["command_count"] - 1}})
    if measured.get("min_padding") is not None:
        variant("padding_min+1",
                {"padding": {"min": measured["min_padding"] + 1}})
    if measured.get("bytes"):
        variant("max_bytes-1", {"size": {"max_bytes": measured["bytes"] - 1}})
    return out


def inspec_rows(assets: list) -> tuple:
    """인-스펙 변이(설계 docs/inspec-metamorphic-v0-design.md).

    negative가 "스펙 밖으로 민 것은 떨어져야 한다"라면 이쪽은 그 쌍대다:
    **합법 영역 안에서만 움직인 것은 통과해야 한다.** 합법성이 연산자로
    증명되므로 파일이 우리 안에서 나왔어도 순환이 아니다.

    반환: (판정할 행들, 못 만든 것들). 건너뛴 것은 조용히 빼지 않고 센다.
    """
    from genesis import inspec_variants as iv

    rows, skipped = [], []
    for a in assets:
        for v in iv.variants(a["svg"]):
            if v["svg"] is None:
                skipped.append({"asset": a["id"], "op": v["op"],
                                "why": v["why"]})
            else:
                rows.append({"asset": a["id"], "op": v["op"], "svg": v["svg"]})
    return rows, skipped


def legal_rows(n: int = None) -> tuple:
    """합법 영역 직접 샘플링(설계 docs/legal-sampling-v0-design.md).

    인-스펙 변이가 **통과분의 궤도** 위만 덮는 한계를 메운다. 여기 표본은
    우리 파이프라인이 절대 안 만드는 모양이고, 그래도 합법이다 — 떨어지면
    심판에 스펙에 없는 암묵 조건이 있다는 직접 증거다.
    """
    from genesis import legal_sampler as sampler

    samples = sampler.sample(N_MIN["legal"] if n is None else n)
    return samples, sampler.coverage(samples)


# --------------------------------------------------------------- 집계

def _verdicts(pairs: list) -> list:
    return [icon_judge.judge_svg(svg, doc)["verdict"] for svg, doc in pairs]


def run(manifest: dict, root: str = ROOT, legal_n: int = None) -> dict:
    """root는 **자산** 경로의 기준. 스펙은 언제나 저장소 것을 읽는다 —
    표본을 어디에 두든 심판이 읽는 스펙은 하나여야 한다.

    legal_n은 합법 샘플링 표본 수다. 기본값은 등록값(200)이고, **줄여 부르면
    그 통제는 최소 표본 미달로 자동 강등된다**(n_ok=False → go 불가). 테스트가
    빠르게 돌기 위해 줄여 쓰는 자리이지, 실주행에서 낮추는 자리가 아니다.
    """
    doc = icon_judge.load_spec(os.path.join(ROOT, manifest["spec"]))
    assets = []
    for rel in manifest["assets"]:
        with open(os.path.join(root, rel), encoding="utf-8") as f:
            assets.append({"id": rel, "svg": f.read()})

    pos = _verdicts([(a["svg"], doc) for a in assets])
    sens_rows = []
    for a in assets:
        measured = icon_judge.judge_svg(a["svg"], doc)["measured"]
        for v in violating_specs(doc, measured):
            sens_rows.append((a["id"], v["spec_name"], a["svg"], v["doc"]))
    sens = _verdicts([(svg, d) for _i, _n, svg, d in sens_rows])
    neg_rows = [(a["id"], m["rule"], m["svg"])
                for a in assets for m in mutations(a["svg"])]
    neg = _verdicts([(svg, doc) for _i, _r, svg in neg_rows])
    null_rows = [(a["id"], v["spec_name"], a["svg"], v["doc"])
                 for a in assets for v in null_specs(doc)]
    nul = _verdicts([(svg, d) for _i, _n, svg, d in null_rows])
    inspec_variants, inspec_skipped = inspec_rows(assets)
    ins = _verdicts([(r["svg"], doc) for r in inspec_variants])
    legal_samples, legal_coverage = legal_rows(legal_n)
    leg = _verdicts([(svg, doc) for svg in legal_samples])

    def block(kind, verdicts, want, state="measured", why=None):
        n = len(verdicts)
        hit = sum(1 for v in verdicts if v == want)
        rate = round(hit / n, 4) if n else 0.0
        ok = (rate >= THRESHOLDS[kind]) if kind != "null" else \
            (rate <= THRESHOLDS["null"])
        return {"n": n, "n_min": N_MIN[kind], "n_ok": n >= N_MIN[kind],
                "rate": rate, "threshold": THRESHOLDS[kind],
                "passes_threshold": ok, "state": state, "why": why,
                "counts": state == "measured",
                "undefined": sum(1 for v in verdicts if v == "UNDEFINED"),
                "verdicts": verdicts}

    # G1: positive의 출처가 계약이다. 매니페스트가 밝히지 않으면 self로 본다
    # (밝히지 않은 것을 external로 쳐주면 순환이 조용히 통과한다).
    # G4(2026-08-26 사장님 승인): positive에 붙어 있던 두 질문을 가른다.
    #   (i) 심판이 스펙과 같은가  → negative·sensitivity·inspec·legal 넷이 답한다
    #   (ii) 스펙이 사람 뜻과 같은가 → 골든이 답할 질문이 아니다(취향 라인)
    # 그래서 이 행은 "측정 불가"가 아니라 **범위 밖**이다. 못 잰 것과 여기서
    # 잴 것이 아닌 것은 다른 상태다.
    source = manifest.get("positive_source", "self")
    pos_state = "out_of_scope"
    pos_why = ("(ii) 스펙이 사람 뜻과 같은가는 골든이 답할 질문이 아니다 - "
               "취향 라인(docs/taste-judge-v0-design.md)이 들고 있고 지금 "
               "NO-PROMOTE다. (i) 심판이 스펙과 같은가는 negative·"
               "spec_sensitivity·inspec·legal 넷이 답한다. "
               f"[표본 출처: {source}, 변이 통제의 원본으로 계속 쓰인다]")
    # G2: null은 model_based 필드 전용 관문. 그 필드가 없으면 해당 없음.
    mb = manifest.get("model_based_fields", [])
    null_state = "measured" if mb else "n/a"
    null_why = None if mb else (
        "model_based 필드 0건 - 자산 심판 초안 §7·§8에 따라 이 심판에는 null "
        "통제가 적용되지 않는다(값은 기록으로 남긴다).")

    out = {"manifest": manifest.get("id"), "spec": manifest["spec"],
           "positive_source": source, "model_based_fields": mb,
           "positive": block("positive", pos, "PASS", pos_state, pos_why),
           "negative": block("negative", neg, "FAIL"),
           "null": block("null", nul, "PASS", null_state, null_why),
           "sensitivity": block("sensitivity", sens, "FAIL"),
           "inspec": block("inspec", ins, "PASS"),
           "legal": block("legal", leg, "PASS"),
           "legal_coverage": legal_coverage,
           "inspec_rows": [{"asset": r["asset"], "op": r["op"], "verdict": v}
                           for r, v in zip(inspec_variants, ins)],
           "inspec_skipped": inspec_skipped,
           "negative_rows": [{"asset": i, "rule": r} for i, r, _s in neg_rows],
           "null_rows": [{"asset": i, "spec": n} for i, n, _s, _d in null_rows],
           "sensitivity_rows": [{"asset": i, "spec": n, "verdict": v}
                                for (i, n, _s, _d), v in zip(sens_rows, sens)]}
    # positive는 범위 밖, null은 해당 없음 - 둘 다 집계에서 빠지되 값은 남는다
    kinds = ("positive", "negative", "null", "sensitivity", "inspec",
             "legal")
    counted = [k for k in kinds if out[k]["counts"]]
    blocked = [k for k in kinds if out[k]["state"] == "undefined"]
    out["counted_controls"] = counted
    out["verdict"] = ("go" if (not blocked and all(
        out[k]["passes_threshold"] and out[k]["n_ok"] for k in counted))
        else "no-go")
    return out


def _print(res: dict) -> None:
    print(f'골든 — 매니페스트 {res["manifest"]} / 스펙 {res["spec"]}')
    print("=" * 66)
    rows = [("positive_control", "통과율", res["positive"], ">="),
            ("negative_control", "탈락률", res["negative"], ">="),
            ("null_control", "통과율", res["null"], "<="),
            ("spec_sensitivity", "뒤집힘률", res["sensitivity"], ">="),
            ("inspec_control", "통과율", res["inspec"], "=="),
            ("legal_control", "통과율", res["legal"], "==")]
    for name, label, b, sign in rows:
        if b["state"] == "n/a":
            mark = "해당 없음"
        elif b["state"] == "out_of_scope":
            mark = "범위 밖"
        elif b["state"] == "undefined":
            mark = "측정 불가"
        else:
            mark = "OK" if b["passes_threshold"] else "미달"
        nmark = ("" if b["n_ok"] or b["state"] != "measured"
                 else f'  ⚠ 표본 {b["n"]} < 최소 {b["n_min"]}')
        print(f'  {name:17s} n={b["n"]:3d}  {label} {b["rate"]:.4f} '
              f'({sign} {b["threshold"]}) {mark}{nmark}')
        if b["why"]:
            print(f'      → {b["why"]}')
    cov = res.get("legal_coverage") or {}
    if cov:
        axes = cov["axes"]
        print(f'      (무작위 합법본 커버리지: path {min(axes["path_count"])}~'
              f'{max(axes["path_count"])}개, 요소 '
              f'{",".join(sorted(axes["elements"]))}, 명령 '
              f'{",".join(sorted(axes["commands_used"]))} — '
              f'안 건드린 축 {len(cov["not_exercised"])}종은 기록에)')
    if res.get("inspec_skipped"):
        print(f'      (인-스펙 변이 중 못 만든 것 {len(res["inspec_skipped"])}건 '
              f'— 조건 미충족. 조용히 빼지 않는다)')
    print("=" * 66)
    print(f'집계 대상: {", ".join(res["counted_controls"]) or "없음"} '
          f'/ positive 출처: {res["positive_source"]}')
    print(f'판정: {res["verdict"].upper()}  '
          f'(집계 대상이 전부 문턱·표본을 채우고, 측정 불가가 없을 때만 go)')


def main(argv=None):
    ap = argparse.ArgumentParser(description="골든 케이스 = 심판의 심판")
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--root", default=ROOT,
                    help="자산 경로의 기준 디렉터리(기본: 저장소 루트)")
    ap.add_argument("--record")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    with open(args.manifest, encoding="utf-8") as f:
        manifest = json.load(f)
    res = run(manifest, root=args.root)
    if args.record:
        os.makedirs(os.path.dirname(args.record) or ".", exist_ok=True)
        with open(args.record, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        _print(res)
    return 0 if res["verdict"] == "go" else 1


if __name__ == "__main__":
    sys.exit(main() or 0)
