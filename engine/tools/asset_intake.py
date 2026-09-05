"""반입 오라클 — **이미 있는** 자산을 규격에 대본다. 생성하지 않는다, 지출 0.

2026-08-26 사장님: "픽셀랩 자산으로 먼저 돌려봐."

`audition/pixellab`의 PNG들은 다른 회사 AI(PixelLab)가 08-07에 만든 것이다.
생성기를 갈아끼워도 심판은 그대로라는 것을, 이번엔 **우리가 부르지도 않은
생성기**의 산출물로 확인한다. 심판 코드는 여전히 한 줄도 바뀌지 않는다 —
`pixel_art_style` 원자와 `asset_probe.measure_pixel_art`를 그대로 부른다.

  intake  자산 목록 → 부류별 규격으로 채점 → **통과분만** 선별 풀로 복사
          (거절분은 사유와 함께 목록으로 남긴다. 지우지 않는다)

선별판에는 통과분만 오른다(아이콘 레인과 같은 규율). 사람이 고르는 것은
"규격을 넘은 것 중에 무엇이 좋은가"이지, 규격 미달까지 고르는 게 아니다.

  python -X utf8 tools/asset_intake.py --manifest data/image_sets/pixellab-v1.json \\
      --out out/images/pixellab-v1
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import yaml                                              # noqa: E402

from genesis import asset_probe                          # noqa: E402
from tools import judge_bench as jb                      # noqa: E402

SPEC_PATH = os.path.join(ROOT, "data", "image_specs", "pixel-sprite-v2.yaml")
ATOM_ID = "pixel_art_style"


def load_spec(path: str = SPEC_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def spec_for(profile: str, doc: dict) -> dict:
    """부류 이름 → 심판이 읽는 spec.*  (부류가 없으면 판정하지 않는다)"""
    if profile not in doc["profiles"]:
        raise KeyError(f"등록되지 않은 부류: {profile!r} "
                       f"(있는 것: {sorted(doc['profiles'])})")
    p = doc["profiles"][profile]
    return {"max_logical_size": p["max_logical_size"],
            "max_colors": p["max_colors"], "alpha_binary": p["alpha_binary"]}


def judge_asset(path: str, profile: str, doc: dict,
                registry: list | None = None) -> dict:
    reg = registry if registry is not None else jb.load_registry()
    atom = next(a for a in reg if a["id"] == ATOM_ID)
    measured = asset_probe.measure_pixel_art(path)
    sample = {"spec": spec_for(profile, doc), "measured": measured,
              "claim": {}}
    rows = jb.explain_conformance(atom["judge"]["params"], sample)
    if any(r["ok"] is None for r in rows):
        verdict = "UNDEFINED"
    elif all(r["ok"] for r in rows):
        verdict = "PASS"
    else:
        verdict = "FAIL"
    return {"verdict": verdict, "profile": profile, "measured": measured,
            "violations": [{"rule": r["rule"], "got": r["got"],
                            "want": r["want"]}
                           for r in rows if r["ok"] is False]}


def fit_target(measured: dict, profile: dict) -> tuple:
    """규격 안으로 들어갈 목표 크기 — **비율은 유지한다**(찌그러뜨리지 않는다)."""
    w = measured["logical_width"] or measured["width"]
    h = measured["logical_height"] or measured["height"]
    cap = profile["max_logical_size"]
    if max(w, h) <= cap:
        return int(w), int(h)
    scale = cap / max(w, h)
    return max(1, int(round(w * scale))), max(1, int(round(h * scale)))


def pixelize_to_spec(src: str, dst: str, profile: dict, measured: dict):
    """선언된 후처리(tools/artgen/pixelize.py)로 규격에 맞춘다.

    아이콘 레인에서 배운 것을 그대로 적는다: 이렇게 고친 파일이 오라클을
    통과하는 것은 **당연**하다. 우리가 맞춰서 만들었기 때문이다. 그래서
    원본 판정을 따로 남긴다.
    """
    from PIL import Image

    from tools.artgen import pixelize as pz_tool

    w, h = fit_target(measured, profile)
    with Image.open(src) as img:
        out = pz_tool.pixelize(img, w, h, colors=profile["max_colors"])
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    out.save(dst)
    return w, h


def run(manifest: dict, doc: dict, out_dir: str | None = None,
        root: str = ROOT, fix: bool = False) -> dict:
    """자산 목록을 채점하고 통과분을 선별 풀로 복사한다. 원본은 건드리지 않는다.

    fix=True면 규격 미달분을 **후처리로 고쳐** 다시 재고, 고친 것도 선별 풀에
    올린다. 원본 판정(raw_verdict)은 그대로 남는다 — 무엇이 통과한 것이고
    무엇이 우리가 고쳐서 통과시킨 것인지 섞이면 안 된다.
    """
    reg = jb.load_registry()
    groups = []
    for g in manifest["groups"]:
        rows, kept = [], 0
        for rel in g["files"]:
            src = os.path.join(root, rel)
            res = judge_asset(src, g["profile"], doc, reg)
            row = {"source": rel.replace("\\", "/"), "raw_verdict":
                   res["verdict"], "fixed": False, **res}
            gdir = os.path.join(out_dir or "", "candidates", g["group"])
            if res["verdict"] == "PASS" and out_dir:
                kept += 1
                os.makedirs(gdir, exist_ok=True)
                dst = os.path.join(gdir, "c{:02d}.png".format(kept))
                shutil.copy2(src, dst)          # 복사다 - 원본을 옮기지 않는다
                row["path"] = os.path.relpath(dst, root).replace("\\", "/")
            elif fix and out_dir and res["measured"].get("error") is None:
                kept += 1
                dst = os.path.join(gdir, "c{:02d}.png".format(kept))
                w, h = pixelize_to_spec(src, dst,
                                        doc["profiles"][g["profile"]],
                                        res["measured"])
                after = judge_asset(dst, g["profile"], doc, reg)
                row.update(fixed=True, fixed_size=[w, h],
                           verdict=after["verdict"],
                           violations=after["violations"],
                           measured=after["measured"],
                           path=os.path.relpath(dst, root).replace("\\", "/"))
            rows.append(row)
        groups.append({"group": g["group"], "profile": g["profile"],
                       "question": g.get("question", ""), "rows": rows,
                       "passed": sum(1 for r in rows
                                     if r["verdict"] == "PASS"),
                       "raw_passed": sum(1 for r in rows
                                         if r["raw_verdict"] == "PASS"),
                       "fixed": sum(1 for r in rows if r["fixed"]),
                       "total": len(rows)})
    return {"spec": doc["spec_id"], "source": manifest.get("source", ""),
            "generator": manifest.get("generator", ""),
            "groups": groups,
            "passed": sum(g["passed"] for g in groups),
            "raw_passed": sum(g["raw_passed"] for g in groups),
            "fixed": sum(g["fixed"] for g in groups),
            "total": sum(g["total"] for g in groups),
            "picked_by": None}


def _print(res: dict) -> None:
    print("반입 오라클 — 스펙 {} · 생성기 {}".format(res["spec"],
                                                    res["generator"] or "?"))
    print("=" * 70)
    for g in res["groups"]:
        print("[{}] {} ({}) — 통과 {}/{}".format(
            g["profile"], g["group"], g["question"] or "-", g["passed"],
            g["total"]))
        for r in g["rows"]:
            if r["verdict"] == "PASS":
                continue
            why = "; ".join("{} {} (기준 {})".format(v["rule"], v["got"],
                                                     v["want"])
                            for v in r["violations"])
            print("    {:9s} {:26s} {}".format(
                r["verdict"], os.path.basename(r["source"]), why))
    print("=" * 70)
    print("전체 통과 {}/{}  (원본 그대로 통과 {} · 우리가 고쳐서 통과 {})".format(
        res["passed"], res["total"], res["raw_passed"], res["fixed"]))
    if res["fixed"]:
        print("주의: 고친 것이 통과하는 건 당연하다 — 우리가 규격에 맞춰 "
              "만들었기 때문이다. 원본 판정은 raw_verdict에 그대로 남는다.")
    print("정직 조항: 걸렸다고 그림이 나쁜 게 아니라 **이 게임 규격에 안 맞는** "
          "것이다. 규격을 바꾸는 것은 사장님 몫이다.")


def main(argv=None):
    ap = argparse.ArgumentParser(description="반입 오라클(기존 자산 채점)")
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--spec", default=SPEC_PATH)
    ap.add_argument("--out", help="통과분을 복사할 선별 풀 디렉터리")
    ap.add_argument("--fix", action="store_true",
                    help="규격 미달분을 선언된 후처리로 고쳐 다시 잰다")
    ap.add_argument("--record")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    with open(args.manifest, encoding="utf-8") as f:
        manifest = json.load(f)
    res = run(manifest, load_spec(args.spec), args.out, fix=args.fix)
    if args.record:
        os.makedirs(os.path.dirname(args.record) or ".", exist_ok=True)
        with open(args.record, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        _print(res)
    return 0 if res["passed"] else 1


if __name__ == "__main__":
    sys.exit(main() or 0)
