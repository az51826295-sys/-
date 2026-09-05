"""§6.11 구조 귀속 제거 실험 (등록: docs/ablation-structure-design.md v1.1).

BS = run_arm_bsearch(use_registry=True)  — §6.11 그대로, 8호출.
BF = run_arm(arm="B", budget=8)          — 가설·레지스트리 제거,
     선택 제도(중복 제거·champion)는 유지. 동일 예산.

과제: classify_inc.candidates()의 미소진 적격 18건을 tasks_b4의
기계 규칙으로 RepoTask화하고, 입회 검사(selfcheck)를 통과한 것만
실행한다. 제외는 사유와 함께 기록 - §8.3 계측기 전례.

  python -m genesis.rookery.ablation --build       # 과제 생성만
  python -m genesis.rookery.ablation --admit       # 입회 검사
  python -m genesis.rookery.ablation --pilot       # 목 파일럿 (지출 0)
  python -m genesis.rookery.ablation --run         # 본실험 (resume)

집계(1차 지표 5종)는 4주차에 골든 케이스 선행 후 별도 구현한다 -
이 모듈은 원자료(런 행 + 호출 로그)만 만든다.
"""

from __future__ import annotations

import argparse
import ast
import json
import os

DATA = "data"
ADMISSION = os.path.join(DATA, "ablation_admission.json")
REPS = 5
BUDGET = 8
MODEL = "claude-haiku-4-5-20251001"

REPO_URLS = {
    "boltons": "https://github.com/mahmoud/boltons.git",
    "dateutil": "https://github.com/dateutil/dateutil.git",
    "marshmallow": "https://github.com/marshmallow-code/marshmallow.git",
    "more-itertools": "https://github.com/more-itertools/more-itertools.git",
    "sortedcontainers":
        "https://github.com/grantjenks/python-sortedcontainers.git",
    "tinydb": "https://github.com/msiemens/tinydb.git",
}


def frozen_cases() -> list[tuple[str, str]]:
    """등록서에 동결된 18건 (classify_inc.candidates() 산출)."""
    from genesis.rookery.classify_inc import candidates
    return candidates()


def build_task(repo: str, sha9: str):
    """tasks_b4의 기계 분할 규칙을 일반화 적용:
    public = repro_tests 알파벳순 첫 번째, hidden = 나머지,
    smoke = fix 시대 주 테스트 파일의 앞 3개(변경 테스트 제외),
    광역 회귀 = 변경 테스트 클래스 단위, issue = 정답 함수명이
    가려진 public 테스트 소스."""
    from genesis.rookery.adapters.repo_tasks import RepoTask
    from genesis.rookery.tasks_b4 import (
        _git_show, _manifest, _redact, _smoke_ids, _test_src)

    m = _manifest(repo, sha9)
    public = sorted(m["repro_tests"])[0]
    hidden = sorted(set(m["repro_tests"]) - {public})
    tf = public.split("::")[0]
    extra = {f: _git_show(repo, f"{m['fix_commit']}:{f}")
             for f in m["test_files"]}
    changed_names = {t.split("::")[-1] for t in m["added_tests"]}
    smoke = _smoke_ids(extra[tf], tf, changed_names)
    broad = sorted({"::".join(t.split("::")[:2])
                    for t in m["added_tests"]})
    issue = ("다음 테스트가 실패한다 (테스트 대상 함수명은 "
             "target_function으로 가려져 있다):\n"
             + _redact(_test_src(extra[tf], public), m))
    return RepoTask(
        task_id=f"abl_{repo}_{sha9}",
        repo_url=REPO_URLS[repo],
        repo_name=repo,
        parent_commit=m["parent_commit"],
        fix_commit=m["fix_commit"],
        files_changed=m["answer_files"],
        public_repro=[public],
        hidden=hidden,
        regression=smoke,
        regression_hidden=broad,
        extra_test_files=extra,
        issue_summary=issue)


def build_all() -> list:
    tasks = []
    errors = []
    for repo, sha9 in frozen_cases():
        try:
            tasks.append(build_task(repo, sha9))
        except Exception as exc:                     # noqa: BLE001
            errors.append((f"{repo}_{sha9}", f"build: {exc}"[:200]))
    return tasks, errors


def admit() -> dict:
    """기계 입회 검사. 통과한 task_id 목록을 기록하고 반환한다.
    검사: 공개 재현 부모 fail·정답 pass / hidden 부모 fail·정답
    pass / 스모크 부모 pass / 광역 회귀 정답 pass."""
    from genesis.rookery.adapters.repo_tasks import (
        run_pytest, worktree_at)
    from genesis.rookery.exp3a import _reset

    tasks, errors = build_all()
    admitted, rejected = [], list(errors)
    for t in tasks:
        wt_p = worktree_at(t, t.parent_commit, "work")
        wt_f = worktree_at(t, t.fix_commit, "fixcheck")
        _reset(wt_p, t)
        checks = []
        checks.append(("public_parent_fail",
                       run_pytest(wt_p, t.public_repro)[0] == "fail"))
        checks.append(("public_fix_pass",
                       run_pytest(wt_f, t.public_repro)[0] == "pass"))
        if t.hidden:
            checks.append(("hidden_parent_fail",
                           run_pytest(wt_p, t.hidden)[0] == "fail"))
            checks.append(("hidden_fix_pass",
                           run_pytest(wt_f, t.hidden)[0] == "pass"))
        if t.regression:
            checks.append(("smoke_parent_pass",
                           run_pytest(wt_p, t.regression)[0] == "pass"))
        checks.append(("broad_fix_pass",
                       run_pytest(wt_f, t.regression_hidden)[0]
                       == "pass"))
        _reset(wt_p, t)
        bad = [n for n, ok in checks if not ok]
        if bad:
            rejected.append((t.task_id, f"admission: {bad}"))
            print(f"  제외 {t.task_id}: {bad}", flush=True)
        else:
            admitted.append(t.task_id)
            print(f"  입회 {t.task_id} (hidden {len(t.hidden)}, "
                  f"smoke {len(t.regression)})", flush=True)
    out = {"admitted": admitted, "rejected": rejected,
           "total_frozen": len(frozen_cases())}
    with open(ADMISSION, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"\n입회 {len(admitted)} / 제외 {len(rejected)} "
          f"(동결 {out['total_frozen']})  -> {ADMISSION}")
    return out


def admitted_tasks() -> list:
    with open(ADMISSION, encoding="utf-8") as f:
        adm = set(json.load(f)["admitted"])
    tasks, _ = build_all()
    return [t for t in tasks if t.task_id in adm]


# --------------------------------------------------------------- arms


def bs_arm(task, rep, log):
    from genesis.rookery.exp3a import run_arm_bsearch
    run, hyp = run_arm_bsearch(task, rep, _provider(), log,
                               use_registry=True, ia_mode="none")
    row = run.model_dump()
    row["arm"] = "BS"
    row["hyp_stats"] = hyp
    return row


def bf_arm(task, rep, log):
    from genesis.rookery.exp3a import run_arm
    run = run_arm(task, "B", rep, _provider(), log, budget=BUDGET)
    row = run.model_dump()
    row["arm"] = "BF"
    return row


_PROVIDER = None


def _provider():
    global _PROVIDER
    if _PROVIDER is None:
        raise SystemExit("provider not initialized")
    return _PROVIDER


ENV_FILE = r"C:\Users\az518\Desktop\ai-workforce\.env.local"


def _load_key() -> None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return
    try:
        with open(ENV_FILE, encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("ANTHROPIC_API_KEY="):
                    os.environ["ANTHROPIC_API_KEY"] = \
                        line.split("=", 1)[1].strip().strip('"')
                    return
    except OSError:
        pass


def _keep_awake() -> None:
    """장기 런 절전 차단 (4차 라이브 런의 23:58 절전 사고 재발
    방지 - resume이 있어도 밤새 멈춘 시간은 돌아오지 않는다)."""
    import sys
    if sys.platform != "win32":
        return
    import ctypes
    ctypes.windll.kernel32.SetThreadExecutionState(
        0x80000000 | 0x00000001)


def _init_real_provider():
    global _PROVIDER
    _load_key()
    os.environ.setdefault("GENESIS_SPEND", "i-approve")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY 없음")
    from genesis.mission7.proposers import AnthropicProvider
    # max_tokens=4000: §6.x B-search 실행부와 동일. 기본 512로는
    # 가설 JSON·긴 패치가 잘려 파서가 조용히 빈 값을 낸다 -
    # 1차 시작(2026-08-08 13:45)이 이 결함으로 무효화된 계측기
    # 사고의 직접 원인이었다.
    _PROVIDER = AnthropicProvider(MODEL, 1.0, max_tokens=4000)
    return _PROVIDER


class MockProvider:
    """플러밍 검증 전용 (지출 0, 결과 아님). 가설 프롬프트에는
    정답 파일을 포함한 JSON을, 제안 프롬프트에는 정답 파일의 첫
    함수를 무변경 재출력하는 패치 블록을 돌려준다 - 적용·실행·
    선택·기록 경로가 전부 돌게 하는 것이 목적이다."""

    name = "mock"
    usage = {"calls": 0}

    def __init__(self, tasks):
        from genesis.rookery.tasks_b4 import _git_show
        self._hyp = {}
        for t in tasks:
            f = t.files_changed[0]
            src = _git_show(t.repo_name, f"{t.parent_commit}:{f}")
            name = None
            try:
                for node in ast.parse(src).body:
                    if isinstance(node, (ast.FunctionDef,
                                         ast.AsyncFunctionDef)):
                        name = node.name
                        break
            except SyntaxError:
                pass
            # 파일별 실존 모듈 수준 def - 가설 검증기를 통과해
            # BS의 패치 경로까지 파일럿이 태우도록
            self._hyp[f] = name or "main"

    def complete(self, prompt, temperature, a, b):
        self.usage["calls"] += 1
        import re
        if "원인 가설" in prompt or "falsifier" in prompt:
            f, fn = next(iter(self._hyp.items()))
            for path in self._hyp:
                if path in prompt:
                    f, fn = path, self._hyp[path]
                    break
            return json.dumps([{
                "file": f, "function": fn, "call_path": "",
                "reason": "mock", "falsifier": "mock"}] * 2,
                ensure_ascii=False)
        m = re.search(r"### file: (\S+).*?```python\n(.*?)```",
                      prompt, re.S)
        if not m:
            return "# file: x.py\ndef nothing():\n    pass\n"
        path, body = m.group(1), m.group(2)
        try:
            tree = ast.parse(body)
        except SyntaxError:
            return "# file: x.py\ndef nothing():\n    pass\n"
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                seg = ast.get_source_segment(body, node)
                return f"# file: {path}\n{seg}\n"
        return "# file: x.py\ndef nothing():\n    pass\n"

    @staticmethod
    def _first_def_name(prompt):
        import re
        m = re.search(r"def (\w+)\(", prompt)
        return m.group(1) if m else None


def run(experiment: str, tasks, reps: int) -> dict:
    from genesis.rookery.runner import run_experiment_resumable
    return run_experiment_resumable(
        experiment=experiment,
        arms={"BS": bs_arm, "BF": bf_arm},
        tasks=tasks, reps=reps,
        config={"model": MODEL, "temperature": 1.0,
                "budget": BUDGET, "reps": reps,
                "design": "docs/ablation-structure-design.md v1.1"},
        summarize=lambda rows, _t: {
            "runs": len(rows),
            "by_arm_status": _status_counts(rows)},
        usage_of=lambda: dict(getattr(_PROVIDER, "usage", {})))


def _status_counts(rows):
    out = {}
    for r in rows:
        key = f"{r['arm']}/{r.get('final_status')}"
        out[key] = out.get(key, 0) + 1
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--admit", action="store_true")
    ap.add_argument("--pilot", action="store_true")
    ap.add_argument("--run", action="store_true")
    args = ap.parse_args()

    if args.build:
        tasks, errors = build_all()
        for t in tasks:
            print(t.task_id, t.public_repro[0], "hidden",
                  len(t.hidden))
        for k, e in errors:
            print("BUILD FAIL", k, e)
        return 0
    if args.admit:
        admit()
        return 0
    if args.pilot:
        global _PROVIDER
        tasks = admitted_tasks()[:2]
        _PROVIDER = MockProvider(tasks)
        summary = run("ablation11_pilot", tasks, reps=1)
        print(json.dumps(summary, ensure_ascii=False, indent=1))
        return 0
    if args.run:
        _keep_awake()
        _init_real_provider()
        tasks = admitted_tasks()
        summary = run("ablation11", tasks, reps=REPS)
        print(json.dumps(summary, ensure_ascii=False, indent=1))
        return 0
    print("옵션: --build / --admit / --pilot / --run")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
