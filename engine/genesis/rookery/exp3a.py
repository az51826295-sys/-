"""v3a A/B harness: real-repo bug fixing (docs/rookery-exp3a-design.md).

Arm A (sequential single agent): one candidate per call, sees the
public-test failure output of its previous attempt, stops early when
public tests pass. Budget: 6 calls.

Arm B (institutional): rounds of 3 candidates from the same prompt
(temp 1.0), AST-signature dedup, public-test selection,
champion-challenger with rollback; the champion's failure output is
the next round's observation. Past candidates never enter the prompt
(the 7D lesson). Budget: 2 rounds x 3 = 6 calls.

Hidden and regression tests are validator-only: they never run during
the loop, only on the final champion. Failure codes stay distinct
end-to-end; test executions and wall-clock are metered per arm.

Patch protocol: the model replies with one block per changed function/
method:

    # file: path/to/file.py
    # class: ClassName        (only for methods)
    def name(...):
        ...

Blocks are applied by locating the named def (module level or inside
the named class) and splicing with re-indentation.
"""

from __future__ import annotations

import ast
import json
import os
import textwrap
import time

from pydantic import BaseModel, Field

from genesis.rookery.adapters.repo_tasks import (
    RepoTask,
    TASKS_V3A,
    _run,
    run_pytest,
    worktree_at,
)

DATA = "data"
CALLS_PER_TASK = 6
ROUND_SIZE = 3


# ------------------------------------------------------------ focus view


def extract_focus(source: str, symbol: str) -> str | None:
    """'func', 'Class' or 'Class.method' -> source segment."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return None
    if "." in symbol:
        cls_name, meth = symbol.split(".", 1)
        for node in tree.body:
            if isinstance(node, ast.ClassDef) and node.name == cls_name:
                for sub in node.body:
                    if (isinstance(sub, (ast.FunctionDef,
                                         ast.AsyncFunctionDef))
                            and sub.name == meth):
                        seg = ast.get_source_segment(source, sub)
                        return (f"class {cls_name}:  # (excerpt)\n"
                                + textwrap.indent(textwrap.dedent(seg),
                                                  "    "))
        return None
    for node in tree.body:
        if (isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef,
                              ast.ClassDef))
                and node.name == symbol):
            return ast.get_source_segment(source, node)
    return None


def focus_blocks(task: RepoTask, wt: str) -> str:
    out = []
    for path in task.files_changed:
        with open(os.path.join(wt, path), encoding="utf-8") as f:
            source = f.read()
        shown = []
        for symbol in task.focus_symbols:
            seg = extract_focus(source, symbol)
            if seg:
                shown.append(seg)
        body = "\n\n".join(shown) if shown else source
        out.append(f"### file: {path} (관련 부분 발췌)\n```python\n"
                   f"{body}\n```")
    return "\n\n".join(out)


def build_prompt(task: RepoTask, wt: str,
                 failure_report: str | None) -> str:
    tests = []
    for name, content in task.extra_test_files.items():
        if name in task.public_repro:
            tests.append(content)
    for tid in task.public_repro:
        if "::" in tid:
            tests.append(f"(기존 테스트 실행: pytest {tid})")
    parts = [
        "다음은 실제 파이썬 라이브러리의 버그다. 고쳐라.",
        f"버그 설명: {task.issue_summary}",
        focus_blocks(task, wt),
        "통과해야 하는 재현 테스트:\n```python\n"
        + "\n".join(tests) + "\n```",
    ]
    if failure_report:
        parts.append(f"직전 시도의 테스트 실패 출력:\n{failure_report}")
    parts.append(
        "수정할 함수/메서드마다 아래 형식의 블록으로만 답하라. "
        "다른 텍스트 금지.\n"
        "# file: <경로>\n"
        "# class: <클래스명>   (메서드일 때만)\n"
        "def <이름>(...):      (완전한 새 정의, 모듈 최상위 들여쓰기로)")
    return "\n\n".join(parts)


# --------------------------------------------------------- patch apply


class PatchBlock(BaseModel):
    file: str
    cls: str | None
    name: str
    code: str


def parse_patch(response: str, task: RepoTask) -> list[PatchBlock] | None:
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
        if line.startswith(("def ", "async def ")) or line.startswith("@"):
            j = i + 1
            while j < len(lines) and (
                    not lines[j].strip()
                    or lines[j].startswith((" ", "\t"))
                    or lines[j].strip().startswith("@")):
                if (lines[j].strip().startswith(("# file:", "# class:"))):
                    break
                j += 1
            chunk = textwrap.dedent("\n".join(lines[i:j]))
            try:
                mod = ast.parse(chunk)
            except SyntaxError:
                return None
            for node in mod.body:
                if isinstance(node, (ast.FunctionDef,
                                     ast.AsyncFunctionDef)):
                    blocks.append(PatchBlock(
                        file=current_file or task.files_changed[0],
                        cls=current_cls, name=node.name,
                        code=ast.get_source_segment(chunk, node)))
            i = j
            continue
        i += 1
    return blocks or None


def _is_test_path(task: RepoTask, path: str) -> bool:
    norm = path.replace("\\", "/")
    base = os.path.basename(norm)
    return (norm in task.extra_test_files
            or base.startswith("test_")
            or "/test" in f"/{norm}".lower())


def apply_blocks(wt: str, task: RepoTask,
                 blocks: list[PatchBlock]) -> str | None:
    """Returns an error string or None. Any library file is patchable;
    test files (repo tests and our injected suites) never are — the
    agent must not be able to make tests pass by editing tests."""
    by_file: dict[str, list[PatchBlock]] = {}
    for b in blocks:
        if _is_test_path(task, b.file):
            return f"patch_apply_fail: {b.file} is a test file"
        if not os.path.isfile(os.path.join(wt, b.file)):
            return f"patch_apply_fail: {b.file} does not exist"
        by_file.setdefault(b.file, []).append(b)
    for path, file_blocks in by_file.items():
        full = os.path.join(wt, path)
        with open(full, encoding="utf-8") as f:
            source = f.read()
        for b in file_blocks:
            source = _splice(source, b)
            if source is None:
                return (f"patch_apply_fail: {b.name} not found in "
                        f"{path}" + (f" (class {b.cls})" if b.cls else ""))
        with open(full, "w", encoding="utf-8", newline="") as f:
            f.write(source)
    return None


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
    return "\n".join(lines[:start] + [new_code]
                     + lines[node.end_lineno:])


# ------------------------------------------------------------- the arms


_DIVERSE_PAD = (
    "The sky above the harbor was a soft shade of gray that morning, "
    "and the boats moved slowly across the water while gulls circled "
    "overhead in wide unhurried loops. " * 6)

_DIVERSE_ALT = (
    "첫 번째로 떠오르는 수정 경로와 다른 원인 가설을 세우고, "
    "다른 파일이나 호출 경로에서 원인을 찾아라.")

# frozen per-slot manipulations for B-diverse (design §6.8):
# slot 0 baseline / slot 1 non-semantic padding / slot 2 explicit
# alternative-hypothesis instruction
DIVERSE_SLOTS = ("", f"\n\nNOTE (formatting filler):\n{_DIVERSE_PAD}",
                 f"\n\n{_DIVERSE_ALT}")


class Candidate(BaseModel):
    call: int
    code_fail: str | None = None     # patch_parse_fail/patch_apply_fail
    duplicate: bool = False
    public_pass: bool = False
    detail: str = ""
    files: list[str] = Field(default_factory=list)
    sig: str = ""
    # §6.14 instrumentation (None on runs that predate it)
    repro_pass: bool | None = None   # public repro + existing public
    smoke_pass: bool | None = None   # regression smoke
    ia_valid: bool | None = None     # None = no IA attempted
    ia_len: int = 0
    # §6.16 selector-side instrumentation
    mapped_ids: list[str] = Field(default_factory=list)
    mapped_pass: bool | None = None  # None = no mapped tests / not run
    no_mapped: bool | None = None    # no_mapped_regression_test flag


class TaskRun(BaseModel):
    task: str
    arm: str
    rep: int
    candidates: list[Candidate] = Field(default_factory=list)
    test_runs: int = 0
    rollback_rounds: int = 0
    duplicates: int = 0
    first_candidate_full: bool = False
    final_status: str = "no_patch"   # full/public_only/... failure code
    wall_s: float = 0.0
    failure_report_chars: int = 0


def _reset(wt: str, task: RepoTask) -> None:
    _run(["git", "checkout", "--", "."], wt)
    for name, content in task.extra_test_files.items():
        with open(os.path.join(wt, name), "w", encoding="utf-8") as f:
            f.write(content)


def _public(wt: str, task: RepoTask, run: TaskRun) -> tuple[bool, str]:
    # 2026-08-02 revision: the selector also sees the regression smoke
    # tests — the rollover lesson (selection on repro alone cannot see
    # collateral damage). Broad regression_hidden stays validator-only.
    ids = task.public_repro + task.public_pass + task.regression
    run.test_runs += len(ids)
    fails = []
    for tid in ids:
        got, detail = run_pytest(wt, [tid])
        if got != "pass":
            fails.append(f"{tid}: {detail[-160:]}")
    return not fails, "; ".join(fails)[:400]


def _public_cats(wt: str, task: RepoTask,
                 run: TaskRun) -> tuple[bool, str, bool, bool]:
    """_public with per-category results: (all_ok, fails, repro_ok,
    smoke_ok). repro = public repro + existing public tests; smoke =
    the regression smoke set the selector sees."""
    fails = []
    ok_by = {}
    for label, ids in (("repro", task.public_repro + task.public_pass),
                       ("smoke", task.regression)):
        run.test_runs += len(ids)
        ok = True
        for tid in ids:
            got, detail = run_pytest(wt, [tid])
            if got != "pass":
                ok = False
                fails.append(f"{tid}: {detail[-160:]}")
        ok_by[label] = ok
    return (ok_by["repro"] and ok_by["smoke"],
            "; ".join(fails)[:400], ok_by["repro"], ok_by["smoke"])


def _final(wt: str, task: RepoTask, run: TaskRun,
           champion: list[PatchBlock] | None) -> None:
    if champion is None:
        run.final_status = "no_patch"
        return
    _reset(wt, task)
    err = apply_blocks(wt, task, champion)
    if err:
        run.final_status = "patch_apply_fail"
        return
    ok_pub, _ = _public(wt, task, run)
    got_h, _ = run_pytest(wt, task.hidden)
    got_r, _ = run_pytest(wt, task.regression)
    got_rh, _ = run_pytest(wt, task.regression_hidden)
    run.test_runs += 3
    if got_r != "pass" or got_rh != "pass":
        run.final_status = "regression"
    elif ok_pub and got_h == "pass":
        run.final_status = "full"
    elif ok_pub:
        run.final_status = "public_only"
    else:
        run.final_status = "public_fail"


def _propose(provider, task, wt, failure_report, call_no, seq,
             focus_override: str | None = None, suffix: str = ""):
    prompt = build_prompt(task, wt, failure_report)
    if focus_override is not None:
        prompt = prompt.replace(focus_blocks(task, wt), focus_override, 1)
    prompt += suffix
    response = provider.complete(prompt, 1.0, call_no, seq)
    return prompt, response, parse_patch(response, task)


# ------------------------------------------------- exploration protocol


def repo_tree(wt: str) -> str:
    r = _run(["git", "ls-files", "*.py"], wt)
    lines = []
    for path in r.stdout.splitlines():
        full = os.path.join(wt, path)
        try:
            with open(full, encoding="utf-8", errors="replace") as f:
                n = sum(1 for _ in f)
        except OSError:
            continue
        lines.append(f"{path} ({n}줄)")
    return "\n".join(lines)


def explore_call(provider, task: RepoTask, wt: str, rep: int) -> str | None:
    """Call 1 of the exploration protocol: the agent sees only the
    issue and the file tree, and must name what to read. Returns the
    rendered focus text (capped) or None on protocol failure."""
    prompt = (
        "다음은 실제 파이썬 라이브러리의 버그다.\n"
        f"버그 설명: {task.issue_summary}\n\n"
        f"저장소 파일 목록:\n{repo_tree(wt)}\n\n"
        "버그를 고치기 위해 읽어야 할 곳을 JSON 하나로만 답하라 "
        "(최대 5개):\n"
        '{"reads": ["경로.py::심볼" 또는 "경로.py"]}\n'
        "심볼은 함수명, 클래스명, 또는 클래스.메서드.")
    response = provider.complete(prompt, 1.0, 0, rep)
    m = json.loads(response[response.find("{"):response.rfind("}") + 1]) \
        if "{" in response else None
    if not m or not isinstance(m.get("reads"), list):
        return None
    out = []
    budget = 12000
    for read in m["reads"][:5]:
        if "::" in read:
            path, symbol = read.split("::", 1)
        else:
            path, symbol = read, None
        full = os.path.join(wt, path)
        if not os.path.isfile(full):
            out.append(f"### {read}: 파일 없음")
            continue
        with open(full, encoding="utf-8", errors="replace") as f:
            source = f.read()
        seg = extract_focus(source, symbol) if symbol else None
        if seg is None:
            seg = source if len(source) < 6000 else source[:6000]
        seg = seg[:budget]
        budget -= len(seg)
        out.append(f"### file: {path}"
                   + (f" ({symbol})" if symbol else "")
                   + f"\n```python\n{seg}\n```")
        if budget <= 0:
            break
    return "\n\n".join(out)


def run_arm(task: RepoTask, arm: str, rep: int, provider, log,
            explore: bool = False, diverse: bool = False,
            budget: int = CALLS_PER_TASK) -> TaskRun:
    """budget: 총 제안 호출 수. 기본은 기존 6 — 제거 실험(BF)은
    §6.11 BS와 동일 예산 8로 호출한다 (조건 간 유일 차이가
    구조이도록)."""
    t0 = time.time()
    run = TaskRun(task=task.task_id, arm=arm, rep=rep)
    wt = worktree_at(task, task.parent_commit, "work")
    _reset(wt, task)
    champion: list[PatchBlock] | None = None
    champion_pass = False
    failure_report: str | None = None
    seen_sigs: set[str] = set()
    call = 0
    focus_override: str | None = None
    if explore:
        focus_override = explore_call(provider, task, wt, rep)
        call = 1                    # exploration consumes budget
        log({"task": task.task_id, "arm": arm, "rep": rep,
             "call": 0, "exploration": True,
             "focus_chars": len(focus_override or "")})
        if focus_override is None:
            focus_override = "(탐색 실패: 코드 발췌 없음)"
    while call < budget:
        round_size = 1 if arm == "A" else ROUND_SIZE
        adopted_this_round = False
        for slot in range(round_size):
            if call >= budget:
                break
            suffix = DIVERSE_SLOTS[slot % 3] if diverse else ""
            prompt, response, blocks = _propose(
                provider, task, wt, failure_report, call, rep,
                focus_override=focus_override, suffix=suffix)
            cand = Candidate(call=call)
            is_first_patch = not any(
                not c.duplicate for c in run.candidates) and \
                not run.candidates
            if blocks is None:
                cand.code_fail = "patch_parse_fail"
            else:
                cand.files = sorted({b.file for b in blocks})
                sig = json.dumps(sorted(
                    (b.file, b.cls or "", b.name,
                     ast.dump(ast.parse(textwrap.dedent(b.code))))
                    for b in blocks), ensure_ascii=False)
                import hashlib
                cand.sig = hashlib.sha256(
                    sig.encode()).hexdigest()[:12]
                if arm == "B" and sig in seen_sigs:
                    cand.duplicate = True
                    run.duplicates += 1
                seen_sigs.add(sig)
                if not cand.duplicate:
                    _reset(wt, task)
                    err = apply_blocks(wt, task, blocks)
                    if err:
                        cand.code_fail = "patch_apply_fail"
                        cand.detail = err
                    else:
                        ok, fails = _public(wt, task, run)
                        cand.public_pass = ok
                        cand.detail = fails
                        if is_first_patch:
                            run.first_candidate_full = ok
                        # both arms: any valid patch beats no patch;
                        # a public-passing patch beats a failing one
                        adopt = (champion is None
                                 or (ok and not champion_pass))
                        if adopt:
                            champion, champion_pass = blocks, ok
                            adopted_this_round = True
            run.candidates.append(cand)
            log({"task": task.task_id, "arm": arm, "rep": rep,
                 "call": call, "prompt_chars": len(prompt),
                 "response": response,
                 "candidate": cand.model_dump()})
            if arm == "A":
                failure_report = (cand.detail or cand.code_fail
                                  or None)
            call += 1
            if arm == "A" and cand.public_pass:
                call = budget
                break
        if arm == "B":
            if not adopted_this_round:
                run.rollback_rounds += 1
            if champion_pass:
                break
            if champion is not None:
                _reset(wt, task)
                if apply_blocks(wt, task, champion) is None:
                    _, fails = _public(wt, task, run)
                    failure_report = fails or None
    _final(wt, task, run, champion)
    run.wall_s = round(time.time() - t0, 1)
    return run


def run_experiment(provider, tag: str, reps: int = 3,
                   tasks: list[RepoTask] | None = None,
                   explore: bool = False) -> dict:
    calls_path = os.path.join(DATA, f"rookery3a_calls_{tag}.jsonl")

    def log(entry):
        with open(calls_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    results = []
    for task in (tasks or TASKS_V3A):
        for rep in range(reps):
            for arm in ("A", "B"):
                r = run_arm(task, arm, rep, provider, log,
                            explore=explore)
                results.append(r.model_dump())
                print(f"[{tag}] {task.task_id} {arm} rep{rep}: "
                      f"{r.final_status} ({r.wall_s}s)", flush=True)
    summary = summarize(results)
    summary["usage"] = dict(getattr(provider, "usage", {}))
    with open(os.path.join(DATA, f"rookery3a_report_{tag}.json"), "w",
              encoding="utf-8") as f:
        json.dump({"results": results, "summary": summary}, f,
                  ensure_ascii=False, indent=1)
    return summary


RESISTANT = ("mi_running_minmax_stability", "du_isotime_midnight",
             "du_isoparse_t24_rollover")


# ------------------------------------------- B-search (design §6.10)


class Hypothesis(BaseModel):
    file: str
    function: str
    call_path: str = ""
    reason: str = ""
    falsifier: str = ""


def _resolve_symbol(wt: str, path: str, func: str) -> str | None:
    """Models write free text in the function field ('running_min 또는
    running_max (레시피 구현)') — extract identifier candidates and
    return the first that actually exists in the file."""
    import re

    full = os.path.join(wt, path)
    if not os.path.isfile(full):
        return None
    try:
        with open(full, encoding="utf-8", errors="replace") as f:
            tree = ast.parse(f.read())
    except SyntaxError:
        return None
    defined = {n.name for n in ast.walk(tree)
               if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef,
                                 ast.ClassDef))}
    for cand in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", func):
        if cand in defined:
            return cand
    return None


def hypothesis_call(provider, task: RepoTask, wt: str, rep: int,
                    negative: list[str], call_no: int,
                    log=None) -> list[Hypothesis]:
    """log가 주어지면 원시 응답을 남긴다 - ablation11 1차 시도에서
    가설 0개의 원인(max_tokens 절단)을 로그만으로 특정할 수 없었던
    사각지대를 메우는 관측 전용 인자. 파싱 행동은 불변."""
    neg = ("\n확인된 불가능 위치 (기계 검증됨 — 다시 제안 금지):\n"
           + "\n".join(f"- {n}" for n in negative)) if negative else ""
    prompt = (
        "다음은 실제 파이썬 라이브러리의 버그다.\n"
        f"버그 설명: {task.issue_summary}\n\n"
        f"저장소 파일 목록:\n{repo_tree(wt)}\n{neg}\n\n"
        "서로 다른 원인 가설을 4~5개 생성하라. 각 가설은 가능하면 "
        "서로 다른 파일 또는 다른 함수를 지목해야 한다. JSON 배열 "
        "하나로만 답하라:\n"
        '[{"file": "경로.py", "function": "함수명 또는 클래스.메서드", '
        '"call_path": "호출 경로", "reason": "관측 증상과 연결되는 '
        '이유", "falsifier": "이 가설을 반증할 조건"}]')
    response = provider.complete(prompt, 1.0, call_no, rep)
    if log is not None:
        log({"task": task.task_id, "rep": rep, "call": call_no,
             "hypothesis_response": response[:2000]})
    try:
        arr = json.loads(
            response[response.find("["):response.rfind("]") + 1])
        return [Hypothesis(**h) for h in arr if isinstance(h, dict)][:5]
    except Exception:
        return []


def select_hypotheses(hyps: list[Hypothesis], wt: str,
                      ban_list: list[str],
                      registry_add) -> list[Hypothesis]:
    """Mechanical validation + differentiation (design priority:
    different files > different functions). Invalid locations are
    recorded as negative evidence; ban_list holds the locations the
    institution refuses to revisit (empty under §6.12 ablation — the
    shadow registry still records via registry_add)."""
    valid: list[Hypothesis] = []
    for h in hyps:
        resolved = _resolve_symbol(wt, h.file, h.function)
        if resolved is None:
            registry_add(f"{h.file}::{h.function} — 심볼 없음")
            continue
        h = h.model_copy(update={"function": resolved})
        key = f"{h.file}::{h.function}"
        if any(key in n for n in ban_list):
            continue                      # institution-level ban
        valid.append(h)
    chosen: list[Hypothesis] = []
    seen_files: set[str] = set()
    for h in valid:                       # pass 1: distinct files
        if h.file not in seen_files:
            chosen.append(h)
            seen_files.add(h.file)
    for h in valid:                       # pass 2: distinct functions
        if len(chosen) >= 3:
            break
        if h not in chosen and all(
                (c.file, c.function) != (h.file, h.function)
                for c in chosen):
            chosen.append(h)
    return chosen[:3]


def hypothesis_focus(task: RepoTask, wt: str, h: Hypothesis) -> str:
    full = os.path.join(wt, h.file)
    with open(full, encoding="utf-8", errors="replace") as f:
        source = f.read()
    seg = (extract_focus(source, h.function)
           or extract_focus(source, h.function.split(".")[-1])
           or source[:6000])
    return (f"조사 가설 (이 위치를 검증하고 필요하면 수정하라):\n"
            f"- 파일: {h.file}\n- 함수: {h.function}\n"
            f"- 호출 경로: {h.call_path}\n- 이유: {h.reason}\n"
            f"- 반증 조건: {h.falsifier}\n\n"
            f"### file: {h.file}\n```python\n{seg}\n```")


# ------------------------------------------- impact analysis (§6.14)


IA_PAD = _DIVERSE_PAD[:900]      # fixed-length neutral prose, B-pad


def ia_call(provider, task: RepoTask, wt: str, h: Hypothesis,
            call_no: int, rep: int) -> tuple[dict | None, str]:
    """One impact-analysis call for the chosen hypothesis. Returns
    (analysis, raw_response). The AST gate (file/function must
    resolve) is applied here; failures return None."""
    prompt = (
        "다음은 실제 파이썬 라이브러리의 버그다. 아직 고치지 마라.\n"
        f"버그 설명: {task.issue_summary}\n\n"
        + hypothesis_focus(task, wt, h) + "\n\n"
        "패치 전에 영향 분석을 JSON 하나로만 답하라:\n"
        '{"file": "수정할 경로.py", "function": "수정할 함수 또는 '
        '클래스.메서드", "call_paths": ["이 함수를 호출하는 경로"], '
        '"preserve": ["유지해야 하는 기존 동작 (가능하면 테스트 id)"], '
        '"regression_risk": ["예상 회귀 지점"], '
        '"min_scope": "최소 수정 범위 한 문장"}')
    response = provider.complete(prompt, 1.0, call_no, rep)
    try:
        obj = json.loads(
            response[response.find("{"):response.rfind("}") + 1])
    except Exception:
        return None, response
    if not isinstance(obj, dict) or not obj.get("file") \
            or not obj.get("function"):
        return None, response
    if _resolve_symbol(wt, str(obj["file"]),
                       str(obj["function"])) is None:
        return None, response
    return obj, response


def render_ia_block(ia: dict) -> str:
    def _list(key):
        v = ia.get(key) or []
        return "; ".join(str(x) for x in v) if isinstance(v, list) \
            else str(v)
    return ("영향 분석 (패치는 이 분석과 일관되어야 한다):\n"
            f"- 수정 위치: {ia['file']}::{ia['function']}\n"
            f"- 영향 호출 경로: {_list('call_paths')}\n"
            f"- 유지할 기존 동작: {_list('preserve')}\n"
            f"- 예상 회귀 지점: {_list('regression_risk')}\n"
            f"- 최소 수정 범위: {ia.get('min_scope', '')}")


# --------------------------------------- selector-side IA (§6.16)


MAPPED_CAP = 6         # test-case budget per candidate (frozen)


def repo_test_ids(wt: str, targets: set[str],
                  cap: int = MAPPED_CAP) -> list[str]:
    """Repo-native (git-tracked) test functions whose body references
    any target identifier -> pytest ids, deterministic order, capped.
    Never creates tests (frozen constraint 3)."""
    ids: list[str] = []
    r = _run(["git", "ls-files", "*.py"], wt)
    for path in sorted(r.stdout.splitlines()):
        base = os.path.basename(path)
        if not (base.startswith("test_") or "/test" in f"/{path}"):
            continue
        try:
            with open(os.path.join(wt, path), encoding="utf-8",
                      errors="replace") as f:
                tree = ast.parse(f.read())
        except (OSError, SyntaxError):
            continue

        def refs(node) -> set[str]:
            out = set()
            for sub in ast.walk(node):
                if isinstance(sub, ast.Name):
                    out.add(sub.id)
                elif isinstance(sub, ast.Attribute):
                    out.add(sub.attr)
            return out

        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                    and node.name.startswith("test") \
                    and refs(node) & targets:
                ids.append(f"{path}::{node.name}")
            elif isinstance(node, ast.ClassDef):
                for sub in node.body:
                    if isinstance(sub, (ast.FunctionDef,
                                        ast.AsyncFunctionDef)) \
                            and sub.name.startswith("test") \
                            and refs(sub) & targets:
                        ids.append(f"{path}::{node.name}::{sub.name}")
            if len(ids) >= cap:
                return ids[:cap]
    return ids[:cap]


def ia_targets(ia: dict) -> set[str]:
    """Identifier candidates from the IA's function + call paths."""
    import re
    text = " ".join([str(ia.get("function", ""))]
                    + [str(x) for x in (ia.get("call_paths") or [])])
    return set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", text)) - {
        "py", "self", "def", "class", "return", "import"}


def ia_call_selector(provider, task: RepoTask,
                     blocks: list[PatchBlock], call_no: int,
                     rep: int) -> dict | None:
    """Post-patch impact analysis, selector-only (never enters any
    proposer prompt — frozen constraint)."""
    patch_text = "\n\n".join(
        f"# file: {b.file}\n" + (f"# class: {b.cls}\n" if b.cls else "")
        + b.code for b in blocks)
    prompt = (
        "다음은 실제 파이썬 라이브러리의 버그에 대한 패치 후보다.\n"
        f"버그 설명: {task.issue_summary}\n\n"
        f"패치:\n```python\n{patch_text}\n```\n\n"
        "이 패치의 영향 분석을 JSON 하나로만 답하라:\n"
        '{"file": "수정된 경로.py", "function": "수정된 함수", '
        '"call_paths": ["이 함수를 호출하거나 영향을 받는 함수/경로"], '
        '"preserve": ["유지되어야 하는 기존 동작"], '
        '"regression_risk": ["예상 회귀 지점"], '
        '"min_scope": "한 문장"}')
    response = provider.complete(prompt, 1.0, call_no, rep)
    try:
        obj = json.loads(
            response[response.find("{"):response.rfind("}") + 1])
    except Exception:
        return None
    if not isinstance(obj, dict) or not obj.get("function"):
        return None
    return obj


def _prepatch_ok(wt: str, task: RepoTask, tid: str,
                 cache: dict[str, bool]) -> bool:
    """Frozen constraint 2: a mapped test is usable only if it passes
    on the clean (pre-patch) tree. Cached per run."""
    if tid not in cache:
        _reset(wt, task)
        got, _ = run_pytest(wt, [tid])
        cache[tid] = got == "pass"
    return cache[tid]


def sel_tier(ok: bool, mapped_pass: bool | None) -> int:
    """Frozen champion rule: public+smoke+mapped > public+smoke only
    > any valid patch."""
    if not ok:
        return 0
    return 2 if mapped_pass else 1


def run_arm_bsearch(task: RepoTask, rep: int, provider, log,
                    use_registry: bool = True,
                    ia_mode: str = "none") -> tuple[TaskRun, dict]:
    """B-search: [hypothesis(1) + patch x3] x 2 rounds = 8 calls.
    Extra exploration cost is allowed and recorded (design §6.10).

    use_registry=False is the §6.12 ablation: refuted locations are
    neither shown to the model nor banned from selection. The shadow
    registry still records every refutation so both arms share one
    revisit formula."""
    t0 = time.time()
    arm = {"ia": "BIA", "pad": "BPAD", "sel": "BSEL",
           "pub": "BPUB"}.get(ia_mode, "BS" if use_registry else "BSN")
    budget = 14 if ia_mode == "ia" else 8
    prepatch_cache: dict[str, bool] = {}
    sel_ia_calls = 0
    run = TaskRun(task=task.task_id, arm=arm, rep=rep)
    wt = worktree_at(task, task.parent_commit, "work")
    _reset(wt, task)
    negative: list[str] = []
    hyp_stats = {"generated": 0, "valid_selected": 0,
                 "distinct_files": set(), "correct_file_hyp": False,
                 "banned_revisits": 0}

    def registry_add(entry: str) -> None:
        if entry not in negative:
            negative.append(entry)

    champion: list[PatchBlock] | None = None
    champion_pass = False
    champion_tier = 0
    call = 0
    for rnd in range(2):
        hyps = hypothesis_call(provider, task, wt, rep,
                               negative if use_registry else [], call,
                               log=log)
        call += 1
        hyp_stats["generated"] += len(hyps)
        hyp_stats["banned_revisits"] += sum(
            1 for h in hyps
            if any(f"{h.file}::{h.function}" in n for n in negative))
        chosen = select_hypotheses(
            hyps, wt, negative if use_registry else [], registry_add)
        hyp_stats["valid_selected"] += len(chosen)
        validation = [
            {"file": h.file, "function": h.function,
             "resolved": _resolve_symbol(wt, h.file, h.function)}
            for h in hyps]
        for h in chosen:
            hyp_stats["distinct_files"].add(h.file)
            if h.file in task.files_changed:
                hyp_stats["correct_file_hyp"] = True
        log({"task": task.task_id, "arm": arm, "rep": rep,
             "round": rnd, "use_registry": use_registry,
             "hypotheses": [h.model_dump() for h in hyps],
             "chosen": [h.model_dump() for h in chosen],
             "validation": validation,
             "negative": list(negative)})
        adopted = False
        for h in chosen:
            if call >= budget:
                break
            focus = hypothesis_focus(task, wt, h)
            ia_valid: bool | None = None
            ia_len = 0
            if ia_mode == "ia" and call + 1 < budget:
                ia, ia_raw = ia_call(provider, task, wt, h, call, rep)
                log({"task": task.task_id, "arm": arm, "rep": rep,
                     "call": call, "ia_response": ia_raw,
                     "ia": ia})
                call += 1
                if ia is not None:
                    block = render_ia_block(ia)
                    ia_valid, ia_len = True, len(block)
                    focus += "\n\n" + block
                else:
                    ia_valid = False
            elif ia_mode == "pad":
                focus += "\n\n참고 자료 (형식 채움):\n" + IA_PAD
            prompt, response, blocks = _propose(
                provider, task, wt, None, call, rep,
                focus_override=focus)
            cand = Candidate(call=call, ia_valid=ia_valid,
                             ia_len=ia_len)
            if blocks is None:
                cand.code_fail = "patch_parse_fail"
            else:
                cand.files = sorted({b.file for b in blocks})
                import hashlib
                raw = json.dumps(sorted(
                    (b.file, b.cls or "", b.name,
                     ast.dump(ast.parse(textwrap.dedent(b.code))))
                    for b in blocks), ensure_ascii=False)
                cand.sig = hashlib.sha256(raw.encode()).hexdigest()[:12]
                _reset(wt, task)
                err = apply_blocks(wt, task, blocks)
                if err:
                    cand.code_fail = "patch_apply_fail"
                    cand.detail = err
                    if "not found in" in err:
                        registry_add(err.replace("patch_apply_fail: ",
                                                 "") + " — 적용 검증")
                else:
                    ok, fails, repro_ok, smoke_ok = _public_cats(
                        wt, task, run)
                    cand.public_pass = ok
                    cand.repro_pass = repro_ok
                    cand.smoke_pass = smoke_ok
                    cand.detail = fails
                    if ia_mode == "sel" and ok and sel_ia_calls < 6:
                        # selector-only IA: never enters any proposer
                        # prompt (frozen constraint 7: no feedback)
                        ia = ia_call_selector(provider, task, blocks,
                                              call, rep)
                        sel_ia_calls += 1
                        cand.ia_valid = ia is not None
                        usable = []
                        if ia is not None:
                            for tid in repo_test_ids(wt,
                                                     ia_targets(ia)):
                                fresh = tid not in prepatch_cache
                                pre_ok = _prepatch_ok(
                                    wt, task, tid, prepatch_cache)
                                if fresh:
                                    run.test_runs += 1
                                if pre_ok:
                                    usable.append(tid)
                        cand.mapped_ids = usable
                        cand.no_mapped = not usable
                        if usable:
                            _reset(wt, task)
                            apply_blocks(wt, task, blocks)
                            run.test_runs += len(usable)
                            cand.mapped_pass = all(
                                run_pytest(wt, [tid])[0] == "pass"
                                for tid in usable)
                        log({"task": task.task_id, "arm": arm,
                             "rep": rep, "call": call, "sel_ia": ia,
                             "mapped_ids": usable,
                             "mapped_pass": cand.mapped_pass,
                             "no_mapped": cand.no_mapped})
                    tier = sel_tier(ok, cand.mapped_pass)
                    if not run.candidates:
                        run.first_candidate_full = ok
                    if champion is None or tier > champion_tier:
                        champion, champion_tier = blocks, tier
                        champion_pass = tier >= 1
                        adopted = True
            run.candidates.append(cand)
            log({"task": task.task_id, "arm": arm, "rep": rep,
                 "call": call, "hypothesis": h.model_dump(),
                 "response": response,
                 "candidate": cand.model_dump()})
            call += 1
        if not adopted:
            run.rollback_rounds += 1
        if champion_pass:
            break
    _final(wt, task, run, champion)
    run.wall_s = round(time.time() - t0, 1)
    hyp_stats["distinct_files"] = len(hyp_stats["distinct_files"])
    return run, hyp_stats


def run_micro(provider, reps: int = 5) -> dict:
    """Design §6.8: B0 vs B-diverse on the three resistant tasks,
    exploration mode, primary verdict = candidate diversity."""
    calls_path = os.path.join(DATA, "rookery3a_calls_micro.jsonl")

    def log(entry):
        with open(calls_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    tasks = [t for t in TASKS_V3A if t.task_id in RESISTANT]
    results = []
    for task in tasks:
        for rep in range(reps):
            for label, diverse in (("B0", False), ("BD", True)):
                r = run_arm(task, "B", rep, provider, log,
                            explore=True, diverse=diverse)
                row = r.model_dump()
                row["arm"] = label
                results.append(row)
                print(f"[micro] {task.task_id} {label} rep{rep}: "
                      f"{r.final_status}", flush=True)
    report = micro_summarize(results, tasks)
    report["usage"] = dict(getattr(provider, "usage", {}))
    with open(os.path.join(DATA, "rookery3a_report_micro.json"), "w",
              encoding="utf-8") as f:
        json.dump({"results": results, "summary": report}, f,
                  ensure_ascii=False, indent=1)
    return report


def micro_summarize(results: list[dict],
                    tasks: list[RepoTask]) -> dict:
    answer_files = {t.task_id: set(t.files_changed) for t in tasks}
    out = {}
    for label in sorted({r["arm"] for r in results}):
        rows = [r for r in results if r["arm"] == label]
        n = len(rows) or 1
        uniq = dup = valid = correct_file = pub_exists = 0
        distinct_files = 0
        for r in rows:
            cands = [c for c in r["candidates"] if not c["code_fail"]]
            sigs = {c["sig"] for c in cands if c["sig"]}
            files = {f for c in cands for f in c["files"]}
            uniq += len(sigs)
            distinct_files += len(files)
            valid += len(cands)
            dup += r["duplicates"]
            correct_file += bool(files & answer_files[r["task"]])
            pub_exists += any(c["public_pass"] for c in cands)
        out[label] = {
            "n": len(rows),
            "mean_unique_sigs": round(uniq / n, 2),
            "mean_distinct_files": round(distinct_files / n, 2),
            "dup_rate": round(dup / max(valid + dup, 1), 3),
            "correct_file_run_rate": round(correct_file / n, 2),
            "public_pass_run_rate": round(pub_exists / n, 2),
            "full_rate": round(sum(
                r["final_status"] == "full" for r in rows) / n, 2),
        }
    return out


def run_bsearch_micro(provider, reps: int = 5) -> dict:
    """B0 vs B-search on the resistant tasks (design §6.10)."""
    calls_path = os.path.join(DATA, "rookery3a_calls_bsearch.jsonl")

    def log(entry):
        with open(calls_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    tasks = [t for t in TASKS_V3A if t.task_id in RESISTANT]
    results = []
    hyp_rows = []
    for task in tasks:
        for rep in range(reps):
            r0 = run_arm(task, "B", rep, provider, log, explore=True)
            row = r0.model_dump()
            row["arm"] = "B0"
            results.append(row)
            print(f"[bsearch] {task.task_id} B0 rep{rep}: "
                  f"{r0.final_status}", flush=True)
            rs, hyp = run_arm_bsearch(task, rep, provider, log)
            row = rs.model_dump()
            row["arm"] = "BS"
            row["hyp"] = hyp
            results.append(row)
            hyp_rows.append({"task": task.task_id, **hyp})
            print(f"[bsearch] {task.task_id} BS rep{rep}: "
                  f"{rs.final_status} (가설파일 {hyp['distinct_files']}, "
                  f"정답파일 {hyp['correct_file_hyp']})", flush=True)
    summary = micro_summarize(results, tasks)
    bs = [r for r in results if r["arm"] == "BS"]
    n = len(bs) or 1
    summary["BS_hyp"] = {
        "mean_hyp_generated": round(sum(
            r["hyp"]["generated"] for r in bs) / n, 2),
        "mean_hyp_distinct_files": round(sum(
            r["hyp"]["distinct_files"] for r in bs) / n, 2),
        "correct_file_hyp_rate": round(sum(
            r["hyp"]["correct_file_hyp"] for r in bs) / n, 2),
        "banned_revisits": sum(r["hyp"]["banned_revisits"] for r in bs),
    }
    summary["usage"] = dict(getattr(provider, "usage", {}))
    with open(os.path.join(DATA, "rookery3a_report_bsearch.json"), "w",
              encoding="utf-8") as f:
        json.dump({"results": results, "summary": summary}, f,
                  ensure_ascii=False, indent=1)
    return summary


def run_bsearch_noreg(provider, reps: int = 5) -> dict:
    """§6.12 ablation arm: B-search with the negative-evidence
    registry removed. The BS comparator is the frozen §6.11 v2 data
    (reused, not re-run — registered in the design)."""
    calls_path = os.path.join(DATA, "rookery3a_calls_bsearch_noreg.jsonl")

    def log(entry):
        with open(calls_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    tasks = [t for t in TASKS_V3A if t.task_id in RESISTANT]
    results = []
    for task in tasks:
        for rep in range(reps):
            r, hyp = run_arm_bsearch(task, rep, provider, log,
                                     use_registry=False)
            row = r.model_dump()
            row["arm"] = "BSN"
            row["hyp"] = hyp
            results.append(row)
            print(f"[noreg] {task.task_id} BSN rep{rep}: "
                  f"{r.final_status} (가설파일 {hyp['distinct_files']}, "
                  f"정답파일 {hyp['correct_file_hyp']}, "
                  f"재방문 {hyp['banned_revisits']})", flush=True)
    summary = micro_summarize(results, tasks)
    n = len(results) or 1
    summary["BSN_hyp"] = {
        "mean_hyp_generated": round(sum(
            r["hyp"]["generated"] for r in results) / n, 2),
        "mean_hyp_distinct_files": round(sum(
            r["hyp"]["distinct_files"] for r in results) / n, 2),
        "correct_file_hyp_rate": round(sum(
            r["hyp"]["correct_file_hyp"] for r in results) / n, 2),
        "banned_revisits": sum(
            r["hyp"]["banned_revisits"] for r in results),
    }
    summary["usage"] = dict(getattr(provider, "usage", {}))
    with open(os.path.join(DATA, "rookery3a_report_bsearch_noreg.json"),
              "w", encoding="utf-8") as f:
        json.dump({"results": results, "summary": summary}, f,
                  ensure_ascii=False, indent=1)
    return summary


def run_bsearch_614(provider, reps: int = 5,
                    tag: str = "ia614") -> dict:
    """§6.14 (tag ia614) and §6.18 replication (tag loc618): B-IA vs
    B-pad on the resistant tasks. Both arms run the full B-search
    structure (registry on); only the patch-prompt intervention
    differs."""
    calls_path = os.path.join(DATA, f"rookery3a_calls_{tag}.jsonl")

    def log(entry):
        with open(calls_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    tasks = [t for t in TASKS_V3A if t.task_id in RESISTANT]
    results = []
    for task in tasks:
        for rep in range(reps):
            for mode in ("ia", "pad"):
                r, hyp = run_arm_bsearch(task, rep, provider, log,
                                         ia_mode=mode)
                row = r.model_dump()
                row["hyp"] = hyp
                results.append(row)
                print(f"[614] {task.task_id} {r.arm} rep{rep}: "
                      f"{r.final_status}", flush=True)
    summary = micro_summarize(results, tasks)
    summary["usage"] = dict(getattr(provider, "usage", {}))
    with open(os.path.join(DATA, f"rookery3a_report_{tag}.json"), "w",
              encoding="utf-8") as f:
        json.dump({"results": results, "summary": summary}, f,
                  ensure_ascii=False, indent=1)
    return summary


def run_bsearch_616(provider, reps: int = 5,
                    tasks: list[RepoTask] | None = None,
                    tag: str = "sel616", model: str = "",
                    resume: bool = True) -> dict:
    """§6.16 (tag sel616, resistant tasks) and §8.3 re-test (tag
    sel83, B-corpus tasks): B-public vs B-selector-IA. Identical
    proposer path; only the selector differs.

    Routed through the resumable common runner (2026-08-02): a killed
    process continues from the last completed run."""
    from genesis.rookery.runner import run_experiment_resumable

    if tasks is None:
        tasks = [t for t in TASKS_V3A if t.task_id in RESISTANT]

    def arm_fn(mode: str):
        def fn(task, rep, log):
            r, hyp = run_arm_bsearch(task, rep, provider, log,
                                     ia_mode=mode)
            row = r.model_dump()
            row["hyp"] = hyp
            return row
        return fn

    return run_experiment_resumable(
        experiment=tag,
        arms={"BPUB": arm_fn("pub"), "BSEL": arm_fn("sel")},
        tasks=tasks, reps=reps,
        config={"model": model or getattr(provider, "model", ""),
                "temperature": 1.0, "max_tokens": 4000,
                "calls_per_round": CALLS_PER_TASK,
                "round_size": ROUND_SIZE},
        summarize=micro_summarize,
        usage_of=lambda: dict(getattr(provider, "usage", {})),
        log_prefix=tag)


def summarize(results: list[dict]) -> dict:
    out = {}
    for arm in ("A", "B"):
        rows = [r for r in results if r["arm"] == arm]
        n = len(rows) or 1
        first_fail = [r for r in rows if not r["first_candidate_full"]]
        out[arm] = {
            "n": len(rows),
            "full": sum(r["final_status"] == "full" for r in rows) / n,
            "public_only": sum(r["final_status"] == "public_only"
                               for r in rows) / n,
            "regression": sum(r["final_status"] == "regression"
                              for r in rows) / n,
            "first_candidate_full": sum(
                r["first_candidate_full"] for r in rows) / n,
            "recovery": (sum(r["final_status"] == "full"
                             for r in first_fail) / len(first_fail)
                         if first_fail else None),
            "mean_test_runs": sum(r["test_runs"] for r in rows) / n,
            "duplicates": sum(r["duplicates"] for r in rows),
            "mean_wall_s": round(sum(r["wall_s"] for r in rows) / n, 1),
            "code_fails": sum(
                1 for r in rows for c in r["candidates"]
                if c["code_fail"]),
        }
    return out
