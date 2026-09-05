"""CLI for Rookery experiment 1.

  python -m genesis.rookery --selfcheck
      Corpus self-verification: reference fixes pass public+hidden,
      buggy code fails as designed (13 public-failing, 3 latent traps).

  python -m genesis.rookery --pilot
      Mock-provider pipeline check (never a result).

  python -m genesis.rookery --experiment [--model ...]
      The real A/B run. GENESIS_SPEND=i-approve required.
"""

from __future__ import annotations

import argparse
import json

from genesis.rookery.adapters.pyfix_real import TASKS, run_tests


def selfcheck() -> None:
    print("=== 코퍼스 자체 검증 ===")
    latent = []
    problems = 0
    for task in TASKS:
        pub, _ = run_tests(task.buggy_code, task.public_tests)
        hid, _ = run_tests(task.buggy_code, task.hidden_tests)
        if hid == len(task.hidden_tests):
            print(f"  !! {task.name}: 버그가 숨김 테스트를 전부 통과")
            problems += 1
        if pub == len(task.public_tests):
            latent.append(task.name)
    print(f"  잠복형(공개 전부 통과): {latent}")
    expected_latent = {"merge_sorted", "balanced_parens",
                       "second_largest"}
    if set(latent) != expected_latent:
        print(f"  !! 잠복형 목록이 설계와 다름 (설계: {sorted(expected_latent)})")
        problems += 1
    print("판정:", "통과" if problems == 0 else f"실패 ({problems}건)")


class MockFixProvider:
    """PIPELINE CHECK ONLY: returns the buggy code (dup path), garbage
    (invalid path), or a plausibly-fixed variant, cycling."""

    name = "mock"

    def complete(self, prompt: str, temperature: float, a: int,
                 b: int) -> str:
        import re
        m = re.search(r"```python\n(def .*?)```", prompt, re.DOTALL)
        code = m.group(1) if m else "def f():\n    return 0\n"
        idx = (a + b) % 3
        if idx == 0:
            return code                      # duplicate of buggy
        if idx == 1:
            return "this is not python"      # invalid
        return code.replace("range(a, b)", "range(a, b + 1)")


def selfcheck_v2() -> None:
    from genesis.rookery.adapters.pyfix_v2 import TASKS_V2

    print("=== v2 코퍼스 자체 검증 ===")
    problems = 0
    for t in TASKS_V2:
        checks = []
        every = t.public_tests + t.all_final_tests()
        p, fails = run_tests(t.fixed_code, every)
        checks.append(("참조수정 전체 통과", p == len(every), fails[:2]))
        bp, _ = run_tests(t.buggy_code, t.public_tests)
        checks.append(("버그가 공개 ≥1 실패",
                       bp < len(t.public_tests), []))
        bh, _ = run_tests(t.buggy_code,
                          t.hidden_tests + t.interaction_tests)
        checks.append(("버그가 숨김·상호작용 ≥1 실패",
                       bh < len(t.hidden_tests) + len(t.interaction_tests),
                       []))
        br, rfails = run_tests(t.buggy_code, t.regression_tests)
        checks.append(("버그도 회귀 테스트 전부 통과",
                       br == len(t.regression_tests), rfails[:2]))
        if t.partial_fix_code:
            pi, _ = run_tests(t.partial_fix_code, t.interaction_tests)
            checks.append(("부분수정이 상호작용 ≥1 실패",
                           pi < len(t.interaction_tests), []))
            pp, _ = run_tests(t.partial_fix_code, t.public_tests)
            checks.append(("부분수정이 공개 전부 통과",
                           pp == len(t.public_tests), []))
        bad = [(name, detail) for name, ok, detail in checks if not ok]
        if bad:
            problems += len(bad)
            print(f"  !! {t.name}: {bad}")
        else:
            print(f"  {t.name}: OK")
    print("판정:", "통과" if problems == 0 else f"실패 ({problems}건)")


def calibrate(model: str) -> None:
    """Difficulty pilot: single first-call patch per task x 3 reps.
    Records the outcome distribution against design section 2."""
    import json

    from genesis.mission7.proposers import AnthropicProvider
    from genesis.rookery.adapters.pyfix_real import (
        normalize as norm, run_tests as run, static_check)
    from genesis.rookery.adapters.pyfix_v2 import TASKS_V2
    from genesis.rookery.exp1 import build_prompt, extract_code

    provider = AnthropicProvider(model, 1.0)
    outcomes = {"full": 0, "public_only": 0, "fail": 0}
    distinct_ok = 0
    rows = []
    for t in TASKS_V2:
        sigs = set()
        for rep in range(3):
            prompt = build_prompt(t, None)
            code = extract_code(provider.complete(prompt, 1.0, rep, 0))
            if static_check(code):
                outcomes["fail"] += 1
                rows.append((t.name, rep, "invalid"))
                continue
            pub, _ = run(code, t.public_tests)
            hid, _ = run(code, t.all_final_tests())
            full = (pub == len(t.public_tests)
                    and hid == len(t.all_final_tests()))
            if full:
                outcomes["full"] += 1
                kind = "full"
            elif pub == len(t.public_tests):
                outcomes["public_only"] += 1
                kind = "public_only"
            else:
                outcomes["fail"] += 1
                kind = "fail"
            if pub == len(t.public_tests):
                sigs.add(norm(code))
            rows.append((t.name, rep, kind))
        if len(sigs) >= 2:
            distinct_ok += 1
    n = sum(outcomes.values())
    print("=== v2 난이도 보정 파일럿 ===")
    for name, rep, kind in rows:
        print(f"  {name} rep{rep}: {kind}")
    print(f"완전 해결 {outcomes['full']/n:.0%} (목표 30~50%), "
          f"공개만 {outcomes['public_only']/n:.0%} (20~40%), "
          f"실패 {outcomes['fail']/n:.0%} (20~30%)")
    print(f"구조적 상이 유효 패치 보유 과제: {distinct_ok}/6 (목표 ≥3)")
    print(f"usage: {provider.usage}")
    with open("data/rookery2_calibration.json", "w",
              encoding="utf-8") as f:
        json.dump({"rows": rows, "outcomes": outcomes,
                   "distinct_ok": distinct_ok,
                   "usage": provider.usage}, f, ensure_ascii=False)


def selfcheck_v21() -> None:
    from genesis.rookery.adapters.pyfix_v21 import TASKS_V21, patch_module

    print("=== v2.1 코퍼스 자체 검증 ===")
    problems = 0
    for t in TASKS_V21:
        base = t.assembled()
        every = t.public_tests + t.hidden_all()
        fixed = patch_module(base, t.correct_patch)
        checks = []
        p, fails = run_tests(fixed, every)
        checks.append(("정답패치 전체 통과", p == len(every), fails[:2]))
        bp, _ = run_tests(base, t.public_tests)
        checks.append(("버그가 공개 ≥1 실패", bp < len(t.public_tests), []))
        br, rf = run_tests(base, t.regression_tests)
        checks.append(("버그도 회귀 전부 통과",
                       br == len(t.regression_tests), rf[:2]))
        profiles = {}
        hiddens = t.hidden_pricing + t.hidden_cache + t.hidden_combo
        for label, patch in t.decoy_patches.items():
            patched = patch_module(base, patch)
            dp, _ = run_tests(patched, t.public_tests)
            checks.append((f"미끼 {label} 공개 100%",
                           dp == len(t.public_tests), []))
            failed_idx = []
            for i, test in enumerate(hiddens):
                got, _ = run_tests(patched, [test])
                if got == 0:
                    failed_idx.append(i)
            checks.append((f"미끼 {label} 숨김 ≥1 실패",
                           len(failed_idx) > 0, []))
            profiles[label] = tuple(failed_idx)
        labels = list(profiles)
        if len(labels) >= 2:
            checks.append(("미끼 실패 프로필 상이",
                           profiles[labels[0]] != profiles[labels[1]],
                           list(profiles.values())))
        bad = [(n, d) for n, ok, d in checks if not ok]
        if bad:
            problems += len(bad)
            print(f"  !! {t.name}: {bad}")
        else:
            print(f"  {t.name}: OK (미끼 프로필 {profiles})")
    print("판정:", "통과" if problems == 0 else f"실패 ({problems}건)")


def build_prompt_v21(task) -> str:
    files = "\n\n".join(f"### {name}\n```python\n{src}```"
                        for name, src in task.sections.items())
    tests = "\n".join(task.public_tests)
    return (f"{task.goal}\n\n{files}\n\nThese tests must pass:\n"
            f"```python\n{tests}\n```\n\n"
            "Reply with ONLY the corrected function definition(s), "
            "no other text, no imports, no markdown.")


def calibrate_v21(model: str, reps: int = 10) -> None:
    import json

    from genesis.mission7.proposers import AnthropicProvider
    from genesis.rookery.adapters.pyfix_real import normalize as norm
    from genesis.rookery.adapters.pyfix_v21 import TASKS_V21, patch_module
    from genesis.rookery.exp1 import extract_code

    provider = AnthropicProvider(model, 1.0)
    task = TASKS_V21[0]
    base = task.assembled()
    outcomes = {"full": 0, "public_only": 0, "fail": 0}
    wrong_sigs = set()
    rows = []
    for rep in range(reps):
        code = extract_code(provider.complete(
            build_prompt_v21(task), 1.0, rep, 0))
        patched = patch_module(base, code)
        if patched is None:
            outcomes["fail"] += 1
            rows.append((rep, "unpatchable"))
            continue
        pub, _ = run_tests(patched, task.public_tests)
        hid, hfails = run_tests(patched, task.hidden_all())
        if pub == len(task.public_tests) and hid == len(task.hidden_all()):
            outcomes["full"] += 1
            rows.append((rep, "full"))
        elif pub == len(task.public_tests):
            outcomes["public_only"] += 1
            wrong_sigs.add(norm(code))
            rows.append((rep, "public_only", hfails[:2]))
        else:
            outcomes["fail"] += 1
            rows.append((rep, "fail"))
    print(f"=== v2.1 대표 과제({task.name}) 보정: {reps}회 ===")
    for row in rows:
        print(" ", row)
    print(f"완전 {outcomes['full']} (목표 3~6) / 공개만 "
          f"{outcomes['public_only']} (2~5) / 실패 {outcomes['fail']}"
          f" (1~3) / 상이 오답 패치 {len(wrong_sigs)}종 (≥2)")
    print("usage:", provider.usage)
    with open("data/rookery21_calibration.json", "w",
              encoding="utf-8") as f:
        json.dump({"rows": [list(r) for r in rows],
                   "outcomes": outcomes,
                   "wrong_kinds": len(wrong_sigs),
                   "usage": provider.usage}, f, ensure_ascii=False)


class MockRepoProvider:
    """v3a pipeline check only: cycles parse-fail / wrong-target /
    unmodified-function patches to exercise every failure path."""

    name = "mock3a"

    def complete(self, prompt: str, temperature: float, a: int,
                 b: int) -> str:
        import re
        m = re.search(r"### file: (\S+)", prompt)
        path = m.group(1) if m else "unknown.py"
        d = re.search(r"^def (\w+)", prompt.split("```python", 1)[-1],
                      re.MULTILINE)
        name = d.group(1) if d else "nothing"
        kind = (a + b) % 3
        if kind == 0:
            return "완전히 잘못된 응답 형식"
        if kind == 1:
            return ("# file: not_a_target.py\n"
                    "def ghost():\n    return None\n")
        return (f"# file: {path}\n"
                f"def {name}(*args, **kwargs):\n"
                f"    raise ValueError('rk-mock')\n")


class BSearchMockProvider:
    """§6.12 pilot only: answers hypothesis calls with a fixed list
    that repeats two machine-refutable locations every round (so
    round 2 revisits are guaranteed), and patch calls with a valid
    but wrong patch. Captures hypothesis prompts so the pilot can
    assert the ban list is (not) injected."""

    name = "mock-noreg"

    def __init__(self):
        self.hyp_prompts: list[str] = []
        self.patch_prompts: list[str] = []
        self.ia_count = 0

    def complete(self, prompt: str, temperature: float, a: int,
                 b: int) -> str:
        import json as _json
        import re
        if "영향 분석을 JSON 하나로만" in prompt:
            self.ia_count += 1
            func = "consume" if self.ia_count % 2 else "ghost_zzz"
            return _json.dumps({
                "file": "more_itertools/recipes.py", "function": func,
                "call_paths": ["mock 경로"], "preserve": ["mock 동작"],
                "regression_risk": ["mock 회귀"],
                "min_scope": "mock 범위"})
        if "원인 가설을 4~5개 생성하라" in prompt:
            self.hyp_prompts.append(prompt)
            hyps = [
                {"file": "more_itertools/more.py",
                 "function": "chunked", "call_path": "",
                 "reason": "mock", "falsifier": ""},
                {"file": "more_itertools/recipes.py",
                 "function": "ghost_zzz", "call_path": "",
                 "reason": "mock", "falsifier": ""},
                {"file": "no_such_file.py", "function": "foo",
                 "call_path": "", "reason": "mock", "falsifier": ""},
                {"file": "more_itertools/recipes.py",
                 "function": "consume", "call_path": "",
                 "reason": "mock", "falsifier": ""},
            ]
            return _json.dumps(hyps)
        self.patch_prompts.append(prompt)
        fm = re.search(r"- 파일: (\S+)", prompt)
        nm = re.search(r"- 함수: (\S+)", prompt)
        path = fm.group(1) if fm else "unknown.py"
        name = (nm.group(1) if nm else "nothing").split(".")[-1]
        return (f"# file: {path}\n"
                f"def {name}(*args, **kwargs):\n"
                f"    raise ValueError('noreg-mock')\n")


def pilot_noreg() -> None:
    from genesis.rookery.adapters.repo_tasks import TASKS_V3A
    from genesis.rookery.exp3a import run_arm_bsearch

    task = next(t for t in TASKS_V3A
                if t.task_id == "mi_running_minmax_stability")
    logs: list[dict] = []
    pv_bs, pv_bsn = BSearchMockProvider(), BSearchMockProvider()
    r_bs, hyp_bs = run_arm_bsearch(task, 0, pv_bs, logs.append,
                                   use_registry=True)
    r_bsn, hyp_bsn = run_arm_bsearch(task, 0, pv_bsn, logs.append,
                                     use_registry=False)
    bsn_rounds = [e for e in logs
                  if e.get("arm") == "BSN" and "round" in e]
    checks = {
        "BS 2라운드 프롬프트에 금지 목록 주입":
            any("다시 제안 금지" in p for p in pv_bs.hyp_prompts),
        "BSN 프롬프트에 금지 목록 없음":
            not any("다시 제안 금지" in p for p in pv_bsn.hyp_prompts),
        "BSN 그림자 레지스트리 기록":
            bool(bsn_rounds and bsn_rounds[-1]["negative"]),
        "재방문 계수 동일 산식 (양군 2)":
            hyp_bs["banned_revisits"] == 2
            == hyp_bsn["banned_revisits"],
        "validation 필드 로그": all("validation" in e
                                    for e in bsn_rounds),
        "BSN 패치 경로 완주": r_bsn.final_status != "no_patch",
        "BS 판정 경로 불변": r_bs.final_status == r_bsn.final_status,
    }
    for name, ok in checks.items():
        print(f"  {name}: {'OK' if ok else '실패'}")
    print("파일럿 판정:",
          "통과 - 기계 검증 완료" if all(checks.values()) else "실패")


def pilot_ia() -> None:
    from genesis.rookery.adapters.repo_tasks import TASKS_V3A
    from genesis.rookery.exp3a import run_arm_bsearch

    task = next(t for t in TASKS_V3A
                if t.task_id == "mi_running_minmax_stability")
    logs: list[dict] = []
    pv_ia, pv_pad = BSearchMockProvider(), BSearchMockProvider()
    r_ia, _ = run_arm_bsearch(task, 0, pv_ia, logs.append,
                              ia_mode="ia")
    r_pad, _ = run_arm_bsearch(task, 0, pv_pad, logs.append,
                               ia_mode="pad")
    ia_cands = [c for c in r_ia.candidates]
    applied = [c for c in r_ia.candidates + r_pad.candidates
               if not c.code_fail and not c.duplicate]
    checks = {
        "IA 호출 발생": pv_ia.ia_count > 0,
        "IA 게이트 양방향 (valid/invalid 혼재)":
            {c.ia_valid for c in ia_cands} >= {True, False},
        "valid IA만 블록 첨부": (
            any("영향 분석" in p for p in pv_ia.patch_prompts)
            and not all("영향 분석" in p
                        for p in pv_ia.patch_prompts)),
        "BIA 예산 ≤14": max(
            (c.call for c in ia_cands), default=0) < 14,
        "BPAD 패딩 전 후보 첨부": all(
            "형식 채움" in p for p in pv_pad.patch_prompts),
        "BPAD에 IA 호출 없음": pv_pad.ia_count == 0,
        "repro/smoke 분리 계측": all(
            c.repro_pass is not None and c.smoke_pass is not None
            for c in applied),
        "IA 로그 기록": any("ia_response" in e for e in logs),
    }
    for name, ok in checks.items():
        print(f"  {name}: {'OK' if ok else '실패'}")
    print("파일럿 판정:",
          "통과 - 기계 검증 완료" if all(checks.values()) else "실패")


class SelMockProvider:
    """§6.16 pilot only: proposes the true fix (read from the fix
    worktree) so the selector path actually triggers; the sel-IA
    reply is either mappable ('good') or unmappable ('nomap')."""

    name = "mock-sel"

    def __init__(self, ia_kind: str = "good"):
        self.ia_kind = ia_kind

    def complete(self, prompt: str, temperature: float, a: int,
                 b: int) -> str:
        import json as _json
        import os
        if "패치 후보다" in prompt:          # selector-side IA
            if self.ia_kind == "good":
                return _json.dumps({
                    "file": "more_itertools/more.py",
                    "function": "sliced",
                    "call_paths": ["islice", "take"],
                    "preserve": ["기존 슬라이스 동작"],
                    "regression_risk": ["chunked 계열"],
                    "min_scope": "sliced 한 함수"})
            return _json.dumps({
                "file": "more_itertools/more.py",
                "function": "qqqxyz_none",
                "call_paths": ["zzz_nothing"],
                "preserve": [], "regression_risk": [],
                "min_scope": ""})
        if "원인 가설을 4~5개 생성하라" in prompt:
            return _json.dumps([{
                "file": "more_itertools/more.py",
                "function": "sliced", "call_path": "",
                "reason": "mock", "falsifier": ""}])
        from genesis.rookery.exp3a import extract_focus
        fix = os.path.join("data", "repos", "mi_sliced_negative_fix",
                           "more_itertools", "more.py")
        with open(fix, encoding="utf-8", errors="replace") as f:
            seg = extract_focus(f.read(), "sliced")
        return f"# file: more_itertools/more.py\n{seg}"


def pilot_sel() -> None:
    from genesis.rookery.adapters.repo_tasks import TASKS_V3A, worktree_at
    from genesis.rookery.exp3a import (
        repo_test_ids, run_arm_bsearch, sel_tier)

    task = next(t for t in TASKS_V3A
                if t.task_id == "mi_sliced_negative")
    wt = worktree_at(task, task.parent_commit, "work")
    ids_hit = repo_test_ids(wt, {"sliced"})
    ids_miss = repo_test_ids(wt, {"zzz_nonexistent_xx"})
    logs: list[dict] = []
    r_sel, _ = run_arm_bsearch(task, 0, SelMockProvider("good"),
                               logs.append, ia_mode="sel")
    r_nomap, _ = run_arm_bsearch(task, 1, SelMockProvider("nomap"),
                                 logs.append, ia_mode="sel")
    r_pub, _ = run_arm_bsearch(task, 2, SelMockProvider("good"),
                               logs.append, ia_mode="pub")
    sel_cands = [c for c in r_sel.candidates if not c.code_fail]
    nomap_cands = [c for c in r_nomap.candidates if not c.code_fail]
    checks = {
        "매핑: 실심볼 ≥1 테스트": len(ids_hit) >= 1,
        "매핑: 부재 심볼 0 테스트": len(ids_miss) == 0,
        "BSEL 매핑 실행+통과": any(
            c.mapped_ids and c.mapped_pass for c in sel_cands),
        "BSEL 최종 full (정답 패치)": r_sel.final_status == "full",
        "no_mapped 경로 기록": any(
            c.no_mapped for c in nomap_cands),
        "BPUB에 selector 필드 없음": all(
            c.mapped_pass is None and c.no_mapped is None
            for c in r_pub.candidates),
        "BPUB에 sel_ia 로그 없음": not any(
            "sel_ia" in e and e.get("arm") == "BPUB" for e in logs),
        "티어 규칙 (2>1>0)": (sel_tier(True, True) == 2
                              > sel_tier(True, None) == 1
                              > sel_tier(False, None) == 0),
    }
    for name, ok in checks.items():
        print(f"  {name}: {'OK' if ok else '실패'}")
    print("파일럿 판정:",
          "통과 - 기계 검증 완료" if all(checks.values()) else "실패")


class B4MockProvider:
    """§8.3 pilot only: answers with the true answer location and
    either the full fix (all answer functions) or the partial decoy
    (first answer function only) read from the fix commit."""

    name = "mock-b4"

    def __init__(self, task, manifest: dict, partial: bool):
        from genesis.rookery.tasks_b4 import _fix_bodies

        self.task = task
        self.bodies = _fix_bodies(task.repo_name, manifest)
        self.partial = partial
        self.manifest = manifest

    def complete(self, prompt: str, temperature: float, a: int,
                 b: int) -> str:
        import json as _json
        if "패치 후보다" in prompt:          # selector-side IA
            rel, name = self.manifest["answer_functions"][0].split("::")
            return _json.dumps({
                "file": rel, "function": name,
                "call_paths": [], "preserve": [],
                "regression_risk": [], "min_scope": "mock"})
        if "원인 가설을 4~5개 생성하라" in prompt:
            return _json.dumps([
                {"file": rel, "function": name, "call_path": "",
                 "reason": "mock", "falsifier": ""}
                for rel, _, name in list(self.bodies)[:4]])
        items = list(self.bodies.items())
        if self.partial:
            items = items[:1]
        return "\n\n".join(
            f"# file: {rel}\n"
            + (f"# class: {cls}\n" if cls else "")
            + code
            for (rel, cls, name), code in items)


def pilot_b4() -> None:
    from genesis.rookery.exp3a import run_arm_bsearch
    from genesis.rookery.tasks_b4 import _manifest, build_b4_tasks

    task = next(t for t in build_b4_tasks()
                if t.task_id == "b4_du_operators")
    m = _manifest(task.repo_name, task.fix_commit[:9])
    logs: list[dict] = []
    r_full, _ = run_arm_bsearch(
        task, 0, B4MockProvider(task, m, partial=False), logs.append,
        ia_mode="sel")
    r_part, _ = run_arm_bsearch(
        task, 1, B4MockProvider(task, m, partial=True), logs.append,
        ia_mode="sel")
    r_pub, _ = run_arm_bsearch(
        task, 2, B4MockProvider(task, m, partial=True), logs.append,
        ia_mode="pub")
    part_cands = [c for c in r_part.candidates if not c.code_fail]
    checks = {
        "정답 패치 최종 full": r_full.final_status == "full",
        "표적 후보 생성 (부분패치 공개+스모크 통과)":
            any(c.public_pass for c in part_cands),
        "부분패치 최종 비-full (validator가 잡음)":
            r_part.final_status != "full",
        "BSEL sel_ia 로그": any(
            "sel_ia" in e and e.get("arm") == "BSEL" for e in logs),
        "BPUB에 selector 필드 없음": all(
            c.mapped_pass is None for c in r_pub.candidates),
        "매핑: 변경 테스트 자동 배제": all(
            t not in (task.public_repro + task.hidden)
            for c in r_part.candidates for t in c.mapped_ids),
    }
    for name, ok in checks.items():
        print(f"  {name}: {'OK' if ok else '실패'}")
    print("파일럿 판정:",
          "통과 - 기계 검증 완료" if all(checks.values()) else "실패")


def pilot3a() -> None:
    from genesis.rookery.adapters.repo_tasks import TASKS_V3A
    from genesis.rookery.exp3a import run_experiment

    subset = [t for t in TASKS_V3A
              if t.task_id in ("mi_sliced_negative", "tdb_lru_falsy")]
    summary = run_experiment(MockRepoProvider(), "pilot", reps=1,
                             tasks=subset)
    checks = {
        "A/B 각 2런": summary["A"]["n"] == 2 == summary["B"]["n"],
        "코드 실패 경로 사용": (summary["A"]["code_fails"]
                                + summary["B"]["code_fails"]) > 0,
        "테스트 계측": summary["A"]["mean_test_runs"] > 0,
    }
    for name, ok in checks.items():
        print(f"  {name}: {'OK' if ok else '실패'}")
    print("파일럿 판정:",
          "통과 - 기계 검증 완료" if all(checks.values()) else "실패")


def main() -> None:
    parser = argparse.ArgumentParser(prog="genesis.rookery")
    parser.add_argument("--selfcheck", action="store_true")
    parser.add_argument("--selfcheck-v2", action="store_true")
    parser.add_argument("--selfcheck-v21", action="store_true")
    parser.add_argument("--calibrate-v21", action="store_true")
    parser.add_argument("--calibrate", action="store_true")
    parser.add_argument("--pilot", action="store_true")
    parser.add_argument("--pilot3a", action="store_true")
    parser.add_argument("--experiment", action="store_true")
    parser.add_argument("--experiment3a", action="store_true")
    parser.add_argument("--reps", type=int, default=3)
    parser.add_argument("--explore", action="store_true",
                        help="초점 창 제거: 2단계 탐색 프로토콜")
    parser.add_argument("--micro-diverse", action="store_true",
                        help="§6.8 다양성 기제 소실험 (저항 3과제)")
    parser.add_argument("--bsearch", action="store_true",
                        help="§6.10 탐색·패치 분리 소실험 (저항 3과제)")
    parser.add_argument("--pilot-noreg", action="store_true",
                        help="§6.12 목 파일럿 (결과 아님)")
    parser.add_argument("--bsearch-noreg", action="store_true",
                        help="§6.12 부정 증거 레지스트리 제거군 실행")
    parser.add_argument("--pilot-ia", action="store_true",
                        help="§6.14 목 파일럿 (결과 아님)")
    parser.add_argument("--ia614", action="store_true",
                        help="§6.14 B-IA vs B-pad 실행")
    parser.add_argument("--pilot-sel", action="store_true",
                        help="§6.16 목 파일럿 (결과 아님)")
    parser.add_argument("--sel616", action="store_true",
                        help="§6.16 B-public vs B-selector-IA 실행")
    parser.add_argument("--loc618", action="store_true",
                        help="§6.18 위치 재검증 재검 (B-IA vs B-pad, "
                             "반복 10)")
    parser.add_argument("--pilot-b4", action="store_true",
                        help="§8.3 목 파일럿 (결과 아님)")
    parser.add_argument("--sel83", action="store_true",
                        help="§8.3 selector-측 IA 재검정 (B군 4과제)")
    parser.add_argument("--model", default="claude-haiku-4-5-20251001")
    args = parser.parse_args()

    if args.pilot3a:
        pilot3a()
        return
    if args.pilot_noreg:
        pilot_noreg()
        return
    if args.pilot_ia:
        pilot_ia()
        return
    if args.pilot_sel:
        pilot_sel()
        return
    if args.pilot_b4:
        pilot_b4()
        return
    if args.sel83:
        from genesis.mission7.proposers import AnthropicProvider
        from genesis.rookery.exp3a import run_bsearch_616
        from genesis.rookery.tasks_b4 import build_b4_tasks

        provider = AnthropicProvider(args.model, 1.0, max_tokens=4000)
        report = run_bsearch_616(provider, reps=args.reps,
                                 tasks=build_b4_tasks(), tag="sel83")
        print(json.dumps(report, ensure_ascii=False, indent=1))
        return
    if args.loc618:
        from genesis.mission7.proposers import AnthropicProvider
        from genesis.rookery.exp3a import run_bsearch_614

        provider = AnthropicProvider(args.model, 1.0, max_tokens=4000)
        report = run_bsearch_614(provider, reps=args.reps,
                                 tag="loc618")
        print(json.dumps(report, ensure_ascii=False, indent=1))
        return
    if args.sel616:
        from genesis.mission7.proposers import AnthropicProvider
        from genesis.rookery.exp3a import run_bsearch_616

        provider = AnthropicProvider(args.model, 1.0, max_tokens=4000)
        report = run_bsearch_616(provider, reps=args.reps)
        print(json.dumps(report, ensure_ascii=False, indent=1))
        return
    if args.ia614:
        from genesis.mission7.proposers import AnthropicProvider
        from genesis.rookery.exp3a import run_bsearch_614

        provider = AnthropicProvider(args.model, 1.0, max_tokens=4000)
        report = run_bsearch_614(provider, reps=args.reps)
        print(json.dumps(report, ensure_ascii=False, indent=1))
        return
    if args.bsearch_noreg:
        from genesis.mission7.proposers import AnthropicProvider
        from genesis.rookery.exp3a import run_bsearch_noreg

        provider = AnthropicProvider(args.model, 1.0, max_tokens=4000)
        report = run_bsearch_noreg(provider, reps=args.reps)
        print(json.dumps(report, ensure_ascii=False, indent=1))
        return
    if args.bsearch:
        from genesis.mission7.proposers import AnthropicProvider
        from genesis.rookery.exp3a import run_bsearch_micro

        provider = AnthropicProvider(args.model, 1.0, max_tokens=4000)
        report = run_bsearch_micro(provider, reps=args.reps)
        print(json.dumps(report, ensure_ascii=False, indent=1))
        return
    if args.micro_diverse:
        from genesis.mission7.proposers import AnthropicProvider
        from genesis.rookery.exp3a import run_micro

        provider = AnthropicProvider(args.model, 1.0, max_tokens=4000)
        report = run_micro(provider, reps=args.reps)
        print(json.dumps(report, ensure_ascii=False, indent=1))
        return
    if args.experiment3a:
        from genesis.mission7.proposers import AnthropicProvider
        from genesis.rookery.exp3a import run_experiment

        provider = AnthropicProvider(args.model, 1.0,
                                     max_tokens=4000)
        tag = "explore" if args.explore else "main"
        summary = run_experiment(provider, tag, reps=args.reps,
                                 explore=args.explore)
        print(json.dumps(summary, ensure_ascii=False, indent=1))
        return

    if args.selfcheck:
        selfcheck()
        return
    if args.selfcheck_v2:
        selfcheck_v2()
        return
    if args.selfcheck_v21:
        selfcheck_v21()
        return
    if args.calibrate_v21:
        calibrate_v21(args.model)
        return
    if args.calibrate:
        calibrate(args.model)
        return
    if args.pilot:
        from genesis.rookery.exp1 import run_experiment
        report = run_experiment(MockFixProvider(), "pilot")
        print("파일럿 요약(결과 아님):", report["verdicts"])
        return
    if args.experiment:
        from genesis.mission7.proposers import AnthropicProvider
        from genesis.rookery.exp1 import run_experiment
        provider = AnthropicProvider(args.model, 1.0)
        report = run_experiment(provider, "main")
        for v in report["verdicts"]:
            print(v)
        print("usage:", report["usage"])
        return
    parser.print_help()


main()
