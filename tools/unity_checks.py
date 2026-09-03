"""**그 판이 약속한 것**을 눌러 본다.

`unity_playmode.py` 가 재는 넷은 내가 쓴 일반 기준이다 — 어떤 게임이든 씬이
열려야 하고, 보이는 것이 있어야 하고, 입력이 코드에 닿아야 한다. 그건 그 게임이
**이번에 약속한 것**과는 상관이 없다.

설계는 판마다 합격 기준을 열몇 줄 낸다("나무를 흔들면 열매가 떨어진다").
지금까지 그것을 아무도 안 눌러 봤다. 이 심부름꾼이 그 자리를 잇는다:

    python tools/unity_checks.py --project "C:/Users/az518/My project" \\
        --session <판 id>

세 걸음이다.

  ① 씬을 열어 **실제로 있는 이름**을 꺼낸다 (`RookeryScenePeek`)
  ② 그 이름과 기준을 서버에 보내 **표**를 받는다 (`/api/unity/checks`)
  ③ 표를 씬 옆에 놓고 PlayMode 로 눌러 본다 (`RookeryCriteria`)

## 왜 이렇게 나누는가

①이 없으면 모델이 이름을 짐작하고, 짐작한 이름은 틀려도 그럴듯해 보인다.
그 표로 잰 판정은 아무 뜻이 없다.

②에서 모델은 **코드를 못 쓴다.** 시험기는 고정이고 모델은 낱말 표만 채운다.
만든 쪽이 시험지도 쓰면 통과하게 쓰기 때문이다.

③에서 못 잰 것은 **통과가 아니다.** 표에 없는 기준, 겨눌 데가 없는 기준,
입력을 흉내 낼 수 없는 기준은 전부 못 잼으로 센다.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from unity_runner import (  # noqa: E402
    DEFAULT_URL,
    diagnose_reach,
    read_input_handler,
    unity_bases,
)

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = Path(__file__).resolve().parent
EDITOR_SRC = HERE.parent / "unity" / "Editor"
TESTS_SRC = HERE.parent / "unity" / "Tests"


def read_version(project: Path) -> str | None:
    f = project / "ProjectSettings" / "ProjectVersion.txt"
    if not f.exists():
        return None
    for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("m_EditorVersion:"):
            return line.split(":", 1)[1].strip()
    return None


def find_unity(project: Path) -> Path | None:
    version = read_version(project)
    if not version:
        return None
    for base in unity_bases():
        exe = base / version / "Editor" / "Unity.exe"
        if exe.exists():
            return exe
    return None


def peek_scene(unity: Path, project: Path, scene: str, timeout: int) -> dict | None:
    """씬을 열어 이름과 컴포넌트를 꺼낸다. 씬은 안 바꾼다."""
    # 꺼내는 코드는 `Assets/Editor/` 에 둔다. 고리의 울타리(`Assets/Rookery/`)
    # 밖이라 다음 판에 덮어써지지 않는다 — 재는 도구가 재는 대상 안에 있으면
    # 대상이 도구를 지운다.
    dst = project / "Assets" / "Editor"
    dst.mkdir(parents=True, exist_ok=True)
    src = EDITOR_SRC / "RookeryScenePeek.cs"
    target = dst / src.name
    if not target.exists() or target.read_bytes() != src.read_bytes():
        target.write_bytes(src.read_bytes())

    work = Path(tempfile.gettempdir()) / "rookery-unity"
    work.mkdir(parents=True, exist_ok=True)
    stamp = int(time.time())
    out = work / f"scene_shape_{stamp}.json"
    log = work / f"scene_shape_{stamp}.log"

    command = [
        str(unity), "-batchmode", "-quit", "-nographics",
        "-projectPath", str(project),
        "-logFile", str(log),
        "-executeMethod", "Rookery.RookeryScenePeek.Dump",
        "-rookeryPeekOut", str(out),
    ]
    if scene:
        command += ["-rookeryScene", scene]

    print("씬에 무엇이 있는지 꺼냅니다…")
    try:
        subprocess.run(command, timeout=timeout)
    except subprocess.TimeoutExpired:
        print(f"  {timeout}초 안에 안 끝났습니다. 로그: {log}")
        return None
    if not out.exists():
        print(f"  목록을 못 받았습니다. 로그: {log}")
        return None
    try:
        return json.loads(out.read_text(encoding="utf-8"))
    except ValueError:
        print(f"  목록을 못 읽었습니다. 로그: {log}")
        return None


def fetch_checks(url: str, key: str, payload: dict) -> dict:
    import urllib.request
    request = urllib.request.Request(
        url.rstrip("/") + "/api/unity/checks",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"content-type": "application/json", "x-rookery-key": key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--session", required=True, help="어느 판의 기준인가")
    ap.add_argument("--scene", default="", help="씬 이름 일부. 비우면 빌드 설정의 마지막")
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--key", default="")
    ap.add_argument("--dim", choices=["2d", "3d"], default="2d")
    ap.add_argument("--timeout", type=int, default=1200)
    args = ap.parse_args()

    key = args.key or os.environ.get("ROOKERY_KEY", "")
    if not key:
        print("회사 유니티 열쇠가 필요합니다 (--key 또는 ROOKERY_KEY).")
        return 2

    project = Path(args.project).resolve()
    if not (project / "Assets").is_dir():
        print(f"유니티 프로젝트가 아닙니다: {project}")
        return 2

    unity = find_unity(project)
    if not unity:
        print(f"유니티 {read_version(project) or '(모름)'} 에디터를 못 찾았습니다.")
        return 4

    trouble = diagnose_reach(args.url)
    if trouble:
        print(trouble)
        return 3

    # ① 씬에 실제로 있는 것
    shape = peek_scene(unity, project, args.scene, args.timeout)
    if not shape or not shape.get("ok"):
        why = (shape or {}).get("error") or "이유를 못 읽었습니다"
        print(f"씬을 못 봤습니다: {why}")
        print("  여기서 멈춥니다 — 씬을 모르고 만든 표는 짐작한 표입니다.")
        return 5
    names = shape.get("names") or []
    print(f"  물체 {len(names)}개 · 컴포넌트 {len(shape.get('components') or [])}종")

    # ② 기준 → 표
    print("합격 기준을 표로 옮깁니다…")
    try:
        got = fetch_checks(args.url, key, {
            "sessionId": args.session,
            "names": names,
            "components": shape.get("components") or [],
            "dimension": args.dim,
            "inputHandler": read_input_handler(project),
        })
    except Exception as e:  # noqa: BLE001 - 이유를 그대로 보여 준다
        print(f"  서버가 표를 안 줬습니다: {e}")
        return 3
    if "error" in got:
        print(f"  서버가 거절했습니다: {got['error']}")
        return 3

    checks = got.get("checks") or []
    human = got.get("humanOnly") or []
    total = got.get("criteriaCount", len(checks) + len(human))
    print(f"  기준 {total}개 → 잴 수 있는 것 {len(checks)}개 · 사람만 볼 것 {len(human)}개")
    for h in human:
        print(f"    [{h.get('index')}] {h.get('criterion')}")
        print(f"        {h.get('why')}")

    # ③ 표를 놓고 눌러 본다
    dst = project / "Assets" / "Rookery" / "Tests" / "PlayMode"
    dst.mkdir(parents=True, exist_ok=True)
    (dst / "criteria.json").write_text(
        json.dumps({"checks": checks}, ensure_ascii=False, indent=2), encoding="utf-8")
    for name in ("RookeryCriteria.cs", "Rookery.Tests.PlayMode.asmdef"):
        (dst / name).write_bytes((TESTS_SRC / name).read_bytes())

    if not checks:
        # 표가 비었으면 시험을 돌릴 것이 없다. **통과라고 하지 않는다.**
        print("\n잴 수 있는 기준이 하나도 없습니다. 이 판은 기계로는 못 쟀습니다.")
        return 6

    print(f"\n표 {len(checks)}줄을 놓았습니다. 이제 눌러 봅니다.")
    code = subprocess.run(
        [sys.executable, str(HERE / "unity_playmode.py"),
         "--project", str(project), "--timeout", str(args.timeout)]
        + (["--scene", args.scene] if args.scene else []),
    ).returncode

    # 사람만 볼 것이 남아 있으면 마지막에 다시 말한다. 초록불만 보고 끝내면
    # **못 잰 것이 없어진다.**
    if human:
        print(f"\n기준 {total}개 중 {len(human)}개는 여전히 사람만 볼 수 있습니다.")
    return code


if __name__ == "__main__":
    sys.exit(main())
