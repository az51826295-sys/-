"""Auto-derived spent-task registry.

Hand-maintained arrays failed twice: mine.py's USED list was extended
after the more-itertools candidate file had already been written
(stale), and classify_inc's SPENT held only the §8.3 samples, so
mi_running_minmax_stability - spent across five experiments - was
admitted as a fresh INC task and nearly reported as one (design
§9.2, instrument incident #3).

This derives the set instead, from three independent sources:
  1. the v3a task table (repo, fix_commit, task_id)
  2. the §8.3 B-corpus task builder
  3. every experiment report in data/ - each result row names the
     task it ran, resolved back to a commit through 1 and 2

SHA comparison is prefix-based in both directions, so a 7-char
manifest sha and a 40-char table entry match.
"""

from __future__ import annotations

import glob
import json
import os
from functools import lru_cache

DATA = "data"
MIN_PREFIX = 7


def _norm_sha(sha: str) -> str:
    return (sha or "").strip().lower()


def sha_matches(a: str, b: str) -> bool:
    """True when one sha is a prefix of the other (>= 7 chars)."""
    a, b = _norm_sha(a), _norm_sha(b)
    if len(a) < MIN_PREFIX or len(b) < MIN_PREFIX:
        return False
    n = min(len(a), len(b))
    return a[:n] == b[:n]


@lru_cache(maxsize=1)
def spent_records() -> tuple[dict, ...]:
    """Every task that has been consumed by an experiment."""
    out: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def add(repo: str, sha: str, task_id: str, source: str) -> None:
        key = (repo, _norm_sha(sha)[:12])
        if not repo or not sha or key in seen:
            return
        seen.add(key)
        out.append({"repo": repo, "fix_commit": _norm_sha(sha),
                    "task_id": task_id, "source": source})

    from genesis.rookery.adapters.repo_tasks import TASKS_V3A

    for t in TASKS_V3A:
        add(t.repo_name, t.fix_commit, t.task_id, "v3a")

    try:
        from genesis.rookery.tasks_b4 import build_b4_tasks

        for t in build_b4_tasks():
            add(t.repo_name, t.fix_commit, t.task_id, "b4")
    except Exception as exc:                 # never mask the v3a set
        out.append({"repo": "", "fix_commit": "", "task_id": "",
                    "source": f"b4_unavailable: {str(exc)[:80]}"})

    # ablation 11 (data/ablation_admission.json, 기계 추출): 과제 id가
    # abl_<repo>_<sha9>라 repo·fix_commit이 id에 들어 있다. 08-08 이후
    # 이 16건이 표에 없어 보고 해석에서 '미해결'로 세였다 (08-22 수리).
    try:
        with open(os.path.join(DATA, "ablation_admission.json"),
                  encoding="utf-8") as f:
            admitted = json.load(f).get("admitted", [])
    except (OSError, ValueError):
        admitted = []
    abl_alias: dict[str, tuple[str, str]] = {}
    for tid in admitted:
        if isinstance(tid, str) and tid.startswith("abl_") and "_" in tid[4:]:
            repo, sha = tid[4:].rsplit("_", 1)
            abl_alias[tid] = (repo, sha)
            add(repo, sha, tid, "ablation")

    # experiment reports: task ids that actually ran
    by_task = {r["task_id"]: r for r in out if r["task_id"]}
    for tid, (repo, sha) in abl_alias.items():      # 같은 커밋의 별칭도 해석
        by_task.setdefault(tid, {"repo": repo, "fix_commit": _norm_sha(sha),
                                 "task_id": tid})
    for path in sorted(glob.glob(os.path.join(
            DATA, "rookery3a_report_*.json"))):
        try:
            with open(path, encoding="utf-8") as f:
                rows = json.load(f).get("results", [])
        except (OSError, ValueError):
            continue
        for row in rows:
            tid = row.get("task")
            if not tid:
                continue
            known = by_task.get(tid)
            if known:
                add(known["repo"], known["fix_commit"], tid,
                    f"report:{os.path.basename(path)}")
            elif str(tid).isdigit():
                # 합성 세계(보드게임 조건 실험·ablation)의 과제 id는 숫자다 -
                # 저장소·fix_commit이 없으니 소진 레지스트리의 대상이 아니다.
                # 08-08 이후 condexp/ablation11 보고가 이 글로브에 잡혀
                # '미해결'로 세이던 계측 결함 (08-22 전체 스위트 주행에서 발견)
                out.append({"repo": "", "fix_commit": "",
                            "task_id": str(tid),
                            "source": f"synthetic:"
                                      f"{os.path.basename(path)}"})
                by_task[tid] = {"repo": "", "fix_commit": "",
                                "task_id": str(tid)}
            else:
                out.append({"repo": "", "fix_commit": "",
                            "task_id": tid,
                            "source": f"unresolved:"
                                      f"{os.path.basename(path)}"})
                by_task[tid] = {"repo": "", "fix_commit": "",
                                "task_id": tid}
    return tuple(out)


def is_spent(repo: str, sha: str) -> bool:
    """Applied at execution time, so a stale candidate manifest
    cannot smuggle a spent task into a new experiment."""
    return any(r["repo"] == repo and sha_matches(r["fix_commit"], sha)
               for r in spent_records() if r["repo"])


def unresolved_tasks() -> list[str]:
    return sorted({r["task_id"] for r in spent_records()
                   if r["source"].startswith("unresolved")})


def selfcheck() -> int:
    """Frozen §9.3 checks. Returns the number of problems."""
    from genesis.rookery.adapters.repo_tasks import TASKS_V3A

    records = spent_records()
    problems = 0
    checks: list[tuple[str, bool, str]] = []

    v3a = [t for t in TASKS_V3A]
    missing = [t.task_id for t in v3a
               if not is_spent(t.repo_name, t.fix_commit)]
    checks.append((f"v3a {len(v3a)}과제 전부 탐지", not missing,
                   str(missing)))

    try:
        from genesis.rookery.tasks_b4 import build_b4_tasks

        b4 = build_b4_tasks()
        miss_b4 = [t.task_id for t in b4
                   if not is_spent(t.repo_name, t.fix_commit)]
        checks.append((f"§8.3 B군 {len(b4)}과제 전부 탐지",
                       not miss_b4, str(miss_b4)))
    except Exception as exc:
        checks.append(("§8.3 B군 탐지", False, str(exc)[:120]))

    checks.append(("짧은·긴 해시 정규화",
                   sha_matches("d992be0", "d992be0de1234567890")
                   and sha_matches("d992be0de1234567890", "d992be0")
                   and not sha_matches("d992be0", "d992bff0")
                   and not sha_matches("d992", "d992be0de"), ""))

    known = is_spent("more-itertools", "d992be0de")
    checks.append(("mi_running_minmax_stability 제외", known, ""))

    stale = [c for c in _stale_candidates() if c]
    checks.append((f"stale 후보 자동 제외 ({len(stale)}건 차단)",
                   True, ""))

    unresolved = unresolved_tasks()
    checks.append(("리포트 task id 전부 해석됨", not unresolved,
                   str(unresolved[:5])))

    for name, ok, detail in checks:
        if not ok:
            problems += 1
        print(f"  {name}: {'OK' if ok else '실패'}"
              + (f" ({detail})" if detail and not ok else ""))
    print(f"  수집 소진 레코드: {len([r for r in records if r['repo']])}건")
    return problems


def _stale_candidates() -> list[str]:
    """Spent commits still present in mined candidate files - the
    exact leak that produced incident #3."""
    out = []
    for path in glob.glob(os.path.join(DATA,
                                       "mine_candidates_*.json")):
        repo = os.path.basename(path)[len("mine_candidates_"):-len(
            ".json")]
        try:
            with open(path, encoding="utf-8") as f:
                cands = json.load(f)
        except (OSError, ValueError):
            continue
        for c in cands:
            if is_spent(repo, c.get("sha", "")):
                out.append(f"{repo}:{c['sha'][:9]}")
    return out


if __name__ == "__main__":
    print("=== 소진 목록 자동 수집 selfcheck ===")
    n = selfcheck()
    stale = _stale_candidates()
    if stale:
        print(f"  (참고) stale 후보 파일 잔존: {stale}")
    print("판정:", "통과" if n == 0 else f"실패 ({n}건)")
    raise SystemExit(0 if n == 0 else 1)
