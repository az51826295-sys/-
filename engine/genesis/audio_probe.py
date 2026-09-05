"""오디오 확장 측정 — librosa/soundfile이 있을 때만 도는 층 (2026-08-26 결정 D).

`genesis/asset_probe.py`는 표준 라이브러리만으로 잴 수 있는 것을 잰다(16비트 PCM
WAV). 이 모듈은 그 위에 **의존성이 있어야 재지는 것**만 얹는다:

  - 비WAV 디코딩(flac/ogg/mp3 등 libsndfile이 여는 것)
  - BPM(librosa 비트 추적) — 배수 오검출은 여전히 남는다. 후보를 같이 낸다
  - 조성(크럼한슬-슈머클러 상관) — 상관 차가 작으면 **값을 내지 않는다**
  - (참피크는 2026-08-26부터 genesis/true_peak.py로 통일 — 여기서 librosa
    리샘플러를 쓰지 않는다. 한 필드에 구현이 둘이면 값이 갈린다)

정직 조항:
- **LUFS는 2026-08-26부터 잰다** — librosa에는 없으므로 `genesis/loudness.py`가
  BS.1770-4를 직접 구현한다(설계 docs/lufs-v0-design.md, EBU Tech 3341 시험 1로
  검증). RMS를 LUFS라고 부르지 않는다는 조항은 그대로다. 문턱은 미동결이라
  값만 내고 판정하지 않는다.
- 조성 추정은 추정이다. 화성 진행·전조를 보지 않는 단일 벡터 상관이다.
- 라이브러리가 없으면 값을 만들지 않고 `error`에 없다고 적는다(미측정 ≠ 탈락).
"""
from __future__ import annotations

import math
import os

# 크럼한슬-슈머클러 조성 프로파일(장/단). 문헌값 그대로, 우리가 고른 숫자가 아니다.
_KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66,
             2.29, 2.88]
_KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69,
             3.34, 3.17]
_PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
# 1·2위 상관 차가 이보다 작으면 조성을 말하지 않는다(미결정). 측정 관례이지
# 통과/탈락 문턱이 아니다 - 리포트에 같이 낸다.
KEY_MARGIN = 0.05


from genesis import loudness
from genesis import true_peak                              # noqa: E402


def available() -> tuple:
    """(librosa 있나, 사유). 없으면 이 모듈의 값은 전부 미측정이다."""
    try:
        import librosa                                   # noqa: F401
        import soundfile                                 # noqa: F401
    except ImportError as exc:
        return False, f"의존성 없음: {exc.name}"
    return True, None


def _correlate(vec: list, profile: list, shift: int) -> float:
    """벡터와 프로파일의 피어슨 상관(프로파일을 shift만큼 돌려서)."""
    rot = profile[-shift:] + profile[:-shift] if shift else list(profile)
    n = len(vec)
    mv, mp = sum(vec) / n, sum(rot) / n
    num = sum((vec[i] - mv) * (rot[i] - mp) for i in range(n))
    den = math.sqrt(sum((v - mv) ** 2 for v in vec)
                    * sum((p - mp) ** 2 for p in rot))
    return num / den if den else 0.0


def estimate_key(chroma_mean: list, margin: float = KEY_MARGIN) -> dict:
    """크로마 평균 12값 → 조성 추정. 1·2위가 가까우면 **미결정으로 남긴다**."""
    scores = []
    for i in range(12):
        scores.append((_correlate(chroma_mean, _KS_MAJOR, i),
                       f"{_PITCHES[i]} major"))
        scores.append((_correlate(chroma_mean, _KS_MINOR, i),
                       f"{_PITCHES[i]} minor"))
    scores.sort(reverse=True)
    best, second = scores[0], scores[1]
    gap = round(best[0] - second[0], 6)
    decided = gap >= margin
    return {"key": best[1] if decided else None,
            "key_correlation": round(best[0], 6),
            "key_runner_up": second[1], "key_gap": gap,
            "key_margin": margin,
            "key_undecided_reason": None if decided else
            f"1·2위 상관 차 {gap} < {margin} - 조성을 말하지 않는다"}


def measure_audio(path: str) -> dict:
    """확장 측정. 라이브러리가 없거나 파일을 못 열면 error에 적고 값은 비운다."""
    out = {"error": None, "backend": None, "format": None,
           "duration_s": None, "sample_rate": None, "channels": None,
           "bpm": None, "bpm_candidates": [], "beat_count": None,
           "key": None, "key_correlation": None, "key_runner_up": None,
           "key_gap": None, "key_margin": KEY_MARGIN,
           "key_undecided_reason": None,
           "true_peak_dbtp": None, "true_peak_reason": None,
           "true_peak_oversample": 4,
           "lufs": None, "lufs_reason": None}
    ok, why = available()
    if not ok:
        out["error"] = why
        out["lufs_reason"] = f"미측정 - {why}(디코딩을 못 한다)"
        return out
    if not os.path.isfile(path):
        out["error"] = f"파일이 없다: {path}"
        out["lufs_reason"] = "미측정 - 파일이 없다"
        return out

    import librosa
    import numpy as np
    import soundfile as sf

    try:
        info = sf.info(path)
        data, sr = sf.read(path, always_2d=True, dtype="float64")
    except (RuntimeError, OSError) as exc:
        out["error"] = f"디코딩 실패: {type(exc).__name__}: {exc}"
        return out
    if data.size == 0:
        out["error"] = "표본이 0개다"
        return out

    out.update(backend="soundfile", format=info.format,
               sample_rate=sr, channels=data.shape[1],
               duration_s=round(data.shape[0] / sr, 6))

    # 게이트된 라우드니스는 우리 구현으로 잰다(BS.1770-4, docs/lufs-v0-design.md).
    # 채널을 그대로 넘긴다 - 표준의 채널 합은 채널별 제곱의 합이라 모노로 접으면
    # 값이 달라진다.
    loud = loudness.integrated(
        [[float(v) for v in data[:, c]] for c in range(data.shape[1])], sr)
    out["lufs"] = loud["lufs"]
    out["lufs_reason"] = loud["reason"]

    mono = data.mean(axis=1)

    try:
        tempo, beats = librosa.beat.beat_track(y=mono, sr=sr)
        bpm = float(np.atleast_1d(tempo)[0])
        out["bpm"] = round(bpm, 2)
        # 배수 오검출은 여기서 안 풀린다(초안 §6: fail이 아니라 undefined).
        out["bpm_candidates"] = [round(bpm / 2, 2), round(bpm, 2),
                                 round(bpm * 2, 2)]
        out["beat_count"] = int(len(beats))
    except Exception as exc:                    # noqa: BLE001 - 원인을 적어 남긴다
        out["error"] = f"BPM 추정 실패: {type(exc).__name__}: {exc}"

    try:
        chroma = librosa.feature.chroma_cqt(y=mono, sr=sr)
        out.update(estimate_key([float(v) for v in chroma.mean(axis=1)]))
    except Exception as exc:                    # noqa: BLE001
        out["key_undecided_reason"] = (
            f"크로마 추출 실패: {type(exc).__name__}: {exc}")

    # 참피크는 **우리 구현**으로 통일한다(genesis/true_peak.py, 2026-08-26).
    # 한 필드에 구현이 둘이면 경로에 따라 값이 갈리고, 그때 "어느 게 맞나"에
    # 답할 수가 없다. librosa 리샘플러와 우리 구현이 ±0.3 dB 이내로 같다는
    # 것은 테스트가 따로 확인한다(tests/test_true_peak.py) — 대조는 남기되
    # 값을 내는 곳은 하나다.
    peak_row = true_peak.measure([float(v) for v in mono])
    out["true_peak_dbtp"] = peak_row["true_peak_dbtp"]
    out["true_peak_reason"] = peak_row["reason"]
    out["true_peak_oversample"] = peak_row["oversample"]
    return out
