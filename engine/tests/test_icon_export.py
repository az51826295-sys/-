"""아이콘 자동 조립 — 선별 기록이 정한 것만, 그리고 빈 그림을 조용히 안 내보낸다.

게이트 ④의 나머지 절반. 지금까지 게임 자산은 손으로 들어갔고, 그러면
"설계도 → 자산 → 조립"이 끊긴다.
"""
import json
import os

import pytest

from genesis import svg_raster
from tools import game_smoke
from tools import icon_export

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "game", "assets", "ui", "manifest.json")
needs_raster = pytest.mark.skipif(not svg_raster.available(),
                                  reason="래스터 없음 - 미측정")


@needs_raster
def test_the_manifest_matches_the_pick_record():
    """조립된 것은 **사장님이 고른 것**이어야 한다. 기계가 고르지 않는다."""
    from tools import pick_weight_spread as pws
    picks = pws.load_picks()
    man = json.load(open(MANIFEST, encoding="utf-8"))
    exported = {r["concept"]: r["source"] for r in man["icons"]}
    for concept, path in picks.items():
        name = concept.split("_", 1)[-1]
        assert name in exported, f"{name}이 조립에서 빠졌다"
        assert exported[name] == path.replace("\\", "/")


@needs_raster
def test_every_exported_icon_has_ink():
    """빈 PNG를 조용히 내보내면 게임에는 '안 보이는 아이콘'이 들어간다."""
    man = json.load(open(MANIFEST, encoding="utf-8"))
    assert man["count"] >= 8
    for r in man["icons"]:
        assert r["ink_mean"] >= icon_export.MIN_INK, r
        assert not r.get("suspect")
        assert os.path.exists(os.path.join(ROOT, r["png"]))


@needs_raster
def test_exported_size_matches_the_declared_size():
    from PIL import Image
    man = json.load(open(MANIFEST, encoding="utf-8"))
    for r in man["icons"]:
        with Image.open(os.path.join(ROOT, r["png"])) as im:
            assert im.size == (man["size"], man["size"]), r["png"]
            assert im.mode == "RGBA"


@pytest.mark.skipif(game_smoke.find_godot() is None, reason="Godot 없음")
def test_the_game_fails_when_an_assembled_icon_is_missing():
    """이빨: 조립이 끊기면 게임이 떨어져야 한다.

    파일을 실제로 옮기지 않고 **없는 척**한다 - 예전엔 옮겼다가 병렬 주행에서
    다른 테스트가 그 순간을 읽어 무작위로 깨졌다.
    """
    res = game_smoke.run(drop_asset="assets/ui/attack.png")
    assert res["verdict"] == "FAIL", res
    assert any("파일이 없다" in f for f in res["fail"])


@pytest.mark.skipif(game_smoke.find_godot() is None, reason="Godot 없음")
def test_the_assembled_icons_all_load_in_the_engine():
    res = game_smoke.run()
    assert res["verdict"] == "PASS", res
    assets = res["assets"]
    assert assets["declared"] == assets["loaded"] >= 8
    assert assets["bad"] == []


@pytest.mark.skipif(game_smoke.find_godot() is None, reason="Godot 없음")
def test_the_game_fails_when_a_character_direction_is_missing():
    """이빨: 캐릭터 방향 하나가 빠지면 게임이 떨어져야 한다.

    여기도 파일을 안 건드린다(위와 같은 이유).
    """
    res = game_smoke.run(
        drop_asset="assets/characters/merchant/rotations/north.png")
    assert res["verdict"] == "FAIL", res
    assert any("north.png 없다" in f for f in res["fail"]), res["fail"]


def test_the_assembly_declaration_matches_what_is_in_the_game():
    """선언에 없는 자산이 게임에 있으면 '어디서 왔는지'가 사라진다."""
    from tools import assemble_game
    r = assemble_game.assemble(apply=False)
    assert r["characters"], r
    for c in r["characters"]:
        # 오디션 원본과 게임 파일이 **바이트까지 같다** = 손으로 바뀐 게 없다
        assert c["same"] == c["files"], c
        assert not c["missing"], c
    assert r["tiles"]["size_ok"] is True
    _assert_tile_declaration_is_honest(r["tiles"])


def _assert_tile_declaration_is_honest(tiles: dict) -> None:
    """타일 선언이 **지금 실제로 들어 있는 것**과 맞는가.

    예전에는 `kind == "placeholder"` 를 박아 뒀다. 08-27 진짜 오디션 타일을
    넣자 이 줄이 떨어졌는데, **그건 자산이 좋아진 것이지 결함이 아니었다.**
    검사의 의도는 "타일이 영원히 가짜여야 한다"가 아니라 "선언이 정직한가"다.
    의도대로 다시 쓴다 - 진짜라고 적었으면 원본이 실제로 있어야 하고,
    자리표시자가 남아 있으면 어느 칸인지 적혀 있어야 한다.
    """
    import glob
    import os

    kind = tiles["kind"]
    assert kind in ("placeholder", "mixed", "real"), kind
    # 조립 보고서에서는 이 항목 이름이 note다(선언 파일에서는 honest_note).
    note = tiles.get("note") or tiles.get("honest_note") or ""
    if kind == "placeholder":
        assert "자리표시자" in note, note
        return
    # 진짜 타일이 있다고 선언했으면 원본이 실제로 있어야 한다
    src = tiles.get("wang_source")
    assert src, tiles
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    hits = glob.glob(os.path.join(root, src.split(" ")[0]))
    assert len(hits) == tiles["wang_slots"],         f"진짜 타일 {tiles['wang_slots']}칸이라 했는데 원본은 {len(hits)}장"
    # 아틀라스에 실제로 있는 칸 수와 선언이 맞는가. 이게 마지막 이빨이다 -
    # 위 검사들은 전부 선언끼리의 대조라서, 선언 전체가 거짓이면 다 통과한다.
    slots = tiles["size"][0] // 16
    # 투명 충돌 칸은 **그림이 아니다.** 자리표시자로 세면 "5칸인데 6칸"이 되어
    # 정직한 선언이 거짓말로 판정된다(08-27에 실제로 그랬다).
    blocker = 1 if tiles.get("blocker_slot") is not None else 0
    extra = slots - tiles["wang_slots"] - blocker
    if kind == "real":
        assert extra == 0,             f"'real' 이라 했는데 wang 밖 칸이 {extra}개 남아 있다"
        assert not tiles.get("placeholder_slots"),             f"'real' 이라 했는데 자리표시자 칸이 선언돼 있다: "             f"{tiles['placeholder_slots']}"
    if kind == "mixed":
        # 남은 자리표시자를 감추지 않았는가
        ph = tiles.get("placeholder_slots")
        assert ph, tiles
        assert len(ph) == extra,             f"자리표시자 칸이 {extra}개인데 {len(ph)}개만 적혀 있다"
        assert "자리표시자" in note, note
