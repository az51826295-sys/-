"""Alpha engine: the first real handler - test-driven bug fix.

Spec priority 1 work: a failing test exists, the fix must make it
pass without breaking anything the smoke set covers. This is the most
mechanical of the allowed task kinds, which is why it goes first -
the validator can settle it end to end.

Patch protocol is the one the research series froze (v3a): the model
replies with one block per changed function/method,

    # file: path/to/mod.py
    # class: ClassName        (only for methods)
    def name(...):
        ...

The block is located by its def and spliced with re-indentation.

Two things differ from exp3a on purpose, because this runs inside the
engine and not a research script:

- Every write goes through `ws.write_text`, which enforces workspace
  containment and refuses test files. exp3a wrote with a raw open(),
  which would be an isolation hole here (acceptance condition 5).
- The handler captures the BEFORE state on the clean checkout before
  patching, so the auditor's I1 (fail -> pass) has real evidence
  rather than an asserted "before".

The task payload it expects:
    file          - the source file to edit (relative)
    repro_tests   - pytest ids that must go fail -> pass
    smoke_tests   - pytest ids that must stay passing
    issue         - what the model is told (no fix info)
    focus_symbols - optional: symbols to show instead of the whole file
    reference_patch - optional: {file: source} to validate the tests
"""

from __future__ import annotations

import ast
import os
import re
import textwrap
from dataclasses import dataclass

from genesis.rookery.engine.auditor import ValidatorVerdict
from genesis.rookery.engine.isolation import IsolationError, Workspace
from genesis.rookery.engine.worker import HandlerOutcome, TaskContext


@dataclass
class PatchBlock:
    file: str
    cls: str | None
    name: str
    code: str


# ------------------------------------------------------------- parsing


def parse_patch(response: str) -> list[PatchBlock]:
    """Frozen v3a block format -> PatchBlocks. Unparseable chunks are
    skipped rather than raising, so a chatty model does not crash the
    handler; if nothing parses the caller treats it as a parse fail."""
    text = response.replace("```python", "").replace("```", "")
    blocks: list[PatchBlock] = []
    current_file: str | None = None
    current_cls: str | None = None
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("# file:"):
            current_file = line.split(":", 1)[1].strip()
            current_cls = None
            i += 1
            continue
        if line.startswith("# class:"):
            current_cls = line.split(":", 1)[1].strip() or None
            i += 1
            continue
        if line.startswith(("def ", "async def ")) or \
                line.startswith("@"):
            j = i + 1
            while j < len(lines) and (
                    not lines[j].strip()
                    or lines[j].startswith((" ", "\t"))
                    or lines[j].strip().startswith("@")):
                if lines[j].strip().startswith(("# file:", "# class:")):
                    break
                j += 1
            chunk = textwrap.dedent("\n".join(lines[i:j]))
            try:
                mod = ast.parse(chunk)
            except SyntaxError:
                i = j
                continue
            for node in mod.body:
                if isinstance(node, (ast.FunctionDef,
                                     ast.AsyncFunctionDef)):
                    if current_file:
                        seg = ast.get_source_segment(chunk, node)
                        blocks.append(PatchBlock(
                            file=current_file, cls=current_cls,
                            name=node.name, code=seg))
            i = j
            continue
        i += 1
    return blocks


def _splice(source: str, block: PatchBlock) -> str | None:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return None

    def find(body, cls_name):
        for node in body:
            if (isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                    and node.name == block.name and cls_name is None):
                return node, 0
            if (isinstance(node, ast.ClassDef)
                    and (cls_name is None or node.name == cls_name)):
                for sub in node.body:
                    if (isinstance(sub, (ast.FunctionDef,
                                         ast.AsyncFunctionDef))
                            and sub.name == block.name):
                        return sub, node.col_offset + 4
        return None, 0

    node, indent = find(tree.body, block.cls)
    if node is None and block.cls is not None:
        node, indent = find(tree.body, None)
    if node is None:
        return None
    start = node.lineno - 1
    if node.decorator_list:
        start = node.decorator_list[0].lineno - 1
    lines = source.splitlines()
    new_code = textwrap.indent(textwrap.dedent(block.code), " " * indent)
    return "\n".join(lines[:start] + [new_code] + lines[node.end_lineno:])


def apply_blocks(ws: Workspace, blocks: list[PatchBlock]) -> str | None:
    """Apply through the workspace so containment and the test-file
    ban are enforced. Returns an error string or None."""
    from genesis.rookery.engine.auditor import is_test_file

    by_file: dict[str, list[PatchBlock]] = {}
    for b in blocks:
        if is_test_file(b.file):
            return f"patch_apply_fail: {b.file} is a test file"
        if not ws.contains(b.file):
            return f"path_outside_workspace: {b.file}"
        by_file.setdefault(b.file, []).append(b)
    for path, file_blocks in by_file.items():
        try:
            source = ws.read_text(path)
        except (OSError, IsolationError) as exc:
            return f"patch_apply_fail: cannot read {path}: {exc}"
        for b in file_blocks:
            spliced = _splice(source, b)
            if spliced is None:
                return (f"patch_apply_fail: {b.name} not found in "
                        f"{path}" + (f" (class {b.cls})" if b.cls
                                     else ""))
            source = spliced
        ws.write_text(path, source)
    return None


# ---------------------------------------------------------- prompting


def _focus(ws: Workspace, file: str, symbols: list[str]) -> str:
    try:
        source = ws.read_text(file)
    except (OSError, IsolationError):
        return ""
    if not symbols:
        return source if len(source) < 6000 else source[:6000]
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return source[:6000]
    shown = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef,
                             ast.ClassDef)) and node.name in symbols:
            seg = ast.get_source_segment(source, node)
            if seg:
                shown.append(seg)
    return "\n\n".join(shown) if shown else source[:6000]


def _repro_source(ws: Workspace, repro_tests: list[str]) -> str:
    """The failing tests' source, so the model sees the INTENT, not
    just the assertion delta. The live run showed that a thin issue
    like 'assert 2 == 9' makes the model guess the wrong operation on
    a non-obvious function (max looked like add); the test body
    `assert mx(2, 9) == 9` carries the intent the message omits."""
    shown = []
    for tid in repro_tests:
        path = tid.split("::")[0]
        name = tid.split("::")[-1]
        try:
            src = ws.read_text(path)
            tree = ast.parse(src)
        except Exception:                            # noqa: BLE001
            continue
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef,
                                 ast.AsyncFunctionDef)) \
                    and node.name == name:
                seg = ast.get_source_segment(src, node)
                if seg:
                    shown.append(seg)
    return "\n\n".join(shown)


def build_prompt(ws: Workspace, payload: dict,
                 failure: str | None) -> str:
    target = payload["file"]
    parts = [
        "다음은 실제 파이썬 코드의 버그다. 고쳐라.",
        f"버그 설명: {payload.get('issue', '(설명 없음)')}",
        f"수정 대상 파일: {target}",
    ]
    repro_src = _repro_source(ws, payload.get("repro_tests", []))
    if repro_src:
        parts.append("통과해야 하는 테스트 (원하는 동작이 담겨 있다):"
                     f"\n```python\n{repro_src}\n```")
    parts.append(
        "관련 코드:\n```python\n"
        + _focus(ws, target, payload.get("focus_symbols", []))
        + "\n```")
    if failure:
        parts.append(f"직전 시도의 실패 출력:\n{failure[:1500]}")
    # the file line is pre-filled with the real path: a placeholder
    # like <경로> gets echoed verbatim by smaller models (found in the
    # real-API smoke), so leave nothing for the model to substitute.
    parts.append(
        "수정할 함수/메서드마다 아래 형식의 블록으로만 답하라. "
        "설명·주석·코드펜스 없이 블록만 출력하라. 첫 줄은 반드시 "
        f"정확히 `# file: {target}` 로 시작한다.\n\n"
        f"# file: {target}\n"
        "def 함수이름(매개변수):\n"
        "    # 고친 전체 함수 본문\n"
        "\n"
        "메서드를 고칠 때만 `# file:` 다음 줄에 "
        "`# class: 클래스명` 을 넣어라.")
    return "\n\n".join(parts)


# ------------------------------------------------------------ running


def _run_tests(ws: Workspace, ids: list[str]) -> dict[str, str]:
    """pytest per id through ws.run (safety-checked). 'pass'|'fail'|
    'error'."""
    out = {}
    for tid in ids:
        try:
            r = ws.run(["python", "-m", "pytest", "-x", "-q",
                        "--no-header", "-o", "addopts=", tid],
                       timeout=180)
        except Exception as exc:                     # noqa: BLE001
            out[tid] = "error"
            continue
        out[tid] = classify_pytest(r.returncode,
                                   (r.stdout or "") + (r.stderr or ""))
    return out


def classify_pytest(returncode: int, combined: str) -> str:
    """pytest 결과를 pass|fail|error로. pytest 자신의 요약 줄이
    기준이다: `FAILED x::y`는 테스트가 돌았고 실패한 것 - 실패
    메시지에 ImportError가 들어 있어도 마찬가지 (toolz#529의 재현
    테스트는 `from toolz import mapacc`로 *의도적으로* ImportError
    를 내며 FAILED인데, 본문의 'ImportError' 문자열만 보고 error로
    오분류해 전/후 전부 error → I4 환경 의심 정지를 일으켰다 -
    (b) 재검증 목 파일럿). 요약에 FAILED가 없는 비정상 종료(수집
    오류, 내부 오류, 수집 0건)만 error."""
    if returncode == 0:
        return "pass"
    if re.search(r"^FAILED ", combined, re.M):
        return "fail"
    return "error"


def _complete(client, prompt: str, task_id: str, run_id, worker,
              temperature: float = 1.0) -> str:
    resp = client.complete(prompt, temperature=temperature,
                           task_id=task_id, run_id=run_id,
                           worker=worker)
    return getattr(resp, "text", resp)


def _metrics(results: dict[str, str]) -> float:
    if not results:
        return 0.0
    return sum(1 for v in results.values() if v == "pass") / len(results)


def _retarget(ws: Workspace, blocks: list[PatchBlock],
              target: str) -> list[PatchBlock]:
    """A smaller model sometimes writes a placeholder path (`<경로>`)
    or omits it. When a block's file is not a real source file in the
    workspace and the task declares one target file, point the block
    at that target rather than throwing the fix away."""
    from genesis.rookery.engine.auditor import is_test_file

    for b in blocks:
        try:
            ok = ws.contains(b.file) and \
                os.path.isfile(ws.resolve(b.file)) and \
                not is_test_file(b.file)
        except Exception:                            # noqa: BLE001
            ok = False
        if not ok:
            b.file = target
    return blocks


def code_fix_handler(ctx: TaskContext) -> HandlerOutcome:
    """One task, up to `plan.candidates` attempts. Adopts the first
    patch that turns every repro test fail -> pass while keeping the
    smoke set green. The verdict carries the real before/after that
    the auditor checks.

    The name deliberately does not start with `test_`: pytest would
    collect the handler as a test case."""
    p = ctx.task.payload
    ws = ctx.workspace
    repro = list(p.get("repro_tests", []))
    smoke = list(p.get("smoke_tests", []))
    evidence = repro + smoke

    # BEFORE: on the clean checkout the repro must fail and the smoke
    # must pass; if not, this is not a valid fix task (the auditor's
    # I1/I2 will also refuse it, but we record the truth here).
    before = _run_tests(ws, evidence)

    reference_after: dict[str, str] | None = None
    if p.get("reference_patch"):
        ref_blocks = [PatchBlock(file=f, cls=None, name="",
                                 code=code)
                      for f, code in p["reference_patch"].items()]
        # reference is a whole-file replacement, applied then reverted
        for f, code in p["reference_patch"].items():
            if ws.contains(f):
                ws.write_text(f, code)
        reference_after = _run_tests(ws, evidence)
        ws.reset()

    failure_report: str | None = None
    attempts = max(1, ctx.plan.candidates)
    best: dict | None = None
    for attempt in range(attempts):
        ws.reset()
        prompt = build_prompt(ws, p, failure_report)
        text = _complete(ctx.client, prompt, ctx.task.id,
                         ctx.task.run_id, getattr(ctx.task, "worker",
                                                  None))
        blocks = parse_patch(text)
        blocks = _retarget(ws, blocks, p["file"])
        if not blocks:
            failure_report = "patch_parse_fail: 블록을 찾지 못함"
            ctx.store.log(ctx.task.id, ctx.task.run_id,
                          "candidate", {"attempt": attempt,
                                        "result": "parse_fail"})
            continue
        err = apply_blocks(ws, blocks)
        if err:
            failure_report = err
            ctx.store.log(ctx.task.id, ctx.task.run_id, "candidate",
                          {"attempt": attempt, "result": err[:80]})
            if err.startswith("path_outside_workspace"):
                raise IsolationError(err)
            continue
        after = _run_tests(ws, evidence)
        repro_ok = all(after.get(t) == "pass" for t in repro)
        smoke_ok = all(after.get(t) == "pass" for t in smoke)
        changed = sorted({b.file for b in blocks})
        cand = {"attempt": attempt, "after": after,
                "changed": changed, "repro_ok": repro_ok,
                "smoke_ok": smoke_ok,
                "score": _metrics(after)}
        ctx.store.log(ctx.task.id, ctx.task.run_id, "candidate", {
            "attempt": attempt, "repro_ok": repro_ok,
            "smoke_ok": smoke_ok, "changed": changed})
        if repro_ok and smoke_ok:
            best = cand
            break                       # workspace now holds the fix
        if best is None or cand["score"] > best["score"]:
            best = cand
        failure_report = "; ".join(
            f"{t}: {after[t]}" for t in evidence
            if after.get(t) != "pass")[:1500]
        ws.reset()                      # discard a losing candidate

    if best is None:
        verdict = ValidatorVerdict(
            task_id=ctx.task.id, accepted=False,
            evidence_tests=repro, before=before, after={},
            reference=reference_after)
        return HandlerOutcome(verdict=verdict,
                              result={"reason": "no_candidate"})

    accepted = bool(best["repro_ok"] and best["smoke_ok"])
    # a winning candidate broke out of the loop and its patch is still
    # in the workspace for the engine to commit; a losing best was
    # reset, and accepted=False means the engine will not commit it.
    after = best["after"]
    # No metrics are handed to the auditor's I5: the evidence tests
    # going fail -> pass IS the task, so their pass-rate legitimately
    # jumps 0 -> 1 on every correct fix. I1 already validates that
    # transition rigorously, and I5's real leak check (patch edited a
    # test file) fires from changed_files regardless.
    verdict = ValidatorVerdict(
        task_id=ctx.task.id, accepted=accepted,
        evidence_tests=repro, before=before, after=after,
        reference=reference_after, changed_files=best["changed"])
    return HandlerOutcome(
        verdict=verdict,
        result={"changed_files": best["changed"],
                "attempts_used": best["attempt"] + 1},
        commit_message=f"rookery: fix {ctx.task.id}",
        open_pr=accepted)
