"""동결된 문턱을 판정에 넘기는 유일한 경로.

숫자를 손으로 다시 적으면 등록본과 갈라진다 — 그래서 호출자는 반드시 여기를
거친다. 미동결(null) 칸은 그대로 None으로 넘어가고, 심판은 undefined를 낸다
(tools/judge_bench.py의 문턱 미동결 게이트).

  spec = frozen_spec("image")     # {'palette_outside_max': 0.005, ...}
"""
from __future__ import annotations

import os

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES = os.path.join(ROOT, "data", "asset_specs", "asset_judge_v0.rules.yaml")


def load_rules(path: str = RULES) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def frozen_values(doc: dict | None = None) -> dict:
    """동결·미동결 문턱 전부. 미동결은 None으로 남는다(숨기지 않는다)."""
    doc = doc or load_rules()
    out = dict(doc.get("thresholds") or {})
    out.update(doc.get("set_thresholds") or {})
    return out


def frozen_spec(profile: str, doc: dict | None = None) -> dict:
    """프로필 이름 → 심판이 읽는 spec dict. 값은 등록본에서만 온다."""
    doc = doc or load_rules()
    profiles = doc.get("profiles") or {}
    if profile not in profiles:
        raise KeyError(f"그런 프로필 없음: {profile} (있는 것: {sorted(profiles)})")
    values = frozen_values(doc)
    return {field: values.get(key) for field, key in profiles[profile].items()}


def unfrozen_keys(doc: dict | None = None) -> list:
    """아직 동결되지 않은 문턱 이름. 판정이 undefined로 나오는 이유를 설명할 때 쓴다."""
    return sorted(k for k, v in frozen_values(doc).items() if v is None)


def registration(doc: dict | None = None) -> dict:
    doc = doc or load_rules()
    return {k: doc.get(k) for k in
            ("spec_id", "status", "registered_at", "frozen_by",
             "inherits_from")}
