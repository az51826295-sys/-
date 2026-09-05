"""Archetype-A location-hit calibration pilot (design §8.0.1,
frozen 2026-08-02). Instrument calibration, NOT an experiment:

- 5 candidate tasks x 5 calls, Haiku 4.5, temperature 1.0, 25 total
- baseline exploration prompt: repo file list + the repro test's
  SOURCE with every answer-function name mechanically redacted to
  `target_function` (and a pre-check that no answer file path leaks)
- location suspects only (<= 3 per call, JSON); patches forbidden
- pilot data is never included in any experiment sample

Classification (frozen): A1 = file hits 1..4/5 AND func hits 1..4/5;
A2 = file 1..4/5 AND func 0..2/5; ceiling (5/5 both) and floor
(file 0/5) excluded.

  python -m genesis.rookery.calibrate_loc
"""

from __future__ import annotations

import json
import os
import re

from genesis.rookery.mine import _run, _wt

DATA = "data"

# (repo, fix_commit_prefix) - the five §8.0.1 candidates
CANDIDATES = [
    ("more-itertools", "def2d821c"),
    ("dateutil", "16424e936"),
    ("dateutil", "5f2052faf"),
    ("sortedcontainers", "2b037039b"),
    ("sortedcontainers", "7dc426c95"),
]
CALLS = 5
MAX_SUSPECTS = 3


def _manifest(repo: str, sha: str) -> dict:
    with open(os.path.join(DATA, "corpus_v2", f"{repo}_{sha}.json"),
              encoding="utf-8") as f:
        return json.load(f)


def _test_source(wt_fix: str, tid: str) -> str:
    parts = tid.split("::")
    path, name = parts[0], parts[-1]
    with open(os.path.join(wt_fix, path), encoding="utf-8",
              errors="replace") as f:
        source = f.read()
    import ast
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                and node.name == name:
            return ast.get_source_segment(source, node)
    return ""


def _redact(text: str, manifest: dict) -> tuple[str, bool]:
    """Mask answer-function bare names; verify no answer file path
    remains. Returns (redacted, leak_free)."""
    for a in manifest["answer_functions"]:
        bare = a.split("::")[-1].lstrip("_")
        for variant in {a.split("::")[-1], bare, "_" + bare}:
            if variant:
                text = re.sub(rf"\b{re.escape(variant)}\b",
                              "target_function", text)
    leak = any(os.path.basename(f).removesuffix(".py") in text
               for f in manifest["answer_files"])
    return text, not leak


def _tree(wt: str) -> str:
    r = _run(["git", "ls-files", "*.py"], wt)
    return "\n".join(sorted(r.stdout.splitlines()))


def main() -> None:
    from genesis.mission7.proposers import AnthropicProvider

    provider = AnthropicProvider("claude-haiku-4-5-20251001", 1.0,
                                 max_tokens=1000)
    calls_path = os.path.join(DATA, "rookery3a_calls_calib.jsonl")
    results = {}
    for repo, sha in CANDIDATES:
        m = _manifest(repo, sha)
        wt_p = _wt(repo, m["parent_commit"], "parent")
        wt_f = _wt(repo, m["fix_commit"], "fix")
        tid = m["repro_tests"][0]
        src, leak_free = _redact(_test_source(wt_f, tid), m)
        if not leak_free:
            results[f"{repo}_{sha}"] = {"excluded": "file-path leak"}
            continue
        ans_files = set(m["answer_files"])
        ans_funcs = {a.split("::")[-1] for a in m["answer_functions"]}
        prompt = (
            "다음은 실제 파이썬 라이브러리의 버그다.\n"
            "아래 테스트가 실패한다 (테스트 대상 함수명은 "
            "target_function으로 가려져 있다):\n"
            f"```python\n{src}\n```\n\n"
            f"저장소 파이썬 파일 목록:\n{_tree(wt_p)}\n\n"
            "버그의 원인 위치 후보를 JSON 하나로만 답하라 "
            f"(최대 {MAX_SUSPECTS}개). 패치를 작성하지 마라:\n"
            '{"suspects": ["경로.py::함수 또는 클래스.메서드", ...]}')
        file_hits = func_hits = 0
        for call in range(CALLS):
            response = provider.complete(prompt, 1.0, call, 0)
            try:
                arr = json.loads(response[response.find("{"):
                                          response.rfind("}") + 1]
                                 )["suspects"][:MAX_SUSPECTS]
            except Exception:
                arr = []
            f_hit = any(s.split("::")[0].replace("\\", "/")
                        in ans_files for s in arr if isinstance(s, str))
            names = {w for s in arr if isinstance(s, str)
                     for w in re.findall(r"[A-Za-z_][A-Za-z0-9_]*",
                                         s.split("::")[-1])}
            fn_hit = bool(names & ans_funcs)
            file_hits += f_hit
            func_hits += fn_hit
            with open(calls_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(
                    {"task": f"{repo}_{sha}", "call": call,
                     "suspects": arr, "file_hit": f_hit,
                     "func_hit": fn_hit,
                     "response": response[:500]},
                    ensure_ascii=False) + "\n")
        if file_hits == CALLS and func_hits == CALLS:
            cls = "천장 (제외)"
        elif file_hits == 0:
            cls = "바닥 (제외)"
        elif 1 <= file_hits <= 4 and 1 <= func_hits <= 4:
            cls = "A1"
        elif 1 <= file_hits <= 4 and func_hits <= 2:
            cls = "A2"
        else:
            cls = "미분류"
        results[f"{repo}_{sha}"] = {
            "file_hits": f"{file_hits}/{CALLS}",
            "func_hits": f"{func_hits}/{CALLS}",
            "class": cls}
        print(f"{repo}_{sha}: 파일 {file_hits}/5 함수 {func_hits}/5 "
              f"-> {cls}", flush=True)
    results["usage"] = dict(getattr(provider, "usage", {}))
    with open(os.path.join(DATA, "corpus_v2_calibration.json"), "w",
              encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    print(json.dumps(results, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
