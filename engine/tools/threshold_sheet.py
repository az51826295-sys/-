"""동결 대기 시트 — "이 문턱 하나를 정하면 무엇이 심판이 되나".

오늘(2026-08-26) 계측기를 여섯 개 만들었는데 전부 **측정됨·미판정**이다.
문턱이 사장님 몫이기 때문인데, 그 상태로 두면 "뭘 정해야 뭐가 풀리는지"가
문서 여기저기 흩어진다. 이 도구는 그걸 한 장으로 모은다.

**판정하지 않고 값을 제안하지도 않는다.** 두 가지만 한다:

  1. 미동결 문턱 — 이름이 있는데 값이 null인 것. 그 문턱을 읽는 규칙과,
     그 규칙이 대조할 **계측기가 실재하는지**를 같이 보여준다.
  2. 자리 없는 계측기 — 오늘 만든 것들처럼 값은 나오는데 문턱 이름조차 없는 것.
     "정하면 바로 판정이 되는" 후보다.

둘의 차이가 중요하다: 1번은 정해도 계측기가 없으면 여전히 undefined이고,
2번은 정하는 즉시 살아난다.

  python -X utf8 tools/threshold_sheet.py
  python -X utf8 tools/threshold_sheet.py --record data/threshold_sheet.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from genesis import asset_specs                           # noqa: E402
from tools import artifact_adapter as aa                  # noqa: E402

# 계측기는 있는데 문턱 이름이 아직 없는 값들(2026-08-26에 생긴 것).
# **값을 제안하지 않는다** — 어디서 나오는지와 무엇을 잴 수 있는지만 적는다.
INSTRUMENTS_WITHOUT_SLOT = [
    {"measure": "palette_union", "adapter": "tile_set",
     "layer": "세트(타일)", "design": "docs/tile-character-oracle-v0-design.md",
     "note": "세트 전체 고유색 수. 실측 오디션 16장 = **40색**(낱장 상한은 24). "
             "세트 상한을 정하면 '한 세계로 보이는가'가 판정이 된다"},
    {"measure": "seam_ratio_max", "adapter": "tile_set",
     "layer": "세트(타일)", "design": "docs/tile-character-oracle-v0-design.md",
     "note": "세트에서 가장 나쁜 이음새. 실측 최대 8.69(tileset_11), 중앙값 6.04"},
    {"measure": "height_spread", "adapter": "character_group",
     "layer": "세트(캐릭터)", "design": "docs/tile-character-oracle-v0-design.md",
     "note": "캐릭터끼리 키 차이. 실측 hero 36 / merchant 38 → 폭 2"},
    {"measure": "seam_ratio_x", "adapter": "tile_asset",
     "layer": "낱개(타일)", "design": "docs/tile-character-oracle-v0-design.md",
     "note": "이어 붙였을 때 가장자리 불연속이 내부 변화의 몇 배인가. "
             "오디션 타일 16장 실측 중앙값 x 5.81 / y 4.86 (1에 가까울수록 이어진다)"},
    {"measure": "seam_ratio_y", "adapter": "tile_asset",
     "layer": "낱개(타일)", "design": "docs/tile-character-oracle-v0-design.md",
     "note": "세로 이음새. 위와 같은 자"},
    {"measure": "palette_overlap_min", "adapter": "character_set",
     "layer": "세트(캐릭터)", "design": "docs/tile-character-oracle-v0-design.md",
     "note": "네 방향 색 집합의 자카드 최솟값. 실측 hero 0.83 / merchant 0.73 "
             "(하한을 정하면 판정이 된다)"},
    {"measure": "integrated_lufs", "adapter": "wav_asset",
     "layer": "낱개(음악)", "design": "docs/lufs-v0-design.md",
     "note": "BS.1770-4 게이트된 라우드니스. 목표 LUFS를 정하면 판정이 된다"},
    {"measure": "true_peak_dbtp", "adapter": "wav_asset",
     "layer": "낱개(음악)", "design": "docs/true-peak-v0-design.md",
     "note": "초안에 -1.0 dBTP라는 문장은 있으나 동결은 별건이다"},
    {"measure": "seam_spectral", "adapter": "wav_asset",
     "layer": "낱개(음악)", "design": "docs/loop-seam-v0-design.md",
     "note": "루프로 선언된 곡에만 적용. THRESH_SEAM은 지금 진폭 점프용이라 "
             "스펙트럼 쪽은 자리가 따로 필요하다"},
    {"measure": "loudness.loudness_spread", "adapter": "audio_set",
     "layer": "세트(음악)", "design": "docs/audio-set-layer-v0-design.md",
     "note": "지역 내 LUFS 최대-최소"},
    {"measure": "max_transition_seam", "adapter": "audio_set",
     "layer": "세트(음악)", "design": "docs/audio-set-layer-v0-design.md",
     "note": "인접 곡쌍 전환 불연속의 최댓값"},
    {"measure": "duplication.min_distance", "adapter": "audio_set",
     "layer": "세트(음악)", "design": "docs/audio-set-layer-v0-design.md",
     "note": "가장 닮은 두 곡의 거리. 작을수록 닮았다(하한을 정한다)"},
]


def _rules_reading(key: str, doc: dict) -> list:
    """이 문턱 이름을 읽는 프로필·필드."""
    out = []
    for profile, fields in (doc.get("profiles") or {}).items():
        for field, name in fields.items():
            if name == key:
                out.append({"profile": profile, "field": field})
    return out


def _measured_keys() -> set:
    return {k for keys in aa.PROVIDES.values() for k in keys}


def _mentioned_elsewhere(key: str) -> int:
    """규격 문서에서 이 이름이 선언 말고 또 나오나.

    프로필에 안 걸린다고 '죽은 문턱'이라 부르면 안 된다 — 도구 인자나 격리 큐
    처럼 프로필 밖에서 쓰이는 것들이 있다. 스캔의 한계를 값에 섞지 않으려고
    본문 언급 수를 따로 센다.
    """
    with open(asset_specs.RULES, encoding="utf-8") as f:
        return f.read().count(key) - 1          # 선언 한 줄은 뺀다


def unfrozen_rows(doc: dict | None = None) -> list:
    doc = doc or asset_specs.load_rules()
    measured = _measured_keys()
    rows = []
    for key in asset_specs.unfrozen_keys(doc):
        readers = _rules_reading(key, doc)
        # 그 문턱이 붙는 필드 이름이 어댑터가 내는 키와 닿아 있는가(대략 대조)
        touched = sorted({r["field"] for r in readers
                          if r["field"] in measured})
        elsewhere = _mentioned_elsewhere(key)
        rows.append({"threshold": key, "read_by": readers,
                     "measured_fields": touched,
                     "mentions_outside_profiles": max(0, elsewhere),
                     "where": ("프로필" if readers else
                               ("프로필 밖(도구 인자·큐 등)" if elsewhere > 0
                                else "아무 데서도 안 읽힘")),
                     "alive_if_frozen": bool(readers)})
    return rows


def run() -> dict:
    doc = asset_specs.load_rules()
    unfrozen = unfrozen_rows(doc)
    return {
        "registration": asset_specs.registration(doc),
        "unfrozen": unfrozen,
        "n_unfrozen": len(unfrozen),
        "instruments_without_slot": INSTRUMENTS_WITHOUT_SLOT,
        "n_instruments_without_slot": len(INSTRUMENTS_WITHOUT_SLOT),
        "note": ("값을 제안하지 않는다. 무엇을 정하면 무엇이 살아나는지만 "
                 "보여준다 - 문턱은 사장님 몫이다"),
    }


def _print(res: dict) -> None:
    print("=" * 70)
    print("동결 대기 시트 — 무엇을 정하면 무엇이 심판이 되나")
    print("=" * 70)
    print(f'  등록 상태: {res["registration"].get("status")} '
          f'/ 규격 {res["registration"].get("spec_id")}')
    print(f'\n[1] 이름은 있는데 값이 없는 문턱 {res["n_unfrozen"]}건')
    for row in res["unfrozen"]:
        readers = ", ".join(f'{r["profile"]}.{r["field"]}'
                            for r in row["read_by"]) or row["where"]
        print(f'  · {row["threshold"]:22s} ← {readers}')
    print(f'\n[2] 계측기는 있는데 문턱 자리가 없는 값 '
          f'{res["n_instruments_without_slot"]}건 — 정하는 즉시 살아난다')
    for row in res["instruments_without_slot"]:
        print(f'  · {row["measure"]:26s} [{row["layer"]}] '
              f'{row["adapter"]}')
        print(f'      {row["note"]}')
    print("-" * 70)
    print(f'  {res["note"]}')


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="동결 대기 시트")
    ap.add_argument("--record")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    res = run()
    if a.record:
        os.makedirs(os.path.dirname(a.record) or ".", exist_ok=True)
        with open(a.record, "w", encoding="utf-8", newline="\n") as f:
            # 규격 문서의 registered_at은 YAML이 datetime으로 읽는다.
            # 문자열로 눕혀서 기록한다 - 기록이 못 저장되면 시트가 반쪽이다.
            json.dump(res, f, ensure_ascii=False, indent=2, default=str)
    if a.json:
        print(json.dumps(res, ensure_ascii=False, indent=2, default=str))
    else:
        _print(res)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
