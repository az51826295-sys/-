"""자산 측정기 + 문턱 미동결 게이트.

초안: docs/asset-judge-v0-draft.md (사장님, draft — 문턱 미동결)
해부: docs/asset-judge-v0-inheritance.md

핵심 주장 둘:
  ① 측정은 판정이 아니다. 그림·음악에서 잴 수 있는 사실만 잰다.
  ② **문턱이 동결되기 전에는 판정하지 않는다** — pass도 fail도 아닌 undefined.
     숫자를 본 뒤 문턱을 정하는 경로를 코드가 막는다(초안 §6 never 2항).
"""

import math
import os
import struct
import wave

import pytest
import yaml

from genesis import asset_probe as ap
from tools import artifact_adapter as aa
from tools import judge_bench as jb

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES = os.path.join(ROOT, "data", "asset_specs", "asset_judge_v0.rules.yaml")


def rules():
    with open(RULES, encoding="utf-8") as f:
        return yaml.safe_load(f)


def make_png(path, size=(64, 64), color=(10, 20, 30, 255), margin=0):
    from PIL import Image
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    px = img.load()
    for x in range(margin, size[0] - margin):
        for y in range(margin, size[1] - margin):
            px[x, y] = color
    img.save(path)
    return str(path)


def make_wav(path, seconds=1.0, sr=44100, amp=0.5, lead_silence=0.0,
             freq=440.0):
    n = int(sr * seconds)
    lead = int(sr * lead_silence)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        frames = bytearray()
        for i in range(n):
            v = 0.0 if i < lead else amp * math.sin(2 * math.pi * freq * i / sr)
            frames += struct.pack("<h", int(v * 32767))
        wf.writeframes(bytes(frames))
    return str(path)


# ---------------------------------------------------------------- 그림 측정

def test_image_measures_canvas_alpha_and_margin(tmp_path):
    p = make_png(tmp_path / "a.png", size=(64, 64), margin=8)
    m = ap.measure_image(p)
    assert m["error"] is None and m["format"] == "PNG"
    assert (m["width"], m["height"]) == (64, 64)
    assert m["has_alpha"] is True
    assert m["edge_alpha_max"] == 0.0      # 배경 완전 투명
    assert m["opaque_margin"] == 8         # 불투명 영역이 8px 안쪽
    assert m["color_count"] == 1           # 불투명 픽셀의 색만 센다


def test_image_flags_paint_running_to_the_edge(tmp_path):
    p = make_png(tmp_path / "b.png", margin=0)
    m = ap.measure_image(p)
    assert m["edge_alpha_max"] == 1.0
    assert m["opaque_margin"] == 0


def test_palette_conformance_ratio(tmp_path):
    p = make_png(tmp_path / "c.png", color=(255, 0, 0, 255), margin=0)
    inside = ap.measure_image(p, palette=["#ff0000"])
    outside = ap.measure_image(p, palette=["#00ff00"])
    assert inside["palette_outside_ratio"] == 0.0
    assert outside["palette_outside_ratio"] == 1.0


def test_broken_image_is_reported_not_swallowed(tmp_path):
    p = tmp_path / "broken.png"
    p.write_bytes(b"\x89PNG\r\n\x1a\n not really a png")
    m = ap.measure_image(str(p))
    assert m["error"] and m["width"] is None


# ---------------------------------------------------------------- 음악 측정

def test_wav_measures_duration_peak_and_silence(tmp_path):
    p = make_wav(tmp_path / "t.wav", seconds=1.0, amp=0.5, lead_silence=0.25)
    m = ap.measure_wav(p)
    assert m["error"] is None
    assert m["sample_rate"] == 44100 and m["channels"] == 1
    assert abs(m["duration_s"] - 1.0) < 0.01
    assert -7.0 < m["sample_peak_dbfs"] < -5.0      # 0.5 진폭 ≈ -6 dBFS
    assert abs(m["lead_silence_s"] - 0.25) < 0.02
    assert abs(m["dc_offset"]) < 0.01


def test_wav_reports_the_silence_convention_it_used(tmp_path):
    p = make_wav(tmp_path / "t.wav")
    m = ap.measure_wav(p, silence_dbfs=-40.0)
    # 관례를 숨기지 않는다 - 바뀌면 측정값이 달라지므로 값과 함께 낸다
    assert m["silence_dbfs_convention"] == -40.0


def test_non_wav_is_unmeasured_not_guessed(tmp_path):
    p = tmp_path / "x.mp3"
    p.write_bytes(b"ID3\x04\x00\x00\x00\x00\x00\x00fake")
    m = ap.measure_wav(str(p))
    assert m["error"] and "디코딩 실패" in m["error"]


def test_probe_never_fakes_what_it_cannot_measure(tmp_path):
    """없는 도구를 흉내내지 않는다 - 근사치에 그 이름을 붙이지 않는다.

    2026-08-26에 이 목록이 줄었다. LUFS(BS.1770-4)와 참피크(4배 오버샘플)를
    **실제로 구현**했기 때문이다(genesis/loudness.py, genesis/true_peak.py).
    구현하지 않은 BPM·조성은 그대로 남는다 — 이름을 빌려주지 않는 규율은
    깨지지 않았고, 빌릴 필요가 없어진 칸이 둘 생겼을 뿐이다.
    """
    m = ap.measure_wav(make_wav(tmp_path / "t.wav"))
    for faked in ("bpm", "key", "loudness_lufs"):
        assert faked not in m


def test_the_two_names_it_now_earns_are_real_measurements(tmp_path):
    """빌린 이름이 아니라 잰 값인지 - 값이 있고, 없으면 사유가 붙는다."""
    m = ap.measure_wav(make_wav(tmp_path / "t.wav"))
    for earned in ("integrated_lufs", "true_peak_dbtp"):
        assert earned in m
        reason_key = ("lufs_reason" if earned == "integrated_lufs"
                      else "true_peak_reason")
        assert (m[earned] is not None) or m[reason_key]
    # 표본 피크와 참피크는 **다른 이름, 다른 값**이다
    assert "sample_peak_dbfs" in m and "true_peak_dbtp" in m


# ---------------------------------------------------------------- 어댑터 결합

def test_asset_adapters_are_registered_with_their_keys():
    for name in ("image_asset", "wav_asset"):
        assert name in aa.ADAPTERS and aa.PROVIDES[name]


def test_adapter_returns_the_measured_namespace(tmp_path):
    p = make_png(tmp_path / "a.png", margin=4)
    sample = aa.build_sample({"adapter": "image_asset", "params": {"path": p},
                              "spec": {"width": 64}})
    assert sample["measured"]["width"] == 64
    assert sample["spec"]["width"] == 64
    assert sample["claim"] == {}


# ---------------------------------------------------------------- 미동결 게이트

def atom_for(domain):
    """규칙 골격 + 심판대 검증 샘플로 원자를 조립한다(운영 문턱은 여전히 null)."""
    r = rules()
    bench = r[f"{domain}_bench"]
    return {"id": f"asset_{domain}_probe", "verdict": "real",
            "judge": {"kind": "spec_conformance",
                      "params": {"rules": r[f"{domain}_rules"]},
                      "positive": bench["positive"],
                      "negatives": bench["negatives"]}}


def unfrozen_atom():
    return atom_for("image")


def test_rule_set_has_teeth_before_anything_is_judged():
    """규칙 묶음 자체가 자기 반례를 거절하는지 먼저 본다(judge-bench-v1.1)."""
    for domain, least in (("image", 5), ("audio", 6)):
        r = jb.bench_atom(atom_for(domain))
        assert r["verdict"] == "teeth", (domain, r["reason"])
        assert r["teeth"] >= least and r["evidence"] == "measured"


def test_unfrozen_threshold_yields_undefined_not_pass(tmp_path):
    p = make_png(tmp_path / "a.png", margin=8)
    spec = {"width": 64, "height": 64, "edge_alpha_max": None,
            "palette_outside_max": None, "color_count_max": None}
    res = aa.judge_artifacts(unfrozen_atom(), {
        "adapter": "image_asset", "params": {"path": p}, "spec": spec})
    # 통과도 탈락도 아니다 - 등록 전에는 판정 자체가 없다
    assert res["verdict"] == "undefined"
    assert "문턱 미동결" in res["reason"]


def test_frozen_thresholds_make_it_judge(tmp_path):
    p = make_png(tmp_path / "a.png", margin=8)
    frozen = {"width": 64, "height": 64, "edge_alpha_max": 0.05,
              "palette_outside_max": 0.005, "color_count_max": 8}
    params = {"path": p, "palette": ["#0a141e"]}
    ok = aa.judge_artifacts(unfrozen_atom(), {
        "adapter": "image_asset", "params": params, "spec": frozen})
    assert ok["verdict"] == "passed", ok["reason"]
    # 같은 문턱에서 가장자리까지 칠한 자산은 떨어진다
    bad = make_png(tmp_path / "b.png", margin=0)
    res = aa.judge_artifacts(unfrozen_atom(), {
        "adapter": "image_asset",
        "params": {"path": bad, "palette": ["#0a141e"]}, "spec": frozen})
    assert res["verdict"] == "failed"


def test_missing_measurement_is_undefined_not_fail(tmp_path):
    """팔레트를 안 줘서 못 잰 항목으로 탈락시키지 않는다 - 미측정은 undefined."""
    p = make_png(tmp_path / "a.png", margin=8)
    frozen = {"width": 64, "height": 64, "edge_alpha_max": 0.05,
              "palette_outside_max": 0.005, "color_count_max": 8}
    res = aa.judge_artifacts(unfrozen_atom(), {
        "adapter": "image_asset", "params": {"path": p}, "spec": frozen})
    assert res["verdict"] == "undefined" and "측정 없음" in res["reason"]


def test_partial_freeze_is_still_undefined(tmp_path):
    """일부만 동결한 상태로 판정하면 안 된다 - 한 규칙이라도 null이면 undefined."""
    p = make_png(tmp_path / "a.png", margin=8)
    half = {"width": 64, "height": 64, "edge_alpha_max": 0.05,
            "palette_outside_max": None, "color_count_max": 8}
    res = aa.judge_artifacts(unfrozen_atom(), {
        "adapter": "image_asset", "params": {"path": p}, "spec": half})
    assert res["verdict"] == "undefined"


# 2026-08-26 00:31 사장님 승인으로 동결된 값. 여기 숫자가 바뀌면 재등록 사안이다.
FROZEN = {"THRESH_PAL": 0.005, "EDGE_ALPHA_MAX": 0.05, "THRESH_DUR": 0.5,
          "THRESH_SIL": 0.1, "PEAK_DBFS_MAX": -1.5, "THRESH_SEAM": 0.02}
STILL_NULL = {"DROPOUT_MAX_S", "DC_OFFSET_MAX", "THRESH_HUE_VAR",
              "THRESH_VAL_OUT", "THRESH_SAT_OUT", "THRESH_LINE_CV",
              "VALUE_TOLERANCE", "SATURATION_TOLERANCE", "THRESH_OUT_PCT"}


def test_frozen_thresholds_match_the_registration():
    """동결값이 소리 없이 바뀌면 여기서 걸린다(재등록 없는 변경 금지)."""
    from genesis import asset_specs as sp
    reg = sp.registration()
    assert reg["status"] == "registered_partial"
    assert reg["registered_at"] is not None and reg["frozen_by"]
    assert reg["inherits_from"] == "judge-bench-v1.2"
    values = sp.frozen_values()
    for k, v in FROZEN.items():
        assert values[k] == v, (k, values[k], v)


def test_unfrozen_thresholds_stay_null():
    """근거 없이 채워 넣지 않았는지 감시 - 잴 도구가 없는 항목은 null이어야 한다."""
    from genesis import asset_specs as sp
    assert set(sp.unfrozen_keys()) == STILL_NULL


def test_frozen_spec_is_the_only_number_source():
    """호출자가 숫자를 손으로 다시 적지 않고 등록본에서 받는다."""
    from genesis import asset_specs as sp
    assert sp.frozen_spec("image")["palette_outside_max"] == 0.005
    audio = sp.frozen_spec("audio")
    assert audio["peak_dbfs_max"] == -1.5
    assert audio["dropout_max_s"] is None      # 미동결은 None으로 그대로 넘어간다
    assert all(v is None for v in sp.frozen_spec("set_image").values())


def test_unmeasured_fields_are_absent_from_the_rules():
    """잴 도구가 없는 항목은 규칙에 없어야 한다(없는 측정으로 판정 금지)."""
    r = rules()
    named = {rule["measured"] for rule in r["image_rules"] + r["audio_rules"]}
    for gone in ("measured.bpm", "measured.lufs", "measured.style_score",
                 "measured.subject_tags"):
        assert gone not in named
    assert "bpm" in r["unmeasured"]["audio"]
    assert "style_conformance" in r["unmeasured"]["image"]


def test_audio_rules_run_once_frozen(tmp_path):
    p = make_wav(tmp_path / "t.wav", seconds=0.5, amp=0.5)
    atom = atom_for("audio")
    spec = {"sample_rate": 44100, "duration_max_s": 1.0,
            "peak_dbfs_max": -1.5, "silence_max_s": 0.1, "dropout_max_s": 0.1}
    assert aa.judge_artifacts(atom, {"adapter": "wav_asset",
                                     "params": {"path": p},
                                     "spec": spec})["verdict"] == "passed"
    clipped = make_wav(tmp_path / "loud.wav", seconds=0.5, amp=0.999)
    res = aa.judge_artifacts(atom, {"adapter": "wav_asset",
                                    "params": {"path": clipped}, "spec": spec})
    assert res["verdict"] == "failed"      # 표본 피크 초과
