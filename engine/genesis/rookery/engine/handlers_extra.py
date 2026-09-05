"""Alpha engine: additional handler kinds (spec section 1).

Only work with a mechanically checkable oracle is automated (section
8.5 product boundary). Two kinds here, each with an oracle the
auditor verifies by a DIFFERENT invariant than the handler's own:

- doc: add a docstring to a function WITHOUT changing behavior. The
  oracle is structural - the function's AST minus its docstring must
  be identical before and after - not "the tests still pass", which
  a docstring could never break anyway.

- test_add: add a characterization test that pins current behavior.
  The oracle is teeth: the new test must pass on HEAD AND fail when
  the target function is mutated. A test that passes even on a broken
  target is worthless, and this is the check §9 kept running into -
  a test with no discriminating power.

- data: convert a data file between machine-parseable formats. The
  oracle is conservation - same record count, declared columns
  preserved verbatim, every record conforming to a declared schema,
  optional mined spot checks. The honest boundary (section 2.3 of the
  brief): a transformed value that satisfies the schema pattern but is
  semantically wrong passes unless a spot check pins it - the same
  information boundary the incompleteness research hit, stated rather
  than hidden.
"""

from __future__ import annotations

import ast
import csv
import io
import json
import re

from genesis.rookery.engine.auditor import ValidatorVerdict, is_test_file
from genesis.rookery.engine.handlers import (
    _run_tests, apply_blocks, parse_patch)
from genesis.rookery.engine.isolation import IsolationError, Workspace
from genesis.rookery.engine.worker import HandlerOutcome, TaskContext


# --------------------------------------------------------- ast helpers


def _func(src: str, name: str) -> ast.AST | None:
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                and node.name == name:
            return node
    return None


def _body_without_docstring(func: ast.AST) -> str:
    body = list(func.body)
    if (body and isinstance(body[0], ast.Expr)
            and isinstance(getattr(body[0], "value", None), ast.Constant)
            and isinstance(body[0].value.value, str)):
        body = body[1:]
    return "\n".join(ast.dump(n) for n in body)


def _has_docstring(func: ast.AST) -> bool:
    return ast.get_docstring(func) not in (None, "")


# --------------------------------------------------------- doc handler


def _doc_focus(ws: Workspace, file: str, symbol: str) -> str:
    src = ws.read_text(file)
    node = _func(src, symbol)
    return ast.get_source_segment(src, node) if node else src[:2000]


def add_docstring_handler(ctx: TaskContext) -> HandlerOutcome:
    """Add a docstring to `symbol` in `file`, behavior unchanged."""
    p = ctx.task.payload
    ws = ctx.workspace
    symbol = (p.get("focus_symbols") or [p.get("symbol")])[0]
    file = p["file"]
    smoke = list(p.get("smoke_tests", []))

    before_src = ws.read_text(file)
    before = _func(before_src, symbol)
    if before is None:
        return HandlerOutcome(
            verdict=ValidatorVerdict(ctx.task.id, False, kind="doc"),
            result={"reason": f"symbol {symbol} not found"})

    prompt = (
        "다음 파이썬 함수에 한국어 docstring을 추가하라. "
        "동작(코드)은 절대 바꾸지 말고 docstring만 추가하라.\n\n"
        f"수정 대상 파일: {file}\n"
        f"```python\n{ast.get_source_segment(before_src, before)}\n```\n\n"
        f"아래 형식의 블록으로만 답하라. 첫 줄은 `# file: {file}`.\n\n"
        f"# file: {file}\n"
        "def 함수이름(매개변수):\n"
        '    """설명."""\n'
        "    # 기존 본문 그대로")
    resp = ctx.client.complete(prompt, temperature=1.0,
                               task_id=ctx.task.id,
                               run_id=ctx.task.run_id)
    blocks = parse_patch(getattr(resp, "text", resp))
    if not blocks:
        return HandlerOutcome(
            verdict=ValidatorVerdict(ctx.task.id, False, kind="doc"),
            result={"reason": "parse_fail"})
    err = apply_blocks(ws, blocks)
    if err:
        if err.startswith("path_outside_workspace"):
            raise IsolationError(err)
        return HandlerOutcome(
            verdict=ValidatorVerdict(ctx.task.id, False, kind="doc"),
            result={"reason": err})

    after_src = ws.read_text(file)
    after = _func(after_src, symbol)
    behavior_preserved = (after is not None and _body_without_docstring(
        before) == _body_without_docstring(after))
    docstring_added = after is not None and _has_docstring(after) \
        and not _has_docstring(before)
    smoke_ok = all(v == "pass" for v in
                   _run_tests(ws, smoke).values()) if smoke else True
    accepted = behavior_preserved and docstring_added and smoke_ok
    if not accepted:
        ws.reset()
    verdict = ValidatorVerdict(
        ctx.task.id, accepted, kind="doc",
        changed_files=sorted({b.file for b in blocks}),
        checks={"behavior_preserved": behavior_preserved,
                "docstring_added": docstring_added,
                "smoke_ok": smoke_ok})
    return HandlerOutcome(
        verdict=verdict,
        result={"symbol": symbol, "docstring_added": docstring_added},
        commit_message=f"rookery: docstring for {symbol}",
        open_pr=accepted)


# ----------------------------------------------------- test_add handler


_MUTATION = ("def {name}(*args, **kwargs):\n"
             "    raise AssertionError('rookery-mutation')\n")


def _splice_raw(src: str, name: str, new_code: str) -> str | None:
    from genesis.rookery.engine.handlers import PatchBlock, _splice

    return _splice(src, PatchBlock(file="", cls=None, name=name,
                                   code=new_code))


def add_test_handler(ctx: TaskContext) -> HandlerOutcome:
    """Add a characterization test for `symbol` and prove it has
    teeth (fails when the target is mutated)."""
    p = ctx.task.payload
    ws = ctx.workspace
    symbol = (p.get("focus_symbols") or [p.get("symbol")])[0]
    file = p["file"]
    test_file = p["test_file"]
    module = p.get("module") or file.rsplit("/", 1)[-1][:-3]

    src = ws.read_text(file)
    node = _func(src, symbol)
    if node is None:
        return HandlerOutcome(
            verdict=ValidatorVerdict(ctx.task.id, False,
                                     kind="test_add"),
            result={"reason": f"symbol {symbol} not found"})

    prompt = (
        f"모듈 `{module}`의 함수 `{symbol}`의 현재 동작을 고정하는 "
        "pytest 테스트 함수 하나를 작성하라. 지금 코드에서 통과해야 "
        "하고, 함수가 망가지면 실패하도록 구체적 입력·기대값을 "
        "assert 하라.\n\n"
        f"```python\n{ast.get_source_segment(src, node)}\n```\n\n"
        "테스트 함수 정의만 출력하라 (import·설명 없이). 이름은 "
        f"test_로 시작. 함수 안에서 `{module}.{symbol}(...)`로 호출.")
    resp = ctx.client.complete(prompt, temperature=1.0,
                               task_id=ctx.task.id,
                               run_id=ctx.task.run_id)
    text = getattr(resp, "text", resp)
    new_func = _extract_test_func(text)
    if not new_func:
        return HandlerOutcome(
            verdict=ValidatorVerdict(ctx.task.id, False,
                                     kind="test_add"),
            result={"reason": "no test function parsed"})
    tname = new_func[0]
    tcode = new_func[1]

    # append the test (ensure the module import is present)
    existing = ws.read_text(test_file) if _exists(ws, test_file) else ""
    header = existing
    if f"import {module}" not in existing:
        header = f"import {module}\n\n\n" + existing
    ws.write_text(test_file, header.rstrip() + "\n\n\n" + tcode + "\n")
    tid = f"{test_file}::{tname}"

    passes = _run_tests(ws, [tid]).get(tid) == "pass"

    # teeth: mutate the target, the new test must now fail; then undo
    catches = False
    if passes:
        broken = _splice_raw(src, symbol,
                             _MUTATION.format(name=symbol))
        if broken is not None:
            ws.write_text(file, broken)
            catches = _run_tests(ws, [tid]).get(tid) != "pass"
            ws.write_text(file, src)             # restore the source

    accepted = passes and catches
    if not accepted:
        ws.reset()
    verdict = ValidatorVerdict(
        ctx.task.id, accepted, kind="test_add",
        changed_files=[test_file] if accepted else [],
        checks={"new_test_passes": passes, "catches_mutation": catches})
    return HandlerOutcome(
        verdict=verdict,
        result={"symbol": symbol, "test": tid},
        commit_message=f"rookery: characterization test for {symbol}",
        open_pr=accepted)


def _exists(ws: Workspace, rel: str) -> bool:
    import os
    try:
        return os.path.isfile(ws.resolve(rel))
    except IsolationError:
        return False


def _extract_test_func(text: str) -> tuple[str, str] | None:
    text = text.replace("```python", "").replace("```", "")
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return None
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                and node.name.startswith("test"):
            return node.name, ast.get_source_segment(text, node)
    return None


# --------------------------------------------------------- data handler


def _strip_fences(text: str) -> str:
    lines = [ln for ln in text.splitlines()
             if not ln.strip().startswith("```")]
    return "\n".join(lines).strip()


def _parse_records(text: str, fmt: str) -> list[dict] | None:
    """Parse a data file into a list of flat records, or None. Strict
    on purpose: the oracle only means something if both sides parse
    with the standard library, not with the model's idea of a format."""
    text = text.strip()
    if not text:
        return None
    if fmt == "json":
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return None
        if not isinstance(data, list) or not all(
                isinstance(r, dict) for r in data):
            return None
        return data
    if fmt == "csv":
        try:
            rows = list(csv.DictReader(io.StringIO(text)))
        except csv.Error:
            return None
        # ragged rows show up as a None key (extra cells) or None
        # values (missing cells); both mean the table is malformed
        if not rows or any(
                None in r or None in r.values() for r in rows):
            return None
        return [dict(r) for r in rows]
    return None


def _conforms(value, spec) -> bool:
    if isinstance(spec, str):
        spec = {"type": spec}
    t = spec.get("type", "str")
    if t == "int":
        ok = isinstance(value, int) and not isinstance(value, bool)
        if not ok and isinstance(value, str):
            try:
                int(value)
                ok = True
            except ValueError:
                ok = False
    elif t == "float":
        ok = isinstance(value, (int, float)) \
            and not isinstance(value, bool)
        if not ok and isinstance(value, str):
            try:
                float(value)
                ok = True
            except ValueError:
                ok = False
    else:
        ok = isinstance(value, str)
    if not ok:
        return False
    pattern = spec.get("pattern")
    if pattern is not None and \
            re.fullmatch(pattern, str(value)) is None:
        return False
    return True


def _infer_format(path: str) -> str:
    return "json" if path.lower().endswith(".json") else "csv"


def data_convert_handler(ctx: TaskContext) -> HandlerOutcome:
    """Convert `source_file` into `target_file` per the payload's
    prose `spec`, verified by conservation invariants.

    Payload:
        source_file    - machine-parseable input (csv or json)
        target_file    - output to write (never the source, never a
                         test file)
        target_format  - "csv" | "json" (default: from extension)
        schema         - {field: "int"|"float"|"str" | {type, pattern}}
                         every output record must carry exactly these
                         fields and conform; REQUIRED, or the oracle
                         has no teeth
        preserve       - fields whose values must survive verbatim,
                         in row order (string-compared, so csv "1" and
                         json 1 agree)
        spot_checks    - optional [{row, field, expect}] mined ground
                         truth for transformed fields
        spec           - the prose instruction the model follows
    """
    p = ctx.task.payload
    ws = ctx.workspace
    source = p["source_file"]
    target = p["target_file"]
    src_fmt = p.get("source_format") or _infer_format(source)
    tgt_fmt = p.get("target_format") or _infer_format(target)
    schema = p.get("schema") or {}
    preserve = list(p.get("preserve", []))
    spots = list(p.get("spot_checks", []))

    def reject(reason: str) -> HandlerOutcome:
        return HandlerOutcome(
            verdict=ValidatorVerdict(ctx.task.id, False, kind="data"),
            result={"reason": reason})

    if not schema:
        return reject("no_schema: 스키마 없는 변환은 판정 불가")
    if target == source or is_test_file(target):
        return reject(f"bad_target: {target}")
    try:
        src_text = ws.read_text(source)
    except (OSError, IsolationError) as exc:
        return reject(f"source_unreadable: {exc}")
    src_records = _parse_records(src_text, src_fmt)
    if not src_records:
        return reject(f"source_unparseable: {source} ({src_fmt})")

    prompt = (
        "다음 데이터 파일을 지정된 형식으로 변환하라.\n\n"
        f"변환 지시: {p.get('spec', '(형식 변환만)')}\n"
        f"목표 형식: {tgt_fmt}"
        " (json이면 객체 배열, csv면 첫 줄 헤더)\n"
        "목표 스키마 - 모든 레코드가 정확히 이 필드들을 가져야 "
        f"한다: {json.dumps(schema, ensure_ascii=False)}\n"
        f"레코드 수는 원본과 같아야 한다 ({len(src_records)}개). "
        f"다음 필드의 값은 그대로 보존하라: {preserve}\n\n"
        f"원본 ({src_fmt}):\n```\n{src_text[:6000]}\n```\n\n"
        "변환된 파일 내용만 출력하라. 설명 없이.")
    resp = ctx.client.complete(prompt, temperature=1.0,
                               task_id=ctx.task.id,
                               run_id=ctx.task.run_id)
    out_text = _strip_fences(getattr(resp, "text", resp))
    tgt_records = _parse_records(out_text, tgt_fmt)
    if tgt_records is None:
        return reject(f"output_unparseable ({tgt_fmt})")
    ws.write_text(target, out_text + "\n")

    count_match = len(tgt_records) == len(src_records)
    schema_ok = all(
        set(r) == set(schema)
        and all(_conforms(r[f], schema[f]) for f in schema)
        for r in tgt_records)
    preserved_ok = all(
        [str(r.get(f)) for r in src_records]
        == [str(r.get(f)) for r in tgt_records]
        for f in preserve)
    spot_ok = True
    for c in spots:
        row = int(c["row"])
        if not (0 <= row < len(tgt_records)) or \
                str(tgt_records[row].get(c["field"])) != \
                str(c["expect"]):
            spot_ok = False
            break

    accepted = count_match and schema_ok and preserved_ok and spot_ok
    if not accepted:
        ws.reset()
    verdict = ValidatorVerdict(
        ctx.task.id, accepted, kind="data",
        changed_files=[target],
        checks={"count_match": count_match, "schema_ok": schema_ok,
                "preserved_ok": preserved_ok, "spot_ok": spot_ok})
    return HandlerOutcome(
        verdict=verdict,
        result={"source": source, "target": target,
                "records": len(tgt_records)},
        commit_message=f"rookery: convert {source} -> {target}",
        open_pr=accepted)
