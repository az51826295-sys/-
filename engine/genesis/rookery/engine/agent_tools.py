"""에이전트 도구 v2 - 읽기 전용 탐색 도구 (docs/agent-tools-v2-design.md).

실패 41시도 부검: 스텝의 50%가 `read_file`, 대상 파일은 전부 20,000자
절단 대상, 19/41이 내용을 보려고 덤프 스크립트를 썼다. 여기 세 도구는
그 "보지 못하는 것을 보려는" 스텝을 없앤다:

- read_range: 줄 범위 읽기. 절단을 말없이 하지 않는다 - 머리에 총 줄수와
  다음 start_line을 적는다.
- search: 작업공간 안 정규식 검색, `파일:줄: 내용`. 파이썬 구현(서브프로세스
  없음). `python -c` 같은 스니펫 실행 도구는 넣지 않는다 - argv 검사로는
  스니펫의 디스크 접근을 가둘 수 없다.
- list_dir: 부분 디렉터리 지도.

전부 읽기 전용이고 Workspace.resolve()/contains()를 지난다(격리 제도
그대로). agentic.py 연결(TOOLS 스키마 + _exec_tool 분기)은 48h 드라이런
종료 후 - 그때 `exec_tool()` 한 줄이면 된다.
"""

from __future__ import annotations

import fnmatch
import os
import re

from genesis.rookery.engine.isolation import IsolationError

SKIP_DIRS = (".git", "__pycache__", "node_modules", ".godot",
             ".pytest_cache", ".mypy_cache", ".tox", ".venv", "venv")
DEFAULT_LINES = 200
MAX_CHARS = 20000

TOOL_SCHEMAS = [
    {"name": "read_file",
     "description": "파일을 줄 범위로 읽는다 (기본 200줄). 응답 머리에 "
                    "총 줄수와 다음 start_line이 적힌다 - 큰 파일은 "
                    "이어서 읽어라.",
     "input_schema": {"type": "object", "properties": {
         "path": {"type": "string"},
         "start_line": {"type": "integer", "minimum": 1},
         "max_lines": {"type": "integer", "minimum": 1,
                       "maximum": 400}},
         "required": ["path"]}},
    {"name": "search",
     "description": "작업공간 안에서 정규식으로 줄을 찾는다. 결과는 "
                    "파일:줄: 내용. 정의·호출처를 찾을 때 read_file "
                    "대신 먼저 써라.",
     "input_schema": {"type": "object", "properties": {
         "pattern": {"type": "string"},
         "path_glob": {"type": "string",
                       "description": "기본 **/*.py"},
         "max_hits": {"type": "integer", "minimum": 1, "maximum": 200},
         "ignore_case": {"type": "boolean"}},
         "required": ["pattern"]}},
    {"name": "list_dir",
     "description": "디렉터리 내용을 본다 (기본 깊이 1).",
     "input_schema": {"type": "object", "properties": {
         "path": {"type": "string"},
         "depth": {"type": "integer", "minimum": 1, "maximum": 3}},
         "required": []}},
]
V2_TOOL_NAMES = ("read_file", "search", "list_dir")


def read_range(ws, path: str, start_line: int = 1,
               max_lines: int = DEFAULT_LINES,
               max_chars: int = MAX_CHARS) -> str:
    try:
        text = ws.read_text(path)
    except (OSError, IsolationError) as exc:
        return f"오류: {exc}"
    lines = text.splitlines()
    total = len(lines)
    try:
        start = max(1, int(start_line or 1))
        n = max(1, min(int(max_lines or DEFAULT_LINES), 400))
    except (TypeError, ValueError):
        start, n = 1, DEFAULT_LINES
    if total == 0:
        return f"[{path}: 빈 파일]"
    if start > total:
        return f"[{path}: 총 {total}줄 - start_line {start}은 범위 밖]"
    end = min(total, start + n - 1)
    chunk = "\n".join(f"{i}: {ln}" for i, ln in
                      enumerate(lines[start - 1:end], start))
    clipped = ""
    if len(chunk) > max_chars:
        chunk = chunk[:max_chars]
        clipped = " (문자 상한으로 잘림 - max_lines를 줄여라)"
    nxt = (f", 다음: start_line={end + 1}" if end < total else ", 끝")
    return (f"[{path}: 총 {total}줄, 이번 {start}~{end}줄{nxt}{clipped}]\n"
            + chunk)


def _match(rel: str, name: str, pattern: str) -> bool:
    pat = pattern or "**/*.py"
    if fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(name, pat):
        return True
    if pat.startswith("**/"):
        return fnmatch.fnmatch(rel, pat[3:]) or fnmatch.fnmatch(name, pat[3:])
    return False


def search(ws, pattern: str, path_glob: str = "**/*.py",
           max_hits: int = 50, ignore_case: bool = False) -> str:
    try:
        rx = re.compile(pattern, re.IGNORECASE if ignore_case else 0)
    except re.error as exc:
        return f"오류: 정규식 불량 ({exc})"
    max_hits = max(1, min(int(max_hits or 50), 200))
    root = ws.path
    hits: list[str] = []
    scanned = 0
    capped = False
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in sorted(filenames):
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace("\\", "/")
            if not _match(rel, fn, path_glob):
                continue
            if not ws.contains(full):           # 심링크 탈출 방어
                continue
            try:
                with open(full, encoding="utf-8", errors="replace") as f:
                    text = f.read()
            except OSError:
                continue
            scanned += 1
            for i, line in enumerate(text.splitlines(), 1):
                if rx.search(line):
                    hits.append(f"{rel}:{i}: {line.strip()[:160]}")
                    if len(hits) >= max_hits:
                        capped = True
                        break
            if capped:
                break
        if capped:
            break
    head = (f"[search {pattern!r} in {path_glob}: {len(hits)}건"
            f"{' (상한 도달)' if capped else ''}, 파일 {scanned}개]")
    return head + ("\n" + "\n".join(hits) if hits else "\n(없음)")


def list_dir(ws, path: str = ".", depth: int = 1,
             max_entries: int = 200) -> str:
    try:
        base = ws.resolve(path or ".")
    except IsolationError as exc:
        return f"오류: {exc}"
    if not os.path.isdir(base):
        return f"오류: 디렉터리 아님 - {path}"
    depth = max(1, min(int(depth or 1), 3))
    out: list[str] = []
    base_depth = base.rstrip(os.sep).count(os.sep)
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        level = dirpath.rstrip(os.sep).count(os.sep) - base_depth
        rel_dir = os.path.relpath(dirpath, ws.path).replace("\\", "/")
        prefix = "" if rel_dir == "." else rel_dir + "/"
        for d in dirnames:
            out.append(f"{prefix}{d}/")
        for fn in sorted(filenames):
            try:
                size = os.path.getsize(os.path.join(dirpath, fn))
            except OSError:
                size = -1
            out.append(f"{prefix}{fn} ({size}B)")
        if level + 1 >= depth:
            dirnames[:] = []
        if len(out) >= max_entries:
            out.append("... (이하 생략)")
            break
    return f"[{path or '.'} 깊이 {depth}: {len(out)}항목]\n" + "\n".join(out)


def exec_tool(ws, name: str, args: dict) -> str | None:
    """v2 도구면 실행 결과 문자열, 아니면 None (호출부가 v1 분기로)."""
    args = args if isinstance(args, dict) else {}
    if name == "read_file":
        if "path" not in args or args["path"] is None:
            return "오류: 인자 누락 ['path']"
        return read_range(ws, args["path"], args.get("start_line", 1),
                          args.get("max_lines", DEFAULT_LINES))
    if name == "search":
        if not args.get("pattern"):
            return "오류: 인자 누락 ['pattern']"
        return search(ws, args["pattern"], args.get("path_glob") or "**/*.py",
                      args.get("max_hits") or 50,
                      bool(args.get("ignore_case")))
    if name == "list_dir":
        return list_dir(ws, args.get("path") or ".", args.get("depth") or 1)
    return None
