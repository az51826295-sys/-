"""실험 등록부 — 사전 등록 없이 실험이 늘어나지 않게 막는다.

docs/measurement-rules.md §7. 기록에 `"design": "docs/…"`를 쓰는 도구는 전부
`data/experiments.json`에 있어야 한다. 등록부가 없으면 실험이 조용히 늘고,
어떤 도구가 어떤 표본 단위로 판정했는지 사후에 답이 안 된다.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REG = json.load(open(os.path.join(ROOT, "data", "experiments.json"),
                     encoding="utf-8"))["experiments"]
UNITS = {"call", "concept", "asset", "candidate", "none"}
KINDS = {"verdict", "planning", "report"}


def _tools_that_write_a_design_key():
    out = []
    tdir = os.path.join(ROOT, "tools")
    for f in sorted(os.listdir(tdir)):
        if not f.endswith(".py"):
            continue
        src = open(os.path.join(tdir, f), encoding="utf-8").read()
        if re.search(r'"design":\s*"docs/', src):
            out.append(f"tools/{f}")
    return out


def test_every_experiment_tool_is_registered():
    registered = {e["tool"] for e in REG}
    missing = [t for t in _tools_that_write_a_design_key()
               if t not in registered]
    assert not missing, f"등록부에 없는 실험 도구: {missing}"


def test_every_entry_points_at_files_that_exist():
    for e in REG:
        assert os.path.exists(os.path.join(ROOT, e["design"])), e["id"]
        assert os.path.exists(os.path.join(ROOT, e["tool"])), e["id"]
        # 결과 파일은 **아직 없을 수 있다** - 사전 등록은 돌리기 전에 하는 것이고,
        # 없다고 떨어뜨리면 이 검사가 사전 등록을 벌하게 된다(08-27에 실제로 그랬다).
        # 대신 `pending`으로 스스로 밝히게 하고, 밝혔으면 result를 비워 두게 강제한다.
        if e.get("pending"):
            assert not e["result"],                 f'{e["id"]}: pending인데 result가 적혀 있다'
        elif e["result"]:
            assert os.path.exists(os.path.join(ROOT, e["result"])), e["id"]


def test_every_entry_declares_its_sample_unit_and_kind():
    for e in REG:
        assert e["sample_unit"] in UNITS, (e["id"], e["sample_unit"])
        assert e["kind"] in KINDS, (e["id"], e["kind"])
        assert e["note"].strip(), e["id"]


def test_a_candidate_unit_verdict_must_carry_its_reason():
    """§1: 후보 단위를 쓰려면 뭉치지 않는다는 근거를 같이 적는다."""
    for e in REG:
        if e["kind"] == "verdict" and e["sample_unit"] == "candidate":
            assert "뭉" in e["note"] or "독립" in e["note"], (
                f'{e["id"]}: 후보 단위인데 근거가 없다')


def test_ids_are_unique():
    ids = [e["id"] for e in REG]
    assert len(ids) == len(set(ids))


def test_등록부에는_note와_experiments만_있다():
    """항목을 **experiments 밖**에 두면 아무 검사도 안 걸린다.

    08-27에 실제로 그랬다 - 새 실험을 최상위 키로 붙였는데 이 파일의 검사가 전부
    통과했다. 위 검사들은 `["experiments"]` 리스트만 훑기 때문이다. 그러면 등록한
    줄 알았는데 아무 데도 안 실린 실험이 생긴다.
    """
    doc = json.load(open(os.path.join(ROOT, "data", "experiments.json"),
                         encoding="utf-8"))
    assert set(doc) == {"note", "experiments"}, \
        f"등록부 최상위에 낯선 키가 있다: {sorted(set(doc) - {'note', 'experiments'})}"
    assert isinstance(doc["experiments"], list)


def test_pending은_결과가_나오면_풀려야_한다():
    """돌린 실험이 pending으로 남아 있으면 등록부가 거짓말을 한다."""
    for e in REG:
        if not e.get("pending"):
            continue
        # 도구가 쓰기로 한 자리에 파일이 생겼는데도 pending이면 안 된다
        guess = os.path.join(ROOT, "data", f'{e["id"].replace("-", "_")}.json')
        assert not os.path.exists(guess),             f'{e["id"]}: 결과가 {guess} 에 있는데 아직 pending이다'


def test_id가_겹치지_않는다():
    ids = [e["id"] for e in REG]
    dupes = {i for i in ids if ids.count(i) > 1}
    assert not dupes, f"같은 id가 두 번: {sorted(dupes)}"
