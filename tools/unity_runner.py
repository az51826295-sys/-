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
import base64
import json
import os
import re
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# 서버가 몇 번 연속 거절하면 그 일이 안 되는 것으로 본다. 지나가는 일과
# 안 되는 일을 가르는 자리다 — 없으면 20초마다 같은 일을 다시 집는다.
MAX_REFUSALS = 3

DEFAULT_URL = "https://rookery-web-production.up.railway.app"

# 유니티가 로그에 오류를 적는 모양. 파일(줄,칸): error CSxxxx: 메시지
ERROR_LINE = re.compile(
    r"^(?P<file>.+\.cs)\((?P<line>\d+),\d+\):\s*error\s+(?P<code>[A-Z]+\d+):\s*(?P<msg>.+)$"
)

# 컴파일 말고 실행 중에 터진 것. 씬을 코드로 지을 때 이쪽으로 난다.
EXCEPTION_LINE = re.compile(r"^(?P<kind>\w*Exception|Error):\s*(?P<msg>.+)$")

# 프로젝트가 이미 열려 있으면 배치모드가 붙지 못한다. 흔한 막힘이라 따로 잡는다.
LOCKED = "Multiple Unity instances cannot open the same project"


# 자물쇠를 이만큼 안 만졌으면 주인이 죽은 것으로 본다. 한 판(유니티 한 번
# 켜기)이 몇 분 걸리므로 그보다 넉넉해야 멀쩡한 심부름꾼을 쫓아내지 않는다.
STALE_LOCK_SECONDS = 30 * 60


class AlreadyRunning(Exception):
    """이 프로젝트에 심부름꾼이 이미 있다."""


class Lock:
    """한 프로젝트에 하나만.

    도는 동안 계속 만져 두고(`touch`), 나갈 때 지운다. 죽어서 못 지운 자물쇠는
    한참 뒤에 다음 사람이 가져간다.
    """

    def __init__(self, project: Path):
        self.path = project / "rookery-runner.lock"

    def take(self) -> None:
        if self.path.exists():
            age = time.time() - self.path.stat().st_mtime
            if age < STALE_LOCK_SECONDS:
                raise AlreadyRunning(
                    f"이 프로젝트에 심부름꾼이 이미 돌고 있습니다 "
                    f"({int(age)}초 전에 살아 있었습니다).\n"
                    f"그것을 먼저 멈추십시오. 정말 죽은 것이라면 "
                    f"{self.path} 를 지우고 다시 시작하십시오."
                )
            say(f"(자물쇠가 {int(age / 60)}분째 안 만져져 가져갑니다.)")
        self.path.write_text(str(os.getpid()), encoding="utf-8")

    def touch(self) -> None:
        try:
            self.path.write_text(str(os.getpid()), encoding="utf-8")
        except OSError:
            pass

    def release(self) -> None:
        try:
            self.path.unlink()
        except OSError:
            pass


class ServerRefused(Exception):
    """서버가 이번 요청을 거절했다.

    프로세스를 끝내지 않는다. 지나가는 일일 수도 있고, 그때 대기 모드가 통째로
    꺼지면 켜 둔 의미가 없다. 몇 번 다시 해 보고도 안 되면 그때 포기한다.
    """


# 윈도우 콘솔은 cp949 다. 모델이 낸 문장에 줄표(—) 하나만 섞여도 `print` 가
# 죽고, **그 순간 고리가 통째로 멈춘다.** 실제로 그렇게 멈췄다(09-01 설계 판).
#
# 이 병은 이 저장소에서만 세 번째다: genesis 에서 한국어 실패 메시지가 cp949 에
# 죽어 FAIL 이 UNDEFINED 로 바뀌었고(`888e5ec`), 오늘 아침 유니티 AI 심부름꾼에서
# 판정문 대신 역추적이 떴다. **말하다가 죽는 것은 말의 문제가 아니라 통로의
# 문제라, 통로에서 막는다.**
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def say(text: str) -> None:
    # 그래도 못 찍는 글자가 남을 수 있다. 찍기에 실패했다고 일이 멈추지는 않는다 —
    # 화면에 글자 하나가 덜 나오는 것과 고리가 멈추는 것은 비교할 일이 아니다.
    try:
        print(text, flush=True)
    except UnicodeEncodeError:
        print(text.encode("ascii", "replace").decode("ascii"), flush=True)


def diagnose_reach(url: str) -> str | None:
    """서버에 닿는가. 안 닿으면 **왜 안 닿는지까지** 말한다.

    2026-09-01 에 이 심부름꾼이 `[SSL: WRONG_VERSION_NUMBER]` 세 줄만 남기고
    죽었다. 그 문장으로는 서버가 죽은 것인지, 이 기계가 이상한 것인지, 우리가
    주소를 틀린 것인지 알 수 없다. 알아보는 데 반나절이 갔다.

    그날 밝혀진 것: 같은 IP·같은 포트인데 **ClientHello 의 SNI 에 우리 호스트
    이름이 들어 있을 때만** 악수가 깨졌다(SNI 를 빼거나 다른 이름을 넣으면
    성공). 이 기계와 서버 사이 어딘가가 호스트 이름을 보고 끊는다는 뜻이다.
    브라우저는 되는데, 그건 크로미움이 ECH·HTTP/3 를 쓰기 때문이고 파이썬
    `ssl` 은 둘 다 못 쓴다.

    고칠 수 있는 것이 아니라서 **이름을 붙여 준다.** 이름이 붙은 벽은 사장님이
    도메인을 바꾸든 길을 바꾸든 정할 수 있지만, 이름이 없으면 매번 반나절이 간다.
    """
    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname or ""
    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    try:
        with socket.create_connection((host, port), timeout=10):
            pass
    except OSError as e:
        return (f"{url} 에 연결하지 못했습니다: {e}\n"
                f"  주소가 맞는지, 서버가 살아 있는지 보십시오.")

    if parsed.scheme != "https":
        return None

    def handshake(sni: str | None) -> str | None:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        try:
            with socket.create_connection((host, port), timeout=10) as raw:
                with ctx.wrap_socket(raw, server_hostname=sni):
                    return None
        except Exception as e:  # noqa: BLE001 - 무엇이 나오든 이름을 붙여 돌려준다
            return f"{type(e).__name__}: {e}"

    ours = handshake(host)
    if ours is None:
        return None

    # 우리 이름으로는 깨지는데 다른 이름으로는 되는가. 그러면 서버 문제가 아니다.
    neutral = handshake("example.com")
    if neutral is None:
        return (
            f"{host} 로는 TLS 악수가 깨지는데, **같은 IP 에 다른 이름으로는 됩니다.**\n"
            f"  깨진 이유: {ours}\n"
            "  이 기계와 서버 사이 어딘가가 호스트 이름(SNI)을 보고 끊고 있습니다.\n"
            "  서버는 살아 있고 브라우저로는 열립니다 — 스크립트만 못 붙습니다.\n"
            "  지금 할 수 있는 것: 로컬 서버로 우회 (npm run dev 뒤 --url http://localhost:3000)\n"
            "  오래 갈 답: 이 주소가 아닌 우리 도메인을 붙이는 것."
        )

    return (f"{host} 에 TLS 악수가 안 됩니다: {ours}\n"
            f"  다른 이름으로도 안 되니 서버나 네트워크 쪽입니다.")


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
        raise ServerRefused(f"로키가 거절했습니다 ({error.code}): {detail}")
    except urllib.error.URLError as error:
        raise ServerRefused(f"로키에 닿지 못했습니다: {error.reason}")


def inside_scope(path: str, scope: str) -> bool:
    """울타리. 판마다 사람에게 묻지 않는 대신 이 검사가 있다.

    여기가 뚫리면 자동으로 도는 물건이 프로젝트 아무 데나 쓸 수 있고, 그건
    협업이 아니라 사고다.
    """
    p = path.replace("\\", "/")
    return p.startswith(scope) and p.startswith("Assets/") and ".." not in p


UNDO_FILE = ".rookery-undo.json"


def undo_ledger(project: Path) -> dict:
    """무엇을 손댔는지 적어 두는 곳.

    `Assets/` **밖에** 둔다. 안에 두면 유니티가 이것까지 가져다 임포트하고,
    되돌리기 기록이 프로젝트 자산이 되어 버린다.
    """
    f = project / UNDO_FILE
    if not f.exists():
        return {}
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        # 기록이 깨졌다고 일을 세우지 않는다. 대신 새로 쌓는다.
        return {}


def remember(project: Path, session: str, path: str, existed: bool) -> None:
    led = undo_ledger(project)
    row = led.setdefault(session or "unknown", {"overwritten": [], "created": []})
    key = "overwritten" if existed else "created"
    if path not in row[key]:
        row[key].append(path)
    (project / UNDO_FILE).write_text(
        json.dumps(led, ensure_ascii=False, indent=2), encoding="utf-8")


def write_files(project: Path, files: list[dict], scope: str,
                session: str = "") -> int:
    written = 0
    for f in files:
        path = (f.get("path") or "").replace("\\", "/")
        if not inside_scope(path, scope):
            say(f"  울타리 밖이라 건너뜁니다: {path}")
            continue
        target = project / path
        target.parent.mkdir(parents=True, exist_ok=True)
        existed = target.exists()
        if existed:
            # 백업은 **처음 한 번만.** 판마다 덮으면 몇 판 뒤엔 백업이 로키가
            # 지난 판에 쓴 것이 되어, 진짜 원본이 사라진다.
            backup = target.with_suffix(target.suffix + ".before-rookery")
            if not backup.exists():
                shutil.copy2(target, backup)
        # 덮어쓴 것은 백업이 있었지만 **새로 만든 것은 아무 데도 안 적혔다.**
        # 그래서 지금까지 되돌리기가 반쪽이었다: 원본은 살릴 수 있어도 로키가
        # 새로 만든 파일은 사람이 하나씩 찾아 지워야 했다.
        remember(project, session, path, existed)
        target.write_text(f.get("contents") or "", encoding="utf-8")
        say(f"  썼습니다: {path}")
        written += 1
    return written


def write_images(project: Path, images: list[dict], scope: str,
                 session: str = "") -> int:
    """그림을 파일로 쓴다.

    글 파일과 길이 갈리는 유일한 자리다 — 본문이 문자열이 아니라 base64 라
    바이트로 써야 한다. 나머지(울타리 검사, 되돌리기 기록)는 똑같이 거친다.
    **그림이라고 울타리 밖에 쓸 수 있게 두면 울타리가 반쪽이 된다.**
    """
    written = 0
    for im in images:
        path = (im.get("path") or "").replace("\\", "/")
        if not inside_scope(path, scope):
            say(f"  울타리 밖이라 건너뜁니다: {path}")
            continue
        b64 = im.get("base64") or ""
        if not b64:
            say(f"  빈 그림입니다: {path}")
            continue
        target = project / path
        target.parent.mkdir(parents=True, exist_ok=True)
        existed = target.exists()
        if existed:
            backup = target.with_suffix(target.suffix + ".before-rookery")
            if not backup.exists():
                shutil.copy2(target, backup)
        remember(project, session, path, existed)
        target.write_bytes(base64.b64decode(b64))
        say(f"  그렸습니다: {path}")
        written += 1
    return written


def undo(project: Path, which: str) -> int:
    """로키가 손댄 것을 되돌린다.

    **어디로 되돌아가는지 분명히 해 둔다.** 판 단위가 아니라 *로키가 이 파일을
    처음 건드리기 전*으로 돌아간다 — 백업을 처음 한 번만 뜨기 때문이다. 세 판째
    수정만 무르고 두 판째를 남기는 일은 여기서 안 된다. 할 수 있는 척하는 것보다
    못한다고 적어 두는 편이 낫다.
    """
    led = undo_ledger(project)
    if not led:
        say("되돌릴 기록이 없습니다.")
        return 0

    if which in ("last", ""):
        which = list(led.keys())[-1]
    row = led.get(which)
    if not row:
        say(f"그런 세션이 기록에 없습니다: {which}")
        say("  있는 것: " + ", ".join(led.keys()))
        return 1

    restored = removed = missing = 0
    for path in row.get("overwritten", []):
        target = project / path
        backup = target.with_suffix(target.suffix + ".before-rookery")
        if backup.exists():
            shutil.copy2(backup, target)
            say(f"  되돌렸습니다: {path}")
            restored += 1
        else:
            # 백업이 없어졌으면 그냥 둔다. 못 되돌린 것을 되돌렸다고 말하지 않는다.
            say(f"  백업이 없어 그대로 둡니다: {path}")
            missing += 1
    for path in row.get("created", []):
        target = project / path
        if target.exists():
            target.unlink()
            say(f"  지웠습니다: {path}")
            removed += 1

    del led[which]
    (project / UNDO_FILE).write_text(
        json.dumps(led, ensure_ascii=False, indent=2), encoding="utf-8")

    say(f"되돌림 {restored}개 · 지움 {removed}개"
        + (f" · 못 되돌림 {missing}개" if missing else ""))
    say("유니티가 켜져 있으면 창을 눌러 다시 컴파일하게 하십시오.")
    return 0


def pin_paths(errors: list[dict], scene_method: str | None,
              scope: str) -> set[str]:
    """내용을 반드시 보여 줘야 하는 파일.

    두 가지다.

    **오류가 난 파일.** 이름만 보내 놓고 고치라고 하면 고칠 것을 안 보여 준
    것이다. 크기로 고르는 규칙에 이게 걸리면 고리가 조용히 헛돈다.

    **씬을 짓는 파일.** 이어 짓는 판마다 손대는 자리인데, 이 프로젝트에서는
    그게 제일 큰 파일이라 크기로만 고르면 **늘** 빠진다.
    """
    pinned: set[str] = set()
    for e in errors or []:
        p = (e.get("path") or "").replace("\\", "/")
        if p and inside_scope(p, scope):
            pinned.add(p)
    if scene_method:
        parts = [x for x in scene_method.split(".") if x]
        if len(parts) >= 2:
            pinned.add("*/" + parts[-2] + ".cs")
    return pinned


def read_scope(project: Path, scope: str, max_files: int = 24,
               max_chars: int = 120_000, max_paths: int = 400,
               pin: set[str] | None = None) -> list[dict]:
    """울타리 안의 지금 파일들. 고치려면 지금 뭐가 있는지 봐야 한다.

    **이름은 다 보내고, 내용만 자른다.**

    전에는 24개/120KB 에서 목록을 통째로 끊었다. 그러면 서버가 그 목록을
    "지금 프로젝트에 있는 파일" 이라고 모델에게 준다 — 25번째 파일은 모델에게
    **없는 파일**이 된다. 모델은 이미 있는 클래스를 다시 만들고, 이름이
    부딪히고, 컴파일이 깨지고, 우리는 그 판을 또 산다. 프로젝트가 클수록
    더 그런다.

    못 본 것과 없는 것을 구분하지 않으면, **못 볼수록 잘 통과한다** — 이 고리가
    계속 밟는 자리다. 이름 한 줄은 거의 공짜고 비싼 것은 내용이므로, 자르는
    것도 내용만 자른다.

    `max_paths` 는 이름까지도 무한정 보내지 않기 위한 것이다. 여기 걸리면
    프롬프트가 프로젝트 크기를 따라 자라는 문제가 다시 시작되므로 말한다.
    """
    root = project / scope
    if not root.exists():
        return []

    paths = sorted(root.rglob("*.cs"))
    dropped = max(0, len(paths) - max_paths)
    paths = paths[:max_paths]

    # 예산을 **작은 것부터** 채운다.
    #
    # 전에는 알파벳 순으로 앞에서부터 채웠다. 이 프로젝트에서는 `Editor/` 의
    # 씬 빌더들이 제일 크고 제일 앞이라, 그 열한 개가 120KB 를 다 먹고
    # `Gameplay/` 는 **한 개도 못 갔다.** 39개 중 13개만 나갔고, 나머지는
    # 모델에게 없는 파일이었다. 자르는 규칙이 "무엇을 보여 줄지"를 정하고
    # 있었는데, 그 규칙에 뜻이 없었던 것이다.
    #
    # 작은 것부터 담으면 같은 예산으로 **가장 많은 파일이 온전히** 들어간다.
    # 반쪽으로 잘라 넣지 않는 이유는, 잘린 C# 은 모델에게 "여기서 끝나는
    # 클래스"로 보이기 때문이다 — 그건 못 본 것보다 나쁘다.
    def rel_of(p: Path) -> str:
        return str(p.relative_to(project)).replace("\\", "/")

    def is_pinned(p: Path) -> bool:
        rel = rel_of(p)
        for want in (pin or ()):
            if want.startswith("*/"):
                if rel.endswith(want[1:]):
                    return True
            elif rel == want:
                return True
        return False

    # 박아 둔 것부터 담는다. 예산에는 같이 세지만 밀려나지는 않는다 —
    # 밀려나면 그게 이 규칙을 만든 이유가 그대로 다시 생긴다.
    chosen: set[Path] = set(p for p in paths if is_pinned(p))
    total = sum(p.stat().st_size for p in chosen)

    sized = sorted(((p.stat().st_size, p) for p in paths if p not in chosen),
                   key=lambda x: x[0])
    for size, p in sized:
        if len(chosen) >= max_files or total + size > max_chars:
            continue
        total += size
        chosen.add(p)

    out: list[dict] = []
    for p in paths:
        rel = rel_of(p)
        if p in chosen:
            out.append({"path": rel,
                        "contents": p.read_text(encoding="utf-8", errors="replace")})
        else:
            out.append({"path": rel, "clipped": True})
    full = len(chosen)
    clipped = len(out) - full
    # 자른 것을 말한다. 조용히 자르면 "다 봤다"로 읽힌다.
    if clipped:
        say(f"  파일 {full + clipped}개 중 {full}개만 내용을 보냅니다"
            f" (나머지 {clipped}개는 이름만).")
    if dropped:
        say(f"  파일이 {max_paths}개를 넘어 {dropped}개는 이름도 못 보냅니다."
            " — 이 울타리는 한 세션에 담기에 너무 큽니다.")
    return out


def read_packages(project: Path) -> list[str]:
    """이 프로젝트에 실제로 깔린 패키지.

    로키가 `UnityEngine.UI` 를 쓴 코드를 냈는데 그 패키지가 프로젝트에 없어서
    16개 오류가 났고, 로키는 패키지를 못 깔아서 코드만 고치다 멈췄다. 고칠 수
    없는 것을 고치려 한 것이다.

    무엇이 있는지 **먼저 알려 주면** 없는 것을 쓰지 않는다. 이것이 오류를
    고치는 것보다 싸다 — 오류는 판을 한 번 더 돌게 하고, 판마다 값이 나간다.
    """
    manifest = project / "Packages" / "manifest.json"
    if not manifest.exists():
        return []
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return []
    deps = data.get("dependencies") or {}
    # 엔진 기본 모듈은 뺀다. 그건 늘 있어서 알려 줘 봐야 자리만 찬다.
    return sorted(
        f"{name}@{version}"
        for name, version in deps.items()
        if not name.startswith("com.unity.modules.")
    )


def read_input_handler(project: Path) -> str | None:
    """이 프로젝트가 어느 입력 방식을 켜 두었는가.

    **컴파일러가 못 보는 자리다.** 프로젝트가 새 입력 시스템 하나만 켜 두면
    옛 `UnityEngine.Input` 은 컴파일은 통과하고 **실행할 때 던진다.** 그러면
    게임은 켜지고 그려지는데 키를 눌러도 아무 일이 없다 — 그리고 우리는
    "안 움직인다" 와 "내 입력이 안 갔다" 를 구분할 수 없다.

    실제로 그렇게 한 판을 통째로 미확인으로 남겼다(08-31). 생성된 조작 코드는
    전부 `Input.GetAxisRaw` 였고, 이 프로젝트는 새 입력 시스템 전용이었다.

    ProjectSettings 의 `activeInputHandler`: 0 옛것, 1 새것, 2 둘 다.
    """
    settings = project / "ProjectSettings" / "ProjectSettings.asset"
    if not settings.exists():
        return None
    try:
        text = settings.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    found = re.search(r"^\s*activeInputHandler:\s*(\d+)", text, re.MULTILINE)
    if not found:
        return None
    return {"0": "legacy", "1": "new", "2": "both"}.get(found.group(1))


def run_unity(unity: Path, project: Path, log: Path,
              execute_method: str | None, timeout: int) -> tuple[int, str]:
    """유니티를 켠다. 돌아오는 것은 종료 코드와 로그 전문.

    로그는 **판마다 새 이름**을 쓴다. 처음에는 한 파일을 지우고 다시 썼는데,
    윈도우에서 앞선 유니티의 핸들이 남아 있으면 지우기가 WinError 32 로 터지고
    고리가 통째로 멈췄다. 유니티가 이미 끝난 뒤에도 그랬다.

    지울 수 있느냐에 고리가 걸려 있을 이유가 없다. 새 이름을 쓰면 그 문제
    자체가 없어진다.
    """
    log = log.with_name(f"{log.stem}-{int(time.monotonic() * 1000)}{log.suffix}")
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

    # 판마다 파일이 하나씩 생기므로 지나간 것은 치운다. 못 지워도 그냥 둔다 —
    # 청소가 안 되는 것으로 고리를 멈추는 것이 원래 문제였다.
    for old_log in sorted(log.parent.glob(f"{log.stem.rsplit('-', 1)[0]}-*.log"))[:-3]:
        try:
            old_log.unlink()
        except OSError:
            pass

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
    # 2D 인가 3D 인가. **부르는 쪽이 정한다.**
    #
    # 만들려는 것의 문장에서 짐작하게 두면("점프 게임" 이면 2D?) 판마다
    # 다르게 굴고, 그러면 무엇을 재는지 알 수 없게 된다.
    # 그림을 고리 안에서 그릴지.
    #
    # 기본은 안 그린다(09-01 사장님 지시). 프로토타입을 먼저 만들고, 사람이
    # 보고 승인하면 그때 넣는다. 아직 될지 모르는 게임에 그림값을 먼저 쓰지
    # 않고, 승인 문을 건너뛰지도 않는다.
    parser.add_argument("--art", action="store_true",
                        help="옛 방식대로 고리 안에서 그림을 그린다")
    # **기본은 돌려 보는 것이다.**
    #
    # 컴파일에서 멈추면 "문법이 맞다"까지만 알고 끝난다. 끄는 길은 남겨 두되
    # (급할 때가 있다), 끄면 무엇을 못 재게 되는지 이름에 적어 둔다.
    parser.add_argument("--no-play", dest="play", action="store_false",
                        help="컴파일까지만 하고 돌려 보지 않는다 (실제로 되는지 안 잼)")
    parser.add_argument("--dim", choices=["2d", "3d"],
                        default=os.environ.get("ROOKERY_DIM", "2d"),
                        help="2d 또는 3d. 3D 는 기본 도형과 재질로 짓는다")
    parser.add_argument("--rounds", type=int, default=6,
                        help="여기까지만 돈다. 서버에도 같은 뚜껑이 있다.")
    parser.add_argument("--unity-timeout", type=int, default=1200)
    # 로키가 한 판에 답하는 데 얼마나 기다릴지.
    #
    # 600초로 박아 두었다가 3D 첫 판에서 끊겼다. 울타리에 파일이 쌓이면 프롬프트가
    # 같이 커지고(12만 자대), 그만큼 한 판이 길어진다. **끊기면 그 판에 쓴 값이
    # 통째로 버려지므로**, 기다리는 쪽이 싸다.
    parser.add_argument("--server-timeout", type=int, default=1200,
                        help="로키의 한 판 응답을 기다리는 초")
    parser.add_argument(
        "--watch", action="store_true",
        help="대화창에서 연 일을 기다렸다가 알아서 집어 간다.")
    parser.add_argument(
        "--every", type=int, default=20,
        help="대기 모드에서 몇 초마다 물어볼지.")
    parser.add_argument(
        "--undo", nargs="?", const="last", metavar="세션",
        help="로키가 손댄 것을 되돌린다. 세션 id 를 주거나 비우면 마지막 것.")
    parser.add_argument(
        "--undo-list", action="store_true",
        help="되돌릴 수 있는 것이 무엇인지 보여만 준다.")
    args = parser.parse_args()

    # 되돌리기는 서버도 유니티도 부르지 않는다 — 이미 이 기계에 있는 것을
    # 제자리에 놓는 일이다. 열쇠가 없다고, 유니티를 못 찾는다고 못 되돌리면
    # 정작 필요한 순간에 안 되는 되돌리기가 된다.
    project_for_undo = Path(args.project)
    if args.undo_list:
        led = undo_ledger(project_for_undo)
        if not led:
            say("되돌릴 기록이 없습니다.")
            return 0
        for sid, row in led.items():
            say(f"{sid}: 덮어씀 {len(row.get('overwritten', []))}개 · "
                f"새로 만듦 {len(row.get('created', []))}개")
        return 0
    if args.undo:
        return undo(project_for_undo, args.undo)

    if not args.key:
        say("회사 유니티 열쇠가 필요합니다 (ROOKERY_KEY 또는 --key).")
        return 2
    # 대기 모드는 무엇을 만들지 여기서 듣지 않는다. 대화창에서 이미 들었고,
    # 서버가 설계도를 들고 있다.
    if not args.want and not args.watch:
        say("무엇을 만들지 한 줄 적어 주십시오. (또는 --watch 로 기다리십시오.)")
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
    say(f"차원: {args.dim}")
    say("")

    # 서버에 닿는지 **먼저** 본다. 안 닿으면 유니티를 켜기 전에 끝난다 —
    # 켜고 나서 알면 되돌릴 것이 생기고, 사람은 십 분을 기다린 뒤에 안다.
    trouble = diagnose_reach(args.url)
    if trouble:
        say(trouble)
        return 2

    lock = Lock(project)
    try:
        lock.take()
    except AlreadyRunning as error:
        say(str(error))
        return 2

    try:
        if args.watch:
            return watch(args, project, unity, scope, log, lock)
        return drive(args, project, unity, scope, log, lock=lock)
    finally:
        lock.release()


def drive(args, project: Path, unity: Path, scope: str, log: Path,
          resume: str | None = None, lock: 'Lock | None' = None) -> int:
    """세션 하나를 끝까지 돈다.

    `resume` 이 있으면 대화창에서 이미 설계된 일을 이어받는다 — 그때는
    무엇을 만들지 다시 말하지 않는다. 서버가 설계도를 들고 있고, 여기서
    또 말하면 같은 일을 두 번 설계하게 된다.
    """
    session: str | None = resume
    scene_method: str | None = None
    errors: list[dict] = []
    started = time.time()
    compiles = 0
    calls = 0
    refusals = 0

    # **아직 아무것도 재지 않았다.**
    #
    # 서버는 "오류 0개" 를 통과로 읽는다. 그런데 이어받은 세션은 시작할 때
    # 오류 목록이 비어 있고, 그건 "오류가 없다" 가 아니라 "아직 안 봤다" 다.
    # 그대로 보냈더니 유니티를 한 번도 안 켜고 0.1분 만에 "통과" 가 나왔다 —
    # 씬은 만들어지지도 않았는데.
    #
    # 미측정을 통과로 읽지 않는다. 이어받았으면 **먼저 재고** 시작한다.
    measured = False

    # 호출 수에도 뚜껑을 씌운다. 판(컴파일)과 달리 "더 써라"는 유니티를 켜지
    # 않으므로 서버의 판 세기에 안 걸린다 — 여기서 세지 않으면 설계도가
    # 이상할 때 조용히 계속 돈다.
    max_calls = args.rounds * 12

    while compiles < args.rounds and calls < max_calls:
        calls += 1
        if lock is not None:
            lock.touch()
        payload: dict = {
            "scope": scope,
            "unityVersion": read_version(project),
            "errors": errors,
            "project": read_scope(project, scope,
                                  pin=pin_paths(errors, scene_method, scope)),
            "packages": read_packages(project),
            # 어느 입력 방식이 켜져 있는지. 이걸 안 보내면 컴파일은 통과하고
            # 키를 눌러도 아무 일이 없는 게임이 나온다.
            "inputHandler": read_input_handler(project),
            "dimension": args.dim,
            "art": args.art,
            # 이번 요청에 실린 오류가 **실제로 재 본 결과**인가.
            #
            # 빈 목록은 "오류가 없다" 와 "아직 안 봤다" 둘 다로 읽힐 수 있고,
            # 서버는 그 둘을 구분할 방법이 없다. 그래서 여기서 말해 준다.
            "measured": measured,
        }
        if session:
            payload["sessionId"] = session
        else:
            payload["want"] = args.want

        say(f"[{compiles + 1}판] 로키에게 보냅니다"
            + (f" (오류 {len(errors)}개)" if errors else "") + "…")
        try:
            reply = post(args.url, args.key, payload, timeout=args.server_timeout)
            refusals = 0
        except ServerRefused as error:
            refusals += 1
            say(f"  {error}")
            if refusals >= MAX_REFUSALS:
                why = f"서버가 {MAX_REFUSALS}번 연속 거절했습니다: {error}"
                say(why)
                give_up(args, session, why)
                return 1
            # 잠깐 쉬었다 같은 자리에서 다시. 서버가 숨을 돌릴 시간을 준다.
            time.sleep(10 * refusals)
            continue

        session = reply.get("sessionId") or session
        scene_method = reply.get("sceneMethod") or scene_method
        if reply.get("plan"):
            say("  설계도:")
            for path in reply["plan"]:
                say(f"    {path}")
        if reply.get("note"):
            say(f"  로키: {reply['note']}")
        if reply.get("refused"):
            say(f"  버린 파일: {', '.join(reply['refused'])}")

        action = reply.get("action")
        if reply.get("status") != "running" or action == "done":
            return finish(reply, time.time() - started, measured)

        files = reply.get("files") or []
        if files:
            write_files(project, files, scope, session or '')

        images = reply.get("images") or []
        if images:
            write_images(project, images, scope, session or '')

        if action == "compile" and not files and not measured:
            # 서버가 판정을 미루고 재 오라고 했다. 파일이 없어도 켠다.
            say("  아직 잰 것이 없다고 합니다. 지금 상태를 재 봅니다…")

        if action == "draw":
            # 그리는 판에는 유니티를 안 켠다. 그림만 놓고 다음 판으로 간다 —
            # 여기서 켜면 아직 코드가 없어서 오류만 잔뜩 받고, 그 오류는
            # 우리가 만든 것이 아니다.
            left = reply.get("left")
            if left is not None:
                say(f"  남은 그림 {left}장")
            errors = []
            continue

        if action == "write_more":
            # 아직 설계도가 남았다. 유니티를 켜 봐야 반쪽만 있는 상태라
            # 오류만 잔뜩 나온다 — 다 쓰고 나서 한 번에 잰다.
            left = reply.get("left")
            if left is not None:
                say(f"  남은 파일 {left}개")
            errors = []
            continue

        # 컴파일할 때. 씬 메서드가 있으면 **같은 실행에서** 부른다 — 두 번
        # 켜면 두 배 걸리고, 컴파일이 깨졌을 땐 어차피 메서드가 안 불린다.
        compiles += 1
        say("  유니티를 켭니다…"
            + (f" (씬: {scene_method})" if scene_method else ""))
        code, text = run_unity(unity, project, log, scene_method,
                               args.unity_timeout)
        if LOCKED in text:
            say("  유니티가 이미 이 프로젝트를 열고 있습니다. 에디터를 닫고 다시 시작해 주십시오.")
            # 이건 사람이 유니티를 닫으면 풀리는 것이라, 세션은 살려 둔다.
            return 1

        errors = parse_errors(text, project)
        measured = True

        # **종료코드를 버리지 않는다.**
        #
        # 유니티가 0이 아닌 코드로 죽었는데 로그에서 읽어낸 오류가 하나도 없다면,
        # 그건 "오류가 없다" 가 아니라 **"실패했는데 이유를 우리가 못 읽었다"** 다.
        # 실제로 라이선스가 풀려 컴파일조차 못 한 판을 통과로 보고했다.
        #
        # 못 읽은 것을 통과로 만들지 않는다. 로그 끝을 그대로 실어 사람이 볼 수
        # 있게 하고, 이 판은 실패로 둔다.
        if code != 0 and not errors:
            tail = [ln.strip() for ln in text.splitlines() if ln.strip()][-12:]
            errors = [{
                "file": "(유니티)",
                "line": 0,
                "message": (f"유니티가 종료코드 {code} 로 끝났는데 컴파일 오류를 "
                            f"찾지 못했습니다. 로그 끝: " + " | ".join(tail))[:1200],
            }]
            say(f"  유니티가 {code} 로 죽었는데 오류를 못 읽었습니다. 로그 끝:")
            for ln in tail[-4:]:
                say(f"    {ln[:140]}")

        if not errors and scene_method:
            # 컴파일은 됐는데 씬을 짓다 터진 것. 이것도 오류로 돌려보낸다 —
            # 그래야 이 고리가 재는 것이 "문법이 맞다"에서 "씬이 실제로
            # 만들어졌다"까지 넓어진다.
            errors = parse_runtime(text, scene_method)
        say(f"  유니티 종료코드 {code}, 오류 {len(errors)}개")
        for e in errors[:5]:
            say(f"    {e['file']}({e['line']}): {e['message']}")
        if len(errors) > 5:
            say(f"    … 그 외 {len(errors) - 5}개")

        # **울타리 밖 오류만 남았으면 더 사지 않는다.**
        #
        # 09-03 에 이걸로 다섯 판을 샀다($0.67). 오류 81개가 전부
        # `Library/PackageCache/com.unity.inputsystem/...` 안이었고, 로키는 매번
        # 정확히 답했다: "패키지 코드라 Assets/Rookery 에서는 못 고칩니다."
        # 맞는 말인데 그 말을 다섯 번 산 것이다.
        #
        # 고칠 수 없는 것을 다시 시켜 봐야 같은 답이 온다. 판 수로 막는 것은
        # 늦다 — 애초에 보내지 않는 것이 맞다.
        outside = [e for e in errors if not inside_scope(e["file"], scope)]
        if errors and len(outside) == len(errors):
            where = sorted({e["file"].split("/")[2] if e["file"].startswith(
                "Library/PackageCache/") else e["file"].rsplit("/", 1)[0]
                for e in outside})[:3]
            say("")
            say(f"  오류 {len(errors)}개가 **전부 울타리 밖**입니다:")
            for w in where:
                say(f"    {w}")
            say("  로키는 여기를 못 고칩니다. 고칠 수 없는 것을 다시 시키지 않습니다.")
            why = ("울타리 밖 코드가 깨져 있습니다. 로키가 고칠 수 있는 자리가 "
                   "아닙니다: " + ", ".join(where))
            give_up(args, session, why)
            return 1

        # ── 컴파일이 됐으면 **돌려 본다** ────────────────────────
        #
        # 여기까지가 어제까지의 끝이었다: "컴파일이 통과했습니다. 합격 기준은
        # 아직 확인되지 않았습니다." 그런데 컴파일은 문법이 맞다는 뜻일 뿐이고,
        # 09-03 에 컴파일을 통과한 게임이 **키를 눌러도 안 움직였다.**
        #
        # 돌려 봐서 떨어진 것을 컴파일 오류와 같은 자리로 돌려보낸다. 그래야
        # 이 고리가 "컴파일된다" 에서 **"실제로 된다"** 로 올라간다.
        #
        # 시험지는 울타리 밖(`Assets/RookeryTests/`)에 있다. 안에 두면 로키가
        # 게임 대신 시험을 고칠 수 있고, 그건 고치는 것이 아니라 지우는 것이다.
        if not errors and args.play:
            fails, unmeasured, measured_any = run_playmode(project, args.unity_timeout)
            for line in unmeasured:
                say(f"  못 잼: {line}")
            if not measured_any:
                # **못 쟀다고 판을 죽이지 않는다.**
                #
                # 처음에는 여기서 `give_up` 을 불렀다. 그랬더니 컴파일이 통과한
                # 판이 전부 `stopped` 로 끝났고, 그러면 화면에 **승인 버튼이 안
                # 뜬다** — 승인은 `compiled` 에서만 뜨기 때문이다.
                #
                # 못 쟀으면 사람에게 넘겨야 하는데, 그 길을 막아 버린 것이다.
                # 기계가 못 재는 자리에서 사람이 보는 것이 이 제품의 순서이므로,
                # 판은 정상으로 닫고(사람이 켜서 볼 수 있게) **못 쟀다는 사실만
                # 크게 말한다.** 화면의 "합격 기준 N개는 아직 확인되지
                # 않았습니다" 가 그대로 서 있으니 통과로 읽힐 자리도 없다.
                say("")
                say("  **돌려 봤지만 못 쟀습니다.** 통과가 아닙니다 —"
                    " 사장님이 켜서 보셔야 합니다.")
                errors = []
            if fails:
                say(f"  돌려 봤더니 {len(fails)}개가 떨어졌습니다.")
                errors = [{
                    # 울타리 안 자리로 적는다. 이건 로키가 고칠 수 있는 것이다 —
                    # 위의 '울타리 밖' 검사에 걸려서 포기하면 안 된다.
                    "file": scope.rstrip("/"),
                    "line": 0,
                    "message": "돌려 봤더니 안 됩니다: " + f,
                } for f in fails]
                for e in errors[:3]:
                    say(f"    {e['message'][:160]}")

    # 왜 나왔는지 구분해서 말한다. "판을 다 썼다"와 "왕복만 하다 끝났다"는
    # 다음에 할 일이 다르다 — 앞은 고치기가 어려웠던 것이고, 뒤는 설계도가
    # 이상해서 같은 자리를 맴돈 것이다.
    if compiles >= args.rounds:
        why = f"{args.rounds}판을 채웠습니다. 여기서 멈추고 사람에게 넘깁니다."
    else:
        why = f"컴파일까지 못 가고 왕복만 {calls}번 했습니다. 설계도를 보십시오."
    say(why)
    give_up(args, session, why)
    return 1


def give_up(args, session: str | None, why: str) -> None:
    """더 못 간다고 서버에 알린다.

    말하지 않으면 세션이 계속 '진행 중' 으로 남고, 대기 중인 러너가 그것을
    다시 집어 간다. 못 하는 일을 되풀이하면서 판마다 값을 치르게 된다.
    """
    if not session:
        return
    try:
        post(args.url, args.key,
             {"sessionId": session, "giveUp": True, "why": why}, timeout=60)
        say("  (로키에게 멈춘다고 알렸습니다.)")
    except SystemExit as error:
        # 알리지 못한 것으로 멈추기를 멈추지 않는다. 다만 조용히 넘어가지도
        # 않는다 — 이 세션은 다음에 또 집혀 갈 수 있다.
        say(f"  (멈춘다고 알리지 못했습니다: {error})")


def pending(url: str, key: str) -> dict | None:
    """서버에 내 일이 있는지 묻는다. 없으면 None."""
    request = urllib.request.Request(
        url.rstrip("/") + "/api/unity/pending",
        headers={"x-rookery-key": key},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8")).get("session")
    except Exception as error:
        # 잠깐 못 닿는 것으로 대기를 끝내지 않는다. 다음 차례에 또 묻는다.
        say(f"(서버에 못 닿았습니다: {error})")
        return None


def watch(args, project: Path, unity: Path, scope: str, log: Path,
          lock: 'Lock | None' = None) -> int:
    """대화창에서 연 일을 기다렸다가 집어 간다.

    이것이 없으면 대화창에서 연 일을 사람이 터미널에 다시 옮겨 적어야 하고,
    그러면 연결한 것이 아니라 창구가 둘이 된다.
    """
    say(f"기다립니다. {args.every}초마다 로키에게 물어봅니다. (Ctrl+C 로 멈춤)")
    while True:
        if lock is not None:
            # 기다리는 동안에도 살아 있다고 알린다. 안 그러면 조용히 기다리는
            # 심부름꾼의 자물쇠가 낡은 것으로 보여 남이 가져간다.
            lock.touch()
        found = pending(args.url, args.key)
        if found:
            say("")
            say(f"일이 왔습니다: {found['want'][:80]}")
            try:
                drive(args, project, unity, found.get("scope") or scope, log,
                      resume=found["id"], lock=lock)
            except Exception as error:
                # 한 세션이 터져도 기다리기는 계속한다. 여기서 끝나면 켜 둔
                # 것과 꺼 둔 것이 같아지고, 사람은 켜 둔 줄 안다.
                say(f"  이 일에서 터졌습니다: {error}")
        time.sleep(args.every)


def finish(reply: dict, seconds: float, measured: bool = True) -> int:
    """끝났을 때 무엇을 말할 것인가.

    컴파일이 통과해도 "됐다"고 말하지 않는다. 문법이 맞다는 뜻이지 원하던 것이
    됐다는 뜻이 아니다. 그건 사람이 켜 보고 판정한다.
    """
    status = reply.get("status")
    say("")

    if status == "compiled" and not measured:
        # 재지 않고 통과를 받은 것이다. 서버는 "오류 0개" 를 통과로 읽는데,
        # 우리가 이번에 유니티를 켜지 않았으면 그 0 은 "없다" 가 아니라
        # "안 봤다" 다. 그 둘을 같게 읽는 순간 판정이 있으나 마나가 된다.
        say("끝: 통과라고 왔지만 **이번에 아무것도 재지 않았습니다.**")
        say("유니티를 한 번도 켜지 않았으므로 통과로 읽지 않습니다.")
        return 1

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
    for base in unity_bases():
        candidate = base / version / "Editor" / "Unity.exe"
        if candidate.exists():
            return candidate
    return None


def run_playmode(project: Path, timeout: int) -> tuple[list[str], list[str], bool]:
    """게임을 켜서 눌러 본다. **떨어진 것과 못 잰 것을 나눠서** 돌려준다.

    떨어진 것만 로키에게 보낸다. 못 잰 것(`Inconclusive`)은 결함이 아니라
    **재지 못한 것**이라, 그걸 고치라고 보내면 로키가 없는 문제를 고치려 든다.
    대신 사람에게는 말한다 — 조용히 없애면 못 잰 것이 없어진다.

    셋째 칸은 **재기는 했는가**다. "떨어진 것이 없다" 와 "잰 적이 없다" 는
    다르다 — 처음 지었을 때 이걸 안 나눠서, 시험이 0개 돌았는데 고리가
    "컴파일 통과" 로 끝냈다. 못 잰 것이 통과로 흘러갔다.
    """
    # 여기서 늦게 들여온다. `unity_playmode` 가 이 파일을 들여오므로 위에서
    # 하면 서로 물린다.
    import unity_playmode as pm

    trouble = pm.install_tests(project)
    if trouble:
        # 시험지를 못 넣는 것은 게임의 결함이 아니다. 그대로 말하고 넘어간다.
        return [], [f"시험지를 못 넣었습니다: {trouble}"], False

    unity = find_unity(project)
    if not unity:
        return [], ["에디터를 못 찾아 돌려 보지 못했습니다."], False

    # **앞 판이 남긴 자물쇠를 치운다.**
    #
    # 씬을 지으려고 켠 유니티가 `Temp/UnityLockfile` 을 남기면, 바로 뒤따르는
    # 시험이 거기 걸려 **0개**로 끝난다. `unity_playmode.py` 를 직접 부르면
    # 그 안의 `main()` 이 이 검사를 하는데, 여기서는 유니티를 직접 켜느라
    # 건너뛰고 있었다 — 그래서 손으로 돌리면 5개가 돌고 고리가 돌리면 0개였다.
    #
    # 파일이 있다고 유니티가 도는 것은 아니다. **프로세스를 본다.**
    lock = project / "Temp" / "UnityLockfile"
    if lock.exists():
        if pm.unity_running():
            return [], ["유니티가 열려 있어 못 쟀습니다."], False
        try:
            lock.unlink()
        except OSError as e:
            return [], [f"앞 판이 남긴 자물쇠를 못 치웠습니다: {e}"], False

    # 결과와 로그를 **프로젝트 밖**에 둔다. `Temp/` 는 유니티가 켜질 때마다
    # 비워서, 다음에 무슨 일이 있었는지 보러 가면 이미 없다.
    stamp = int(time.time())
    work = Path(tempfile.gettempdir()) / "rookery-unity"
    work.mkdir(parents=True, exist_ok=True)
    results = work / f"rookery_play_{stamp}.xml"
    log = work / f"rookery_play_{stamp}.log"

    # **한 번 더 해 본다.**
    #
    # 코드를 막 새로 컴파일한 유니티 **바로 뒤**에 시험을 켜면, 6개를 찾아
    # 놓고 0개를 돌린 채 0.1초 만에 끝난다(09-03 에 세 판 연속 그랬다). 손으로
    # 같은 명령을 돌리면 다섯이 다 돈다 — 그때는 이미 다 가라앉은 뒤라서다.
    #
    # 다시 하면 통하는 것을 "안 된다" 로 적으면, 고리는 멀쩡한 것을 고치러 간다.
    # 그래서 0개면 한 번만 더 해 본다. 두 번 다 0개면 그때는 못 잰 것이고,
    # **다시 해 봤다는 사실까지 말한다.**
    r = None
    for attempt in (1, 2):
        say("  돌려 봅니다 (PlayMode)…" + ("  [다시]" if attempt == 2 else ""))
        try:
            subprocess.run([
                str(unity), "-batchmode", "-nographics",
                "-projectPath", str(project),
                "-runTests", "-testPlatform", "PlayMode",
                "-testResults", str(results),
                "-logFile", str(log),
            ], timeout=timeout)
        except subprocess.TimeoutExpired:
            return [], [f"{timeout}초 안에 안 끝나 못 쟀습니다. 로그: {log}"], False

        if results.exists():
            r = pm.parse_results(results)
            if sum(len(v) for v in r.values()) > 0:
                break
            r = None
        if attempt == 2:
            return [], [f"두 번 해 봤는데 시험이 0개 돌았습니다 — 잰 것이"
                        f" 없습니다. 로그: {log}"], False

    if r is None:
        return [], [f"결과를 못 읽었습니다. 로그: {log}"], False

    fails = [f"{name}\n{message}".strip() for name, message in r["failed"]]
    unmeasured = [f"{name}: {message}".strip() for name, message in r["inconclusive"]]
    say(f"  통과 {len(r['passed'])} · 떨어짐 {len(fails)} · 못 잼 {len(unmeasured)}")
    return fails, unmeasured, True


def unity_bases() -> list[Path]:
    """에디터가 놓여 있을 수 있는 자리.

    `Program Files` 만 보면 안 된다. 거기에 깔려면 **관리자 권한**이 필요하고,
    그 창은 사람이 눌러야 하며, 사람이 화면 앞에 없으면 거기서 멈춘다. 그래서
    권한 없이 깔 수 있는 **사용자 폴더**를 같이 본다 — 북극성이 "깨끗한 기계에
    로키를 깔아서" 인 이상, 사람 손이 필요한 자리는 그 자체가 고칠 자리다.

    `ROOKERY_UNITY_DIR` 로 자리를 하나 더 붙일 수 있다. 새 기계에서 다른 데
    깔았을 때 코드를 고치지 않고 알려 주기 위한 것이다.
    """
    bases: list[Path] = []
    extra = os.environ.get("ROOKERY_UNITY_DIR", "").strip()
    if extra:
        bases.append(Path(extra))
    bases += [
        # 권한 없이 깔리는 자리. 부트스트랩이 여기에 깐다.
        Path.home() / "UnityEditors",
        Path(r"C:\Program Files\Unity\Hub\Editor"),
        Path(r"C:\Program Files (x86)\Unity\Hub\Editor"),
        Path.home() / "Unity" / "Hub" / "Editor",
    ]
    return bases


if __name__ == "__main__":
    sys.exit(main())
