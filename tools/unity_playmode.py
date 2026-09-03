"""만들어진 게임을 **켜서 재 본다.**

지금까지 이 고리가 잰 것은 컴파일뿐이었다. 컴파일은 문법이 맞다는 뜻일 뿐이라,
없는 그림을 참조해 화면이 빈 씬도, 꺼진 입력 API 를 써서 키를 눌러도 아무 일이
없는 게임도 전부 통과했다. 재는 자가 못 보는 자리였다.

이 심부름꾼은 유니티를 **PlayMode 테스트 모드**로 켜서, 씬을 실제로 열고 몇십
프레임 돌려 보고, 입력을 넣어 본다.

    python tools/unity_playmode.py --project "C:/Users/az518/My project"
    python tools/unity_playmode.py --project ... --scene PixelJump   # 씬 지정
    python tools/unity_playmode.py --project ... --install           # 시험지를 넣고 잰다

**시험지는 사람이 쓴다.** 합격 기준은 로키가 판마다 새로 쓰지만, 만든 쪽이
시험지도 쓰면 통과하게 쓸 수 있다. 그래서 여기서 넣는 것은 게임마다 달라지는
기준이 아니라 어떤 2D 게임이든 지켜야 하는 것들이고, 한 번 쓰고 안 바꾼다.

`-nographics` 를 쓴다. 처음에는 "화면을 안 만들면 렌더러를 재는 시험이 깨진다"
고 보고 뺐는데, **그건 틀렸고 그것 때문에 25분을 멈춰 있었다.** 이 기계에는
내장 그래픽밖에 없어서 배치모드로 플레이 모드에 들어가다 그대로 멈춘다.

우리 시험이 보는 것은 그려진 그림이 아니라 **씬 안에 무엇이 있는가**다 —
카메라가 켜져 있는지, 렌더러가 붙어 있는지, 스프라이트가 파일에서 왔는지.
그건 그래픽 장치 없이도 그대로 참이다.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
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

HERE = Path(__file__).resolve().parent
TESTS_SRC = HERE.parent / "unity" / "Tests"
# 시험지 두 장이 같이 다닌다. 하나는 어떤 게임이든 지켜야 하는 것,
# 하나는 **그 판이 약속한 것**(표는 `unity_checks.py` 가 놓는다).
# 표가 없으면 그쪽은 "잴 표가 없습니다" 로 못 잼을 낸다 — 통과가 아니다.
TEST_FILES = ["RookeryAcceptance.cs", "RookeryCriteria.cs",
              "Rookery.Tests.PlayMode.asmdef"]


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


def has_package(project: Path, name: str) -> bool:
    manifest = project / "Packages" / "manifest.json"
    if not manifest.exists():
        return False
    try:
        deps = json.loads(manifest.read_text(encoding="utf-8")).get("dependencies", {})
    except ValueError:
        return False
    if name in deps:
        return True
    # 간접 의존으로 들어온 것도 실제로는 쓸 수 있다. 받아 놓은 것을 본다.
    cache = project / "Library" / "PackageCache"
    return cache.exists() and any(d.name.startswith(name + "@") for d in cache.iterdir())


def install_tests(project: Path) -> str | None:
    if not has_package(project, "com.unity.test-framework"):
        return ("com.unity.test-framework 가 이 프로젝트에 없습니다. "
                "없으면 시험지가 컴파일되지 않습니다.")
    if not has_package(project, "com.unity.inputsystem"):
        return ("com.unity.inputsystem 이 없습니다. 시험지가 그 어셈블리를 참조합니다.")
    dst = project / "Assets" / "Rookery" / "Tests" / "PlayMode"
    dst.mkdir(parents=True, exist_ok=True)
    for name in TEST_FILES:
        shutil.copy2(TESTS_SRC / name, dst / name)
    print(f"시험지를 넣었습니다: {dst}")
    return None


def unity_running() -> bool:
    """유니티가 정말 돌고 있는가. 못 물어보면 **돈다고 본다** — 잠금을 잘못
    치우면 남의 세션을 깨뜨리고, 그건 기다리는 것보다 훨씬 비싸다."""
    try:
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq Unity.exe"],
            capture_output=True, text=True, timeout=20).stdout
    except (OSError, subprocess.SubprocessError):
        return True
    return "Unity.exe" in out


def parse_results(xml_path: Path) -> dict:
    """NUnit 결과를 읽는다.

    **`Inconclusive` 를 통과와 따로 센다.** 못 잰 것을 통과로 세면, 못 잴수록
    잘 통과한다 — 이 고리가 여섯 번 밟은 자리다.
    """
    root = ET.parse(xml_path).getroot()
    cases = root.iter("test-case")
    out = {"passed": [], "failed": [], "skipped": [], "inconclusive": []}
    for c in cases:
        name = (c.get("name") or "").strip()
        result = (c.get("result") or "").lower()
        label = (c.get("label") or "").lower()
        message = ""
        # `or` 로 쓰면 안 된다. `Element` 의 참/거짓은 **자식이 있는가**라서,
        # 자식 없는 `<message>` 는 찾아 놓고도 거짓이 되어 다음으로 넘어간다.
        # 그러면 이유가 있는데 없는 것처럼 나온다 — 판정문에서 이유가 사라지는
        # 것은 판정을 못 읽게 만드는 것과 같다.
        node = c.find("./failure/message")
        if node is None:
            node = c.find("./reason/message")
        if node is not None and node.text:
            message = node.text.strip()
        if result == "passed":
            out["passed"].append((name, message))
        elif result == "failed":
            out["failed"].append((name, message))
        elif "inconclusive" in (result + label):
            out["inconclusive"].append((name, message))
        else:
            out["skipped"].append((name, message))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--scene", default="", help="씬 이름 일부. 비우면 빌드 설정의 마지막")
    ap.add_argument("--install", action="store_true", help="시험지를 먼저 넣는다")
    ap.add_argument("--timeout", type=int, default=1200)
    args = ap.parse_args()

    project = Path(args.project).resolve()
    if not (project / "Assets").is_dir():
        print(f"유니티 프로젝트가 아닙니다: {project}")
        return 2

    # 잠금 파일이 있다고 유니티가 도는 것은 아니다.
    #
    # 앞선 실행이 컴파일 오류로 끊기거나 죽으면 파일만 남는다. 그때 "열려
    # 있습니다" 라고 하면 **없는 벽 앞에서 사람이 멈춘다.** 실제로 한 시간에
    # 두 번 그랬다. 그래서 파일이 아니라 프로세스를 본다.
    lock = project / "Temp" / "UnityLockfile"
    if lock.exists():
        if unity_running():
            print("유니티가 돌고 있습니다. 닫고 다시 돌려 주십시오.")
            return 5
        print("잠금 파일만 남아 있고 유니티는 없습니다 — 앞선 실행이 남긴 것입니다. 치웁니다.")
        try:
            lock.unlink()
        except OSError as e:
            print(f"  못 치웠습니다: {e}")
            return 5

    unity = find_unity(project)
    if not unity:
        print(f"유니티 {read_version(project) or '(모름)'} 에디터를 못 찾았습니다.")
        return 4

    if args.install:
        trouble = install_tests(project)
        if trouble:
            print(trouble)
            return 3

    stamp = int(time.time())
    results = project / "Temp" / f"rookery_tests_{stamp}.xml"
    log = project / "Temp" / f"rookery_tests_{stamp}.log"
    results.parent.mkdir(parents=True, exist_ok=True)

    command = [
        str(unity), "-batchmode", "-nographics",
        "-projectPath", str(project),
        "-runTests", "-testPlatform", "PlayMode",
        "-testResults", str(results),
        "-logFile", str(log),
    ]
    env = None
    if args.scene:
        import os
        env = {**os.environ, "ROOKERY_SCENE": args.scene}

    print(f"유니티 {read_version(project)} · PlayMode 시험 · 최대 {args.timeout}초")
    started = time.monotonic()
    try:
        code = subprocess.run(command, timeout=args.timeout, env=env).returncode
    except subprocess.TimeoutExpired:
        print(f"{args.timeout}초 안에 안 끝났습니다. 로그: {log}")
        return 6
    elapsed = time.monotonic() - started

    if not results.exists():
        # 시험을 못 돌린 것과 떨어진 것은 다르다. 종료코드만 보면 같아 보인다.
        print(f"\n결과 파일이 없습니다(종료코드 {code}, {elapsed:.0f}초).")
        print("  시험이 아예 안 돌았습니다 — 컴파일이 깨졌을 수 있습니다.")
        text = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
        for line in [l for l in text.splitlines() if "error CS" in l][:8]:
            print("  | " + line.strip())
        print(f"  로그: {log}")
        return 7

    r = parse_results(results)
    total = sum(len(v) for v in r.values())
    if total == 0:
        # 시험이 0개 도는 것은 "다 통과" 가 아니라 **잰 적이 없다** 이다.
        # 어셈블리가 PlayMode 시험으로 안 잡히면 조용히 이렇게 된다 — 실제로
        # `includePlatforms: ["Editor"]` 하나 때문에 그랬다(그러면 EditMode 로 잡힌다).
        print()
        print(f"{elapsed:.0f}초 · 시험이 0개 돌았습니다 — 잰 것이 없습니다.")
        print("  시험 어셈블리가 PlayMode 로 안 잡혔을 수 있습니다"
              " (asmdef 의 includePlatforms 가 비어 있어야 합니다).")
        return 8

    print(f"\n{elapsed:.0f}초 · 통과 {len(r['passed'])} · 떨어짐 {len(r['failed'])} · "
          f"못 잼 {len(r['inconclusive'])}")
    for name, _ in r["passed"]:
        print(f"  통과   {name}")
    for name, message in r["inconclusive"]:
        print(f"  못 잼  {name}\n         {message.splitlines()[0] if message else ''}")
    for name, message in r["failed"]:
        print(f"  떨어짐 {name}")
        for line in (message or "").splitlines()[:4]:
            print("         " + line)

    if r["failed"]:
        return 1
    if not r["passed"]:
        # 전부 못 쟀으면 통과가 아니다.
        print("\n통과한 시험이 하나도 없습니다 — 잰 것이 없습니다.")
        return 8
    print("\n합격 기준 중 기계가 잴 수 있는 것은 다 통과했습니다.")
    print("재미와 조작감은 여전히 사람이 봅니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
