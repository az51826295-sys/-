"""참피크(dBTP) — 표본 **사이**에 숨은 봉우리까지 본다.

사전 등록: `docs/true-peak-v0-design.md`. BS.1770-4 부록 2의 4배 오버샘플
추정을 표준 라이브러리만으로 구현한다. `audio_probe`의 librosa 경로와 같은
값을 내야 하고, 두 경로가 서로의 검증이 된다.

**표본 피크와 다른 값이다.** 표본 피크는 우리가 가진 점들의 최대이고, 참피크는
그 점들 사이를 복원했을 때의 최대다. 디지털이 0 dBFS를 안 넘어도 D/A 뒤에서
클리핑이 나는 이유가 이 차이다.

  from genesis import true_peak
  true_peak.measure(samples)      # {"true_peak_dbtp": -0.4, ...}
"""
from __future__ import annotations

import math

OVERSAMPLE = 4             # 동결(설계 §1)
TAPS_PER_PHASE = 32        # 위상당 탭 수
KAISER_BETA = 8.0


def _bessel_i0(x: float) -> float:
    """0차 변형 베셀 함수. 카이저 창에 필요한 만큼의 급수 전개."""
    total, term = 1.0, 1.0
    for k in range(1, 40):
        term *= (x / (2 * k)) ** 2
        total += term
        if term < 1e-16 * total:
            break
    return total


def polyphase_filters(oversample: int = OVERSAMPLE,
                      taps: int = TAPS_PER_PHASE,
                      beta: float = KAISER_BETA) -> list:
    """위상별 보간 계수. phase 0은 원래 표본을 그대로 통과시킨다.

    윈도우드 sinc: 이상적 보간기 sinc를 카이저 창으로 잘라 쓴다. 창이 없으면
    잘린 자리에서 물결이 생겨 없던 봉우리가 보인다.
    """
    half = taps // 2
    denom = _bessel_i0(beta)
    out = []
    for phase in range(oversample):
        frac = phase / oversample
        coeffs = []
        for i in range(-half + 1, half + 1):
            x = i - frac
            sinc = 1.0 if abs(x) < 1e-12 else math.sin(math.pi * x) / (math.pi * x)
            # 카이저 창(창 중심을 frac만큼 옮긴 좌표계에서)
            r = (i - frac + half) / half - 1.0
            r = max(-1.0, min(1.0, r))
            win = _bessel_i0(beta * math.sqrt(max(0.0, 1 - r * r))) / denom
            coeffs.append(sinc * win)
        gain = sum(coeffs)
        out.append([c / gain for c in coeffs] if gain else coeffs)
    return out


def upsample_peak_pure(samples: list, oversample: int = OVERSAMPLE) -> float:
    """오버샘플된 신호의 절대 최대값(표준 라이브러리만).

    전체 신호를 만들지 않고 최대만 추적한다. 느리다 — 오디오 1초에 4~5초.
    numpy가 있으면 `upsample_peak`이 빠른 경로를 쓰고, 이 함수는 **그 경로가
    맞는지 대조하는 기준**으로 남는다(둘이 같은 값을 낸다는 테스트가 있다).
    """
    filters = polyphase_filters(oversample)
    taps = len(filters[0])
    half = taps // 2
    n = len(samples)
    peak = 0.0
    for i in range(n):
        for phase, coeffs in enumerate(filters):
            if phase == 0:
                value = samples[i]          # 원래 표본은 그대로
            else:
                value = 0.0
                for k, c in enumerate(coeffs):
                    j = i + k - half + 1
                    if 0 <= j < n:
                        value += samples[j] * c
            if abs(value) > peak:
                peak = abs(value)
    return peak


def upsample_peak(samples: list, oversample: int = OVERSAMPLE) -> float:
    """같은 값을 내되, numpy가 있으면 벡터 연산으로 낸다.

    numpy는 **선택**이다. 없으면 순수 파이썬 경로로 떨어지고 값은 같다 —
    빠른 경로가 없다고 판정이 달라지면 그건 기계마다 다른 심판이 된다.
    """
    try:
        import numpy as np
    except ImportError:
        return upsample_peak_pure(samples, oversample)

    filters = polyphase_filters(oversample)
    taps = len(filters[0])
    half = taps // 2
    x = np.asarray(samples, dtype=np.float64)
    peak = float(np.max(np.abs(x))) if x.size else 0.0
    # 경계에서 창이 신호 밖을 물지 않도록 0으로 채운다(순수 경로와 같은 규약).
    padded = np.concatenate([np.zeros(half), x, np.zeros(half)])
    for phase, coeffs in enumerate(filters):
        if phase == 0:
            continue                        # 원래 표본은 이미 봤다
        conv = np.convolve(padded, np.asarray(coeffs, dtype=np.float64)[::-1],
                           mode="valid")
        # valid 결과의 첫 항이 i=0에 대응하도록 자른다
        conv = conv[:x.size]
        if conv.size:
            peak = max(peak, float(np.max(np.abs(conv))))
    return peak


def measure(samples: list, oversample: int = OVERSAMPLE) -> dict:
    """참피크(dBTP)와 표본 피크를 같이 낸다 — 둘의 차이가 이 계산의 값어치다."""
    out = {"true_peak_dbtp": None, "sample_peak_dbfs": None,
           "true_peak_linear": None, "oversample": oversample,
           "taps_per_phase": TAPS_PER_PHASE, "kaiser_beta": KAISER_BETA,
           "reason": None}
    if not samples:
        out["reason"] = "표본이 없다"
        return out
    sample_peak = max(abs(v) for v in samples)
    if sample_peak <= 0:
        out["reason"] = "무음 - 피크가 0이라 dB로 옮길 수 없다"
        return out
    out["sample_peak_dbfs"] = round(20 * math.log10(sample_peak), 3)
    peak = upsample_peak(samples, oversample)
    out["true_peak_linear"] = round(peak, 6)
    out["true_peak_dbtp"] = round(20 * math.log10(peak), 3)
    return out
