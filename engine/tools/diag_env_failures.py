"""§9.2 환경 탈락분 1단계: 복원 시도 없이 실패 원인만 분류한다.

절차 (전부 로컬, API 0원):
 A. 명단 산수 - §9.2 서명 스캔 산출(corpus_inc_shortlist.json)과
    검증 결과(corpus_inc/*.json)의 집합 관계를 그대로 보고한다.
 B. 저장 필드 1차 분류 - answer_functions/repro_tests의 빈 여부로
    실패 지점(함수 추출 vs 테스트 실행)을 나눈다.
 C. 원인 로그 채취 - 실패 후보마다 fix 커밋 워크트리에서 해당
    커밋의 테스트 파일로 pytest를 1회 돌려 (수정 없음, 설치 없음)
    stderr/stdout을 캡처하고 패턴으로 분류한다. §9.2 당시 콘솔
    로그가 파일로 남지 않아, 같은 파이프라인 조건의 실행으로
    로그를 재생성하는 것이다 - 복원 시도가 아니다.

분류 (사전 정의):
  py_incompat     파이썬 버전 비호환 (구문 오류, 제거된 stdlib,
                  collections→abc 이동 등)
  dep_missing     서드파티 의존성 부재/해결 실패
  sys_lib         시스템 라이브러리 부재 (DLL 등)
  runner_config   pytest 러너·설정 비호환 (제거된 pytest API,
                  INTERNALERROR, usage 오류)
  network         네트워크 필요
  timeout         수집/실행 타임아웃
  test_mismatch   테스트는 돌지만 서명의 테스트 id가 안 잡힘
                  (환경 아님 - 분류기 그레인 문제)
  runs_ok         지금 환경에서 정상 수집·실행됨 (탈락 사유가
                  환경이 아니었음을 뜻함 - 별도 조사 대상)

    python tools/diag_env_failures.py          # 전체
    python tools/diag_env_failures.py --limit 5
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.getcwd())

from genesis.rookery.mine import _run, _wt  # noqa: E402

DATA = "data"
OUT = os.path.join(DATA, "corpus_inc")
SHORTLIST = os.path.join(DATA, "corpus_inc_shortlist.json")
REPORT = os.path.join(DATA, "env_failure_diagnosis.json")

RULES = [
    ("network", r"getaddrinfo|ConnectionError|Connection refused|"
                r"urlopen error|Name or service not known"),
    ("timeout", r"__TIMEOUT__"),
    ("py_incompat",
     r"SyntaxError|Missing parentheses in call to 'print'|"
     r"No module named '?(imp|distutils|asynchat|asyncore|smtpd|"
     r"unittest2|StringIO|ConfigParser|urllib2|cPickle|__builtin__)'?|"
     r"cannot import name '\w+' from 'collections'|"
     r"module 'inspect' has no attribute 'getargspec'|"
     r"AttributeError: module 'collections' has no attribute|"
     r"invalid escape sequence|name 'unicode' is not defined|"
     r"name 'basestring' is not defined"),
    ("runner_config",
     r"INTERNALERROR|usage error|unrecognized arguments|"
     r"no attribute 'config'|_pytest\.\w+ has no attribute|"
     r"PytestRemovedIn|fixture '\w+' not found|"
     r"AttributeError: module 'pytest'|PluginValidationError|"
     r"hookimpl|Plugin '.+conftest"),
    ("dep_missing", r"ModuleNotFoundError|ImportError: No module"),
    ("sys_lib", r"DLL load failed|OSError: \[WinError|"
                r"error while loading shared"),
]


def classify_text(text: str) -> str:
    for name, pat in RULES:
        if re.search(pat, text):
            return name
    return "unclassified"


def diagnose(repo: str, sha: str, test_files: list[str]) -> tuple[str, str]:
    """fix 커밋 워크트리에서 커밋 자신의 테스트 파일을 1회 실행."""
    try:
        wt = _wt(repo, sha, "diag")
    except SystemExit as exc:
        return "worktree_fail", str(exc)[:300]
    present = [t for t in test_files
               if os.path.isfile(os.path.join(wt, t))]
    if not present:
        return "test_files_absent", f"none of {test_files} in worktree"
    env = None
    src = os.path.join(wt, "src")
    if os.path.isdir(src):
        env = dict(os.environ)
        env["PYTHONPATH"] = os.path.abspath(src) + os.pathsep \
            + env.get("PYTHONPATH", "")
    try:
        r = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "--no-header",
             "--tb=short", "-rA", "-o", "addopts=", *present],
            cwd=wt, capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=240, env=env)
    except subprocess.TimeoutExpired:
        return "timeout", "__TIMEOUT__ collection/run over 240s"
    text = r.stdout + "\n" + r.stderr
    ran = len(re.findall(r"^(PASSED|FAILED|ERROR)\s", r.stdout,
                         re.MULTILINE))
    if r.returncode in (0, 1) and ran > 0 and \
            "error" not in r.stdout.lower().split("\n")[-2 if
            r.stdout.count("\n") > 1 else 0]:
        cat = "runs_ok"
    else:
        cat = classify_text(text)
        if cat == "unclassified" and ran > 0:
            cat = "runs_ok"
    tail = text[-800:]
    return cat, tail


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    with open(SHORTLIST, encoding="utf-8") as f:
        shortlist = json.load(f)
    results = {}
    for p in glob.glob(os.path.join(OUT, "*.json")):
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        key = os.path.basename(p).removesuffix(".json")
        results[key] = d

    # A. 명단 산수
    sl_keys = [f"{r['repo']}_{r['sha']}" for r in shortlist]
    have = [k for k in sl_keys if k in results]
    missing = [k for k in sl_keys if k not in results]
    verified, skipped = [], []
    for k in have:
        d = results[k]
        if d.get("skipped"):
            skipped.append(k)
        else:
            verified.append(k)
    extra = sorted(set(results) - set(sl_keys))
    print(f"[A] shortlist {len(sl_keys)} | 결과 있음 {len(have)} "
          f"(검증 완주 {len(verified)}, skip {len(skipped)}) | "
          f"결과 없음(ERR) {len(missing)} | "
          f"shortlist 밖 결과 파일 {len(extra)} (이전 세대)")

    # B. 저장 필드 1차 분류
    stageB = {}
    for k in skipped:
        d = results[k]
        if not d.get("answer_functions"):
            stageB[k] = "no_answer_functions"
        elif not d.get("repro_tests"):
            stageB[k] = "no_repro_tests"
        else:
            stageB[k] = "other_skip"
    from collections import Counter
    print(f"[B] skip 세부: {dict(Counter(stageB.values()))}")

    # C. 원인 로그 채취 (skip + ERR 전부)
    targets = []
    by_key = {f"{r['repo']}_{r['sha']}": r for r in shortlist}
    for k in skipped + missing:
        r = by_key[k]
        tfiles = sorted({t.split("::")[0] for t in r["tests"]})
        targets.append((k, r["repo"], r["sha"], tfiles))
    if args.limit:
        targets = targets[:args.limit]

    rows = []
    dist = Counter()
    for i, (k, repo, sha, tfiles) in enumerate(targets, 1):
        cat, tail = diagnose(repo, sha, tfiles)
        rows.append({"key": k, "repo": repo, "sha": sha,
                     "stageB": stageB.get(k, "ERR_no_result"),
                     "cause": cat, "log_tail": tail})
        dist[cat] += 1
        print(f"  [{i}/{len(targets)}] {k:34} {cat}", flush=True)

    print("\n[C] 원인 분포:")
    for cat, n in dist.most_common():
        print(f"  {cat:16} {n}")
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump({"shortlist_n": len(sl_keys),
                   "verified": verified, "skipped": skipped,
                   "err_missing": missing, "extra_prev_era": extra,
                   "stageB": stageB, "diagnosis": rows},
                  f, ensure_ascii=False, indent=1)
    print(f"\n저장: {REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
