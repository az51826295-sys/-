"""이중 구현 대조 + 경계 스위프 (docs/dual-implementation-v0-design.md).

  python -X utf8 tools/dual_check.py --out data/dual_check_v0.json

지출 0. 말뭉치는 전부 이미 있는 것(생성물·합법 표본·인스펙 변이·음성 변이).

대조는 **public 규칙만** 한다(설계 §4 개정) — A는 hidden도 걸지만 B는 공개
스펙만 읽으므로, hidden을 섞으면 범위 차이를 구현 차이로 잘못 읽는다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import icon_judge_b as B                    # noqa: E402
from genesis import inspec_variants                      # noqa: E402
from genesis import legal_sampler                        # noqa: E402
from tools import golden_bench as gb                     # noqa: E402
from tools import icon_judge                             # noqa: E402

MIN_TOTAL = 300          # 설계 §3 동결
MIN_VIOLATING = 40
CANDIDATE_DIRS = ("out/icons/pick-v1/candidates",
                  "out/icons/pick-v2/candidates")


# ---------------------------------------------------------------- 말뭉치

def corpus(root: str = ROOT) -> list:
    """(출처, svg) 목록. 새로 생성하지 않는다."""
    items = []
    for rel in CANDIDATE_DIRS:
        base = os.path.join(root, rel)
        for dirpath, _dirs, files in os.walk(base):
            for f in sorted(files):
                if f.endswith(".svg"):
                    with open(os.path.join(dirpath, f), encoding="utf-8") as fh:
                        items.append(("candidate", fh.read()))
    real = [s for _k, s in items]
    items += [("legal", s) for s in legal_sampler.sample() if isinstance(s, str)]
    for svg in real[:12]:
        for v in inspec_variants.translations(svg)[:2]:
            if v.get("svg"):
                items.append(("inspec", v["svg"]))
        for key in ("mirror", "rotate90"):
            got = getattr(inspec_variants, key)(svg)
            if got.get("svg"):
                items.append(("inspec", got["svg"]))
    for svg in real[:20]:
        for mut in gb.mutations(svg):
            if mut.get("svg"):
                items.append(("negative", mut["svg"]))
    return [(k, s) for k, s in items if s]


# ---------------------------------------------------------------- 판정

def _fold(rows: list) -> str:
    if any(r["ok"] is None for r in rows):
        return "UNDEFINED"
    return "PASS" if all(r["ok"] for r in rows) else "FAIL"


def judge_a_public(svg: str, doc: dict, reg: list) -> dict:
    """A의 판정에서 hidden 규칙을 뺀 것."""
    res = icon_judge.judge_svg(svg, doc=doc, registry=reg)
    rows = [r for r in res["rules"] if not r.get("hidden")]
    return {"verdict": _fold(rows), "rows": rows}


def compare(doc: dict, items: list, reg: list, judge_a=None) -> dict:
    judge_a = judge_a or (lambda svg: judge_a_public(svg, doc, reg))
    agree, disagree = 0, []
    kinds: dict = {}
    violating = 0
    for kind, svg in items:
        a = judge_a(svg)
        b = B.judge(svg, doc["public"])
        if a["verdict"] != "PASS":
            violating += 1
        same = a["verdict"] == b["verdict"]
        k = kinds.setdefault(kind, {"n": 0, "agree": 0})
        k["n"] += 1
        if same:
            agree += 1
            k["agree"] += 1
        else:
            a_rules = {r["rule"]: r["ok"] for r in a["rows"]}
            b_rules = {r["rule"]: r["ok"] for r in b["rows"]}
            diff = {r: [a_rules.get(r, "없음"), b_rules.get(r, "없음")]
                    for r in set(a_rules) | set(b_rules)
                    if a_rules.get(r, "없음") != b_rules.get(r, "없음")}
            disagree.append({"kind": kind, "a": a["verdict"], "b": b["verdict"],
                             "rule_diff": diff, "svg": svg[:600]})
    n = len(items)
    agreement = agree / n if n else None
    gate_ok = (n >= MIN_TOTAL and violating >= MIN_VIOLATING)
    if not gate_ok:
        verdict, why = "undefined", "sample_gate"
    elif agreement == 1.0:
        verdict, why = "agree", "identical_on_every_sample"
    else:
        verdict, why = "disagree", "at_least_one_sample_differs"
    return {"verdict": verdict, "why": why, "agreement": agreement,
            "n": n, "violating": violating, "gate_ok": gate_ok,
            "by_kind": kinds, "disagreements": disagree}


# ---------------------------------------------------------------- 스위프

HEAD = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
        'fill="none" stroke="currentColor" stroke-width="{w}" '
        'stroke-linecap="round" stroke-linejoin="round"{extra}>')


def _svg(body: str, w: str = "1.5", extra: str = "") -> str:
    return HEAD.format(w=w, extra=extra) + body + "</svg>"


def _f(v: float) -> str:
    return f"{v:g}"


def sweep_padding(v):
    return _svg(f'<path d="M{_f(v)} {_f(v)} L{_f(24 - v)} {_f(24 - v)}"/>')


def sweep_path_count(n):
    body = "".join(f'<path d="M4 {4 + i} L20 {4 + i}"/>' for i in range(int(n)))
    return _svg(body)


def sweep_shape_count(n):
    body = "".join(f'<circle cx="12" cy="{4 + i}" r="1"/>' for i in range(int(n)))
    return _svg(body)


def sweep_commands(n):
    pts = "".join(f" L{4 + (i % 8) * 2} {4 + ((i + 1) % 8) * 2}"
                  for i in range(int(n) - 1))
    return _svg(f'<path d="M4 4{pts}"/>')


def sweep_stroke_width(w):
    return _svg('<path d="M4 4 L20 20"/>', w=_f(w))


def sweep_grid(delta):
    return _svg(f'<path d="M{_f(4 + delta)} 4 L20 20"/>')


def sweep_bytes(target):
    """id 속성으로 바이트만 늘린다 — 다른 제약을 건드리지 않는다."""
    base = _svg('<path d="M4 4 L20 20"/>', extra=' id=""')
    pad = int(target) - len(base.encode("utf-8"))
    if pad < 0:
        return None
    return _svg('<path d="M4 4 L20 20"/>', extra=f' id="{"a" * pad}"')


SWEEPS = (
    {"rule": "padding.min", "spec": ("padding", "min"), "kind": "min_pass",
     "values": [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], "make": sweep_padding},
    {"rule": "path.max_count", "spec": ("path", "max_count"),
     "kind": "max_pass", "values": list(range(1, 10)),
     "make": sweep_path_count},
    {"rule": "shape.max_count", "spec": ("shape", "max_count"),
     "kind": "max_pass", "values": list(range(1, 10)),
     "make": sweep_shape_count},
    {"rule": "path.max_total_commands", "spec": ("path", "max_total_commands"),
     "kind": "max_pass", "values": list(range(55, 66)),
     "make": sweep_commands},
    {"rule": "stroke.width", "spec": ("stroke", "width"), "kind": "exact_set",
     "values": [0.5, 1.0, 1.5, 2.0], "make": sweep_stroke_width},
    {"rule": "grid.snap", "spec": ("grid", "snap"), "kind": "grid",
     "values": [0, 0.25, 0.5, 0.75, 1.0], "make": sweep_grid},
    {"rule": "size.max_bytes", "spec": ("size", "max_bytes"),
     "kind": "max_pass", "values": list(range(2044, 2053)),
     "make": sweep_bytes},
)


# ---------------------------------------------------------- 열거형 전수
# 설계 §5: 수치가 아닌 제약은 스위프가 아니라 **전수 열거**로 같은 표를 만든다.
# 값 목록은 스펙이 정한 것 + 흔한 대안이다. 정답을 코드에 적지 않는다 —
# 무엇이 통과해야 하는지는 스펙 문서에서 읽어 비교한다.

def enum_linecap(v):
    return _svg('<path d="M4 4 L20 20"/>').replace('stroke-linecap="round"',
                                                   f'stroke-linecap="{v}"')


def enum_linejoin(v):
    return _svg('<path d="M4 4 L20 20"/>').replace('stroke-linejoin="round"',
                                                   f'stroke-linejoin="{v}"')


def enum_fill(v):
    return _svg('<path d="M4 4 L20 20"/>').replace('fill="none"', f'fill="{v}"')


def enum_stroke(v):
    return _svg('<path d="M4 4 L20 20"/>').replace('stroke="currentColor"',
                                                   f'stroke="{v}"')


def enum_element(tag):
    """요소 하나만 든 최소 도형. 기하는 전부 합법 범위 안에 둔다."""
    bodies = {
        "path": '<path d="M4 4 L20 20"/>',
        "circle": '<circle cx="12" cy="12" r="6"/>',
        "rect": '<rect x="4" y="4" width="16" height="16"/>',
        "line": '<line x1="4" y1="4" x2="20" y2="20"/>',
        "polyline": '<polyline points="4,4 12,12 20,4"/>',
        "polygon": '<polygon points="4,4 20,4 12,20"/>',
        "g": '<g><path d="M4 4 L20 20"/></g>',
        "text": '<text x="8" y="12">x</text><path d="M4 4 L20 20"/>',
        "image": '<image x="4" y="4" width="8" height="8"/>'
                 '<path d="M4 4 L20 20"/>',
        "filter": '<filter id="f"/><path d="M4 4 L20 20"/>',
        "mask": '<mask id="m"/><path d="M4 4 L20 20"/>',
        "style": '<style/><path d="M4 4 L20 20"/>',
        "script": '<script/><path d="M4 4 L20 20"/>',
        "defs": '<defs/><path d="M4 4 L20 20"/>',
    }
    return _svg(bodies[tag]) if tag in bodies else None


ENUMS = (
    {"rule": "stroke.linecap", "spec": ("stroke", "linecap"),
     "values": ["round", "butt", "square"], "make": enum_linecap},
    {"rule": "stroke.linejoin", "spec": ("stroke", "linejoin"),
     "values": ["round", "miter", "bevel"], "make": enum_linejoin},
    {"rule": "fill", "spec": ("fill",),
     "values": ["none", "#111111", "currentColor"], "make": enum_fill},
    {"rule": "palette", "spec": ("palette",),
     "values": ["currentColor", "#3b82f6", "red"], "make": enum_stroke},
)

ELEMENT_VALUES = ("path", "circle", "rect", "line", "polyline", "polygon",
                  "g", "text", "image", "filter", "mask", "style", "script",
                  "defs")


def enumerate_constraints(doc: dict, reg: list, judge_a=None) -> dict:
    """열거형 제약: 통과해야 할 값 집합 = 스펙이 적은 것. 관측과 대조한다."""
    judge_a = judge_a or (lambda svg: judge_a_public(svg, doc, reg))
    axes, mismatches = {}, []
    for e in ENUMS:
        want = _spec_value(doc, e["spec"])
        allowed = ([str(w) for w in want] if isinstance(want, list)
                   else [str(want)])
        passes, points = [], []
        for v in e["values"]:
            rows = {r["rule"]: r["ok"] for r in judge_a(e["make"](v))["rows"]}
            ok = rows.get(e["rule"])
            points.append({"value": v, "ok": ok})
            if ok is True:
                passes.append(v)
        exact = sorted(passes) == sorted(x for x in e["values"] if x in allowed)
        axes[e["rule"]] = {"want": allowed, "observed": sorted(passes),
                           "status": "exact" if exact else "mismatch",
                           "points": points}
        if not exact:
            mismatches.append(e["rule"])

    allowed_els = [str(x) for x in (_spec_value(doc, ("allowed_elements",))
                                    or [])]
    forbidden = [str(x) for x in (_spec_value(doc, ("forbidden_elements",))
                                  or [])]
    rows_out, bad = {}, []
    for tag in ELEMENT_VALUES:
        svg = enum_element(tag)
        if svg is None:
            rows_out[tag] = {"verdict": None, "why": "만들 수 없음"}
            continue
        res = judge_a(svg)
        expect = ("PASS" if tag in allowed_els and tag not in forbidden
                  else "FAIL")
        rows_out[tag] = {"verdict": res["verdict"], "expect": expect,
                         "ok": res["verdict"] == expect}
        if res["verdict"] != expect:
            bad.append(tag)
    axes["elements"] = {"want": {"allowed": allowed_els,
                                 "forbidden": forbidden},
                        "observed": rows_out,
                        "status": "exact" if not bad else "mismatch",
                        "mismatched": bad}
    if bad:
        mismatches.append("elements")

    statuses = {a["status"] for a in axes.values()}
    verdict = "mismatch" if "mismatch" in statuses else "exact"
    return {"verdict": verdict, "mismatches": mismatches, "axes": axes}


def _spec_value(doc: dict, path: tuple):
    node = doc["public"]
    for k in path:
        if not isinstance(node, dict) or k not in node:
            return None
        node = node[k]
    return node


def sweep(doc: dict, reg: list, judge_a=None) -> dict:
    """제약마다 A의 뒤집힘 지점을 찾아 문서값과 맞춘다."""
    judge_a = judge_a or (lambda svg: judge_a_public(svg, doc, reg))
    axes, mismatches = {}, []
    for s in SWEEPS:
        want = _spec_value(doc, s["spec"])
        obs = []
        for v in s["values"]:
            svg = s["make"](v)
            if svg is None:
                obs.append({"value": v, "ok": None, "why": "만들 수 없음"})
                continue
            rows = {r["rule"]: r["ok"] for r in judge_a(svg)["rows"]}
            obs.append({"value": v, "ok": rows.get(s["rule"], None),
                        "why": None if s["rule"] in rows else "A에 그 규칙 없음"})
        passes = [o["value"] for o in obs if o["ok"] is True]
        if want is None or not passes:
            axes[s["rule"]] = {"want": want, "observed": None,
                               "status": "undefined",
                               "why": ("스펙에 없음" if want is None
                                       else "통과하는 값이 없음"),
                               "points": obs}
            continue
        if s["kind"] == "max_pass":
            observed, ok = max(passes), max(passes) == want
        elif s["kind"] == "min_pass":
            observed, ok = min(passes), min(passes) == want
        elif s["kind"] == "exact_set":
            observed, ok = passes, passes == [want]
        else:                                    # grid: 격자 배수만 통과해야
            step = float(want)
            observed = passes
            ok = all(abs(p / step - round(p / step)) < 1e-9 for p in passes) \
                and all(o["ok"] is False for o in obs
                        if abs(o["value"] / step - round(o["value"] / step))
                        > 1e-9)
        axes[s["rule"]] = {"want": want, "observed": observed,
                           "status": "exact" if ok else "mismatch",
                           "why": None, "points": obs}
        if not ok:
            mismatches.append(s["rule"])

    statuses = {a["status"] for a in axes.values()}
    if "mismatch" in statuses:
        verdict = "mismatch"
    elif statuses == {"exact"}:
        verdict = "exact"
    else:
        verdict = "partial"          # exact + undefined 섞임
    return {"verdict": verdict, "mismatches": mismatches, "axes": axes}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="data/dual_check_v0.json")
    a = ap.parse_args(argv)
    doc = icon_judge.load_spec()
    reg = None
    items = corpus()
    cmp_res = compare(doc, items, reg)
    sw_res = sweep(doc, reg)
    en_res = enumerate_constraints(doc, reg)
    res = {"spec": "dual-implementation-v0",
           "design": "docs/dual-implementation-v0-design.md",
           "compare": cmp_res, "sweep": sw_res, "enums": en_res,
           "gate": {"min_total": MIN_TOTAL, "min_violating": MIN_VIOLATING}}
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)

    ag = cmp_res["agreement"]
    print(f"대조: {cmp_res['verdict']} ({cmp_res['why']}) "
          f"일치율={'-' if ag is None else f'{ag:.4f}'} "
          f"표본={cmp_res['n']} 위반본={cmp_res['violating']}")
    for k, v in sorted(cmp_res["by_kind"].items()):
        print(f"  {k}: {v['agree']}/{v['n']}")
    if cmp_res["disagreements"]:
        print(f"  불일치 {len(cmp_res['disagreements'])}건 — 전건 기록됨")
        for d in cmp_res["disagreements"][:5]:
            print(f"    [{d['kind']}] A={d['a']} B={d['b']} {d['rule_diff']}")
    print(f"경계 스위프: {sw_res['verdict']}")
    for rule, ax in sw_res["axes"].items():
        print(f"  {rule}: 문서={ax['want']} 관측={ax['observed']} "
              f"→ {ax['status']}" + (f" ({ax['why']})" if ax["why"] else ""))
    print(f"열거형 전수: {en_res['verdict']}")
    for rule, ax in en_res["axes"].items():
        if rule == "elements":
            obs = ax["observed"]
            good = sum(1 for v in obs.values() if v.get("ok"))
            print(f"  elements: {good}/{len(obs)} 기대대로"
                  + (f"  어긋남 {ax['mismatched']}" if ax["mismatched"] else ""))
        else:
            print(f"  {rule}: 문서={ax['want']} 통과={ax['observed']} "
                  f"→ {ax['status']}")
    print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
