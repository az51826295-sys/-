"""로키가 유니티를 켠다.

사장님이 손을 대지 않으려면 누군가 이 PC에서 유니티를 켜야 한다. 로키는
클라우드에 있어서 이 컴퓨터를 열 수 없다 — 서버가 남의 기계를 여는 통로를
만드는 것은 이 제품이 하지 않는 일이다.

그래서 이 심부름꾼이 있다. 한 번 켜 두면 그 다음부터는:

    로키에게 묻는다 → 받은 파일을 쓴다 → 유니티를 배치모드로 켠다 →
    로그에서 컴파일 오류를 긁는다 → 로키에게 돌려보낸다 → 반복

사람은 무엇을 만들지 한 줄 적을 때와, 다 된 것을 볼 때만 손을 댄다.

**에디터 창에서 도는 고리와 다른 점.** `RookeryVibe.cs` 는 유니티가 열려
있어야 하고 사람이 창에서 시작을 누른다. 이 심부름꾼은 반대다 — 유니티가
닫혀 있어야 하고(같은 프로젝트를 두 번 열 수 없다), 유니티를 켜는 쪽이
로키다.

**왜 로그를 긁는가.** 배치모드에서 `-executeMethod` 로 오류를 받아 오면
깔끔하겠지만, 생성된 코드가 깨지면 **우리 스크립트도 같이 컴파일에 실패해서
그 메서드가 아예 안 불린다.** 정작 오류가 났을 때만 못 읽는 셈이다. 로그는
컴파일이 실패해도 남는다.

쓰는 법:

    set ROOKERY_KEY=<회사 유니티 열쇠>
    python tools/unity_runner.py "2D 탑다운으로 방향키로 걷는 게임"
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_URL = "https://rookery-web-production.up.railway.app"

# 유니티가 로그에 오류를 적는 모양. 파일(줄,칸): error CSxxxx: 메시지
ERROR_LINE = re.compile(
    r"^(?P<file>.+\.cs)\((?P<line>\d+),\d+\):\s*error\s+(?P<code>[A-Z]+\d+):\s*(?P<msg>.+)$"
)

# 컴파일 말고 실행 중에 터진 것. 씬을 코드로 지을 때 이쪽으로 난다.
EXCEPTION_LINE = re.compile(r"^(?P<kind>\w*Exception|Error):\s*(?P<msg>.+)$")

# 프로젝트가 이미 열려 있으면 배치모드가 붙지 못한다. 흔한 막힘이라 따로 잡는다.
LOCKED = "Multiple Unity instances cannot open the same project"


def say(text: str) -> None:
    print(text, flush=True)


def post(url: str, key: str, payload: dict, timeout: int) -> dict:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url.rstrip("/") + "/api/unity/vibe",
        data=body,
        headers={"Content-Type": "application/json", "x-rookery-key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:400]
        raise SystemExit(f"로키가 거절했습니다 ({error.code}): {detail}")
    except urllib.error.URLError as error:
        raise SystemExit(f"로키에 닿지 못했습니다: {error.reason}")


def inside_scope(path: str, scope: str) -> bool:
    """울타리. 판마다 사람에게 묻지 않는 대신 이 검사가 있다.

    여기가 뚫리면 자동으로 도는 물건이 프로젝트 아무 데나 쓸 수 있고, 그건
    협업이 아니라 사고다.
    """
    p = path.replace("\\", "/")
    return p.startswith(scope) and p.startswith("Assets/") and ".." not in p


def write_files(project: Path, files: list[dict], scope: str) -> int:
    written = 0
    for f in files:
        path = (f.get("path") or "").replace("\\", "/")
        if not inside_scope(path, scope):
            say(f"  울타리 밖이라 건너뜁니다: {path}")
            continue
        target = project / path
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            # 백업은 **처음 한 번만.** 판마다 덮으면 몇 판 뒤엔 백업이 로키가
            # 지난 판에 쓴 것이 되어, 진짜 원본이 사라진다.
            backup = target.with_suffix(target.suffix + ".before-rookery")
            if not backup.exists():
                shutil.copy2(target, backup)
        target.write_text(f.get("contents") or "", encoding="utf-8")
        say(f"  썼습니다: {path}")
        written += 1
    return written


def read_scope(project: Path, scope: str, max_files: int = 24,
               max_chars: int = 120_000) -> list[dict]:
    """울타리 안의 지금 파일들. 고치려면 지금 뭐가 있는지 봐야 한다."""
    root = project / scope
    if not root.exists():
        return []
    out: list[dict] = []
    total = 0
    for p in sorted(root.rglob("*.cs")):
        text = p.read_text(encoding="utf-8", errors="replace")
        total += len(text)
        if len(out) >= max_files or total > max_chars:
            # 자른 것을 말한다. 조용히 자르면 "다 봤다"로 읽힌다.
            say(f"  파일이 많아 {len(out)}개만 보냅니다.")
            break
        out.append({"path": str(p.relative_to(project)).replace("\\", "/"),
                    "contents": text})
    return out


def run_unity(unity: Path, project: Path, log: Path,
              execute_method: str | None, timeout: int) -> tuple[int, str]:
    """유니티를 켠다. 돌아오는 것은 종료 코드와 로그 전문."""
    if log.exists():
        log.unlink()
    command = [
        str(unity), "-batchmode", "-quit", "-nographics",
        "-projectPath", str(project),
        "-logFile", str(log),
    ]
    if execute_method:
        command += ["-executeMethod", execute_method]
    try:
        finished = subprocess.run(command, timeout=timeout)
        code = finished.returncode
    except subprocess.TimeoutExpired:
        say(f"  유니티가 {timeout}초 안에 끝나지 않았습니다.")
        code = -1
    text = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
    return code, text


def parse_errors(log_text: str, project: Path) -> list[dict]:
    """로그에서 컴파일 오류만 긁는다.

    같은 오류가 로그에 여러 번 찍히므로 중복을 지운다 — 안 그러면 로키에게
    같은 말을 열 번 보내고, 판정도 그만큼 흐려진다.
    """
    errors: list[dict] = []
    seen: set[tuple[str, int, str]] = set()
    for line in log_text.splitlines():
        m = ERROR_LINE.match(line.strip())
        if not m:
            continue
        path = m.group("file").replace("\\", "/")
        # 절대 경로로 찍힐 때가 있다. 로키에게는 프로젝트 기준으로 보낸다.
        try:
            path = str(Path(path).resolve().relative_to(project.resolve())).replace("\\", "/")
        except (ValueError, OSError):
            pass
        key = (path, int(m.group("line")), m.group("msg"))
        if key in seen:
            continue
        seen.add(key)
        errors.append({
            "file": path,
            "line": int(m.group("line")),
            "message": f"{m.group('code')}: {m.group('msg')}",
        })
    return errors


def parse_runtime(log_text: str, method: str) -> list[dict]:
    """씬을 짓다 터진 것.

    컴파일 오류와 달리 파일·줄이 없을 때가 많다. 없는 줄번호를 지어내지 않고
    0으로 둔다 — 지어낸 위치는 다음 판에서 엉뚱한 곳을 고치게 만든다.
    """
    out: list[dict] = []
    seen: set[str] = set()

    if "could not be found" in log_text and method.split(".")[-1] in log_text:
        out.append({
            "file": method,
            "line": 0,
            "message": (f"-executeMethod 로 {method} 를 찾지 못했습니다. "
                        "이름이 틀렸거나, 그 클래스가 Editor 폴더 밖에 있습니다."),
        })

    for line in log_text.splitlines():
        m = EXCEPTION_LINE.match(line.strip())
        if not m:
            continue
        message = f"{m.group('kind')}: {m.group('msg')}"
        if message in seen:
            continue
        seen.add(message)
        out.append({"file": method, "line": 0, "message": message})
        if len(out) >= 10:
            break
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="로키가 유니티를 켜서 만든다.")
    parser.add_argument("want", nargs="?", help="무엇을 만들지 한 줄.")
    parser.add_argument("--url", default=os.environ.get("ROOKERY_URL", DEFAULT_URL))
    parser.add_argument("--key", default=os.environ.get("ROOKERY_KEY", ""))
    parser.add_argument("--project", default=os.environ.get(
        "UNITY_PROJECT", str(Path.home() / "My project")))
    parser.add_argument("--unity", default=os.environ.get("UNITY_EXE", ""))
    parser.add_argument("--scope", default="Assets/Rookery/")
    parser.add_argument("--rounds", type=int, default=6,
                        help="여기까지만 돈다. 서버에도 같은 뚜껑이 있다.")
    parser.add_argument("--unity-timeout", type=int, default=1200)
    args = parser.parse_args()

    if not args.key:
        say("회사 유니티 열쇠가 필요합니다 (ROOKERY_KEY 또는 --key).")
        return 2
    if not args.want:
        say("무엇을 만들지 한 줄 적어 주십시오.")
        return 2

    project = Path(args.project)
    if not (project / "Assets").is_dir():
        say(f"유니티 프로젝트가 아닙니다: {project}")
        return 2

    unity = Path(args.unity) if args.unity else find_unity(project)
    if not unity or not unity.exists():
        say("유니티 실행 파일을 찾지 못했습니다. --unity 로 알려 주십시오.")
        return 2

    scope = args.scope if args.scope.endswith("/") else args.scope + "/"
    log = project / "rookery-batch.log"

    say(f"유니티: {unity}")
    say(f"프로젝트: {project}")
    say(f"쓸 폴더: {scope}  (이 밖에는 쓰지 않습니다)")
    say("")

    session: str | None = None
    scene_method: str | None = None
    errors: list[dict] = []
    started = time.time()

    for round_no in range(1, args.rounds + 1):
        payload: dict = {
            "scope": scope,
            "unityVersion": read_version(project),
            "errors": errors,
            "project": read_scope(project, scope),
        }
        if session:
            payload["sessionId"] = session
        else:
            payload["want"] = args.want

        say(f"[{round_no}판] 로키에게 보냅니다"
            + (f" (오류 {len(errors)}개)" if errors else "") + "…")
        reply = post(args.url, args.key, payload, timeout=600)

        session = reply.get("sessionId") or session
        if reply.get("note"):
            say(f"  로키: {reply['note']}")
        if reply.get("refused"):
            say(f"  울타리 밖이라 로키가 거절당한 파일: {', '.join(reply['refused'])}")

        if reply.get("status") != "running":
            return finish(reply, time.time() - started)

        files = reply.get("files") or []
        if not files:
            say("  낼 파일이 없다고 합니다. 멈춥니다.")
            return 1
        if write_files(project, files, scope) == 0:
            say("  쓸 수 있는 파일이 하나도 없었습니다. 멈춥니다.")
            return 1

        # 씬 메서드가 있으면 **같은 실행에서** 부른다. 두 번 켜면 두 배 걸리고,
        # 컴파일이 깨졌을 땐 어차피 메서드가 안 불리므로 한 번이면 충분하다.
        scene_method = reply.get("sceneMethod") or scene_method
        say("  유니티를 켭니다…"
            + (f" (씬: {scene_method})" if scene_method else ""))
        code, text = run_unity(unity, project, log, scene_method,
                               args.unity_timeout)
        if LOCKED in text:
            say("  유니티가 이미 이 프로젝트를 열고 있습니다. 에디터를 닫고 다시 시작해 주십시오.")
            return 1

        errors = parse_errors(text, project)
        if not errors and scene_method:
            # 컴파일은 됐는데 씬을 짓다 터진 것. 이것도 오류로 돌려보낸다 —
            # 그래야 이 고리가 재는 것이 "문법이 맞다"에서 "씬이 실제로
            # 만들어졌다"까지 넓어진다.
            errors = parse_runtime(text, scene_method)
        say(f"  유니티 종료코드 {code}, 오류 {len(errors)}개")
        if errors:
            for e in errors[:5]:
                say(f"    {e['file']}({e['line']}): {e['message']}")
            if len(errors) > 5:
                say(f"    … 그 외 {len(errors) - 5}개")

    say(f"{args.rounds}판을 채웠습니다. 여기서 멈추고 사람에게 넘깁니다.")
    return 1


def finish(reply: dict, seconds: float) -> int:
    """끝났을 때 무엇을 말할 것인가.

    컴파일이 통과해도 "됐다"고 말하지 않는다. 문법이 맞다는 뜻이지 원하던 것이
    됐다는 뜻이 아니다. 그건 사람이 켜 보고 판정한다.
    """
    status = reply.get("status")
    say("")
    say(f"끝: {status} ({seconds / 60:.1f}분)")
    if reply.get("why"):
        say(reply["why"])

    for e in reply.get("remaining") or []:
        say(f"  남은 오류 {e.get('file')}({e.get('line')}): {e.get('message')}")

    criteria = reply.get("criteria") or []
    if criteria:
        say("")
        say("합격 기준 — 아직 확인되지 않았습니다. 컴파일은 문법이 맞다는 뜻일 뿐입니다:")
        for c in criteria:
            say(f"  · {c.get('when')} → {c.get('then')}")
    return 0 if status == "compiled" else 1


def read_version(project: Path) -> str:
    f = project / "ProjectSettings" / "ProjectVersion.txt"
    if not f.exists():
        return ""
    for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("m_EditorVersion:"):
            return line.split(":", 1)[1].strip()
    return ""


def find_unity(project: Path) -> Path | None:
    """프로젝트가 적어 둔 버전의 에디터를 찾는다.

    아무 버전이나 잡으면 프로젝트를 통째로 다른 버전으로 올려 버린다 — 되돌릴
    수 없는 일이라, 못 찾으면 찾은 척하지 않고 물어본다.
    """
    version = read_version(project)
    if not version:
        return None
    for base in [
        Path(r"C:\Program Files\Unity\Hub\Editor"),
        Path(r"C:\Program Files (x86)\Unity\Hub\Editor"),
        Path.home() / "Unity" / "Hub" / "Editor",
    ]:
        candidate = base / version / "Editor" / "Unity.exe"
        if candidate.exists():
            return candidate
    return None


if __name__ == "__main__":
    sys.exit(main())
