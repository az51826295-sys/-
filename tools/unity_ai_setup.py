"""생성 전용 유니티 프로젝트를 짓는다.

유니티 AI 생성기(`com.unity.ai.generators`)는 **Unity 6000.0** 을 겨냥해 만들어졌고
(package.json: `"unity": "6000.0"`, `unityRelease: "60f1"`), 마지막 갱신이
2026-02-23 이다. 그 사이 에디터는 6.5 까지 갔고, 6.5 에서 오류로 승격된 폐기
API 때문에 패키지가 컴파일되지 않는다. 올릴 버전도 없다 — 1.7.0-pre.1 이 최신이다.

그래서 **게임 프로젝트를 내리지 않고, 생성만 하는 프로젝트를 6000.0 으로 따로 짓는다.**
게임 프로젝트를 6.5 에서 6.0 으로 내리는 것은 되돌릴 수 없다.

    python tools/unity_ai_setup.py --at "C:/Users/az518/RookeryGen"

**이 심부름꾼이 못 하는 것: 에디터 설치.** 로키는 프로그램을 못 깐다.
Unity Hub 에서 6000.0 LTS 를 먼저 받아 주셔야 한다.

짓고 나면:

    python tools/unity_ai_probe.py --project "C:/Users/az518/RookeryGen" --max-points 1
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
# 에디터를 찾는 자리는 한 벌만 둔다. 여기저기 적어 두면 새 자리가 생겼을 때
# 한 군데를 빼먹고, 그 도구만 조용히 '유니티가 없다'고 말한다.
from unity_runner import unity_bases  # noqa: E402

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# 생성기가 겨냥한 줄기. 여기서 벗어나면 컴파일부터 안 된다.
WANTED_STREAM = "6000.0"

HUB_DIRS = unity_bases()

BRIDGE = ["RookeryUnityAI.cs", "Rookery.UnityAI.asmdef"]


def installed_editors() -> list[tuple[str, Path]]:
    found = []
    for base in HUB_DIRS:
        if not base.exists():
            continue
        for d in sorted(base.iterdir()):
            exe = d / "Editor" / "Unity.exe"
            if exe.exists():
                found.append((d.name, exe))
    return found


def pick_editor() -> tuple[str, Path] | None:
    """6000.0 줄기 중 가장 새 패치. 다른 줄기는 **쓰지 않는다** — 아무거나
    잡으면 컴파일이 안 되는 그 자리로 되돌아간다."""
    same = [(v, p) for v, p in installed_editors() if v.startswith(WANTED_STREAM + ".")]
    return sorted(same)[-1] if same else None


def create_project(unity: Path, at: Path) -> int:
    print(f"프로젝트를 짓습니다: {at}")
    log = at.parent / f"rookery_gen_create_{int(time.time())}.log"
    at.parent.mkdir(parents=True, exist_ok=True)
    return subprocess.run([
        str(unity), "-batchmode", "-quit", "-nographics",
        "-createProject", str(at),
        "-logFile", str(log),
    ], timeout=900).returncode


def add_packages(at: Path) -> None:
    """만들 것만 넣는다. 게임에 쓰는 것들은 여기 안 들어간다 — 이 프로젝트는
    자산을 만들어 내보내는 곳이지 게임을 짓는 곳이 아니다."""
    manifest = at / "Packages" / "manifest.json"
    data = json.loads(manifest.read_text(encoding="utf-8"))
    deps = data.setdefault("dependencies", {})
    # 생성기가 com.unity.ai.toolkit 과 com.unity.2d.sprite 를 같이 끌고 온다.
    deps["com.unity.ai.generators"] = "1.7.0-pre.1"
    manifest.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print("  com.unity.ai.generators 를 넣었습니다(토큰·2d.sprite 는 딸려 옵니다).")


def copy_bridge(at: Path) -> None:
    src = Path(__file__).resolve().parent.parent / "unity" / "Editor"
    dst = at / "Assets" / "Rookery" / "Editor" / "AI"
    dst.mkdir(parents=True, exist_ok=True)
    for name in BRIDGE:
        shutil.copy2(src / name, dst / name)
    print(f"  다리를 놓았습니다: {dst}")


def resolve(unity: Path, at: Path) -> tuple[int, Path]:
    """한 번 열어서 패키지를 받아 오고 컴파일한다. 여기서 깨지면 그 뒤는 볼 것도 없다."""
    log = at / "Temp" / f"rookery_gen_resolve_{int(time.time())}.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    print("패키지를 받아 오고 컴파일합니다. 처음이라 몇 분 걸립니다.")
    code = subprocess.run([
        str(unity), "-batchmode", "-quit", "-nographics",
        "-projectPath", str(at), "-logFile", str(log),
    ], timeout=1800).returncode
    return code, log


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--at", required=True, help="새 프로젝트를 지을 곳")
    args = ap.parse_args()

    picked = pick_editor()
    if not picked:
        print(f"Unity {WANTED_STREAM}.x 에디터가 안 깔려 있습니다.")
        have = installed_editors()
        if have:
            print("  지금 깔린 것: " + ", ".join(v for v, _ in have))
            print(f"  이 중에는 {WANTED_STREAM} 줄기가 없습니다. 6.5 에서는 생성기가"
                  " 컴파일되지 않습니다(확인함).")
        print("  Unity Hub → Installs → Install Editor → 6000.0 LTS 를 받아 주십시오.")
        print("  로키는 프로그램을 못 깝니다.")
        return 2

    version, unity = picked
    at = Path(args.at).resolve()
    print(f"에디터 {version}")

    if (at / "ProjectSettings").exists():
        print(f"이미 프로젝트가 있습니다: {at} — 짓지 않고 그대로 씁니다.")
    else:
        code = create_project(unity, at)
        if code != 0 or not (at / "ProjectSettings").exists():
            print(f"프로젝트를 못 지었습니다(종료코드 {code}).")
            return 3

    add_packages(at)
    copy_bridge(at)

    code, log = resolve(unity, at)
    built = at / "Library" / "ScriptAssemblies" / "Rookery.UnityAI.dll"
    if built.exists():
        print("\n다리가 지어졌습니다. 이제 재 볼 수 있습니다:")
        print(f'  python tools/unity_ai_probe.py --project "{at}" --max-points 1')
        return 0

    # 지어지지 않은 것과 실패한 것을 가른다. 종료코드만 보면 둘이 같아 보인다.
    print(f"\nRookery.UnityAI.dll 이 안 지어졌습니다(종료코드 {code}).")
    print(f"  로그: {log}")
    text = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
    for line in [l for l in text.splitlines() if "error CS" in l][:8]:
        print("  | " + line.strip())
    return 4


if __name__ == "__main__":
    sys.exit(main())
