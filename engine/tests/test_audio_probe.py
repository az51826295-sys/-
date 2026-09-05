"""오디오 확장 측정 테스트 (2026-08-26 결정 D: librosa). 지출 0.

지키는 것:
1. 조성 추정은 1·2위가 가까우면 **값을 내지 않는다**(미결정 ≠ 아무 조성).
2. 라이브러리가 없으면 값을 지어내지 않고 error에 없다고 적는다.
3. LUFS는 여전히 미측정이다 — 이름은 있지만 값은 None이고 이유가 붙는다.
4. 어댑터가 실제로 등록돼 있다(선언만 하고 잴 도구가 없는 상태를 막는다).
"""
from __future__ import annotations

import math
import os
import struct
import sys
import wave

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from genesis import audio_probe as ap                    # noqa: E402
from tools import artifact_adapter as aa                 # noqa: E402


def write_tone(path, freqs, seconds=2.0, sr=22050, click_period=0.5):
    frames = []
    for i in range(int(sr * seconds)):
        t = i / sr
        v = sum(math.sin(2 * math.pi * f * t) for f in freqs) / len(freqs)
        if click_period and i % int(sr * click_period) < 40:
            v += 0.8 * math.sin(2 * math.pi * 2000 * t)
        frames.append(int(max(-1.0, min(1.0, v * 0.5)) * 32767))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(struct.pack("<%dh" % len(frames), *frames))
    return str(path)


# ------------------------------------------------------------- 조성(순수 함수)

def test_key_estimate_finds_the_profile_it_was_given():
    # C장조 프로파일을 그대로 넣으면 C major가 1위여야 한다
    r = ap.estimate_key(list(ap._KS_MAJOR))
    assert r["key"] == "C major" and r["key_gap"] >= ap.KEY_MARGIN


def test_key_estimate_rotates_with_the_pitch():
    rotated = ap._KS_MAJOR[-7:] + ap._KS_MAJOR[:-7]     # 7반음 위 = G
    assert ap.estimate_key(rotated)["key"] == "G major"


def test_flat_chroma_decides_nothing():
    r = ap.estimate_key([1.0] * 12)
    assert r["key"] is None
    assert "말하지 않는다" in r["key_undecided_reason"]
    assert r["key_runner_up"]                # 2위는 기록으로 남긴다


def test_margin_is_reported_not_hidden():
    r = ap.estimate_key(list(ap._KS_MINOR))
    assert r["key_margin"] == ap.KEY_MARGIN
    assert r["key_correlation"] > 0


# ------------------------------------------------------------- 없는 도구

def test_missing_library_is_unmeasured_not_a_verdict(monkeypatch, tmp_path):
    monkeypatch.setattr(ap, "available", lambda: (False, "의존성 없음: librosa"))
    out = ap.measure_audio(str(tmp_path / "nope.wav"))
    assert out["error"].startswith("의존성 없음")
    assert out["bpm"] is None and out["key"] is None


def test_missing_file_is_reported(monkeypatch, tmp_path):
    monkeypatch.setattr(ap, "available", lambda: (True, None))
    out = ap.measure_audio(str(tmp_path / "nope.wav"))
    assert "파일이 없다" in out["error"]


def test_lufs_is_unmeasured_only_when_we_cannot_decode(monkeypatch, tmp_path):
    """디코더가 없으면 값이 아니라 사유를 남긴다(2026-08-26 전까지는 항상 이랬다)."""
    monkeypatch.setattr(ap, "available", lambda: (False, "의존성 없음: librosa"))
    out = ap.measure_audio(str(tmp_path / "x.wav"))
    assert out["lufs"] is None and "미측정" in out["lufs_reason"]


def test_lufs_is_now_measured_by_our_own_bs1770(tmp_path):
    """08-26: 게이트된 라우드니스를 우리가 구현했다(docs/lufs-v0-design.md).

    외부 기준으로 고정한다 — EBU Tech 3341 시험 1(스테레오 1 kHz −23 dBFS).
    """
    ok, _why = ap.available()
    if not ok:
        pytest.skip("librosa/soundfile 미설치")
    path = str(tmp_path / "tone.wav")
    _write_tone(path, dbfs=-23.0, secs=3.0, sr=48000, channels=2)
    out = ap.measure_audio(path)
    assert out["error"] is None
    assert out["lufs"] == pytest.approx(-23.0, abs=0.1)
    assert out["lufs_reason"] is None


def _write_tone(path, dbfs=-23.0, secs=3.0, sr=48000, channels=2):
    import math
    import struct
    import wave
    amp = 10 ** (dbfs / 20)
    frames = bytearray()
    for t in range(int(secs * sr)):
        v = int(max(-1.0, min(1.0, amp * math.sin(2 * math.pi * 1000 * t / sr)))
                * 32767)
        frames += struct.pack("<h", v) * channels
    with wave.open(path, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(bytes(frames))


# ------------------------------------------------------------- 어댑터 결합

def test_extended_adapter_is_registered():
    assert "music_asset_ext" in aa.ADAPTERS
    for key in ("bpm", "key", "true_peak_dbtp"):
        assert key in aa.PROVIDES["music_asset_ext"]


# ------------------------------------------------------------- 실측(있을 때만)

def test_real_measurement_when_librosa_is_installed(tmp_path):
    pytest.importorskip("librosa")
    path = write_tone(tmp_path / "a.wav", [440.0, 554.37, 659.25])
    out = ap.measure_audio(path)
    assert out["error"] is None
    assert out["sample_rate"] == 22050 and out["channels"] == 1
    assert 1.9 < out["duration_s"] < 2.1
    assert out["bpm"] and out["bpm"] > 0
    assert out["bpm_candidates"][1] == out["bpm"]      # 0.5x·1x·2x 후보
    assert out["true_peak_dbtp"] is not None and out["true_peak_dbtp"] <= 0.5
