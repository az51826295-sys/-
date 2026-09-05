"""Rookery experiment 1: single-agent (A) vs institutional (B) code
fixing under identical budgets (docs/rookery-exp1-design.md).

Both arms end with a MODEL-GENERATED patch as their answer (the buggy
original is never a valid final). Hidden tests are used only for final
scoring — never for selection, never in prompts.

Arm A: 6 sequential attempts; each retry sees the previous attempt's
public-test failures. Stops early when a patch passes all public tests.

Arm B: 2 rounds x 3 candidates (same prompt within a round, temp 1.0),
mechanical dedup (AST signature), public-test scoring, champion =
best-so-far model patch (strictly-better adoption after the first),
failure observations of the CHAMPION feed the next round. Past patches
never enter the prompt (the 7D lesson).
"""

from __future__ import annotations

import json
import os
import statistics
import time

from pydantic import BaseModel, Field

from genesis.rookery.adapters.pyfix_real import (
    TASKS,
    FixTask,
    normalize,
    run_tests,
    static_check,
)

DATA = "data"
CALLS_PER_TASK = 6
ROUND_SIZE = 3


def build_prompt(task: FixTask, failure_report: str | None) -> str:
    tests = "\n".join(task.public_tests)
    parts = [
        "Fix the bug in this Python function.",
        f"Specification: {task.description}",
        f"Current code:\n```python\n{task.buggy_code}```",
        f"These tests must pass:\n```python\n{tests}\n```",
    ]
    if failure_report:
        parts.append(f"Latest observed failures:\n{failure_report}")
    parts.append("Reply with ONLY the complete fixed function "
                 "definition. No imports, no explanations, no markdown.")
    return "\n\n".join(parts)


def extract_code(response: str) -> str:
    text = response.strip()
    if "```" in text:
        chunks = text.split("```")
        for chunk in chunks[1:]:
            body = chunk.split("\n", 1)[-1] if "\n" in chunk else chunk
            if "def " in body:
                return body.strip()
    return text


class PatchRecord(BaseModel):
    call_index: int
    valid: bool
    duplicate: bool = False
    public_passed: int = 0
    public_total: int = 0
    failures: list[str] = Field(default_factory=list)


class TaskResult(BaseModel):
    task: str
    arm: str
    calls_used: int
    patches: list[PatchRecord] = Field(default_factory=list)
    rollback_rounds: int = 0
    duplicates: int = 0
    final_public_pass: bool = False
    final_hidden_pass: bool = False
    regression: bool = False           # public all-pass, hidden fail
    first_try_failed: bool = False
    recovered: bool = False


def _score_patch(code: str, task: FixTask, idx: int) -> tuple[PatchRecord, str]:
    err = static_check(code)
    if err:
        return PatchRecord(call_index=idx, valid=False,
                           failures=[err]), ""
    passed, fails = run_tests(code, task.public_tests)
    rec = PatchRecord(call_index=idx, valid=True, public_passed=passed,
                      public_total=len(task.public_tests), failures=fails)
    return rec, code


def _finalize(result: TaskResult, task: FixTask,
              final_code: str | None) -> TaskResult:
    if final_code:
        pub_passed, _ = run_tests(final_code, task.public_tests)
        hid_passed, _ = run_tests(final_code, task.hidden_tests)
        result.final_public_pass = pub_passed == len(task.public_tests)
        result.final_hidden_pass = hid_passed == len(task.hidden_tests)
        result.regression = (result.final_public_pass
                             and not result.final_hidden_pass)
    if result.first_try_failed and result.final_hidden_pass:
        result.recovered = True
    return result


def run_arm_a(task: FixTask, provider, log) -> TaskResult:
    result = TaskResult(task=task.name, arm="A", calls_used=0)
    failure_report = None
    best_code, best_score = None, -1
    for i in range(CALLS_PER_TASK):
        prompt = build_prompt(task, failure_report)
        response = provider.complete(prompt, 1.0, i, 0)
        code = extract_code(response)
        rec, valid_code = _score_patch(code, task, i)
        result.patches.append(rec)
        result.calls_used += 1
        log({"task": task.name, "arm": "A", "call": i,
             "prompt": prompt, "response": response,
             "record": rec.model_dump()})
        if i == 0 and (not rec.valid
                       or rec.public_passed < rec.public_total):
            result.first_try_failed = True
        if rec.valid and rec.public_passed > best_score:
            best_code, best_score = valid_code, rec.public_passed
        if rec.valid and rec.public_passed == rec.public_total:
            break
        failure_report = "; ".join(rec.failures)[:400] or "invalid patch"
    return _finalize(result, task, best_code)


def run_arm_b(task: FixTask, provider, log) -> TaskResult:
    result = TaskResult(task=task.name, arm="B", calls_used=0)
    champion_code, champion_score = None, -1
    failure_report = None
    seen = {normalize(task.buggy_code)}
    call = 0
    for rnd in range(CALLS_PER_TASK // ROUND_SIZE):
        adopted_this_round = False
        for _ in range(ROUND_SIZE):
            prompt = build_prompt(task, failure_report)
            response = provider.complete(prompt, 1.0, rnd, call)
            code = extract_code(response)
            rec, valid_code = _score_patch(code, task, call)
            key = normalize(code)
            if key in seen:
                rec.duplicate = True
                result.duplicates += 1
            seen.add(key)
            result.patches.append(rec)
            result.calls_used += 1
            log({"task": task.name, "arm": "B", "round": rnd,
                 "call": call, "prompt": prompt, "response": response,
                 "record": rec.model_dump()})
            if call == 0 and (not rec.valid
                              or rec.public_passed < rec.public_total):
                result.first_try_failed = True
            if (rec.valid and not rec.duplicate
                    and (champion_code is None
                         or rec.public_passed > champion_score)):
                champion_code, champion_score = valid_code, rec.public_passed
                adopted_this_round = True
            call += 1
        if not adopted_this_round:
            result.rollback_rounds += 1
        if champion_score == len(task.public_tests):
            break
        if champion_code is not None:
            _, fails = run_tests(champion_code, task.public_tests)
            failure_report = "; ".join(fails)[:400] or None
    return _finalize(result, task, champion_code)


def run_experiment(provider, tag: str) -> dict:
    calls_path = os.path.join(DATA, f"rookery1_calls_{tag}.jsonl")

    def log(entry: dict) -> None:
        with open(calls_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    results = []
    t0 = time.time()
    for task in TASKS:
        for runner in (run_arm_a, run_arm_b):
            r = runner(task, provider, log)
            results.append(r.model_dump())
            print(f"[{tag}] {task.name} {r.arm}: hidden "
                  f"{'PASS' if r.final_hidden_pass else 'fail'}"
                  f"{' (회귀)' if r.regression else ''}", flush=True)
    report = summarize(results)
    report["elapsed_s"] = round(time.time() - t0)
    report["usage"] = dict(getattr(provider, "usage", {}))
    out = os.path.join(DATA, f"rookery1_report_{tag}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"results": results, "summary": report}, f,
                  ensure_ascii=False, indent=1)
    return report


def summarize(results: list[dict]) -> dict:
    def arm(a):
        return [r for r in results if r["arm"] == a]

    summary = {}
    for a in ("A", "B"):
        rows = arm(a)
        n = len(rows)
        rec_base = [r for r in rows if r["first_try_failed"]]
        summary[a] = {
            "hidden_pass": sum(r["final_hidden_pass"] for r in rows) / n,
            "public_pass": sum(r["final_public_pass"] for r in rows) / n,
            "regression": sum(r["regression"] for r in rows) / n,
            "mean_calls": statistics.fmean(r["calls_used"] for r in rows),
            "duplicates": sum(r["duplicates"] for r in rows),
            "rollback_rounds": sum(r["rollback_rounds"] for r in rows),
            "recovery": (sum(r["recovered"] for r in rec_base)
                         / len(rec_base) if rec_base else None),
        }
    a, b = summary["A"], summary["B"]
    summary["verdicts"] = [
        f"R1 (B 숨김 통과율 ≥ A+10%p): "
        + ("충족" if b["hidden_pass"] - a["hidden_pass"] >= 0.10 - 1e-9
           else "미충족")
        + f" - B {b['hidden_pass']:.2f} vs A {a['hidden_pass']:.2f}",
        f"R2 (B 회귀율 ≤ A): "
        + ("충족" if b["regression"] <= a["regression"] else "미충족")
        + f" - B {b['regression']:.2f} vs A {a['regression']:.2f}",
        f"R3 (B 회복률 > A): "
        + (("충족" if (b["recovery"] or 0) > (a["recovery"] or 0)
            else "미충족")
           if a["recovery"] is not None and b["recovery"] is not None
           else "판정 불가 (첫 실패 표본 없음)")
        + f" - B {b['recovery']} vs A {a['recovery']}",
    ]
    return summary
