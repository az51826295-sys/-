"""48h 드라이런 종료 후 '연결 작업'을 한 번에 적용한다 (2026-08-22 준비).

드라이런 중엔 agentic.py·intake_pipeline.py·service.py를 바꿀 수 없어
(인테이크가 매시간 새 프로세스로 import) 연결을 미뤄 뒀다. 이 스크립트는
그 연결을 정확한 문자열 치환으로 적용하고, 끝나면 돌려야 할 테스트를
알려준다. **드라이런 판정(tools/stage1_dryrun_judge.py) 뒤에만 실행.**
멱등: 이미 적용된 치환은 건너뛴다. 앵커가 없으면 멈춘다(손으로 확인).

  python tools/post_dryrun_wiring.py            # 적용
  python tools/post_dryrun_wiring.py --dry-run  # 무엇이 바뀔지만

적용 내용:
 1. 도구 v2 연결 (docs/agent-tools-v2-design.md): agentic.TOOLS의 read_file
    스키마를 agent_tools.TOOL_SCHEMAS(read_file 줄 범위 + search + list_dir)로,
    _exec_tool에서 v2 디스패치 우선.
 2. 인박스 소비 (genesis/rookery/inbox.py): 파이프라인 main()에서 인박스
    대기 항목을 후보에 합치고, verify()는 후보가 body를 들고 있으면 GitHub
    조회를 건너뛰며, 검증 뒤 결말을 인박스에 되적는다.
 3. Goodhart 일일 편입 (docs/goodhart-metric-design.md): 서비스가 하루 한 번
    tools/goodhart.py를 같은 태그로 돌리고 결과를 로그에 남긴다
    (ROOKERY_GOODHART_INTERVAL_S, 기본 86400; 0이면 끔).
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRY = "--dry-run" in sys.argv

PATCHES = [
    # ------------------------------------------------ 1. tools v2
    ("genesis/rookery/engine/agentic.py", [
        ('''TOOLS = [
    {"name": "read_file",
     "description": "작업공간의 파일 내용을 읽는다",
     "input_schema": {"type": "object", "properties": {
         "path": {"type": "string"}}, "required": ["path"]}},
    {"name": "write_file",''',
         '''from genesis.rookery.engine.agent_tools import (  # noqa: E402
    TOOL_SCHEMAS as _V2_TOOLS, exec_tool as _v2_exec)

TOOLS = [
    *_V2_TOOLS,                 # read_file(줄 범위)·search·list_dir (도구 v2)
    {"name": "write_file",'''),
        ('''    if name == "read_file":
        try:
            return ws.read_text(args["path"])[:20000]
        except (OSError, IsolationError) as exc:
            return f"오류: {exc}"
''',
         '''    v2 = _v2_exec(ws, name, args)       # read_file(줄 범위)·search·list_dir
    if v2 is not None:
        return v2
'''),
        ('''REQUIRED_ARGS = {
    "read_file": ("path",),
    "write_file": ("path", "content"),''',
         '''REQUIRED_ARGS = {
    "read_file": ("path",),
    "search": ("pattern",),
    "write_file": ("path", "content"),'''),
    ]),
    # ------------------------------------------------ 2. inbox
    ("tools/intake_pipeline.py", [
        ('''        try:
            body = vf.fetch_issue_body(c["repo"], c["number"])
        except Exception as exc:                 # noqa: BLE001''',
         '''        try:
            body = c.get("body") or vf.fetch_issue_body(c["repo"],
                                                        c["number"])
        except Exception as exc:                 # noqa: BLE001'''),
        ('''        if args.limit:
            cands = cands[:args.limit]
        summary["scanned"] = len(sc["issues"])
        summary["candidates"] = len(cands)
        rows = verify(cands, args.mock)''',
         '''        if args.limit:
            cands = cands[:args.limit]
        # 채팅 인박스(재현 테스트 없이 들어온 지시)도 같은 게이트로
        from genesis.rookery import inbox as _inbox
        inbox_path = os.path.join(DATA, "chat_inbox.json")
        inbox_cands = _inbox.to_candidates(_inbox.pending(inbox_path))
        cands += inbox_cands
        summary["scanned"] = len(sc["issues"])
        summary["candidates"] = len(cands)
        summary["inbox_candidates"] = len(inbox_cands)
        rows = verify(cands, args.mock)
        if inbox_cands:
            summary["inbox_recorded"] = _inbox.record(inbox_path, rows)'''),
    ]),
    # ------------------------------------------------ 3. goodhart daily
    ("genesis/rookery/engine/config.py", [
        ('''    mock: bool = False
    stop_after_s: float = 0.0           # 0 = 신호까지 상주
''',
         '''    mock: bool = False
    stop_after_s: float = 0.0           # 0 = 신호까지 상주
    goodhart_interval_s: float = 86400.0   # 0 = 끔
'''),
        ('''            stop_after_s=_f(env, "ROOKERY_STOP_AFTER_S", 0.0))
''',
         '''            stop_after_s=_f(env, "ROOKERY_STOP_AFTER_S", 0.0),
            goodhart_interval_s=_f(env, "ROOKERY_GOODHART_INTERVAL_S",
                                   86400.0))
'''),
    ]),
    ("genesis/rookery/engine/service.py", [
        ('''def _idle(store: Store) -> bool:''',
         '''def _run_goodhart(config: ServiceConfig) -> None:
    """하루 한 번 Goodhart 계측 (docs/goodhart-metric-design.md). 결과는
    data/goodhart/와 로그에만 - 모델·프롬프트에는 가지 않는다."""
    argv = [sys.executable, os.path.join(ROOT_DIR, "tools", "goodhart.py"),
            "--tags", config.tag]
    if config.mock:
        argv.append("--no-github")
    try:
        r = subprocess.run(argv, cwd=ROOT_DIR, capture_output=True,
                           text=True, encoding="utf-8", errors="replace",
                           timeout=600)
        tail = (r.stdout or "").strip().splitlines()
        log.info("goodhart rc=%s %s", r.returncode,
                 " | ".join(t for t in tail if t.startswith(("ALARM", '"G_'))
                            or "G_a" in t)[:300])
    except Exception as exc:                     # noqa: BLE001
        log.error("goodhart 실행 실패: %s", str(exc)[:200])


def _idle(store: Store) -> bool:'''),
        ('''    next_intake = time.time() if config.intake_interval_s > 0 else None
    intake_thread: threading.Thread | None = None''',
         '''    next_intake = time.time() if config.intake_interval_s > 0 else None
    next_goodhart = (time.time() + 300 if config.goodhart_interval_s > 0
                     else None)
    intake_thread: threading.Thread | None = None'''),
        ('''        for name, store, guard, reporter, engine in units:
            _heartbeat(engine, guard, store, reporter, name)
        ticks += 1''',
         '''        for name, store, guard, reporter, engine in units:
            _heartbeat(engine, guard, store, reporter, name)
        if next_goodhart is not None and time.time() >= next_goodhart:
            threading.Thread(target=_run_goodhart, args=(config,),
                             daemon=True, name="rookery-goodhart").start()
            next_goodhart = time.time() + config.goodhart_interval_s
        ticks += 1'''),
    ]),
]


def main() -> int:
    changed = 0
    for rel, pairs in PATCHES:
        path = os.path.join(ROOT, rel)
        src = open(path, encoding="utf-8").read()
        for old, new in pairs:
            if new in src:
                print(f"  skip (already applied): {rel}")
                continue
            n = src.count(old)
            if n != 1:
                print(f"STOP: anchor count {n} != 1 in {rel}:\n{old[:80]}")
                return 1
            src = src.replace(old, new)
            changed += 1
            print(f"  patch: {rel}")
        if not DRY:
            open(path, "w", encoding="utf-8").write(src)
    print(f"{'would change' if DRY else 'changed'} {changed} spots")
    print("next: python -m pytest tests/test_engine_agentic.py "
          "tests/test_agent_tools_v2.py tests/test_intake_pipeline.py "
          "tests/test_inbox.py tests/test_service_multi.py "
          "tests/test_engine_service.py -q")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
