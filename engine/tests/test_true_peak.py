"""참피크 시험 — 설계: docs/true-peak-v0-design.md.

검증 기준이 둘이다: 해석적 정답과, 이미 있는 librosa 경로. 그리고 빠른 경로
(numpy)와 순수 파이썬 경로가 **같은 값**을 내야 한다 — 기계마다 다른 심판이
되면 안 되므로.
"""
import math
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from genesis import true_peak as tp                      # noqa: E402

FS = 48000


def sine(freq, amp, secs, phase=0.0, fs=FS):
    return [amp * math.sin(2 * math.pi * freq * t / fs + phase)
            for t in range(int(secs * fs))]


def test_frozen_filter_settings():
    assert tp.OVERSAMPLE == 4
    assert tp.TAPS_PER_PHASE == 32
    assert tp.KAISER_BETA == 8.0


def test_analytic_amplitude():
    r = tp.measure(sine(1000, 0.5, 0.2))
    assert r["true_peak_dbtp"] == pytest.approx(-6.02, abs=0.05)


def test_teeth_peak_hidden_between_samples():
    """이빨: 표본 피크와 같은 값이 나오면 이 구현은 쓸모가 없다."""
    hidden = sine(FS / 4, 1.0, 0.2, phase=math.pi / 4)
    r = tp.measure(hidden)
    gain = r["true_peak_dbtp"] - r["sample_peak_dbfs"]
    assert gain > 0.1, r
    assert gain == pytest.approx(3.11, abs=0.2)   # 표본 사이에 숨은 봉우리


def test_full_scale_can_exceed_zero_dbtp():
    """0 dBFS를 안 넘어도 D/A 뒤에서는 넘을 수 있다 - 그게 dBTP의 존재 이유."""
    r = tp.measure(sine(997, 1.0, 0.2))
    assert r["sample_peak_dbfs"] <= 0.0
    assert r["true_peak_dbtp"] >= 0.0


def test_fast_and_pure_paths_agree():
    """numpy는 선택이다. 없다고 판정이 달라지면 기계마다 다른 심판이 된다."""
    for sig in (sine(1000, 0.5, 0.05),
                sine(FS / 4, 1.0, 0.05, phase=math.pi / 4)):
        assert tp.upsample_peak(sig) == pytest.approx(
            tp.upsample_peak_pure(sig), abs=1e-9)


def test_silence_and_empty_get_reasons_not_numbers():
    r = tp.measure([0.0] * 1000)
    assert r["true_peak_dbtp"] is None and "무음" in r["reason"]
    r2 = tp.measure([])
    assert r2["true_peak_dbtp"] is None and r2["reason"] == "표본이 없다"


def test_measurement_conventions_are_reported():
    """탭·베타는 값이 달라질 수 있는 설계값이라 리포트에 같이 낸다."""
    r = tp.measure(sine(1000, 0.5, 0.05))
    assert r["oversample"] == 4
    assert r["taps_per_phase"] == 32
    assert r["kaiser_beta"] == 8.0


def test_agrees_with_the_librosa_resampler():
    """독립 대조: 남의 리샘플러로 오버샘플한 값과 ±0.3 dB 이내여야 한다.

    `audio_probe`를 부르지 않는다 — 그쪽도 이제 우리 구현을 쓰므로 자기 자신과
    비교하는 꼴이 된다. 여기서는 librosa를 **직접** 불러 진짜 대조를 만든다.
    """
    librosa = pytest.importorskip("librosa")
    import numpy as np
    sig = sine(FS / 4, 0.9, 0.5, phase=math.pi / 4)
    up = librosa.resample(np.asarray(sig, dtype=np.float64),
                          orig_sr=FS, target_sr=FS * 4)
    theirs = 20 * math.log10(float(np.max(np.abs(up))))
    ours = tp.measure(sig)["true_peak_dbtp"]
    assert ours == pytest.approx(theirs, abs=0.3)


def test_extended_probe_uses_the_single_implementation(tmp_path):
    """한 필드에 구현이 둘이면 경로에 따라 값이 갈린다 - 하나로 통일했는지 확인."""
    from genesis import audio_probe
    ok, _why = audio_probe.available()
    if not ok:
        pytest.skip("librosa/soundfile 미설치")
    import struct
    import wave
    sig = sine(FS / 4, 0.9, 0.3, phase=math.pi / 4)
    path = str(tmp_path / "peak.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(FS)
        w.writeframes(b"".join(struct.pack("<h", int(v * 32767)) for v in sig))
    from genesis import asset_probe
    ext = audio_probe.measure_audio(path)["true_peak_dbtp"]
    std = asset_probe.measure_wav(path)["true_peak_dbtp"]
    assert ext == pytest.approx(std, abs=0.01)   # 두 층이 같은 값을 낸다


def test_wav_probe_reports_true_peak_without_librosa(tmp_path):
    """표준 라이브러리 층에서도 참피크가 나온다 - 이 작업의 목적."""
    from genesis import asset_probe
    import struct
    import wave
    sig = sine(FS / 4, 0.9, 0.3, phase=math.pi / 4)
    path = str(tmp_path / "t.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(FS)
        w.writeframes(b"".join(struct.pack("<h", int(v * 32767)) for v in sig))
    m = asset_probe.measure_wav(path)
    assert m["true_peak_dbtp"] is not None
    assert m["true_peak_dbtp"] > m["sample_peak_dbfs"]   # 이름이 다른 이유
    from tools import artifact_adapter as aa
    assert "true_peak_dbtp" in aa.PROVIDES["wav_asset"]
