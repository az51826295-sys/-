"""유니티 AI 생성기가 **창 없이도 도는가.**

이 물음에 답한 사람이 아직 없다. `unity/UNITY-AI.md` 첫 줄에도 "직접 돌려 본
적이 없다"고 적혀 있다. 패키지 안에는 공개 API 가 있지만
(`Unity.AI.Generators.Tools.AssetGenerators.GenerateAsync`), 생성 자체는 유니티
클라우드에 로그인된 계정과 AI Points 를 쓴다. 그 둘이 배치모드에서 되는지는
**돌려 봐야만** 안다.

이 심부름꾼이 그 한 판을 돌린다:

    python tools/unity_ai_probe.py --project "C:/Users/az518/HD2D_JRPG_Proto" \\
        --kind sprite --prompt "..." --save Assets/Rookery/AITest/probe.png

**돈이 든다.** 유니티 AI Points 를 쓴다. 한 판만 돌린다.

`-quit` 를 안 붙인다. 생성이 비동기라 `-executeMethod` 가 돌아오는 시점에는
아직 안 끝나 있다. 다 되면 에디터 안의 우리 코드가 스스로 끈다.

세 가지가 갈린다:
  1. 패키지가 없다        → 만들 수 없다. 넣는 것부터.
  2. 배치모드에서 안 된다 → 창을 열고 메뉴로 해야 한다(로키 고리와 조건 충돌).
  3. 된다                 → 고리에 넣을 수 있다.
셋을 뭉뚱그리면 어디를 고쳐야 하는지 알 수 없다.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
# 에디터를 찾는 자리는 한 벌만 둔다. 여기저기 적어 두면 새 자리가 생겼을 때
# 한 군데를 빼먹고, 그 도구만 조용히 '유니티가 없다'고 말한다.
from unity_runner import unity_bases  # noqa: E402

# 윈도우 콘솔은 cp949 라서 한국어 설명에 섞인 줄표(—) 하나에 죽는다. 그러면
# **판정문 대신 파이썬 역추적이 뜨고**, 정작 무엇이 됐는지가 사라진다.
# genesis 에서 같은 병으로 빨간불 다섯 개가 났었다(FAIL 이 UNDEFINED 로 바뀌었다).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

RESULT_MARK = "ROOKERY_AI_RESULT "


def read_version(project: Path) -> str | None:
    f = project / "ProjectSettings" / "ProjectVersion.txt"
    if not f.exists():
        return None
    for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("m_EditorVersion:"):
            return line.split(":", 1)[1].strip()
    return None


def find_unity(project: Path) -> Path | None:
    """프로젝트가 적어 둔 버전만 찾는다. 아무 버전이나 잡으면 프로젝트를 통째로
    올려 버리고, 그건 되돌릴 수 없다."""
    version = read_version(project)
    if not version:
        return None
    for base in unity_bases():
        exe = base / version / "Editor" / "Unity.exe"
        if exe.exists():
            return exe
    return None


def has_generators(project: Path) -> bool:
    manifest = project / "Packages" / "manifest.json"
    if not manifest.exists():
        return False
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    return "com.unity.ai.generators" in (data.get("dependencies") or {})


def project_locked(project: Path) -> bool:
    """유니티가 이미 이 프로젝트를 열고 있는가.

    **파일이 있다고 유니티가 도는 것은 아니다.** 앞선 배치 실행이 끝나거나
    죽으면 파일만 남고, 그때 "열려 있습니다" 라고 하면 **없는 벽 앞에서 멈춘다.**
    `unity_playmode.py` 에서 이미 겪고 고친 자리인데 여기까지 안 왔었다.

    못 물어보면 **돈다고 본다** — 잠금을 잘못 치우면 남의 세션을 깨뜨리고,
    그건 기다리는 것보다 훨씬 비싸다.
    """
    if not (project / "Temp" / "UnityLockfile").exists():
        return False
    try:
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq Unity.exe"],
            capture_output=True, text=True, timeout=20).stdout
    except (OSError, subprocess.SubprocessError):
        return True
    if "Unity.exe" in out:
        return True
    print("잠금 파일만 남아 있고 유니티는 없습니다 — 앞선 실행이 남긴 것입니다. 치웁니다.")
    try:
        (project / "Temp" / "UnityLockfile").unlink()
    except OSError as e:
        print(f"  못 치웠습니다: {e}")
        return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--kind", default="sprite",
                    help="sprite · image · mesh · material · sound · animation")
    ap.add_argument("--prompt", default=(
        "Pixel art sprite of a single round gold coin, chunky visible pixels, "
        "hard edges, limited palette, transparent background, no text."))
    ap.add_argument("--save", default="")
    ap.add_argument("--max-points", type=int, default=0,
                    help="견적이 이보다 크면 만들지 않는다. 0 이면 상한 없음")
    ap.add_argument("--timeout", type=int, default=600)
    ap.add_argument("--list-models", action="store_true",
                    help="쓸 수 있는 모델 목록만 받는다. 포인트를 안 쓴다")
    args = ap.parse_args()

    project = Path(args.project).resolve()
    if not (project / "ProjectSettings").exists():
        print(f"유니티 프로젝트가 아닙니다: {project}")
        return 2

    # ① 패키지가 있는가. 없으면 여기서 끝이다 — 로키는 패키지를 못 깐다.
    if not has_generators(project):
        print("com.unity.ai.generators 가 이 프로젝트에 없습니다.")
        print("  Package Manager 에서 넣어 주셔야 합니다. 로키는 패키지를 못 깝니다.")
        return 3

    unity = find_unity(project)
    if not unity:
        version = read_version(project) or "(모름)"
        print(f"유니티 {version} 에디터를 못 찾았습니다.")
        return 4

    if project_locked(project):
        print("유니티가 이 프로젝트를 열고 있습니다. 닫고 다시 돌려 주십시오.")
        print("  (같은 프로젝트를 두 번 열 수 없습니다.)")
        return 5

    stamp = int(time.time())
    # **주문서를 프로젝트 안에 두지 않는다.**
    #
    # `Temp/` 에 뒀더니, 유니티가 프로젝트를 여는 첫 동작으로 그 폴더를 통째로
    # 지웠다. 그래서 우리 코드는 제대로 불렸는데 읽을 주문이 없었다 — 그러면
    # "유니티 AI 가 안 된다" 로 보이지만 안 된 것은 우리 심부름 방식이다.
    # 원인을 엉뚱한 데서 찾게 만드는 종류의 실패다.
    work = Path(tempfile.gettempdir()) / "rookery-unity"
    work.mkdir(parents=True, exist_ok=True)
    job_path = work / f"rookery_ai_job_{stamp}.json"
    out_path = work / f"rookery_ai_out_{stamp}.json"
    log_path = work / f"rookery_ai_log_{stamp}.txt"

    save = args.save or f"Assets/Rookery/AITest/probe_{args.kind}_{stamp}" + (
        ".prefab" if args.kind == "mesh" else
        ".wav" if args.kind == "sound" else
        ".mat" if args.kind == "material" else
        ".anim" if args.kind == "animation" else ".png")

    job = {
        "kind": args.kind,
        "prompt": args.prompt,
        "savePath": save,
        "width": 0,
        "height": 0,
        "removeBackground": True,
        "seconds": 3.0,
        "modelId": "",
        "maxPoints": args.max_points,
        "timeoutSeconds": args.timeout,
    }
    job_path.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")

    if args.list_models:
        # **모델 목록이 견적보다도 먼저다.** 생성기는 `modelId` 없이는 아무것도
        # 안 만드는데, 어떤 모델이 있는지는 계정마다 다르다. 목록을 못 보면
        # 이름을 찍어 넣게 되고, 찍은 이름은 틀려도 그럴듯해 보인다.
        command = [
            str(unity), "-batchmode", "-nographics",
            "-projectPath", str(project),
            "-logFile", str(log_path),
            "-executeMethod", "Rookery.AI.RookeryUnityAICli.Models",
            "-rookeryAiOut", str(out_path),
        ]
        print(f"유니티 {read_version(project)} · 모델 목록 · 포인트를 안 씁니다")
        try:
            code = subprocess.run(command, timeout=420).returncode
        except subprocess.TimeoutExpired:
            print(f"420초 안에 안 끝났습니다. 로그: {log_path}")
            return 6
        data = None
        if out_path.exists():
            try:
                data = json.loads(out_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                pass
        if data is None:
            log_text = log_path.read_text(encoding="utf-8", errors="replace") if log_path.exists() else ""
            found = re.search(r"ROOKERY_AI_MODELS (\{.*?\})", log_text)
            if found:
                try:
                    data = json.loads(found.group(1))
                except json.JSONDecodeError:
                    pass
        if data is None:
            print(f"목록을 못 읽었습니다(종료코드 {code}). 로그: {log_path}")
            return 7
        if not data.get("ok"):
            print("목록을 못 받았습니다: " + (data.get("error") or "(이유 없음)"))
            return 8
        models = data.get("models") or []
        print(f"\n쓸 수 있는 모델 {len(models)}개")
        if not models:
            # **빈 목록을 "없다"로 읽지 않는다.**
            #
            # 생성기 서비스는 로그인이 안 돼 있어도 오류를 안 내고 **빈 목록**을
            # 준다. 그걸 "이 계정엔 모델이 없습니다" 로 읽으면, 정작 사실은
            # "물어보지도 못했다" 다. 그러면 요금제를 결제하러 가게 되는데
            # 결제는 이 문제를 안 고친다.
            #
            # 유니티는 이 사정을 로그에 적어 둔다. 그 줄을 찾아서 두 경우를
            # 가른다 — 못 본 것과 없는 것을 구분하지 않으면, 못 볼수록 잘
            # 통과한다.
            log_text = (log_path.read_text(encoding="utf-8", errors="replace")
                        if log_path.exists() else "")
            blocked = [l.strip() for l in log_text.splitlines()
                       if "Access token is unavailable" in l
                       or "not signed in" in l.lower()]
            if blocked:
                print("  **없는 것이 아니라 못 물어본 것입니다.** 유니티가 클라우드"
                      " 접속 토큰을 못 얻었습니다:")
                for line in blocked[:3]:
                    print("  | " + line)
                print("  라이선스는 붙어 있습니다. 모자란 것은 로그인 토큰입니다.")
                print(f"  로그: {log_path}")
                return 9
            print("  목록이 비었고, 로그에 막힌 흔적도 없습니다.")
            print("  이 계정에 쓸 수 있는 생성 모델이 정말로 없을 수 있습니다.")
            print(f"  로그: {log_path}")
        for m in models:
            print(f"  {m.get('modelId')}")
            print(f"      {m.get('description')}")
        return 0

    command = [
        str(unity), "-batchmode", "-nographics",
        "-projectPath", str(project),
        "-logFile", str(log_path),
        # `-quit` 를 안 붙인다. 생성이 끝나기 전에 유니티가 꺼진다.
        "-executeMethod", "Rookery.AI.RookeryUnityAICli.Run",
        "-rookeryAiJob", str(job_path),
        "-rookeryAiOut", str(out_path),
    ]

    print(f"유니티 {read_version(project)} · {args.kind} · 최대 {args.timeout}초")
    print("이 판은 유니티 AI Points 를 씁니다.")
    started = time.monotonic()
    try:
        code = subprocess.run(command, timeout=args.timeout + 120).returncode
    except subprocess.TimeoutExpired:
        print(f"{args.timeout + 120}초 안에 안 끝났습니다. 로그: {log_path}")
        return 6
    elapsed = time.monotonic() - started

    # 결과는 두 곳에 있다. 파일이 먼저고, 못 쓴 경우를 위해 로그도 본다 —
    # 결과가 아무 데도 없는 것이 제일 나쁘다.
    result = None
    if out_path.exists():
        try:
            result = json.loads(out_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    log_text = log_path.read_text(encoding="utf-8", errors="replace") if log_path.exists() else ""
    if result is None:
        found = re.search(re.escape(RESULT_MARK) + r"(\{.*?\})", log_text)
        if found:
            try:
                result = json.loads(found.group(1))
            except json.JSONDecodeError:
                pass

    print(f"\n종료코드 {code} · {elapsed:.1f}초")
    if result is None:
        # 종료코드만 보고 판정하지 않는다. 결과를 못 읽은 것과 실패한 것은 다르고,
        # 둘을 같게 읽으면 못 읽을수록 잘 통과한다.
        #
        # 그중에서도 제일 흔한 갈래를 먼저 가른다: **유니티 자기 패키지가
        # 컴파일이 안 되는 경우.** 그러면 우리 어셈블리는 아예 안 지어지고,
        # 우리 코드가 불릴 자리 자체가 없다. 이걸 "안 됐다"로 뭉뚱그리면 우리
        # 코드를 고치러 가게 된다 — 고칠 것이 없는데.
        broken = sorted(set(re.findall(
            r"Library\\PackageCache\\(com\.unity\.ai\.[a-z.]+)@", log_text)))
        if broken and "Script Compilation Error" in log_text:
            print("유니티 AI 패키지가 이 에디터에서 컴파일되지 않습니다:")
            for pkg in broken:
                print(f"  - {pkg}")
            print("  우리 코드 문제가 아닙니다. 우리 어셈블리는 지어지지도 않았습니다.")
            for line in [l for l in log_text.splitlines() if "error CS" in l][:6]:
                print("  | " + line.strip())
            print(f"  로그: {log_path}")
            return 8

        print("결과를 못 읽었습니다. 배치모드에서 우리 코드가 아예 안 불렸을 수 있습니다.")
        print(f"  로그: {log_path}")
        tail = [l for l in log_text.splitlines() if "Rookery" in l or "error" in l.lower()]
        for line in tail[-12:]:
            print("  | " + line)
        return 7

    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result.get("ok"):
        print(f"\n됩니다. 배치모드에서 만들어졌습니다: {result.get('assetPath')}")
        print(f"AI Points {result.get('pointCost')} · {result.get('seconds', 0):.1f}초")
        return 0

    print(f"\n안 됐습니다: {result.get('error')}")
    print(f"  로그: {log_path}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
