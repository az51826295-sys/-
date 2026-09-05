"""게임 스모크 (게이트 ④, `docs/engine-ready-gate-v0-design.md`).

  python -X utf8 tools/game_smoke.py

Godot을 **헤들리스로** 띄워 메인 씬을 올리고, 입력을 흉내 내 몇 가지 사실을 잰다:
눌렀을 때 움직이나 · 세로로 흐르지 않나 · 뗐을 때 멈추나 · 걷기 애니메이션이
방향에 맞나. 사람이 창을 보고 "되네"라고 말하는 자리를 기계로 바꾼다.

3값이다. Godot이 없으면 **fail이 아니라 undefined**(미측정)다.
"""
from __future__ import annotations

import argparse
import errno
import glob
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

SCRIPT = "res://tools/smoke.gd"
GAME_DIR = "game"
# 기계마다 다를 수 있어 후보를 훑는다. 못 찾으면 미정의다.
GODOT_GLOBS = (
    r"C:\Users\az518\Desktop\godot\Godot_v*_win64_console.exe",
    r"C:\Users\az518\Desktop\godot\Godot_v*_win64.exe",
    "/usr/local/bin/godot", "/usr/bin/godot",
)


def find_godot() -> str | None:
    for pattern in GODOT_GLOBS:
        hits = sorted(glob.glob(pattern))
        if hits:
            return hits[-1]
    return None


class _ProjectLock:
    """Godot 두 개가 같은 프로젝트를 동시에 열면 `.godot/` 를 두고 다툰다.

    병렬 테스트(-n 4)에서 실제로 그렇게 터졌다(returncode 1, 결과 없음).
    잠금 파일 하나로 직렬화한다 - 게이트 명령을 바꾸지 않고 고치는 방법이다.
    """

    def __init__(self, root: str, timeout: float = 300.0):
        self.path = os.path.join(root, GAME_DIR, ".smoke.lock")
        self.timeout = timeout
        self.fd = None

    def __enter__(self):
        start = time.time()
        while True:
            try:
                self.fd = os.open(self.path,
                                  os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(self.fd, str(os.getpid()).encode())
                return self
            except OSError as exc:
                if exc.errno != errno.EEXIST:
                    raise
                if time.time() - start > self.timeout:
                    # 잠금을 영원히 기다리지 않는다. 남은 잠금은 지우고 간다.
                    try:
                        os.unlink(self.path)
                    except OSError:
                        pass
                time.sleep(0.2)

    def __exit__(self, *exc):
        if self.fd is not None:
            os.close(self.fd)
            try:
                os.unlink(self.path)
            except OSError:
                pass
        return False


def run(no_input: bool = False, root: str = ROOT,
        timeout: int = 180, drop_asset: str | None = None) -> dict:
    exe = find_godot()
    if not exe:
        return {"verdict": "UNDEFINED", "why": "Godot 실행 파일을 못 찾았다",
                "engine": None}
    env = dict(os.environ)
    if no_input:
        env["SMOKE_NO_INPUT"] = "1"        # 이빨 확인용: 아무것도 안 누른다
    if drop_asset:
        # 파일을 지우지 않고 없는 척한다 - 병렬 주행에서 다른 테스트를 깨뜨리지
        # 않으려고(예전 방식은 실제로 파일을 옮겼다).
        env["SMOKE_DROP_ASSET"] = drop_asset
    t0 = time.time()
    try:
        with _ProjectLock(root):
            proc = subprocess.run(
                [exe, "--headless", "--path", GAME_DIR, "--script", SCRIPT],
                cwd=root, capture_output=True, timeout=timeout, env=env,
                # **인코딩을 명시한다.** text=True는 기계 기본 코드페이지로 읽는데,
                # 이 기계에서는 cp949라 Godot이 낸 한글 실패 메시지에서 디코딩이
                # 터졌다. 그러면 출력이 통째로 사라져 판정이 UNDEFINED가 된다 -
                # **실패가 미측정으로 둔갑**하는 최악의 조용한 고장이다.
                # (통과할 때는 한글이 없어서 안 터졌다. 그래서 오래 안 보였다.)
                encoding="utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        return {"verdict": "UNDEFINED", "why": f"{timeout}초 안에 안 끝났다",
                "engine": exe}
    out = (proc.stdout or "") + (proc.stderr or "")
    line = next((ln for ln in out.splitlines()
                 if ln.startswith("SMOKE_JSON ")), None)
    if not line:
        return {"verdict": "UNDEFINED", "why": "스모크가 결과를 안 냈다",
                "engine": exe, "returncode": proc.returncode,
                "tail": out.strip().splitlines()[-5:]}
    payload = json.loads(line[len("SMOKE_JSON "):])
    payload.update({"engine": os.path.basename(exe),
                    "returncode": proc.returncode,
                    "seconds": round(time.time() - t0, 1),
                    "no_input": no_input, "drop_asset": drop_asset})
    return payload


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="data/game_smoke.json")
    ap.add_argument("--no-input", action="store_true",
                    help="아무 키도 안 누른다(이 검사가 반응하는지 확인용)")
    a = ap.parse_args(argv)
    res = run(no_input=a.no_input)
    with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)
    print(f"판정: {res['verdict']}"
          + (f"  ({res.get('why')})" if res.get("why") else ""))
    if "dx_pressed" in res:
        print(f"  누른 뒤 이동 {res['dx_pressed']:.2f}px "
              f"(세로 {res['dy_pressed']:.2f})  "
              f"뗀 뒤 미끄러짐 {res['drift_after_release']:.2f}px")
        print(f"  본 애니메이션 {res['animations_seen']}  틱 {res['ticks']}")
    for f in res.get("fail", []):
        print(f"  ✖ {f}")
    for u in res.get("undefined", []):
        print(f"  ? {u}")
    print(f"기록: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
