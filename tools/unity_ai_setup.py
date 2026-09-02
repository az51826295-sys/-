"""생성 전용 유니티 프로젝트를 짓는다.

## 패키지가 두 벌이고, 오래 쓰던 쪽이 죽은 쪽이다 (09-02 에 알아냄)

| | `com.unity.ai.generators` | `com.unity.ai.assistant` |
|---|---|---|
| 최신 | 1.7.0-pre.1 · 2026-02-23 | 2.19.0-pre.2 · 2026-09-01 |
| 공개 API | 있다 | **없다**(`.api` 가 비어 있다) |
| 서버 | **거절**: `ApiNoLongerSupported` | 살아 있다 |

generators 는 버려진 것이 아니라 **assistant 안으로 통째로 들어갔다** —
`Unity.AI.Generators.*` · `Unity.AI.Image` · `Unity.AI.Mesh` · `Unity.AI.Sound`
가 전부 그 안에 있다. 코드는 같고 문패만 안쪽으로 돌렸다.

그래서 여기서는 **살아 있는 쪽을 품고 그 한 줄에 우리 이름을 더한다.** 패키지가
소스로 오기 때문에 할 수 있는 일이다. 유니티 코드는 한 줄만 더하고 아무것도
지우지 않는다.

    python tools/unity_ai_setup.py --at "C:/Users/az518/RookeryGen"

**에디터 설치는 이제 `tools/bootstrap.ps1 -Install` 이 한다.** 사용자 폴더에
깔면 관리자 권한이 필요 없다 — 09-02 에 열린 길이다.

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


ASSISTANT = "com.unity.ai.assistant"
REGISTRY = "https://packages.unity.com/"

# 품은 패키지가 스스로 안 끌고 오는 것들. 레지스트리에서 받아 쓸 때는 딸려
# 오지만 `file:` 로 품으면 우리가 적어 줘야 한다.
ASSISTANT_DEPS = {
    "com.unity.2d.sprite": "1.0.0",
    "com.unity.mathematics": "1.3.2",
    "com.unity.nuget.mono-cecil": "1.11.5",
    "com.unity.nuget.newtonsoft-json": "3.2.1",
}


def vendor_assistant(home: Path) -> Path | None:
    """살아 있는 유니티 AI 를 받아서 **문을 열어 둔 채로** 놓아 둔다.

    `com.unity.ai.generators` 는 2026-02-23 이 마지막이고, 그 서버 API 를
    유니티가 더 안 받는다(`ApiNoLongerSupported`). 죽은 것이 아니라 **옮겨
    갔다** — `com.unity.ai.assistant` 안에 `Unity.AI.Generators.*` 가 통째로
    들어 있고 그쪽은 지금도 갱신된다.

    옮겨 가면서 **공개 문이 닫혔다**(`.api` 가 비어 있고, `InternalsVisibleTo`
    가 유니티 자기 어셈블리만 부른다). 다행히 패키지가 소스로 오므로, 품어서
    그 한 줄에 우리 이름을 더하면 열린다.

    프로젝트마다 500MB 를 복사하지 않으려고 **한 벌만** 두고 여러 프로젝트가
    `file:` 로 가리킨다.
    """
    import tarfile
    import urllib.request

    target = home / ASSISTANT
    if (target / "package.json").exists():
        print(f"  이미 있습니다: {target}")
        return open_the_door(target)

    print("  살아 있는 유니티 AI 를 받습니다 (약 240MB)...")
    try:
        with urllib.request.urlopen(REGISTRY + ASSISTANT, timeout=120) as r:
            meta = json.loads(r.read().decode("utf-8"))
        version = meta["dist-tags"]["latest"]
        url = meta["versions"][version]["dist"]["tarball"]
    except (OSError, ValueError, KeyError) as e:
        print(f"  레지스트리를 못 읽었습니다: {e}")
        return None

    home.mkdir(parents=True, exist_ok=True)
    tgz = home / f"{ASSISTANT}-{version}.tgz"
    try:
        urllib.request.urlretrieve(url, tgz)
    except OSError as e:
        print(f"  못 받았습니다: {e}")
        return None

    # 타르 안의 최상위는 `package/` 다. 그 아래만 꺼낸다.
    staging = home / "_unpack"
    if staging.exists():
        shutil.rmtree(staging)
    with tarfile.open(tgz) as tar:
        tar.extractall(staging, filter="data")
    shutil.move(str(staging / "package"), str(target))
    shutil.rmtree(staging, ignore_errors=True)
    tgz.unlink(missing_ok=True)
    print(f"  놓았습니다: {target}  ({version})")
    return open_the_door(target)


def open_the_door(package: Path) -> Path | None:
    """우리 어셈블리 이름을 `InternalsVisibleTo` 에 더한다.

    유니티 코드를 고치는 것이라 **한 줄만** 더한다. 지우거나 바꾸지 않는다 —
    다음 판올림 때 이 파일을 통째로 새로 받고 이 한 줄을 다시 더하면 된다.
    """
    info = package / "Modules" / "Unity.AI.Generators.Tools" / "AssemblyInfo.cs"
    if not info.exists():
        print(f"  문을 못 찾았습니다: {info}")
        print("  패키지 구조가 바뀌었을 수 있습니다. 구조를 확인해야 합니다.")
        return None
    text = info.read_text(encoding="utf-8")
    mark = '[assembly: InternalsVisibleTo("Rookery.UnityAI")]'
    if mark not in text:
        anchor = "[assembly: InternalsVisibleTo("
        i = text.index(anchor)
        text = text[:i] + mark + "\n" + text[i:]
        info.write_text(text, encoding="utf-8")
        print("  문을 열었습니다: Rookery.UnityAI")
    return package


def add_packages(at: Path, assistant: Path) -> None:
    """만들 것만 넣는다. 게임에 쓰는 것들은 여기 안 들어간다 — 이 프로젝트는
    자산을 만들어 내보내는 곳이지 게임을 짓는 곳이 아니다."""
    manifest = at / "Packages" / "manifest.json"
    data = json.loads(manifest.read_text(encoding="utf-8"))
    deps = data.setdefault("dependencies", {})
    # 죽은 쪽이 남아 있으면 어셈블리 이름이 겹친다. 그러면 어느 쪽에 붙었는지
    # 알 수 없고, 알 수 없는 판으로 재면 그 판정은 아무 뜻이 없다.
    deps.pop("com.unity.ai.generators", None)
    deps.pop("com.unity.ai.toolkit", None)
    deps[ASSISTANT] = "file:" + str(assistant).replace("\\", "/")
    for name, version in ASSISTANT_DEPS.items():
        deps.setdefault(name, version)
    manifest.write_text(json.dumps(data, indent=2), encoding="utf-8")
    # **잠금 파일이 지운 것을 되살린다.** 매니페스트에서 뺐는데도 낡은 패키지가
    # 다시 등록되는 것을 한 번 겪었다. 지워야 깨끗한 판이 된다.
    lock = at / "Packages" / "packages-lock.json"
    lock.unlink(missing_ok=True)
    print(f"  {ASSISTANT} 를 품어서 넣었습니다.")


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
    # 500MB 짜리를 프로젝트마다 복사하지 않는다. 한 벌만 두고 가리킨다.
    ap.add_argument("--ai-home", default=str(Path.home() / "RookeryUnityAI"),
                    help="살아 있는 유니티 AI 패키지를 놓아 둘 곳")
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

    assistant = vendor_assistant(Path(args.ai_home).resolve())
    if not assistant:
        print("살아 있는 유니티 AI 를 못 놓았습니다. 여기서 멈춥니다 —")
        print("  죽은 패키지로 이어 가면 컴파일은 되고 서버가 거절합니다.")
        return 4
    add_packages(at, assistant)
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
