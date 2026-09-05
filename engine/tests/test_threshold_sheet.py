"""동결 대기 시트 시험 — 값을 제안하지 않는다는 것이 이 도구의 전부다.

이 시트가 "이 정도면 −14 LUFS가 좋겠습니다" 같은 말을 하기 시작하면, 문턱이
사장님 손을 떠나 계측기 안으로 숨어든다. 그래서 여기서 고정하는 것은
**무엇을 보여주는가**가 아니라 **무엇을 하지 않는가**다.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from genesis import asset_specs                           # noqa: E402
from tools import artifact_adapter as aa                  # noqa: E402
from tools import threshold_sheet as ts                   # noqa: E402


def test_it_never_proposes_a_value():
    """시트의 어떤 칸에도 '정해야 할 숫자'가 들어 있으면 안 된다."""
    res = ts.run()
    for row in res["instruments_without_slot"]:
        assert "value" not in row and "suggested" not in row
        assert not any(isinstance(v, (int, float)) for v in row.values())
    assert "제안하지 않는다" in res["note"]


def test_unfrozen_list_matches_the_spec_file():
    """시트가 자기 목록을 따로 들고 있으면 규격과 어긋난다."""
    res = ts.run()
    assert [r["threshold"] for r in res["unfrozen"]] == \
        asset_specs.unfrozen_keys()


def test_reader_rules_are_reported_for_frozen_decision():
    """'정하면 살아나는가'를 알려면 누가 읽는지가 있어야 한다."""
    rows = {r["threshold"]: r for r in ts.run()["unfrozen"]}
    dropout = rows["DROPOUT_MAX_S"]
    assert dropout["alive_if_frozen"] is True
    assert {"profile": "audio", "field": "dropout_max_s"} in dropout["read_by"]


def test_out_of_profile_use_is_not_called_dead():
    """스캔의 한계를 값에 섞지 않는다 - 프로필 밖에서 쓰이는 문턱이 있다."""
    rows = {r["threshold"]: r for r in ts.run()["unfrozen"]}
    out_of_profile = rows["THRESH_OUT_PCT"]
    assert out_of_profile["read_by"] == []
    assert out_of_profile["mentions_outside_profiles"] > 0
    assert out_of_profile["where"] == "프로필 밖(도구 인자·큐 등)"


def test_instruments_point_at_real_adapters():
    """자리 없는 계측기 목록이 실재하는 어댑터를 가리키는지."""
    for row in ts.run()["instruments_without_slot"]:
        assert row["adapter"] in aa.ADAPTERS, row["measure"]
        assert row["design"].endswith(".md")
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        assert os.path.isfile(os.path.join(root, row["design"]))


def test_instrument_measures_exist_in_the_adapter_output():
    """목록에 적힌 값이 실제로 그 어댑터에서 나오는가(이름만 적어두지 않는다)."""
    for row in ts.run()["instruments_without_slot"]:
        top = row["measure"].split(".")[0]
        assert top in aa.PROVIDES[row["adapter"]], row["measure"]


def test_cli_runs_and_records(tmp_path, capsys):
    out_path = str(tmp_path / "sheet.json")
    assert ts.main(["--record", out_path]) == 0
    assert os.path.isfile(out_path)
    out = capsys.readouterr().out
    assert "동결 대기 시트" in out
    assert "문턱은 사장님 몫" in out
