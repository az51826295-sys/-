"""게임 조립 — 선언(data/game_assembly.json)대로 자산을 게임에 넣는다 (게이트 ④).

  python -X utf8 tools/assemble_game.py            # 확인만(무엇이 다른지)
  python -X utf8 tools/assemble_game.py --apply    # 실제로 옮긴다

지금까지 캐릭터·타일은 **손으로** 들어가 있었다. 손으로 넣으면 "무엇이 어디서
왔는지"가 사라지고, 자산을 바꿀 때 게임이 조용히 어긋난다.

규율:
- **선언에 없는 것은 옮기지 않는다.** 무엇을 넣을지는 기록이 정한다.
- **덮어쓰기 전에 다르다는 것을 말한다.** `--apply` 없이는 아무것도 안 건드린다.
- 조립 결과는 `game/assets/manifest.json`에 적히고, 게임 스모크가 그것을 검사한다.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

DECL = "data/game_assembly.json"
MANIFEST = "game/assets/manifest.json"
DIRS = ("south", "west", "east", "north")


def _sha(path: str) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as fh:
        h.update(fh.read())
    return h.hexdigest()[:12]


def _plan_character(entry: dict, root: str) -> dict:
    """원본 → 목적지 파일 짝. PixelLab 폴더 구조를 게임 구조로 옮긴다."""
    src = os.path.join(root, entry["source"])
    dst = os.path.join(root, entry["dest"])
    pairs, missing = [], []
    for d in DIRS:
        s = os.path.join(src, "rotations", f"{d}.png")
        if os.path.exists(s):
            pairs.append((s, os.path.join(dst, "rotations", f"{d}.png")))
        else:
            missing.append(f"rotations/{d}.png")
        sdir = os.path.join(src, "animations", "walking", d)
        if not os.path.isdir(sdir):
            missing.append(f"animations/walking/{d}")
            continue
        for f in sorted(os.listdir(sdir)):
            if f.endswith(".png"):
                pairs.append((os.path.join(sdir, f),
                              os.path.join(dst, "walking", d, f)))
    return {"name": entry["name"], "pairs": pairs, "missing": missing,
            "origin": entry.get("origin")}


def assemble(apply: bool = False, root: str = ROOT) -> dict:
    decl = json.load(open(os.path.join(root, DECL), encoding="utf-8"))
    report = {"spec": "game-assembly-v0", "applied": apply,
              "declaration": DECL, "characters": [], "tiles": {}, "icons": {},
              "changed": [], "missing": [], "same": 0}

    # 1) 아이콘 — 선별 기록에서 나온다(별도 도구가 이미 만든다)
    ui_manifest = os.path.join(root, "game", "assets", "ui", "manifest.json")
    if os.path.exists(ui_manifest):
        man = json.load(open(ui_manifest, encoding="utf-8"))
        report["icons"] = {"count": man.get("count", 0),
                           "size": man.get("size"),
                           "source": decl["icons"]["from"]}
    else:
        report["missing"].append("아이콘 manifest 없음 - icon_export를 먼저 돌린다")

    # 2) 캐릭터 — 오디션 폴더에서 게임 구조로
    for entry in decl.get("characters", []):
        plan = _plan_character(entry, root)
        moved = same = 0
        for s, d in plan["pairs"]:
            if os.path.exists(d) and _sha(s) == _sha(d):
                same += 1
                continue
            report["changed"].append(os.path.relpath(d, root).replace("\\", "/"))
            if apply:
                os.makedirs(os.path.dirname(d), exist_ok=True)
                shutil.copy2(s, d)
                moved += 1
        report["characters"].append({
            "name": plan["name"], "files": len(plan["pairs"]),
            "same": same, "moved": moved, "missing": plan["missing"],
            "origin": plan["origin"]})
        report["same"] += same
        report["missing"] += [f'{plan["name"]}/{m}' for m in plan["missing"]]

    # 3) 타일 — 무엇이 진짜이고 무엇이 아직 자리표시자인지 그대로 옮긴다.
    #    08-27 이전에는 전부 자리표시자였다. 지금은 지형만 진짜다.
    tiles = decl.get("tiles", {})
    dest = os.path.join(root, tiles.get("dest", ""))
    size = None
    if os.path.exists(dest):
        from PIL import Image
        with Image.open(dest) as im:
            size = list(im.size)
    report["tiles"] = {"kind": tiles.get("kind"), "dest": tiles.get("dest"),
                       "size": size, "expect_size": tiles.get("expect_size"),
                       "generator": tiles.get("generator"),
                       "note": tiles.get("honest_note"),
                       # 선언의 출처 항목을 **그대로** 실어 보낸다. 이게 빠지면
                       # "진짜 타일 16칸"이라는 주장을 아무도 검사할 수 없다.
                       "wang_slots": tiles.get("wang_slots"),
                       "wang_source": tiles.get("wang_source"),
                       "placeholder_slots": tiles.get("placeholder_slots"),
                       "blocker_slot": tiles.get("blocker_slot"),
                       "size_ok": (size == tiles.get("expect_size")
                                   if size else None)}
    if size and size != tiles.get("expect_size"):
        report["missing"].append(
            f'타일 아틀라스 크기가 {size} (선언 {tiles.get("expect_size")})')

    # 4) manifest — 게임 스모크가 읽는다
    manifest = {
        "spec": "game-assets-v0",
        "icons": report["icons"],
        "characters": [{"name": c["name"], "files": c["files"],
                        "dest": f'game/assets/characters/{c["name"]}',
                        "origin": c["origin"]}
                       for c in report["characters"]],
        "tiles": report["tiles"],
        "note": "생성물이다. 손으로 고치지 않는다 - tools/assemble_game.py가 쓴다",
    }
    if apply or not os.path.exists(os.path.join(root, MANIFEST)):
        with open(os.path.join(root, MANIFEST), "w", encoding="utf-8",
                  newline="\n") as fh:
            json.dump(manifest, fh, ensure_ascii=False, indent=2)
        report["manifest_written"] = MANIFEST
    return report


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true",
                    help="실제로 옮긴다(없으면 무엇이 다른지만 말한다)")
    a = ap.parse_args(argv)
    r = assemble(apply=a.apply)
    print(f"선언 {r['declaration']} · {'적용' if a.apply else '확인만'}")
    ic = r["icons"]
    if ic:
        print(f"  아이콘 {ic.get('count')}개 ({ic.get('size')}px) ← {ic.get('source')}")
    for c in r["characters"]:
        line = (f"  캐릭터 {c['name']:<10} 파일 {c['files']}  "
                f"같음 {c['same']}  옮김 {c['moved']}")
        if c["missing"]:
            line += f"  없음 {c['missing']}"
        print(line + f"   ← {c['origin']}")
    t = r["tiles"]
    print(f"  타일 {t['kind']} {t['size']} (선언 {t['expect_size']}) "
          f"크기맞음 {t['size_ok']}")
    if t.get("note"):
        print(f"       {t['note']}")
    if r["changed"]:
        print(f"  다른 파일 {len(r['changed'])}개"
              + ("" if a.apply else " — --apply 로 옮긴다"))
        for p in r["changed"][:5]:
            print(f"    · {p}")
    if r["missing"]:
        print(f"  ✖ 빠진 것 {len(r['missing'])}: {r['missing'][:4]}")
    if r.get("manifest_written"):
        print(f"  기록: {r['manifest_written']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
