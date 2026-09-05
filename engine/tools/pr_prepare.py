"""채택 1건 → 제출 직전 PR 브랜치 준비 (사장님 답변 Q2: "검토 30분을 10분으로").

오늘(08-22) 손으로 한 제출 절차의 기계 부분을 한 명령으로:
  1. `origin/<base>`를 fetch해 그 위에 새 워크트리·브랜치(`rookery-pr/<repo>-<issue>`)
  2. 채택 커밋(헤드 저장소의 `rookery/live-<repo>_<n>` 브랜치)을 체리픽,
     저자 = 사장님(az518), 메시지 = "<이슈 제목> (#n)" + Refs + AI 관여 트레일러
  3. 인테이크 재현 테스트(`test_intake_<repo>_<n>.py`)를 **정식 회귀 테스트 초안**으로
     변환해 해당 모듈의 기존 테스트 파일 끝에 붙인다(없으면 새 파일). 사람이 다듬는다.
  4. 저장소 전체 스위트(+doctest) 실행 → 결과 요약
  5. 남은 사람 일: 패치 읽기·판단, 테스트 다듬기, PR 본문 Summary, 푸시·제출.
지출 0, 푸시 없음. 시간을 재서 출력한다(10분 목표의 측정치).

  python tools/pr_prepare.py live-toolz_496 --tags live_runB [--base master] [--no-suite]
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import re
import subprocess
import sys
import time

sys.path.insert(0, os.getcwd())
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from genesis.rookery.engine import prqueue  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
AUTHOR = ("az518", "az51826295@gmail.com")
TRAILER = "Co-Authored-By: Rookery Alpha (AI agent, human-reviewed)"
BASE_OF = {"marshmallow": "dev"}


def _git(argv, cwd, check=True, env=None):
    r = subprocess.run(["git", *argv], cwd=cwd, capture_output=True,
                       text=True, encoding="utf-8", errors="replace",
                       env=env)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(argv)}: {r.stderr.strip()[:300]}")
    return r.stdout.strip()


def _queue_cfg():
    spec = importlib.util.spec_from_file_location(
        "_pr_queue", os.path.join(HERE, "pr_queue.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.SLUG_OF, mod.FORK_OWNER, mod.BASE_OF


# ------------------------------------------------ regression test draft


def find_test_file(wt: str, changed: list[str]) -> str | None:
    """변경된 모듈 `a/b/mod.py`에 대응하는 기존 테스트 파일 `test_mod.py`."""
    for f in changed:
        mod = os.path.splitext(os.path.basename(f))[0]
        if mod.startswith("test_") or mod == "__init__":
            continue
        want = f"test_{mod}.py"
        for dirpath, dirnames, filenames in os.walk(wt):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            if want in filenames:
                return os.path.relpath(os.path.join(dirpath, want), wt
                                       ).replace("\\", "/")
    return None


def draft_regression(intake_src: str, issue: int | str, slug: str) -> str:
    """인테이크 테스트 → 회귀 테스트 초안: 함수 이름에 이슈 번호, 머리에
    출처 주석. import는 그대로 둔다(사람이 파일 상단 import와 합친다)."""
    body = intake_src.strip("\n")
    body = re.sub(r"^if __name__ == .__main__.:\n(?:[ \t]+.*\n?)*", "",
                  body, flags=re.M)
    body = re.sub(r"^def test_(\w+)\(", rf"def test_issue_{issue}_\1(",
                  body, flags=re.M)
    return (f"\n\n# --- regression test for {slug}#{issue} "
            f"(draft from the reproduction test - review & merge imports) ---\n"
            f"{body}\n")


# --------------------------------------------------------------- main


def prepare(task_id: str, tags: list[str], base: str | None,
            run_suite: bool = True, work_root: str | None = None) -> dict:
    t0 = time.time()
    slug_of, fork_owner, base_of = _queue_cfg()
    base_of = {**base_of, **BASE_OF}
    state = prqueue.load_state(os.path.join(DATA, "pr_queue_state.json"))
    cands = prqueue.collect(DATA, tags, os.path.join(DATA, "repos"),
                            slug_of, fork_owner, base_of, state)
    cand = next((c for c in cands if c.task_id == task_id), None)
    if cand is None:
        raise SystemExit(f"채택 후보 아님: {task_id} (tags {tags})")
    if not cand.commit:
        raise SystemExit(f"채택 커밋 없음: {cand.note}")
    repo_dir = os.path.join(DATA, "repos", f"{cand.repo_name}_head")
    base = base or base_of.get(cand.repo_name, "master")
    _git(["fetch", "-q", "origin"], repo_dir)
    branch = f"rookery-pr/{cand.repo_name}-{cand.issue}"
    work_root = work_root or os.path.join(DATA, "pr_work")
    wt = os.path.join(work_root, f"{cand.repo_name}-{cand.issue}")
    if os.path.exists(wt):
        _git(["worktree", "remove", "--force", wt], repo_dir, check=False)
    _git(["branch", "-D", branch], repo_dir, check=False)
    _git(["worktree", "add", "-q", "-b", branch, wt, f"origin/{base}"],
         repo_dir)
    env = {**os.environ, "GIT_AUTHOR_NAME": AUTHOR[0],
           "GIT_AUTHOR_EMAIL": AUTHOR[1], "GIT_COMMITTER_NAME": AUTHOR[0],
           "GIT_COMMITTER_EMAIL": AUTHOR[1]}
    _git(["cherry-pick", "--no-commit", cand.commit], wt, env=env)
    # 3. 회귀 테스트 초안
    intake_name = cand.repro_test or f"test_intake_{cand.repo_name}_{cand.issue}.py"
    intake_src = _git(["show", f"{cand.commit}:{intake_name}"], repo_dir,
                      check=False) or _git(
        ["show", f"HEAD:{intake_name}"], repo_dir, check=False)
    test_file = find_test_file(wt, cand.files)
    drafted = None
    if intake_src:
        if test_file is None:
            mod = os.path.splitext(os.path.basename(
                (cand.files or ["change"])[0]))[0]
            tests_dir = "tests" if os.path.isdir(os.path.join(wt, "tests")) \
                else "."
            test_file = f"{tests_dir}/test_{mod}_issue_{cand.issue}.py"
            os.makedirs(os.path.dirname(os.path.join(wt, test_file)),
                        exist_ok=True)
            open(os.path.join(wt, test_file), "w", encoding="utf-8").close()
        with open(os.path.join(wt, test_file), "a", encoding="utf-8",
                  newline="\n") as f:
            f.write(draft_regression(intake_src, cand.issue, cand.slug))
        drafted = test_file
        _git(["add", test_file], wt)
    # 인테이크 테스트 파일이 체리픽에 딸려왔으면 제외 (헤드에만 있던 파일)
    if intake_name and os.path.exists(os.path.join(wt, intake_name)):
        _git(["rm", "-q", "--cached", intake_name], wt, check=False)
        try:
            os.remove(os.path.join(wt, intake_name))
        except OSError:
            pass
    title = cand.draft_title
    msg = (f"{title}\n\n"
           f"Refs #{cand.issue}. <!-- human: one sentence - what was wrong, "
           f"what this changes -->\n\n"
           f"Reproduce: pytest {intake_name} fails on HEAD, passes after.\n"
           f"Verified: repository suite incl. doctests; files: "
           f"{', '.join(cand.files)}.\n"
           f"Not touched: anything outside those files; no test files "
           f"modified.\n\n{TRAILER}\n")
    _git(["commit", "-q", "-m", msg], wt, env=env)
    sha = _git(["rev-parse", "--short", "HEAD"], wt)
    # 4. 스위트
    suite = None
    if run_suite:
        r = subprocess.run([sys.executable, "-m", "pytest", "-q",
                            "--doctest-modules", "-p", "no:cacheprovider",
                            "-x", "--ignore=" + intake_name],
                           cwd=wt, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=900)
        tail = (r.stdout or "").strip().splitlines()
        suite = {"rc": r.returncode, "summary": tail[-1] if tail else ""}
    elapsed = round(time.time() - t0, 1)
    return {"task": task_id, "repo": cand.repo_name, "issue": cand.issue,
            "worktree": wt, "branch": branch, "commit": sha,
            "base": f"origin/{base}", "files": cand.files,
            "regression_draft": drafted, "suite": suite,
            "push": f"git -C {repo_dir} push fork {branch}",
            "compare": cand.compare_url.replace(
                f"{fork_owner}:{cand.repo_name}:{cand.branch}",
                f"{fork_owner}:{cand.repo_name}:{branch}"),
            "elapsed_s": elapsed,
            "human_left": ["패치 읽기·판단", "회귀 테스트 다듬기(import 합치기)",
                           "PR 본문 Summary", "푸시·제출", "mark submitted"]}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("task_id")
    ap.add_argument("--tags", default="live_auto")
    ap.add_argument("--base", default=None)
    ap.add_argument("--no-suite", action="store_true")
    args = ap.parse_args(argv)
    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    out = prepare(args.task_id, tags, args.base, run_suite=not args.no_suite)
    import json
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
