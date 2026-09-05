"""오디오 로더 시험 — 설계: docs/audio-set-layer-v0-design.md 부록 A.

여기서 고정하는 것:
- WAV는 **의존성 없이** 읽힌다(그 경로가 사라지면 다른 기계에서 값이 안 나온다).
- 표준 라이브러리가 못 여는 것은 soundfile로 넘어가고, 없으면 **값이 아니라 사유**.
- 어느 경로로 읽었는지(`backend`)를 항상 낸다.
"""
import math
import os
import struct
import sys
import wave

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from genesis import audio_io                             # noqa: E402

FS = 48000


def tone(freq=500.0, secs=0.5, dbfs=-23.0):
    amp = 10 ** (dbfs / 20)
    return [amp * math.sin(2 * math.pi * freq * t / FS)
            for t in range(int(secs * FS))]


def write_pcm16(path, signal, channels=1):
    with wave.open(path, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(FS)
        w.writeframes(b"".join(struct.pack("<h", int(v * 32767)) * channels
                               for v in signal))
    return path


def test_wav_reads_without_any_dependency(tmp_path):
    r = audio_io.load_channels(write_pcm16(str(tmp_path / "a.wav"), tone()))
    assert r["backend"] == "stdlib"          # 의존성 없이 도는 경로
    assert r["error"] is None
    assert r["sample_rate"] == FS
    assert len(r["channels"]) == 1
    assert max(abs(v) for v in r["channels"][0]) == pytest.approx(
        10 ** (-23 / 20), abs=0.01)


def test_stereo_channels_are_kept_separate(tmp_path):
    r = audio_io.load_channels(
        write_pcm16(str(tmp_path / "s.wav"), tone(), channels=2))
    assert len(r["channels"]) == 2
    assert r["channels"][0] == r["channels"][1]


def test_mono_folds_but_channels_stay_available(tmp_path):
    r = audio_io.load_mono(
        write_pcm16(str(tmp_path / "s.wav"), tone(), channels=2))
    assert r["mono"] is not None
    assert len(r["channels"]) == 2       # 라우드니스는 접힌 걸 쓰면 안 된다


def test_missing_file_is_a_reason_not_an_exception(tmp_path):
    r = audio_io.load_channels(str(tmp_path / "없다.wav"))
    assert r["channels"] is None
    assert "파일이 없다" in r["error"]


def test_unreadable_file_says_which_paths_were_tried(tmp_path):
    p = tmp_path / "broken.wav"
    p.write_bytes(b"not a wav at all")
    r = audio_io.load_channels(str(p))
    assert r["channels"] is None
    assert "stdlib(" in r["error"] and "soundfile(" in r["error"]


def test_non_wav_needs_the_decoder(tmp_path):
    """디코더가 없으면 값을 지어내지 않고 사유를 낸다."""
    ok, _why = audio_io.soundfile_available()
    p = tmp_path / "x.ogg"
    p.write_bytes(b"OggS" + b"\x00" * 32)
    r = audio_io.load_channels(str(p))
    assert r["channels"] is None
    if not ok:
        assert "디코더 없음" in r["error"]


def test_soundfile_path_handles_what_stdlib_cannot(tmp_path):
    """24비트 WAV는 표준 라이브러리가 못 연다 → soundfile로 넘어간다."""
    sf = pytest.importorskip("soundfile")
    import numpy as np
    path = str(tmp_path / "deep.wav")
    sf.write(path, np.asarray(tone()), FS, subtype="PCM_24")
    r = audio_io.load_channels(path)
    assert r["backend"] == "soundfile"
    assert r["error"] is None


def test_compressed_formats_load(tmp_path):
    sf = pytest.importorskip("soundfile")
    import numpy as np
    for name in ("a.flac", "b.ogg"):
        path = str(tmp_path / name)
        sf.write(path, np.asarray(tone()), FS)
        r = audio_io.load_mono(path)
        assert r["backend"] == "soundfile", name
        assert r["mono"] and r["error"] is None
