"""환경 조성 — 로키가 유니티 일을 시킬 수 있는 상태인지 보고, 될 것은 만든다.

  python -X utf8 tools/setup_env.py                 # 보기만 한다 (아무것도 안 바꿈)
  python -X utf8 tools/setup_env.py --fix           # 고칠 수 있는 것을 고친다
  python -X utf8 tools/setup_env.py --fix --install-editor   # 에디터까지 받는다

**서버는 이 기계를 못 연다.** 그건 이 제품이 안 하기로 한 일이고, 그래서 원격
으로 유니티를 깔아 주는 길은 없다. 대신 **명령 한 줄이 다 하게** 만든다 —
사람이 하는 일은 그 한 줄을 넣는 것까지다.

## 무엇을 고칠 수 있고 무엇은 못 하나

고친다:
  - 유니티 프로젝트가 없으면 만든다 (에디터로 빈 프로젝트 생성)
  - 게임에 필요한 패키지가 빠져 있으면 `Packages/manifest.json` 에 넣는다
  - 프로젝트가 적어 둔 버전의 에디터가 없으면 Hub 로 받는다 (`--install-editor`)

못 한다 (사람 몫이라고 **적어서 내놓는다**):
  - Unity Hub 설치 — 설치 프로그램을 받아 실행하는 일이라 사람이 한다
  - 유니티 로그인·라이선스 — 계정 자격증명이고, 이 도구는 그것을 만지지 않는다
  - 회사 열쇠(`ROOKERY_KEY`) — 로키 화면에서 사람이 복사해 온다

못 하는 것을 **하겠다고 말하지 않는다.** 실제로 그렇게 한 번 데였다: 로키가
없는 패키지에 의존한 코드를 냈고, 패키지를 깔 수 없어서 코드만 고치다 멈췄다.
고칠 수 없는 것을 고치려 한 것이다. 이 도구는 그 반대를 한다 — 못 하는 것은
목록으로 내놓고 사람이 하게 한다.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

HUB_CANDIDATES = [
    Path(r"C:\Program Files\Unity Hub\Unity Hub.exe"),
    Path(r"C:\Program Files (x86)\Unity Hub\Unity Hub.exe"),
]

EDITOR_ROOTS = [
    Path(r"C:\Program Files\Unity\Hub\Editor"),
    Path(r"C:\Program Files (x86)\Unity\Hub\Editor"),
    Path.home() / "Unity" / "Hub" / "Editor",
]

# 2D 게임을 만들다 실제로 막혔던 것들. **"필요한 것" 이 아니라 "없으면 막혔던
# 자리" 다.** 그 차이가 중요하다 — `com.unity.ugui` 가 빈 프로젝트에 없어서
# 로키가 낸 UI 코드가 16개 오류를 냈고, 패키지를 깔 수 없어 여섯 판을 돌다
# 멈췄다. 그렇다고 이것이 모든 프로젝트에 필요하다는 뜻은 아니다.
MAYBE_NEEDED = {
    "com.unity.ugui": "UI(버튼·텍스트)를 쓰면 필요",
    "com.unity.2d.sprite": "2D 스프라이트를 쓰면 필요",
}


def say(text: str) -> None:
    print(text, flush=True)


def find_hub() -> Path | None:
    for p in HUB_CANDIDATES:
        if p.exists():
            return p
    return None


def hub(hub_exe: Path, *args: str, timeout: int = 600) -> tuple[int, str]:
    """Hub 를 헤드리스로 부른다. 창을 띄우지 않는다."""
    proc = subprocess.run(
        [str(hub_exe), "--", "--headless", *args],
        capture_output=True, text=True, timeout=timeout,
    )
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def installed_editors(hub_exe: Path) -> dict[str, str]:
    code, out = hub(hub_exe, "editors", "--installed", timeout=120)
    found: dict[str, str] = {}
    if code != 0:
        return found
    for line in out.splitlines():
        line = line.strip()
        if " installed at " in line:
            ver, path = line.split(" installed at ", 1)
            found[ver.strip()] = path.strip()
    return found


def project_version(project: Path) -> str | None:
    f = project / "ProjectSettings" / "ProjectVersion.txt"
    if not f.exists():
        return None
    for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("m_EditorVersion:"):
            return line.split(":", 1)[1].strip()
    return None


def unverified_packages(project: Path) -> dict[str, str]:
    """**없다고 단정하지 않는다.** 없는 것과 필요한데 없는 것은 다르다.

    이 도구는 이 프로젝트가 무엇을 만들지 모른다. 3D 게임이면 2D 스프라이트는
    없어야 맞고, 있는 것이 오히려 군더더기다. 그래서 목록에 있는 것이 안 보이면
    **미확인**으로 내놓는다 — 필요한지는 로키가 그것을 쓰는 코드를 냈을 때
    컴파일러가 말해 준다. 그때 근거가 생긴다.

    재지 않은 것을 없다고 적으면, 이 고리가 계속 데여 온 그 자리와 같아진다.
    """
    manifest = project / "Packages" / "manifest.json"
    if not manifest.exists():
        return dict(MAYBE_NEEDED)
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except Exception:
        return dict(MAYBE_NEEDED)
    have = data.get("dependencies", {})
    return {k: why for k, why in MAYBE_NEEDED.items() if k not in have}


def add_packages(project: Path, want: dict[str, str]) -> bool:
    """미확인 패키지를 매니페스트에 넣는다. **사람이 따로 시켜야 한다.**"""
    manifest = project / "Packages" / "manifest.json"
    if not manifest.exists():
        return False
    data = json.loads(manifest.read_text(encoding="utf-8"))
    deps = data.setdefault("dependencies", {})
    # 버전은 우리가 정하지 않는다. `1.0.0` 을 적으면 유니티가 그 이상으로
    # 해결한다. 특정 버전을 박으면 다른 유니티 버전에서 못 푸는 조합이 생긴다.
    for name in want:
        deps.setdefault(name, "1.0.0")
    # 원본을 한 번 떠 둔다. 매니페스트가 깨지면 프로젝트가 안 열린다.
    backup = manifest.with_suffix(".json.before-rookery")
    if not backup.exists():
        backup.write_text(manifest.read_text(encoding="utf-8"), encoding="utf-8")
    manifest.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return True


def create_project(editor: Path, project: Path) -> bool:
    say(f"  빈 프로젝트를 만듭니다: {project} (몇 분 걸립니다)")
    proc = subprocess.run(
        [str(editor), "-batchmode", "-quit", "-createProject", str(project),
         "-nographics", "-logFile", str(project.parent / "rookery-create.log")],
        capture_output=True, text=True, timeout=1800,
    )
    return proc.returncode == 0 and (project / "Assets").is_dir()


def report(project: Path, hub_exe: Path | None) -> dict:
    """지금 상태. **판정이 아니라 관측이다** — 고칠 수 있는지는 아래에서 따진다."""
    editors = installed_editors(hub_exe) if hub_exe else {}
    version = project_version(project) if project.exists() else None
    return {
        "python": sys.version.split()[0],
        "hub": str(hub_exe) if hub_exe else None,
        "editors": editors,
        "project": str(project),
        "projectExists": (project / "Assets").is_dir(),
        "projectVersion": version,
        "editorForProject": editors.get(version) if version else None,
        "unverifiedPackages": unverified_packages(project) if (project / "Assets").is_dir() else {},
        "rookeryKey": bool(os.environ.get("ROOKERY_KEY")),
    }


def show(state: dict) -> list[str]:
    """사람이 읽을 줄들과, 사람만 할 수 있는 일의 목록을 돌려준다."""
    say("")
    say(f"파이썬        {state['python']}")
    say(f"Unity Hub     {state['hub'] or '없음'}")
    say(f"설치된 에디터  {', '.join(state['editors']) or '없음'}")
    say(f"프로젝트      {state['project']}"
        + ("" if state["projectExists"] else "  ← 없음"))
    if state["projectVersion"]:
        say(f"프로젝트 버전  {state['projectVersion']}"
            + ("" if state["editorForProject"] else "  ← 이 버전 에디터가 없음"))
    say(f"회사 열쇠     {'있음' if state['rookeryKey'] else '없음 (ROOKERY_KEY)'}")
    if state["unverifiedPackages"]:
        say("")
        say("미확인 (없는 것이지, 필요한데 없는 것인지는 모릅니다):")
        for name, why in state["unverifiedPackages"].items():
            say(f"  □ {name} — {why}")
        say("  로키가 그것을 쓰는 코드를 내면 컴파일러가 말해 줍니다. 그때")
        say("  근거가 생깁니다. 미리 넣으려면 --add-packages 를 붙이십시오.")

    human: list[str] = []
    if not state["hub"]:
        human.append(
            "Unity Hub 설치 — https://unity.com/download 에서 받아 실행하십시오. "
            "설치 프로그램을 실행하는 일이라 이 도구가 대신 하지 않습니다.")
    if not state["rookeryKey"]:
        human.append(
            "회사 열쇠 — 로키 화면에서 복사해 `set ROOKERY_KEY=...` 로 넣으십시오.")
    if state["hub"] and not state["editors"]:
        human.append(
            "유니티 로그인 — Hub 를 한 번 열어 로그인하십시오. 라이선스는 계정 "
            "자격증명이라 이 도구가 만지지 않습니다.")
    return human


def main() -> int:
    ap = argparse.ArgumentParser(description="로키 유니티 환경 조성")
    ap.add_argument("--project", default=os.environ.get(
        "UNITY_PROJECT", str(Path.home() / "My project")))
    ap.add_argument("--fix", action="store_true",
                    help="고칠 수 있는 것을 고친다 (프로젝트 생성, 패키지 추가)")
    ap.add_argument("--install-editor", action="store_true",
                    help="프로젝트 버전의 에디터를 Hub 로 받는다. 수 GB, 오래 걸린다")
    ap.add_argument("--add-packages", action="store_true",
                    help="미확인 패키지를 매니페스트에 넣는다. 필요한지는 확인 안 됨")
    ap.add_argument("--json", action="store_true", help="상태를 JSON 으로만")
    args = ap.parse_args()

    project = Path(args.project)
    hub_exe = find_hub()
    state = report(project, hub_exe)

    if args.json:
        print(json.dumps(state, ensure_ascii=False, indent=1))
        return 0

    human = show(state)

    if not args.fix:
        say("\n(보기만 했습니다. 고치려면 --fix 를 붙이십시오.)")
        if human:
            say("\n사람이 해야 하는 것:")
            for h in human:
                say("  - " + h)
        return 0

    # ── 고친다 ──────────────────────────────────────────────────
    say("\n고칩니다.")

    if not state["hub"]:
        say("  Hub 가 없어 여기서 더 갈 수 없습니다.")
        for h in human:
            say("  - " + h)
        return 1

    editors = state["editors"]
    if not state["projectExists"]:
        if not editors:
            say("  에디터가 하나도 없어 프로젝트를 못 만듭니다.")
            return 1
        version = sorted(editors)[-1]
        if not create_project(Path(editors[version]), project):
            say("  프로젝트를 만들지 못했습니다. 로그를 보십시오.")
            return 1
        say("  만들었습니다.")
        state = report(project, hub_exe)

    if state["projectVersion"] and not state["editorForProject"]:
        version = state["projectVersion"]
        if not args.install_editor:
            say(f"  이 프로젝트는 {version} 을 쓰는데 그 에디터가 없습니다.")
            say("  받으려면 --install-editor 를 붙이십시오 (수 GB, 오래 걸립니다).")
        else:
            say(f"  에디터 {version} 을 받습니다. 오래 걸립니다…")
            code, out = hub(hub_exe, "install", "--version", version, timeout=7200)
            say("  " + (out.strip().splitlines() or ["(출력 없음)"])[-1])
            if code != 0:
                say("  받지 못했습니다. Hub 를 열어 직접 받으셔야 할 수 있습니다.")

    if args.add_packages:
        unverified = unverified_packages(project)
        if not unverified:
            say("  넣을 것이 없습니다.")
        elif add_packages(project, unverified):
            say(f"  넣었습니다: {', '.join(unverified)}")
            say("  (유니티가 다음에 열릴 때 받아 옵니다. 원본은 떠 뒀습니다.)")
        else:
            say("  매니페스트가 없어 못 넣었습니다.")
    else:
        # 미확인은 **기본으로 안 고친다.** 필요한지 모르는 것을 넣으면 프로젝트에
        # 군더더기가 쌓이고, 그 군더더기는 누가 왜 넣었는지 아무도 모른다.
        say("  미확인 패키지는 그대로 뒀습니다 (--add-packages 로 넣습니다).")

    if human:
        say("\n사람이 해야 하는 것:")
        for h in human:
            say("  - " + h)
    else:
        say("\n사람이 해야 할 것은 없습니다. `python tools/unity_runner.py --watch` 로 켜십시오.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
