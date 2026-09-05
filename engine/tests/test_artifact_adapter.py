"""심판대 어댑터 — 실제 파일을 심판에 물린다. 설계: docs/judge-design.md §7

핵심 주장 둘:
  ① 심판은 이제 사람이 적은 dict가 아니라 **디스크의 진짜 파일**을 채점한다.
  ② 후보의 자기신고(claim.*)만 읽는 심판은 통과해도 자율 근거가 아니다
     (pass_on_claim) — "측정한다"는 선언조차 잴 도구가 있어야 인정된다.
"""

import json
import os

import pytest

from tools import artifact_adapter as aa
from tools import judge_bench as jb

REG = jb.load_registry()


def atom(aid):
    return next(a for a in REG if a["id"] == aid)


def write(path, text=""):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path


# ---------------------------------------------------------------- 어댑터 자체

def test_dir_files_measures_size_and_hash(tmp_path):
    root = tmp_path / "d"
    write(str(root / "a.txt"), "same")
    write(str(root / "sub" / "b.txt"), "same")
    write(str(root / "c.txt"), "different content here")
    m = aa.ADAPTERS["dir_files"]({"path": str(root)})
    assert m["count"] == 3
    # 같은 내용이면 같은 해시 - 우리가 파일에서 직접 잰 사실
    assert m["hashes"]["a.txt"] == m["hashes"]["sub/b.txt"]
    assert m["hashes"]["c.txt"] != m["hashes"]["a.txt"]
    # 크기 내림차순
    sizes = [f["size"] for f in m["files"]]
    assert sizes == sorted(sizes, reverse=True)


def test_dir_bytes_pair_measures_reclaimed_space(tmp_path):
    before, after = tmp_path / "b", tmp_path / "a"
    write(str(before / "cache.bin"), "x" * 5000)
    write(str(after / "cache.bin"), "x" * 10)
    m = aa.ADAPTERS["dir_bytes_pair"]({"before": str(before),
                                       "after": str(after)})
    assert m["bytes_before"] == 5000 and m["bytes_after"] == 10


def test_adapter_fails_loudly_on_missing_path(tmp_path):
    with pytest.raises(aa.AdapterError, match="디렉터리가 없다"):
        aa.ADAPTERS["dir_files"]({"path": str(tmp_path / "nope")})


def test_deterministic_on_same_tree(tmp_path):
    root = tmp_path / "d"
    write(str(root / "a.txt"), "hello")
    a = aa.ADAPTERS["dir_files"]({"path": str(root)})
    b = aa.ADAPTERS["dir_files"]({"path": str(root)})
    assert a == b


# ---------------------------------------------------------------- 실제 채점

def test_cache_cleanup_judged_on_real_directories(tmp_path):
    before, after = tmp_path / "b", tmp_path / "a"
    write(str(before / "cache.bin"), "x" * 90000)
    write(str(after / "cache.bin"), "x" * 100)
    res = aa.judge_artifacts(atom("cache_cleanup"), {
        "adapter": "dir_bytes_pair",
        "params": {"before": str(before), "after": str(after)}})
    assert res["verdict"] == "passed"          # 측정값으로 통과
    assert res["evidence"] == "measured"
    assert res["sample"]["measured"]["bytes_before"] == 90000


def test_cache_cleanup_rejects_a_cleanup_that_freed_nothing(tmp_path):
    before, after = tmp_path / "b", tmp_path / "a"
    write(str(before / "cache.bin"), "x" * 5000)
    write(str(after / "cache.bin"), "x" * 5000)     # 그대로다
    res = aa.judge_artifacts(atom("cache_cleanup"), {
        "adapter": "dir_bytes_pair",
        "params": {"before": str(before), "after": str(after)}})
    assert res["verdict"] == "failed"


def test_large_file_finder_catches_an_inflated_report(tmp_path):
    root = tmp_path / "d"
    write(str(root / "big.bin"), "x" * 5000)
    write(str(root / "small.txt"), "x" * 10)
    source = {"adapter": "dir_files", "params": {"path": str(root)},
              "spec": {"min_size": 1000}}
    # 정직한 보고: 임계 넘는 것만
    ok = aa.judge_artifacts(atom("large_file_finder"),
                            {**source, "claim": {"paths": ["big.bin"]}})
    assert ok["verdict"] == "passed"
    # 부풀린 보고: 작은 파일까지 큰 파일이라고 우김 → 측정이 잡는다
    bad = aa.judge_artifacts(
        atom("large_file_finder"),
        {**source, "claim": {"paths": ["big.bin", "small.txt"]}})
    assert bad["verdict"] == "failed"
    # 놓친 보고도 실패
    missed = aa.judge_artifacts(atom("large_file_finder"),
                                {**source, "claim": {"paths": []}})
    assert missed["verdict"] in ("failed", "adapter_error")


def test_duplicate_finder_verified_against_real_hashes(tmp_path):
    root = tmp_path / "d"
    write(str(root / "a.txt"), "identical bytes")
    write(str(root / "b.txt"), "identical bytes")
    write(str(root / "c.txt"), "other bytes")
    source = {"adapter": "dir_files", "params": {"path": str(root)}}
    ok = aa.judge_artifacts(atom("duplicate_file_finder"),
                            {**source, "claim": {"pairs": [["a.txt", "b.txt"]]}})
    assert ok["verdict"] == "passed"
    lie = aa.judge_artifacts(atom("duplicate_file_finder"),
                             {**source, "claim": {"pairs": [["a.txt", "c.txt"]]}})
    assert lie["verdict"] == "failed"          # 해시가 다르다


def test_story_selection_reads_the_actual_draft_file(tmp_path):
    good = write(str(tmp_path / "ok.md"), "폐광 마을의 등대지기는 배를 본다.")
    bad = write(str(tmp_path / "no.md"), "용사는 마왕을 물리치러 떠났다.")
    spec = {"spec": {"forbidden": ["용사", "마왕"]}}
    ok = aa.judge_artifacts(atom("spec_fit_story_selection"),
                            {"adapter": "text_file", "params": {"path": good},
                             **spec})
    assert ok["verdict"] == "passed"
    no = aa.judge_artifacts(atom("spec_fit_story_selection"),
                            {"adapter": "text_file", "params": {"path": bad},
                             **spec})
    assert no["verdict"] == "failed"


def test_missing_artifact_is_not_a_pass(tmp_path):
    res = aa.judge_artifacts(atom("cache_cleanup"), {
        "adapter": "dir_bytes_pair",
        "params": {"before": str(tmp_path / "gone"),
                   "after": str(tmp_path / "gone2")}})
    assert res["verdict"] == "adapter_error"   # 못 읽었으면 통과가 아니다


# ---------------------------------------------------------------- 자기신고 격리

def test_claim_only_atom_passes_but_is_not_autonomous():
    """자기신고만 읽는 심판은 통과해도 pass_on_claim이다.

    2026-08-25 23:30 이후 레지스트리에는 이런 원자가 하나도 없다(전부 측정으로
    이행). 그래도 기계는 이 등급을 계속 갈라낼 수 있어야 하므로 합성 원자로 건다.
    """
    claim_atom = {"id": "tag_only_selection", "verdict": "real", "judge": {
        "kind": "tag_cover",
        "params": {"required": "spec.tags", "candidate": "claim.tags"},
        "positive": {"spec": {"tags": ["mood:tense"]},
                     "claim": {"tags": ["mood:tense", "loop:seamless"]}},
        "negatives": [{"note": "요구 태그가 빠짐",
                       "mutate": {"claim.tags": ["loop:seamless"]}}]}}
    assert jb.evidence_grade(claim_atom["judge"]) == "claim_only"
    res = aa.judge_artifacts(claim_atom, {
        "adapter": "text_file", "params": {"path": __file__},
        "spec": {"tags": ["mood:tense"]},
        "claim": {"tags": ["mood:tense", "loop:seamless"]}})
    assert res["verdict"] == "pass_on_claim"
    assert res["evidence"] == "claim_only"


def test_registry_has_no_claim_only_atoms_left():
    """이행 완료 상태를 상시 감시한다 - 자기신고로 되돌아가면 여기서 걸린다."""
    res = jb.bench_registry()
    assert res["summary"]["evidence_claim_only"] == 0, res["claim_only"]


def test_declaring_measured_without_a_tool_is_caught():
    """'measured.*'라고 쓰기만 한 것도 자기신고다 - 잴 도구가 있어야 인정."""
    rep = aa.binding_report(REG)
    by = {r["atom"]: r for r in rep["rows"]}
    # 실제로 파일을 재는 넷은 결합됨
    for aid in ("cache_cleanup", "large_file_finder", "duplicate_file_finder",
                "spec_fit_story_selection"):
        assert by[aid]["status"] == "bound", by[aid]
    # 안드로이드 권한·URL 수집기는 아직 도구가 없다 - 정직하게 표시된다
    for aid in ("dangerous_permission_scan", "phishing_link_check"):
        assert by[aid]["status"] == "no_tool"
    assert rep["summary"]["key_gap"] == 0


def test_binding_report_catches_a_key_gap():
    fake = [{"id": "wrong_tool", "verdict": "real", "adapter": "text_file",
             "judge": {"kind": "numeric_delta",
                       "params": {"before": "measured.bytes_before",
                                  "after": "measured.bytes_after",
                                  "min_delta": 1},
                       "positive": {"measured": {"bytes_before": 10,
                                                 "bytes_after": 1}},
                       "negatives": [{"note": "x",
                                      "mutate": {"measured.bytes_after": 10}}]}}]
    rep = aa.binding_report(fake)
    assert rep["rows"][0]["status"] == "key_gap"
    assert set(rep["rows"][0]["missing"]) == {"bytes_before", "bytes_after"}


# ---------------------------------------------------------------- CLI

def test_cli_bindings_runs():
    assert aa.main(["--bindings", "--json"]) == 0


def test_cli_judges_a_real_directory(tmp_path, capsys):
    before, after = tmp_path / "b", tmp_path / "a"
    write(str(before / "c.bin"), "x" * 3000)
    write(str(after / "c.bin"), "x")
    src = json.dumps({"adapter": "dir_bytes_pair",
                      "params": {"before": str(before), "after": str(after)}})
    assert aa.main(["--atom", "cache_cleanup", "--source", src]) == 0
    assert "통과(측정)" in capsys.readouterr().out
