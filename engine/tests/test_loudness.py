"""게이트된 라우드니스 시험 — 설계: docs/lufs-v0-design.md.

정답을 남의 구현에서 받아오지 않는다. 두 개의 **외부 기준**으로 고정한다:
① BS.1770-4에 실린 48 kHz 필터 계수표, ② EBU Tech 3341 시험 1.
사전 등록한 기대값이 틀렸던 자리(§3-A)도 여기서 정정된 값으로 박아 둔다.
"""
import math
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from genesis import loudness as L                        # noqa: E402

FS = 48000

# BS.1770-4 표 1·2 (48 kHz). 우리는 아날로그 원형에서 계산하므로, 이 값과
# 일치한다는 것은 계산이 표준과 같다는 뜻이다.
SHELF_B = (1.53512485958697, -2.69169618940638, 1.19839281085285)
SHELF_A = (1.0, -1.69065929318241, 0.73248077421585)
HPF_A = (1.0, -1.99004745483398, 0.99007225036621)


def sine(freq: float, dbfs: float, secs: float, fs: int = FS) -> list:
    amp = 10 ** (dbfs / 20)
    return [amp * math.sin(2 * math.pi * freq * t / fs)
            for t in range(int(secs * fs))]


def test_48k_coefficients_match_the_standard_table():
    b, a = L.shelf_coefficients(FS)
    assert b == pytest.approx(SHELF_B, abs=1e-6)
    assert a == pytest.approx(SHELF_A, abs=1e-6)
    b2, a2 = L.highpass_coefficients(FS)
    assert b2 == (1.0, -2.0, 1.0)
    assert a2 == pytest.approx(HPF_A, abs=1e-6)


def test_coefficients_are_recomputed_per_sample_rate():
    """48 kHz 표를 박아 넣으면 다른 표본율에서 조용히 틀린다."""
    assert L.shelf_coefficients(44100) != L.shelf_coefficients(48000)
    assert L.highpass_coefficients(44100) != L.highpass_coefficients(48000)


def test_ebu_tech_3341_case_1():
    """외부 기준: 스테레오 1 kHz −23 dBFS → −23.0 LUFS (±0.1)."""
    s = sine(1000, -23.0, 3.0)
    assert L.integrated([s, s], FS)["lufs"] == pytest.approx(-23.0, abs=0.1)


def test_stereo_sine_reads_its_dbfs():
    """1 kHz에서 K-가중 이득(+0.6977 dB)이 상수항(−0.691)을 상쇄한다(§3-A)."""
    for dbfs in (0.0, -6.0, -20.0):
        s = sine(1000, dbfs, 2.0)
        assert L.integrated([s, s], FS)["lufs"] == pytest.approx(dbfs,
                                                                 abs=0.05)


def test_mono_is_three_db_below_stereo():
    s = sine(1000, -12.0, 2.0)
    mono = L.integrated([s], FS)["lufs"]
    stereo = L.integrated([s, s], FS)["lufs"]
    assert stereo - mono == pytest.approx(3.01, abs=0.05)


def test_scaling_shifts_by_exactly_that_many_lu():
    a = L.integrated([sine(1000, -6.0, 2.0)], FS)["lufs"]
    b = L.integrated([sine(1000, -26.0, 2.0)], FS)["lufs"]
    assert a - b == pytest.approx(20.0, abs=0.01)


def test_k_weighting_is_not_flat():
    """RMS가 아니다 - 저역은 깎이고 고역은 올라간다."""
    low = L.integrated([sine(100, -20.0, 2.0)], FS)["lufs"]
    mid = L.integrated([sine(1000, -20.0, 2.0)], FS)["lufs"]
    high = L.integrated([sine(10000, -20.0, 2.0)], FS)["lufs"]
    assert low < mid < high
    assert high - mid == pytest.approx(3.34, abs=0.2)   # 4.04 − 0.70 dB


def test_gating_keeps_silence_from_dragging_the_value_down():
    """이빨: 게이팅이 없으면 뒤에 붙은 무음이 값을 크게 끌어내린다."""
    loud = sine(1000, -23.0, 3.0)
    silence = [0.0] * int(6 * FS)
    with_silence = L.integrated([loud + silence, loud + silence], FS)
    assert with_silence["lufs"] == pytest.approx(-23.0, abs=0.3)
    # 게이트가 없었다면 에너지가 1/3로 희석돼 약 −27.8이 나온다
    ungated = -23.0 + 10 * math.log10(3 / 9)
    assert with_silence["lufs"] > ungated + 3
    assert with_silence["gated_blocks"] < with_silence["blocks"]


def test_silence_is_undefined_not_zero():
    r = L.integrated([[0.0] * FS], FS)
    assert r["lufs"] is None
    assert "절대 게이트" in r["reason"]


def test_too_short_input_is_undefined():
    r = L.integrated([[0.1] * 100], FS)          # 400 ms 블록도 못 만든다
    assert r["lufs"] is None
    assert "400 ms" in r["reason"]
    assert r["blocks"] == 0


def test_empty_and_bad_rate_are_reported():
    assert L.integrated([], FS)["reason"] == "표본이 없다"
    assert L.integrated([[0.1]], 0)["lufs"] is None


def test_blocks_are_400ms_with_75_percent_overlap():
    r = L.integrated([sine(1000, -20.0, 1.0)], FS)
    # 1초 → 400 ms 블록을 100 ms 간격으로: 0, 0.1, ... 0.6 = 7개
    assert r["blocks"] == 7


# --- WAV 계측기에 물린 자리 -------------------------------------------------

def _write_wav(path, dbfs=-23.0, secs=3.0, sr=48000, channels=2):
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
    return path


def test_wav_probe_reports_integrated_lufs(tmp_path):
    from genesis import asset_probe
    p = _write_wav(str(tmp_path / "tone.wav"))
    m = asset_probe.measure_wav(p)
    assert m["error"] is None
    assert m["integrated_lufs"] == pytest.approx(-23.0, abs=0.1)
    assert m["lufs_reason"] is None
    # RMS와 다른 값이다 - 같은 값이면 LUFS라고 부를 이유가 없다
    assert abs(m["integrated_lufs"] - m["rms_dbfs"]) > 1.0


def test_wav_probe_does_not_fold_channels_before_measuring(tmp_path):
    """모노로 접고 재면 스테레오가 3 dB 낮게 나온다 - 표준과 어긋난다."""
    from genesis import asset_probe
    stereo = asset_probe.measure_wav(
        _write_wav(str(tmp_path / "s.wav"), channels=2))["integrated_lufs"]
    mono = asset_probe.measure_wav(
        _write_wav(str(tmp_path / "m.wav"), channels=1))["integrated_lufs"]
    assert stereo - mono == pytest.approx(3.01, abs=0.05)


def test_silent_wav_gets_a_reason_not_a_number(tmp_path):
    from genesis import asset_probe
    p = _write_wav(str(tmp_path / "quiet.wav"), dbfs=-90.0)
    m = asset_probe.measure_wav(p)
    assert m["integrated_lufs"] is None
    assert "게이트" in m["lufs_reason"]


def test_adapter_exposes_lufs(tmp_path):
    from tools import artifact_adapter as aa
    assert "integrated_lufs" in aa.PROVIDES["wav_asset"]
    p = _write_wav(str(tmp_path / "tone.wav"))
    out = aa.ADAPTERS["wav_asset"]({"path": p})
    assert out["integrated_lufs"] == pytest.approx(-23.0, abs=0.1)
