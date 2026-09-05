"""오디오 세트 층 시험 — 설계: docs/audio-set-layer-v0-design.md.

세 지표마다 **가르는 쌍**을 만들어 이빨을 증명한다. 그리고 비워둔 둘이
조용히 채워지지 않았는지도 확인한다 — 없는 것을 지어내지 않는 것이 이 층의
절반이다.
"""
import math
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from genesis import audio_set as aset                    # noqa: E402

FS = 48000
TEETH_RATIO = 2.0          # 설계 §4 등록값


def sine(freq, secs=1.0, amp=0.5, fs=FS):
    return [amp * math.sin(2 * math.pi * freq * t / fs)
            for t in range(int(secs * fs))]


# --- loudness_spread --------------------------------------------------------

def test_aligned_set_has_no_spread():
    assert aset.loudness_spread([-23.0] * 5)["loudness_spread"] == 0.0


def test_one_quiet_track_shows_up_as_the_spread():
    r = aset.loudness_spread([-23.0] * 4 + [-33.0])
    assert r["loudness_spread"] == pytest.approx(10.0, abs=0.01)
    assert r["min"] == -33.0 and r["max"] == -23.0


def test_missing_lufs_is_excluded_and_counted():
    """None을 0으로 섞으면 무음 한 곡이 세트를 흔든다 - 그건 사고다."""
    r = aset.loudness_spread([-23.0] * 5 + [None])
    assert r["loudness_spread"] == 0.0
    assert r["n_missing"] == 1 and r["n_used"] == 5


def test_small_set_gets_no_number():
    r = aset.loudness_spread([-23.0] * 4)
    assert r["loudness_spread"] is None
    assert "적격성 E6" in r["reason"]
    assert aset.MIN_SET_N == 5


# --- transition_seam --------------------------------------------------------

def test_transition_teeth():
    """이빨: 다른 주파수로 넘어가는 전환이 같은 주파수보다 최소 2배."""
    smooth = aset.transition_seam(sine(500), sine(500))["transition_seam"]
    jumpy = aset.transition_seam(sine(500), sine(3000))["transition_seam"]
    assert jumpy >= smooth * TEETH_RATIO, (jumpy, smooth)


def test_transition_needs_long_enough_tracks():
    r = aset.transition_seam([0.1] * 100, sine(500))
    assert r["transition_seam"] is None
    assert "짧은 곡" in r["reason"]


# --- duplication ------------------------------------------------------------

def test_same_track_twice_is_the_closest_pair():
    tracks = [sine(500), sine(500), sine(1200), sine(2500), sine(4000)]
    r = aset.duplication(tracks, ["a", "a2", "b", "c", "d"])
    assert r["closest_pair"] == ["a", "a2"]
    assert r["min_distance"] == pytest.approx(0.0, abs=1e-6)
    assert r["distances"][1]["distance"] > 0.1     # 나머지는 뚜렷이 멀다


def test_distance_is_reported_raw_not_as_a_score():
    """0~1 유사도로 바꾸지 않는다 - 임의의 함수를 하나 더 얹는 일이다."""
    r = aset.duplication([sine(500), sine(4000)], ["a", "b"])
    assert r["min_distance"] > 0
    assert "similarity" not in r and "score" not in r


def test_duplication_needs_two_tracks():
    r = aset.duplication([sine(500)], ["a"])
    assert r["min_distance"] is None and "2개 미만" in r["reason"]


# --- 세트 묶음과 비워둔 칸 ---------------------------------------------------

def test_measure_set_keeps_the_given_order():
    """재생 순서는 스펙이 정한다 - 우리가 정렬하지 않는다."""
    names = ["c", "a", "b", "d", "e"]
    tracks = [sine(f) for f in (500, 900, 1500, 2200, 3000)]
    r = aset.measure_set(tracks, [-23.0] * 5, names)
    assert [t["pair"] for t in r["transitions"]] == [
        ["c", "a"], ["a", "b"], ["b", "d"], ["d", "e"]]
    assert r["max_transition_seam"] is not None
    assert r["worst_transition"] in [t["pair"] for t in r["transitions"]]


def test_the_two_unmeasured_rules_stay_unmeasured_with_reasons():
    """비워둔 칸이 조용히 채워지지 않았는지 - 이 층의 절반이 이거다."""
    r = aset.measure_set([sine(500)] * 5, [-23.0] * 5)
    assert r["tempo_cv"] is None
    assert "배수 오검출" in r["tempo_cv_reason"]
    assert r["key_conflict"] is None
    assert "규칙표" in r["key_conflict_reason"]


# --- 어댑터로 실제 파일에 물린 자리 -----------------------------------------

def _write(path, freq, dbfs=-23.0, secs=1.0):
    import struct
    import wave
    amp = 10 ** (dbfs / 20)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(FS)
        w.writeframes(b"".join(
            struct.pack("<h", int(amp * math.sin(2 * math.pi * freq * t / FS)
                                  * 32767)) for t in range(int(secs * FS))))
    return path


def test_adapter_measures_a_real_folder(tmp_path):
    from tools import artifact_adapter as aa
    for i, freq in enumerate((500, 500, 1200, 2500, 4000)):
        _write(str(tmp_path / f"{i:02d}.wav"), freq,
               dbfs=-23.0 if i < 4 else -33.0)
    r = aa.ADAPTERS["audio_set"]({"dir": str(tmp_path)})
    assert r["n"] == 5
    assert r["loudness"]["loudness_spread"] > 5          # 한 곡이 조용하다
    assert r["duplication"]["closest_pair"] == ["00.wav", "01.wav"]
    assert r["max_transition_seam"] is not None
    assert "audio_set" in aa.PROVIDES
    for key in ("loudness", "duplication", "max_transition_seam"):
        assert key in aa.PROVIDES["audio_set"]


def test_adapter_refuses_a_broken_file_instead_of_guessing(tmp_path):
    from tools import artifact_adapter as aa
    _write(str(tmp_path / "ok.wav"), 500)
    (tmp_path / "bad.wav").write_bytes(b"not a wav")
    with pytest.raises(aa.AdapterError):
        aa.ADAPTERS["audio_set"]({"dir": str(tmp_path)})


def test_adapter_handles_a_mixed_format_set(tmp_path):
    """WAV·FLAC·OGG가 섞여도 같은 지표가 나오고, 읽은 경로를 같이 낸다."""
    sf = pytest.importorskip("soundfile")
    import numpy as np
    from tools import artifact_adapter as aa
    for i, freq in enumerate((500, 500, 1200)):
        _write(str(tmp_path / f"{i:02d}.wav"), freq)
    amp = 10 ** (-23 / 20)
    for name, freq in (("03.flac", 2500), ("04.ogg", 4000)):
        sig = np.asarray([amp * math.sin(2 * math.pi * freq * t / FS)
                          for t in range(FS)])
        sf.write(str(tmp_path / name), sig, FS)
    r = aa.ADAPTERS["audio_set"]({"dir": str(tmp_path)})
    assert r["n"] == 5
    assert r["backends"]["00.wav"] == "stdlib"
    assert r["backends"]["03.flac"] == "soundfile"
    assert r["duplication"]["closest_pair"] == ["00.wav", "01.wav"]
    assert r["loudness"]["loudness_spread"] is not None
