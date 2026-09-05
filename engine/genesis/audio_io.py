"""오디오 로더 하나 — 어느 경로로 읽었는지를 항상 같이 낸다.

사전 등록: `docs/audio-set-layer-v0-design.md` 부록 A.

두 경로가 있다:
  stdlib      16비트 PCM WAV. **의존성 없이** 도는 경로 — 지운다면 서버·다른
              기계에서 값이 안 나오는 상황이 생긴다.
  soundfile   그 밖의 것(24비트·부동소수 WAV, flac/ogg/mp3 …). 없으면 값이
              아니라 사유를 낸다.

값만 보고 원인을 못 찾는 일이 없도록 `backend`를 항상 붙인다. 같은 파일이
기계에 따라 다른 경로로 읽힐 수 있기 때문이다.

**mp3 정직 조항**: 인코더가 앞뒤에 무음을 덧붙이므로 디코드하면 원본에 없던
여백이 생긴다. 우리 오차가 아니라 포맷의 성질이고, 보정하지 않는다 — 보정하면
모르는 인코더 관례를 추측하는 셈이다.
"""
from __future__ import annotations

import array
import os
import wave

FULL_SCALE = 32768.0


def soundfile_available() -> tuple:
    try:
        import soundfile                                  # noqa: F401
    except ImportError as exc:
        return False, f"의존성 없음: {exc.name}"
    return True, None


def _read_stdlib(path: str):
    """(채널별 표본, 표본율) 또는 (None, 사유). 16비트 PCM WAV만."""
    try:
        with wave.open(path, "rb") as wf:
            ch, width, sr = (wf.getnchannels(), wf.getsampwidth(),
                             wf.getframerate())
            raw = wf.readframes(wf.getnframes())
    except (wave.Error, OSError, EOFError) as exc:
        return None, f"표준 라이브러리로 못 연다: {type(exc).__name__}: {exc}"
    if width != 2:
        return None, f"16비트 PCM이 아니다({width * 8}비트)"
    samples = array.array("h")
    samples.frombytes(raw[:len(raw) - (len(raw) % 2)])
    if not samples:
        return None, "표본이 0개다"
    channels = [[samples[i] / FULL_SCALE for i in range(c, len(samples), ch)]
                for c in range(ch)]
    return (channels, sr), None


def _read_soundfile(path: str):
    ok, why = soundfile_available()
    if not ok:
        return None, f"디코더 없음 - {why}"
    import soundfile as sf

    try:
        data, sr = sf.read(path, always_2d=True, dtype="float64")
    except (RuntimeError, OSError) as exc:
        return None, f"디코딩 실패: {type(exc).__name__}: {exc}"
    if data.size == 0:
        return None, "표본이 0개다"
    channels = [[float(v) for v in data[:, c]] for c in range(data.shape[1])]
    return (channels, sr), None


def load_channels(path: str) -> dict:
    """파일 하나 → 채널별 표본(−1.0~1.0) + 표본율 + 읽은 경로.

    실패는 예외가 아니라 `error`다 — 미측정은 탈락이 아니므로 호출자가
    사유를 그대로 리포트에 옮길 수 있어야 한다.
    """
    out = {"channels": None, "sample_rate": None, "backend": None,
           "error": None, "path": path}
    if not os.path.isfile(path):
        out["error"] = f"파일이 없다: {path}"
        return out

    tried = []
    if path.lower().endswith(".wav"):
        loaded, why = _read_stdlib(path)
        if loaded:
            out["channels"], out["sample_rate"] = loaded
            out["backend"] = "stdlib"
            return out
        tried.append(f"stdlib({why})")

    loaded, why = _read_soundfile(path)
    if loaded:
        out["channels"], out["sample_rate"] = loaded
        out["backend"] = "soundfile"
        return out
    tried.append(f"soundfile({why})")
    out["error"] = "못 읽는다 - " + " / ".join(tried)
    return out


def load_mono(path: str) -> dict:
    """채널 평균 한 줄. 라우드니스는 채널을 접으면 안 되므로 **여기서 안 쓴다** —
    이음새·중복처럼 파형 하나면 되는 지표용이다."""
    out = load_channels(path)
    if out["channels"] is None:
        out["mono"] = None
        return out
    chans = out["channels"]
    n = len(chans)
    out["mono"] = ([sum(c[i] for c in chans) / n
                    for i in range(len(chans[0]))] if n > 1 else list(chans[0]))
    return out
