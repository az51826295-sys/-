"""자기신고 3건을 측정으로 바꾼 결과 — 2026-08-25 23:30~23:35

바꾼 것:
  spec_fit_art_selection  후보가 붙인 태그 → 캔버스·팔레트·채도/명도 실측
  music_selection         후보가 붙인 태그 → 길이·피크·무음·결손 + 추정 BPM
  game_feature_coding     후보가 낸 성적표 → **우리가 pytest를 직접 실행**

못 재는 부분은 버리지 않고 분리했다: art_mood_fit / music_mood_fit(human_gate).
"""

import math
import struct
import wave

import pytest

from genesis import asset_probe as ap
from tools import artifact_adapter as aa
from tools import judge_bench as jb

PALETTE = [(18, 20, 26), (34, 38, 48), (58, 52, 44), (96, 86, 70)]
PALETTE_HEX = ["#12141a", "#222630", "#3a342c", "#605646"]


def atom(aid):
    return next(a for a in jb.load_registry() if a["id"] == aid)


def bg(path, size=(320, 180), neon=False):
    from PIL import Image
    img = Image.new("RGBA", size)
    for y in range(size[1]):
        for x in range(size[0]):
            rgb = (255, 0, 200) if neon else PALETTE[(x // 8 + y // 8) % 4]
            img.putpixel((x, y), rgb + (255,))
    img.save(path)
    return str(path)


def tone(path, seconds=3.0, sr=44100, amp=0.5, freq=110.0, lead=0.0):
    n, lead_n = int(sr * seconds), int(sr * lead)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        buf = bytearray()
        for i in range(n):
            v = 0.0 if i < lead_n else amp * math.sin(2 * math.pi * freq * i / sr)
            buf += struct.pack("<h", int(v * 32767))
        w.writeframes(bytes(buf))
    return str(path)


def click(path, bpm, seconds=8.0, sr=44100):
    n, period = int(sr * seconds), int(sr * 60 / bpm)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        buf = bytearray()
        for i in range(n):
            ph = i % period
            v = (0.8 * math.exp(-ph / 60) * math.sin(2 * math.pi * 1200 * i / sr)
                 if ph < 400 else 0.0)
            buf += struct.pack("<h", int(v * 32767))
        w.writeframes(bytes(buf))
    return str(path)


ART_SPEC = {"width": 320, "height": 180, "palette_outside_max": 0.005,
            "saturation_max": 0.45, "value_min": 0.05}
MUSIC_SPEC = {"sample_rate": 44100, "duration_max_s": 180.0,
              "peak_dbfs_max": -1.5, "silence_max_s": 0.1,
              "dropout_max_s": 0.2}
GAME_SPEC = {"returncode_ok": 0, "max_failures": 0, "min_tests": 3}


# ---------------------------------------------------------------- 등급 전환

def test_no_atom_reads_self_report_any_more():
    """레지스트리 전체 감사: claim.*만 읽는 real 원자가 하나도 없어야 한다."""
    res = jb.bench_registry()
    assert res["summary"]["evidence_claim_only"] == 0, res["claim_only"]
    assert res["summary"]["autonomy_ratio"] == 1.0
    assert res["summary"]["passes_strict"] is True


@pytest.mark.parametrize("aid,adapter", [
    ("spec_fit_art_selection", "image_style_asset"),
    ("music_selection", "music_asset"),
    ("game_feature_coding", "pytest_run"),
])
def test_rewritten_atoms_are_measured_and_bound(aid, adapter):
    a = atom(aid)
    r = jb.bench_atom(a)
    assert r["verdict"] == "teeth" and r["evidence"] == "measured"
    assert a["adapter"] == adapter
    assert aa.binding_status(a)["status"] == "bound"


def test_unmeasurable_halves_are_split_out_not_dropped():
    """분위기는 버린 게 아니라 사람 눈 게이트 원자로 분리됐다."""
    for aid in ("art_mood_fit", "music_mood_fit"):
        a = atom(aid)
        assert a["verdict"] == "no_judge"
        assert jb.bench_atom(a)["verdict"] == "human_gate"
        assert jb.atom_status(a)["autonomous"] is False


# ---------------------------------------------------------------- 그림

def test_art_spec_pass_and_fail(tmp_path):
    src = {"adapter": "image_style_asset", "spec": ART_SPEC}
    ok = aa.judge_artifacts(atom("spec_fit_art_selection"), {
        **src, "params": {"path": bg(tmp_path / "ok.png"),
                          "palette": PALETTE_HEX}})
    assert ok["verdict"] == "passed", ok["reason"]
    neon = aa.judge_artifacts(atom("spec_fit_art_selection"), {
        **src, "params": {"path": bg(tmp_path / "neon.png", neon=True),
                          "palette": PALETTE_HEX}})
    assert neon["verdict"] == "failed"      # 채도 1.0, 팔레트 밖 100%


def test_art_catches_a_one_value_palette_typo(tmp_path):
    """팔레트를 한 값만 틀리게 줘도 이탈률로 잡힌다(실제로 오늘 이걸로 걸렸다)."""
    wrong = ["#12141a", "#22262f", "#3a342c", "#605646"]   # 0x2f vs 0x30
    res = aa.judge_artifacts(atom("spec_fit_art_selection"), {
        "adapter": "image_style_asset", "spec": ART_SPEC,
        "params": {"path": bg(tmp_path / "ok.png"), "palette": wrong}})
    assert res["verdict"] == "failed"


# ---------------------------------------------------------------- 음악

def test_music_technical_spec_pass_and_clipping_fail(tmp_path):
    src = {"adapter": "music_asset", "spec": MUSIC_SPEC}
    ok = aa.judge_artifacts(atom("music_selection"), {
        **src, "params": {"path": tone(tmp_path / "ok.wav")}})
    assert ok["verdict"] == "passed", ok["reason"]
    loud = aa.judge_artifacts(atom("music_selection"), {
        **src, "params": {"path": tone(tmp_path / "loud.wav", amp=0.999)}})
    assert loud["verdict"] == "failed"
    lead = aa.judge_artifacts(atom("music_selection"), {
        **src, "params": {"path": tone(tmp_path / "lead.wav", lead=1.5)}})
    assert lead["verdict"] == "failed"       # 앞 무음 1.5초


def test_tempo_estimator_golden(tmp_path):
    """합성 클릭트랙 골든. 배수 오검출은 숨기지 않고 후보로 드러낸다."""
    for bpm in (90, 120):
        r = ap.measure_tempo(click(tmp_path / f"{bpm}.wav", bpm))
        assert abs(r["bpm"] - bpm) <= 2, (bpm, r["bpm"])
    # 150은 절반으로 잠긴다 - 알려진 한계이므로 후보 목록에 참값이 들어 있어야 한다
    r = ap.measure_tempo(click(tmp_path / "150.wav", 150))
    assert any(abs(c - 150) <= 3 for c in r["bpm_candidates"]), r


def test_octave_error_is_undefined_not_fail():
    """초안 §6 boundary_rules: 0.5x/2x는 fail이 아니라 미정의."""
    spec = {"kind": "tempo_match",
            "params": {"measured": "measured.bpm", "target": "spec.bpm",
                       "tolerance": "spec.tol"}}
    sample = {"spec": {"bpm": 120, "tol": 4}, "measured": {"bpm": 60.1}}
    with pytest.raises(jb.Unjudgeable, match="배수 오검출"):
        jb.run_judge(spec, sample)
    assert jb.run_judge(spec, {"spec": {"bpm": 120, "tol": 4},
                               "measured": {"bpm": 120.2}}) is True
    assert jb.run_judge(spec, {"spec": {"bpm": 120, "tol": 4},
                               "measured": {"bpm": 91.0}}) is False


# ---------------------------------------------------------------- 게임 기능

def test_game_feature_runs_the_tests_itself():
    """후보의 성적표가 아니라 우리가 돌린 결과로 판정한다."""
    res = aa.judge_artifacts(atom("game_feature_coding"), {
        "adapter": "pytest_run",
        "params": {"path": "tests/test_blueprint_engine.py"},
        "spec": GAME_SPEC})
    assert res["verdict"] == "passed", res["reason"]
    assert res["sample"]["measured"]["tests_passed"] >= 3
    assert res["sample"]["measured"]["returncode"] == 0


def test_game_feature_fails_on_a_broken_test_file(tmp_path):
    p = tmp_path / "test_broken.py"
    p.write_text("def test_a():\n    assert 1 == 2\n"
                 "def test_b():\n    assert True\n"
                 "def test_c():\n    assert True\n"
                 "def test_d():\n    assert True\n", encoding="utf-8")
    res = aa.judge_artifacts(atom("game_feature_coding"), {
        "adapter": "pytest_run", "params": {"path": str(p)},
        "spec": GAME_SPEC})
    assert res["verdict"] == "failed"


def test_thin_test_suite_does_not_count_as_a_feature(tmp_path):
    """테스트 1건짜리 '형식 통과'는 명세 검증이 아니다."""
    p = tmp_path / "test_thin.py"
    p.write_text("def test_only():\n    assert True\n", encoding="utf-8")
    res = aa.judge_artifacts(atom("game_feature_coding"), {
        "adapter": "pytest_run", "params": {"path": str(p)},
        "spec": GAME_SPEC})
    assert res["verdict"] == "failed"
