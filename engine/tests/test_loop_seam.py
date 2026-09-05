"""루프 이음새 시험 — 설계: docs/loop-seam-v0-design.md.

외부 표준이 없는 칸이라 **합성 시료로 이빨을 증명한다**: 완벽한 루프와
뒤쪽 절반을 다른 주파수로 바꾼 루프를 계측기가 실제로 가르는가.
사전 등록한 이빨 기준(잘라 붙인 것이 최소 2배)을 그대로 박아 둔다.
"""
import cmath
import math
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from genesis import loop_seam as ls                      # noqa: E402

FS = 48000
TEETH_RATIO = 2.0          # 설계 §3 등록값. 결과를 보고 낮추지 않는다.


def sine(freq, secs, amp=0.5, fs=FS):
    return [amp * math.sin(2 * math.pi * freq * t / fs)
            for t in range(int(secs * fs))]


@pytest.fixture(scope="module")
def samples():
    perfect = sine(500, 2.0)                 # 주기가 길이를 정확히 나눈다
    spliced = sine(500, 1.0) + sine(3000, 1.0)
    broken = perfect[:-1] + [1.0]
    return {"perfect": perfect, "spliced": spliced, "broken": broken}


def test_fft_matches_the_direct_transform():
    """빠르게 만들면서 값이 달라지지 않았는지 - 속도 최적화의 기본 검사."""
    frame = [math.sin(2 * math.pi * 7 * i / 64) +
             0.3 * math.cos(2 * math.pi * 13 * i / 64) for i in range(64)]
    fast = ls._dft_magnitudes(frame)
    slow = [abs(sum(v * cmath.exp(-2j * math.pi * k * i / 64)
                    for i, v in enumerate(frame))) for k in range(33)]
    assert fast == pytest.approx(slow, abs=1e-9)


def test_perfect_loop_looks_like_the_rest_of_the_song(samples):
    r = ls.measure(samples["perfect"], FS)
    assert r["reason"] is None
    assert r["seam_spectral"] < TEETH_RATIO      # 이음새가 튀지 않는다
    assert r["references_used"] >= 2


def test_spliced_loop_has_teeth(samples):
    """설계 §3의 이빨 기준: 잘라 붙인 루프가 완벽한 루프의 최소 2배."""
    perfect = ls.measure(samples["perfect"], FS)["seam_spectral"]
    spliced = ls.measure(samples["spliced"], FS)["seam_spectral"]
    assert spliced >= perfect * TEETH_RATIO, (spliced, perfect)


def test_broken_sample_shows_up_as_a_step(samples):
    r = ls.measure(samples["broken"], FS)
    assert r["seam_step"] > 0.9                  # 파형이 끊겼다
    assert r["seam_spectral"] > ls.measure(
        samples["perfect"], FS)["seam_spectral"]


def test_ratio_is_normalised_by_the_song_itself(samples):
    """진폭을 키워도 비율은 그대로 - 곡마다 다른 절대값에 휘둘리지 않는다."""
    quiet = ls.measure(samples["spliced"], FS)
    loud = ls.measure([v * 4 for v in samples["spliced"]], FS)
    assert loud["seam_spectral"] == pytest.approx(quiet["seam_spectral"],
                                                  rel=0.02)
    # 절대 거리도 같이 낸다 - 판단 재료를 감추지 않는다
    assert quiet["seam_distance"] is not None
    assert quiet["reference_distance"] is not None


def test_short_input_gets_a_reason_not_a_number():
    r = ls.measure([0.1] * 100, FS)
    assert r["seam_spectral"] is None
    assert "창 두 개를 못 만든다" in r["reason"]


def test_uniform_interior_cannot_produce_a_ratio():
    """곡 내부 변화가 0이면 나눌 수 없다 - 0이나 큰 수를 지어내지 않는다."""
    r = ls.measure([0.5] * (FS * 2), FS)
    assert r["seam_spectral"] is None
    assert "변화량이 0" in r["reason"]
    assert r["seam_distance"] is not None       # 절대 거리는 남긴다


def test_window_and_reference_count_are_frozen():
    assert ls.WINDOW == 1024
    assert ls.REFERENCE_WINDOWS == 16


# --- WAV 계측기에 물린 자리 -------------------------------------------------

def _write_wav(path, signal, sr=FS):
    import struct
    import wave
    frames = bytearray()
    for v in signal:
        frames += struct.pack("<h", int(max(-1.0, min(1.0, v)) * 32767))
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(bytes(frames))
    return path


def test_wav_probe_reports_the_seam(tmp_path, samples):
    from genesis import asset_probe
    good = asset_probe.measure_wav(
        _write_wav(str(tmp_path / "loop.wav"), samples["perfect"]))
    bad = asset_probe.measure_wav(
        _write_wav(str(tmp_path / "spliced.wav"), samples["spliced"]))
    assert good["seam_reason"] is None
    assert bad["seam_spectral"] >= good["seam_spectral"] * TEETH_RATIO


def test_adapter_exposes_the_seam():
    from tools import artifact_adapter as aa
    assert "seam_spectral" in aa.PROVIDES["wav_asset"]
    assert "seam_reason" in aa.PROVIDES["wav_asset"]
