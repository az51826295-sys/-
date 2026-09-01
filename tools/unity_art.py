"""승인된 그림을 프로토타입 자리에 꽂는다.

09-01 사장님 지시로 순서가 이렇게 됐다:

    설계 → 프로토타입(도형) → 사람이 본다 → **승인** → 그림을 넣는다

프로토타입은 `<울타리>Sprites/<이름>.png` 가 있으면 쓰고 없으면 도형으로 돌게
짜여 있다. 그래서 이 심부름꾼이 하는 일은 하나다 — **승인된 그림을 그 이름으로
놓는 것.** 코드는 안 건드린다.

    python tools/unity_art.py --project "..." --list
    python tools/unity_art.py --project "..." --put player=마을주민_0

## 문은 하나다

가져오는 곳은 `/api/unity/assets` 뿐이고, 그 문은 **승인된 산출물의 통과 후보만**
내보낸다. 여기에 "로컬 파일도 넣을 수 있게" 를 붙이고 싶은 유혹이 있는데, 그걸
붙이면 승인을 안 지나는 두 번째 문이 생긴다. 방금 그 문제를 닫았으므로 안 붙인다.

## 자리는 사람이 정한다

어느 그림이 `player` 인지 기계가 이름으로 짐작하게 두면 언젠가 엉뚱한 것이
들어가고, 그건 조용히 틀린다. 그래서 `--put <자리>=<자산이름>` 으로 사람이 짝을
지어 준다. `--list` 가 양쪽을 나란히 보여 준다.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
# 되돌리기 기록과 울타리 검사는 심부름꾼 것을 그대로 쓴다. 여기에 따로 만들면
# 기록이 두 벌이 되고, 두 벌이면 `--undo` 가 무엇을 되돌리는지 알 수 없게 된다.
from unity_runner import (  # noqa: E402
    DEFAULT_URL,
    diagnose_reach,
    inside_scope,
    remember,
    say,
)

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def fetch_assets(url: str, key: str) -> dict:
    request = urllib.request.Request(
        url.rstrip("/") + "/api/unity/assets",
        headers={"x-rookery-key": key},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def open_slots(project: Path, scope: str, sub: str = "Sprites") -> list[str]:
    """프로토타입이 기다리고 있는 자리.

    설계가 낸 그림 목록이 발주서인데, 그것은 서버에 있다. 여기서는 **이미 놓인
    파일**을 보고 무엇이 차 있는지만 말한다 — 자리 목록 자체를 짐작해서 만들지
    않는다. 짐작한 목록은 틀려도 그럴듯해 보인다.
    """
    folder = project / scope.replace("/", chr(92)) / sub
    if not folder.exists():
        return []
    return sorted(f.stem for f in folder.glob("*.png"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--scope", default="Assets/Rookery/")
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--key", default="")
    ap.add_argument("--list", action="store_true", help="자리와 승인된 그림을 보여 준다")
    ap.add_argument("--put", action="append", default=[], metavar="자리=자산이름",
                    help="승인된 그림을 그 자리에 놓는다. 여러 번 쓸 수 있다")
    ap.add_argument("--session", default="art", help="되돌리기 기록에 남길 이름")
    # 2D 는 스프라이트로, 3D 는 재질 텍스처로 들어간다. 폴더가 다르고,
    # 3D 쪽은 씬의 **물체 이름**이 곧 자리 이름이다(Ground, Player, Trunk...).
    ap.add_argument("--as", dest="kind", choices=["sprite", "texture"],
                    default="sprite", help="어디에 놓을지")
    args = ap.parse_args()

    import os
    key = args.key or os.environ.get("ROOKERY_KEY", "")
    if not key:
        say("회사 유니티 열쇠가 필요합니다 (--key 또는 ROOKERY_KEY).")
        return 2

    project = Path(args.project).resolve()
    if not (project / "Assets").is_dir():
        say(f"유니티 프로젝트가 아닙니다: {project}")
        return 2
    scope = args.scope if args.scope.endswith("/") else args.scope + "/"

    trouble = diagnose_reach(args.url)
    if trouble:
        say(trouble)
        return 2

    try:
        data = fetch_assets(args.url, key)
    except urllib.error.HTTPError as e:
        say(f"로키가 거절했습니다 ({e.code}): {e.read().decode('utf-8', 'replace')[:200]}")
        return 3
    except urllib.error.URLError as e:
        say(f"로키에 닿지 못했습니다: {e.reason}")
        return 3

    assets = data.get("assets") or []
    by_name = {a["name"]: a for a in assets}

    if args.list or not args.put:
        say(f"승인된 그림 {len(assets)}장 · {data.get('company', '')}")
        if not assets:
            # 없는 것을 "아직 안 봤다" 처럼 말하지 않는다. 문은 열려 있고
            # 그 문으로 나올 것이 없다는 뜻이다.
            say("  아직 승인된 것이 없습니다. 승인해야 여기로 나옵니다.")
        for a in assets:
            say(f"  {a['name']}  ({a['title']})")
        placed = open_slots(project, scope, "Textures" if args.kind == "texture" else "Sprites")
        say(f"\n이미 놓인 자리 {len(placed)}개: " + (", ".join(placed) or "없음"))
        sub = "Textures" if args.kind == "texture" else "Sprites"
        say(f"\n놓는 법: --put <자리>=<자산이름>  (자리는 {scope}{sub}/<자리>.png 가 됩니다)")
        if args.kind == "texture":
            say("자리 이름은 씬의 물체 이름입니다: Ground · Player · NPC · Trunk · Crown · Rock · Box")
        return 0

    wrote = 0
    for pair in args.put:
        if "=" not in pair:
            say(f"'{pair}' 는 <자리>=<자산이름> 모양이어야 합니다.")
            return 2
        slot, name = pair.split("=", 1)
        slot, name = slot.strip(), name.strip()
        asset = by_name.get(name)
        if not asset:
            # 승인 안 된 것을 이름만으로 넣어 주지 않는다. 그 순간 이 심부름꾼이
            # 승인을 건너뛰는 두 번째 문이 된다.
            say(f"'{name}' 은 승인된 그림 목록에 없습니다. 승인된 것만 넣습니다.")
            return 3

        folder = "Textures" if args.kind == "texture" else "Sprites"
        path = f"{scope}{folder}/{slot}.png"
        if not inside_scope(path, scope):
            say(f"울타리 밖입니다: {path}")
            return 2

        target = project / path.replace("/", "\\")
        target.parent.mkdir(parents=True, exist_ok=True)
        existed = target.exists()
        if existed:
            # 심부름꾼과 같은 방식으로 백업한다. 덮어쓴 것을 되돌릴 수 없으면
            # 승인이 되돌릴 수 없는 결정이 된다.
            backup = target.with_suffix(target.suffix + ".before-rookery")
            if not backup.exists():
                backup.write_bytes(target.read_bytes())
        remember(project, args.session, path, existed)

        raw = asset["image"]
        if "," in raw and raw.strip().startswith("data:"):
            raw = raw.split(",", 1)[1]
        target.write_bytes(base64.b64decode(raw))
        say(f"놓았습니다: {path}  ← {name}")
        wrote += 1

    say(f"\n{wrote}장 놓았습니다. 유니티를 열면 임포트되고, 프로토타입이 그때부터"
        " 도형 대신 이 그림을 씁니다 — 코드는 안 건드렸습니다.")
    say("되돌리려면: python tools/unity_runner.py --undo " + args.session
        + f' --project "{project}"')
    return 0


if __name__ == "__main__":
    sys.exit(main())
