"""루키 2.0: 도구를 쥔 에이전트 루프 (진화 1단계).

기존 handler는 한 번 제안하고 끝나는 one-shot proposer다. 이 모듈은
Claude Code가 일하는 방식 - 읽고, 고치고, 실행하고, 출력을 보고
다시 고치는 반복 - 을 루키의 규율 안에 넣는다:

- 모든 도구 실행은 Workspace를 통과한다 (격리 containment,
  명령 허용목록, 테스트 파일 수정 금지).
- 모든 모델 호출은 예산 원장의 reserve -> settle 을 거친다.
- 루프가 무엇을 만들었든 채택은 기존 validator + auditor 경로
  그대로다 (증거 테스트 fail -> pass, 감사 불변식).
- 반복 상한(스텝 수)과 과제 예산이 폭주를 구조적으로 막는다.
- 채택 커밋 위생 (능력 실험 4): 에이전트가 남긴 신규 비추적
  파일은 커밋 전 기계 규칙으로 지워지고, 지우면 재현이 깨지는
  파일은 복원 후 감사 불변식 I6(신규 파일 규율)에 걸린다.

계층 라우팅(진화 2단계): payload의 tier가 "smart"면 Sonnet,
아니면 Haiku. 단가는 운영자가 넣은 값만 쓴다(추측 금지).

경험 라우팅(진화 4단계 → v2): 모든 과제의 결말(tier, 채택 여부,
실비)을 원장에 남기고, 두 계층의 측정된 승률·가격으로 "해결 1건당
기대 비용"이 더 싼 선행 전략을 고른다 (v1의 승률 문턱은 (b)
재검증에서 손해 판정). 증거 문턱 미달이면 기본값 유지 - 미로
세계의 진입 비용 설계와 같은 evidence-gating이다.
제안 측 정보 주입은 시리즈 전체에서 효과가 없었으므로(7B~7D,
§6.14·§6.18), 경험은 프롬프트가 아니라 **선택(라우팅)** 에만
쓴다. 명시 tier(운영자 지시)는 언제나 경험을 이긴다.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from genesis.rookery.engine.auditor import ValidatorVerdict, is_test_file
from genesis.rookery.engine.budget import Denied
from genesis.rookery.engine.isolation import IsolationError
from genesis.rookery.engine.worker import HandlerOutcome, TaskContext

API = "https://api.anthropic.com/v1/messages"

MODELS = {
    # tier: (model id, USD per Mtok in, USD per Mtok out)
    "fast": ("claude-haiku-4-5-20251001", 1.0, 5.0),
    "smart": ("claude-sonnet-5", 3.0, 15.0),
    # 능력 실험 4: 단가는 2026-08-21 문서 확인값 (추측 금지 원칙)
    "opus": ("claude-opus-5", 5.0, 25.0),
}

MAX_STEPS = 12
# 4000: §6.x 검증값. 2000은 초소형 합성 모듈 시절의 크기로, 실전
# 저장소에서 전체 파일 쓰기를 중간 절단해 smart 시도를 3~4스텝에
# 조기 종료시켰다 (능력 실험 1, docs/capability-run1.md)
MAX_TOKENS = 4000
# Opus 5는 thinking이 기본 켜짐이고 사고 토큰이 max_tokens에
# 포함된다 - 4000이면 사고만 하다 도구 호출이 잘린다 (절단 계열
# 재발 경로의 사전 차단, docs/capability-run4.md). Sonnet 5도
# 같다: (b) 재검증 B팔 0차에서 smart 응답이 사고 블록을 달고
# 4000에서 잘려 edit_file 입력이 불완전 → KeyError로 과제 즉사
# (docs/ledger-retest-live.md 부검). 사고하는 모델은 전부 12000.
THINKING_MAX_TOKENS = 12000
OPUS_MAX_TOKENS = THINKING_MAX_TOKENS          # 호환 이름
THINKING_MODEL_PREFIXES = ("claude-opus", "claude-sonnet-5")


def max_tokens_for(model: str) -> int:
    if model.startswith(THINKING_MODEL_PREFIXES):
        return THINKING_MAX_TOKENS
    return MAX_TOKENS

from genesis.rookery.engine.agent_tools import (  # noqa: E402
    TOOL_SCHEMAS as _V2_TOOLS, exec_tool as _v2_exec)

TOOLS = [
    *_V2_TOOLS,                 # read_file(줄 범위)·search·list_dir (도구 v2)
    {"name": "write_file",
     "description": "작업공간의 파일을 통째로 새 내용으로 쓴다. "
                    "테스트 파일은 수정 불가.",
     "input_schema": {"type": "object", "properties": {
         "path": {"type": "string"}, "content": {"type": "string"}},
         "required": ["path", "content"]}},
    {"name": "edit_file",
     "description": "파일의 한 부분을 교체한다. old는 파일 안에서 "
                    "정확히 한 번 나타나야 한다. 큰 파일은 "
                    "write_file 대신 이것을 써라. 테스트 파일은 "
                    "수정 불가.",
     "input_schema": {"type": "object", "properties": {
         "path": {"type": "string"}, "old": {"type": "string"},
         "new": {"type": "string"}},
         "required": ["path", "old", "new"]}},
    {"name": "run_tests",
     "description": "pytest 테스트 id 목록을 실행하고 결과를 본다",
     "input_schema": {"type": "object", "properties": {
         "test_ids": {"type": "array",
                      "items": {"type": "string"}}},
         "required": ["test_ids"]}},
    {"name": "done",
     "description": "작업을 끝냈다고 선언한다",
     "input_schema": {"type": "object", "properties": {
         "summary": {"type": "string"}}, "required": ["summary"]}},
]

SYSTEM = """너는 격리된 작업공간에서 일하는 자율 수정 에이전트다.
목표: 재현 테스트를 전부 통과시키고 스모크 테스트를 깨지 않는 것.
규칙:
- 파일을 고치기 전에 읽어라. 고친 뒤에는 반드시 run_tests로 확인하라.
- 큰 파일은 edit_file(부분 교체)을 써라. write_file은 파일 전체를
  다시 쓰므로 작은 파일에만.
- 테스트 파일은 수정 금지다 (시도해도 거부된다).
- 전부 통과를 확인했으면 done을 호출하라. 확인 없이 done 금지.
- 스텝 수가 제한돼 있다. 계획적으로 움직여라."""


class ApiCaller:
    """실제 Anthropic 호출. 테스트에서는 이 객체를 가짜로 바꾼다."""

    def __init__(self, api_key: str):
        self.key = api_key

    def call(self, model: str, system: str, messages: list,
             tools: list) -> dict:
        mt = max_tokens_for(model)
        body = json.dumps({
            "model": model, "max_tokens": mt,
            "system": system, "messages": messages, "tools": tools,
        }).encode()
        req = urllib.request.Request(API, data=body, headers={
            "x-api-key": self.key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                out = json.load(r)
        except urllib.error.HTTPError as exc:
            # 본문을 살린다: "HTTP Error 400: Bad Request"만으로는
            # 크레딧 소진(400)과 요청 오류를 구분할 수 없었다 -
            # (b) 재검증 B팔 1차. 본문의 문구가 인프라 판별 표지다.
            body = exc.read().decode("utf-8", "replace")[:300]
            raise RuntimeError(f"HTTP {exc.code}: {body}") from exc
        if "content" not in out:
            # API 오류 응답(과부하 등)은 content가 없다 - KeyError로
            # 죽는 대신 명시적 실패로 (실전 런 0에서 toolz#529가
            # 이 경로로 worker_exception 사망, 2026-08-20)
            raise RuntimeError(
                f"API 응답에 content 없음: {str(out)[:200]}")
        return out


def default_caller() -> ApiCaller:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    return ApiCaller(key)


CALLER_FACTORY = default_caller


# ------------------------------------------------------------- tools


# 도구별 필수 인자. 누락은 모델의 오류(대개 max_tokens 절단)이지
# 엔진의 예외가 아니다 - 도구 오류 문자열로 돌려줘 모델이 고치게
# 한다. (b) 재검증 B팔 0차: edit_file에 old가 없어 KeyError →
# worker_exception → smart 시도 전체가 즉사했다.
REQUIRED_ARGS = {
    "read_file": ("path",),
    "search": ("pattern",),
    "write_file": ("path", "content"),
    "edit_file": ("path", "old", "new"),
    "run_tests": ("test_ids",),
}


def _exec_tool(ctx: TaskContext, name: str, args: dict) -> str:
    ws = ctx.workspace
    if not isinstance(args, dict):
        args = {}
    missing = [k for k in REQUIRED_ARGS.get(name, ())
               if k not in args or args[k] is None]
    if missing:
        return (f"오류: 인자 누락 {missing} - 응답이 max_tokens로 "
                f"잘렸을 수 있다. 더 작은 조각으로 다시 호출하라")
    v2 = _v2_exec(ws, name, args)       # read_file(줄 범위)·search·list_dir
    if v2 is not None:
        return v2
    if name == "write_file":
        path = args["path"]
        if is_test_file(path):
            return "거부: 테스트 파일은 수정할 수 없다"
        try:
            ws.write_text(path, args["content"])
            return "저장됨"
        except IsolationError as exc:
            raise IsolationError(str(exc))
        except OSError as exc:
            return f"오류: {exc}"
    if name == "edit_file":
        path = args["path"]
        if is_test_file(path):
            return "거부: 테스트 파일은 수정할 수 없다"
        try:
            content = ws.read_text(path)
        except (OSError, IsolationError) as exc:
            return f"오류: {exc}"
        old = args["old"]
        n = content.count(old)
        if n == 0:
            return "오류: old가 파일에 없다 - 정확히 복사했는지 확인"
        if n > 1:
            return (f"오류: old가 {n}번 나타난다 - 주변 줄을 더 "
                    "포함해 유일하게 만들어라")
        try:
            ws.write_text(path, content.replace(old, args["new"], 1))
            return "교체됨"
        except IsolationError as exc:
            raise IsolationError(str(exc))
        except OSError as exc:
            return f"오류: {exc}"
    if name == "run_tests":
        from genesis.rookery.engine.handlers import _run_tests
        results = _run_tests(ws, list(args["test_ids"])[:20])
        return json.dumps(results, ensure_ascii=False)
    return f"알 수 없는 도구: {name}"


# ------------------------------------------------- context + routing


def repo_map(ws, max_entries: int = 150) -> str:
    """작업공간의 파일 지도 - 에이전트의 '프로젝트 기억' 1단계.
    경로와 크기만 준다 (내용은 read_file로 스스로 읽게)."""
    root = ws.path
    entries = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames
                       if d not in (".git", "__pycache__",
                                    "node_modules", ".godot")]
        for fn in sorted(filenames):
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace("\\", "/")
            try:
                size = os.path.getsize(full)
            except OSError:
                continue
            entries.append(f"{rel} ({size}B)")
            if len(entries) >= max_entries:
                entries.append("... (이하 생략)")
                return "\n".join(entries)
    return "\n".join(entries)


ROUTE_MIN_SAMPLES = 8       # 계층별 이만큼 재보기 전에는 기본값 고정


def record_outcome(store, task, tier: str, accepted: bool,
                   steps: int, tool_calls: int,
                   usd: float | None = None) -> None:
    """과제 결말을 원장 이벤트로 남긴다 - 경험 라우팅의 측정 채널.
    events는 append-only라 결과 JSON과 달리 실패 시도도 남는다.
    usd = 이 시도의 실비 (라우팅 v2는 가격도 경험이다)."""
    data = {"kind": task.kind, "tier": tier,
            "attempt": task.attempts, "accepted": accepted,
            "steps": steps, "tool_calls": tool_calls}
    if usd is not None:
        data["usd"] = round(float(usd), 6)
    store.log(task.id, task.run_id, "agent_outcome", data)


def fast_first_try_stats(store, kind: str) -> tuple[int, int]:
    """이 종류의 일에서 fast 계층의 1차 시도 (표본 수, 성공 수)."""
    row = store.conn.execute(
        "SELECT COUNT(*) n,"
        " COALESCE(SUM(json_extract(data,'$.accepted')),0) w"
        " FROM events WHERE kind='agent_outcome'"
        " AND json_extract(data,'$.kind')=?"
        " AND json_extract(data,'$.tier')='fast'"
        " AND json_extract(data,'$.attempt')=1", (kind,)).fetchone()
    return int(row["n"]), int(row["w"])


def tier_stats(store, kind: str) -> dict[str, dict]:
    """계층별 경험: fast는 1차 시도만(선행 확률), smart는 전 시도
    (1차든 승급이든 smart가 푸는 확률). 가격은 usd가 기록된 시도만."""
    out: dict[str, dict] = {}
    for tier, attempt_clause in (
            ("fast", " AND json_extract(data,'$.attempt')=1"),
            ("smart", "")):
        row = store.conn.execute(
            "SELECT COUNT(*) n,"
            " COALESCE(SUM(json_extract(data,'$.accepted')),0) w,"
            " COUNT(json_extract(data,'$.usd')) cn,"
            " AVG(json_extract(data,'$.usd')) c"
            " FROM events WHERE kind='agent_outcome'"
            " AND json_extract(data,'$.kind')=?"
            " AND json_extract(data,'$.tier')=?" + attempt_clause,
            (kind, tier)).fetchone()
        out[tier] = {"n": int(row["n"]), "wins": int(row["w"]),
                     "cost_n": int(row["cn"]),
                     "cost": (float(row["c"]) if row["c"] is not None
                              else None)}
    return out


def expected_cost_per_solve(p_f: float, c_f: float, p_s: float,
                            c_s: float) -> tuple[float, float]:
    """(fast 선행, smart 선행)의 해결 1건당 기대 비용. 2시도 사다리:
    F = fast → 실패 시 smart,  S = smart → 실패 시 smart."""
    eps = 1e-9
    f_cost = c_f + (1.0 - p_f) * c_s
    f_solve = p_f + (1.0 - p_f) * p_s
    s_cost = c_s + (1.0 - p_s) * c_s
    s_solve = p_s + (1.0 - p_s) * p_s
    return f_cost / max(f_solve, eps), s_cost / max(s_solve, eps)


def pick_tier(payload: dict, attempts: int, store=None,
              kind: str = "agent_fix") -> str:
    """계층 라우팅 v2 (docs/routing-v2-design.md).

    우선순위: 명시 tier(운영자) > 재시도 승급(이 과제가 이미
    실패했다) > 측정된 경험 > 기본 fast.

    v1(fast 1차 승률 < 0.5면 smart 직행)은 (b) 재검증에서 '원장
    손해' 판정 - 두 계층이 대부분 실패하는 대역에서 승률만 보면
    실패의 가격만 올린다 (docs/ledger-retest-live.md). v2는 두
    선행 전략의 **해결 1건당 기대 비용**을 비교한다: fast 시도가
    smart의 ~15% 값이면 fast 승률이 낮아도 fast 선행이 싸다.
    증거 게이트: 두 계층 모두 표본 n>=8 **그리고** 가격 표본이
    있어야 경험이 기본값을 바꾼다 (시드 이력은 가격이 없으면
    라우팅을 못 바꾼다 - 가격은 측정된 사실만)."""
    if payload.get("tier") in MODELS:
        return payload["tier"]
    if attempts > 1:
        return "smart"
    if store is not None:
        st = tier_stats(store, kind)
        f, s = st["fast"], st["smart"]
        enough = (f["n"] >= ROUTE_MIN_SAMPLES
                  and s["n"] >= ROUTE_MIN_SAMPLES
                  and f["cost"] is not None and s["cost"] is not None
                  and f["cost_n"] >= ROUTE_MIN_SAMPLES
                  and s["cost_n"] >= ROUTE_MIN_SAMPLES)
        if enough:
            p_f, p_s = f["wins"] / f["n"], s["wins"] / s["n"]
            ef, es = expected_cost_per_solve(p_f, f["cost"],
                                             p_s, s["cost"])
            if es < ef:
                return "smart"
    return "fast"


# ------------------------------------------------------------ handler


# (b) 재검증 B팔 0차 실측: fast는 문맥 20k에서 호출당 $0.022로
# 0.02를 넘어 초과 검토 게이트가 9~12스텝에서 fast 시도를 끊었다
# - "fast의 기회"를 원장이 아니라 추정기가 지우던 셈. smart는
# 사고 12000 토큰 응답이면 $0.2에 근접. 추정은 실비보다 후하게.
# (b) 재검증 A팔 실측: smart 후반 호출 $0.18~0.28 → 0.30.
RESERVE_EST_USD = {"fast": 0.05, "smart": 0.30, "opus": 0.50}


def _guarded_call(ctx: TaskContext, caller, model_id: str,
                  prices: tuple, messages: list,
                  tier: str = "fast") -> dict | None:
    """한 호출 = 한 예약. 원장 거절이면 None.

    추정치는 계층별이다 - 능력 실험 2 부검: fast 기준 고정 추정
    (0.02달러)을 smart 실비(0.022~0.026)가 매번 초과해 초과 검토
    게이트가 다음 호출을 차단, 4~5스텝 조기 종료의 진범이었다.
    제도가 아니라 추정이 틀린 사례."""
    est_krw = RESERVE_EST_USD.get(tier, 0.02) * \
        ctx.guard.policy.usd_krw
    res = ctx.guard.reserve(est_krw, task_id=ctx.task.id,
                            run_id=ctx.task.run_id)
    if isinstance(res, Denied):
        return None
    try:
        out = caller.call(model_id, SYSTEM, messages, TOOLS)
    except Exception:
        ctx.guard.release(res)
        raise
    usage = out.get("usage", {})
    usd = (usage.get("input_tokens", 0) * prices[0]
           + usage.get("output_tokens", 0) * prices[1]) / 1e6
    ctx.guard.settle(res, usd=usd,
                     tokens_in=usage.get("input_tokens", 0),
                     tokens_out=usage.get("output_tokens", 0))
    return out


def agent_fix_handler(ctx: TaskContext) -> HandlerOutcome:
    """다단계 에이전트 수정. 오라클과 감사는 code_fix와 동일 -
    제안자만 one-shot에서 루프로 진화했다."""
    from genesis.rookery.engine.handlers import _run_tests

    p = ctx.task.payload
    ws = ctx.workspace
    repro = list(p.get("repro_tests", []))
    smoke = list(p.get("smoke_tests", []))
    evidence = repro + smoke
    tier = pick_tier(p, ctx.task.attempts, store=ctx.store,
                     kind=ctx.task.kind)
    model_id, pin, pout = MODELS.get(tier, MODELS["fast"])

    before = _run_tests(ws, evidence)
    caller = CALLER_FACTORY()

    task_brief = (
        f"수정 대상 파일: {p.get('file', '(미지정 - 직접 찾아라)')}\n"
        f"문제 설명: {p.get('issue', '(없음)')}\n"
        f"통과시켜야 하는 테스트: {repro}\n"
        f"깨뜨리면 안 되는 테스트: {smoke}\n\n"
        f"저장소 지도:\n{repo_map(ws)}")
    messages: list = [{"role": "user", "content": task_brief}]

    steps = 0
    tool_calls = 0
    done_rejections = 0
    nudged = False
    while steps < MAX_STEPS:
        steps += 1
        out = _guarded_call(ctx, caller, model_id, (pin, pout),
                            messages, tier=tier)
        if out is None:
            break                        # 예산 거절 - 정직하게 중단
        content = out.get("content", [])
        messages.append({"role": "assistant", "content": content})
        if out.get("stop_reason") == "max_tokens":
            # 절단 관측 (B팔 0차 부검): 잘린 응답은 불완전한 도구
            # 호출을 낳는다 - 원장에 남겨 사후 식별 가능하게
            ctx.store.log(ctx.task.id, ctx.task.run_id,
                          "agent_truncated",
                          {"step": steps, "tier": tier})
        # 관측 수리 (능력 실험 2): 응답 원문을 원장에 - run 1의
        # smart 조기 종료를 부검할 수 없었던 사각지대 제거
        ctx.store.log(ctx.task.id, ctx.task.run_id,
                      "agent_response",
                      {"step": steps, "tier": tier,
                       "text": json.dumps(content,
                                          ensure_ascii=False)[:3000]})
        tool_uses = [b for b in content
                     if b.get("type") == "tool_use"]
        if not tool_uses:
            # 무도구 재촉 (H2): 1회에 한해 도구 사용을 요구
            if not nudged:
                nudged = True
                messages.append({"role": "user", "content":
                                 "설명 말고 도구를 사용하라. 수정이 "
                                 "끝났다고 판단되면 run_tests로 "
                                 "확인한 뒤 done을 호출하라."})
                continue
            break                        # 재촉 후에도 무도구면 종료
        results = []
        finished = False
        for tu in tool_uses:
            if tu["name"] == "done":
                # done 반려 (H1): 그 자리에서 재현 테스트 실행 -
                # 아직 실패면 거부하고 계속하게 한다
                verify = _run_tests(ws, repro)
                still = [t for t in repro
                         if verify.get(t) != "pass"]
                if still and steps < MAX_STEPS:
                    done_rejections += 1
                    results.append({
                        "type": "tool_result",
                        "tool_use_id": tu["id"],
                        "content": "done 거부: 재현 테스트가 아직 "
                                   f"실패한다 {still[:3]}. 계속 "
                                   "수정하라."})
                    continue
                finished = True
                results.append({"type": "tool_result",
                                "tool_use_id": tu["id"],
                                "content": "확인 중"})
                continue
            tool_calls += 1
            res_text = _exec_tool(ctx, tu["name"],
                                  tu.get("input", {}))
            results.append({"type": "tool_result",
                            "tool_use_id": tu["id"],
                            "content": res_text[:8000]})
        messages.append({"role": "user", "content": results})
        if finished:
            break

    # 커밋 전 위생 (능력 실험 4 부검): 신규 비추적 파일을 지우고
    # 최종 검증한다. 지운 것이 수정의 일부였다면 재현 테스트가
    # 깨진다 - 복원하고 다시 재며, 살아남은 신규 파일은 verdict의
    # new_files로 감사(I6)에 넘어간다. 조용한 혼입도 조용한 삭제도
    # 없게.
    scratch = _sweep_scratch(ws)
    if scratch:
        ctx.store.log(ctx.task.id, ctx.task.run_id, "scratch_sweep",
                      {"files": sorted(scratch)})
    after = _run_tests(ws, evidence)
    repro_ok = all(after.get(t) == "pass" for t in repro)
    smoke_ok = all(after.get(t) == "pass" for t in smoke)
    if scratch and not (repro_ok and smoke_ok):
        _restore_scratch(ws, scratch)
        ctx.store.log(ctx.task.id, ctx.task.run_id,
                      "scratch_restore", {"files": sorted(scratch)})
        after = _run_tests(ws, evidence)
        repro_ok = all(after.get(t) == "pass" for t in repro)
        smoke_ok = all(after.get(t) == "pass" for t in smoke)
    accepted = bool(repro and repro_ok and smoke_ok)
    changed = ws.changed_files() if hasattr(ws, "changed_files") \
        else _git_changed(ws)
    new_files = _untracked_files(ws)
    if not accepted:
        ws.reset()
    ctx.store.log(ctx.task.id, ctx.task.run_id, "agent_loop_stats",
                  {"done_rejections": done_rejections,
                   "nudged": nudged})
    spent = ctx.store.conn.execute(
        "SELECT COALESCE(SUM(usd),0) FROM reservations"
        " WHERE task_id=? AND run_id=? AND state='settled'",
        (ctx.task.id, ctx.task.run_id)).fetchone()[0]
    record_outcome(ctx.store, ctx.task, tier, accepted, steps,
                   tool_calls, usd=spent)
    verdict = ValidatorVerdict(
        task_id=ctx.task.id, accepted=accepted,
        evidence_tests=repro, before=before, after=after,
        changed_files=changed, new_files=new_files)
    return HandlerOutcome(
        verdict=verdict,
        result={"steps": steps, "tool_calls": tool_calls,
                "tier": tier, "changed_files": changed},
        commit_message=f"rookery-agent: fix {ctx.task.id}",
        open_pr=accepted)


def _is_runner_noise(path: str) -> bool:
    """테스트 실행만으로 생기는 캐시 - 소스 변경이 아니다. .pyc는
    목 파일럿에서 실제 오탐을 냈고 (test_*.pyc →
    implausible_perfection 정지), .pytest_cache는 .gitignore 없는
    저장소에서 같은 경로로 위생 규칙을 오발동시킨다."""
    p = path.replace("\\", "/")
    return (p.endswith(".pyc") or "__pycache__/" in p
            or ".pytest_cache/" in p or p == ".pytest_cache")


def _git_changed(ws) -> list[str]:
    """git이 보는 변경 목록에서 실행 캐시는 뺀다."""
    r = ws.run(["git", "status", "--porcelain"], timeout=60)
    out = []
    for line in (r.stdout or "").splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) != 2:
            continue
        if _is_runner_noise(parts[1]):
            continue
        out.append(parts[1])
    return sorted(out)


def _untracked_files(ws) -> list[str]:
    """작업 전에는 없었던 파일들 (git이 ??로 보는 것, 캐시 제외)."""
    r = ws.run(["git", "status", "--porcelain", "-uall"], timeout=60)
    out = []
    for line in (r.stdout or "").splitlines():
        if not line.startswith("??"):
            continue
        p = line[2:].strip().strip('"')
        if _is_runner_noise(p):
            continue
        out.append(p)
    return sorted(out)


def _sweep_scratch(ws) -> dict[str, bytes]:
    """커밋 전 위생 규칙 (능력 실험 4 부검: 빈 스크래치 파일 2개가
    files_in_scope=1인 채택 커밋에 `git add -A`로 혼입). 프롬프트로
    치우라고 부탁하는 대신 기계적으로 지운다. 지운 파일이 수정의
    일부였는지는 증거 테스트 재실행이 판정한다 (호출부 복원 경로).
    못 지운 파일은 남아서 new_files로 감사에 걸린다."""
    saved: dict[str, bytes] = {}
    for rel in _untracked_files(ws):
        full = ws.resolve(rel)
        try:
            with open(full, "rb") as f:
                saved[rel] = f.read()
            os.remove(full)
        except OSError:
            saved.pop(rel, None)
    return saved


def _restore_scratch(ws, saved: dict[str, bytes]) -> None:
    for rel, blob in saved.items():
        full = ws.resolve(rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(blob)
