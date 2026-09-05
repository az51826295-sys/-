"""루프 이음새 — 끝이 시작으로 이어 붙을 때 소리가 튀나.

사전 등록: `docs/loop-seam-v0-design.md`. 자산 심판 초안 §2의
`audio.mechanical.loop_seam`은 규칙 문장만 있고 **재는 도구가 없었다.**

여기서 내는 것은 값이지 판정이 아니다. `THRESH_SEAM`은 미동결이고, 루프가
아닌 곡에는 **적용하지 않는다**(초안: undefined 아님, 미적용).

의존성 없음 — DFT도 직접 돈다. 창이 1024 표본이라 순수 파이썬으로 충분하다.

  from genesis import loop_seam
  loop_seam.measure(samples, 48000)   # {"seam_spectral": 1.02, ...}
"""
from __future__ import annotations

import cmath
import math

WINDOW = 1024              # 창 길이(표본). 동결 — 결과를 보고 바꾸지 않는다
REFERENCE_WINDOWS = 16     # 곡 내부 기준 창 개수
_EPS = 1e-12


def _hann(n: int) -> list:
    if n < 2:
        return [1.0] * n
    return [0.5 - 0.5 * math.cos(2 * math.pi * i / (n - 1)) for i in range(n)]


def _fft(values: list) -> list:
    """반복형 쿨리-투키(기수 2). 길이가 2의 거듭제곱일 때만 쓴다.

    O(n²) 직접 계산으로 시작했더니 측정 하나에 4.5초가 걸렸다 — 오늘 세운
    루프 속도 정책(docs/test-loop-policy.md)에 우리가 걸린다. 창이 1024라
    n log n이면 100배 가까이 줄어든다.
    """
    n = len(values)
    a = [complex(v) for v in values]
    # 비트 역순 재배열
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j |= bit
        if i < j:
            a[i], a[j] = a[j], a[i]
    length = 2
    while length <= n:
        step = cmath.exp(-2j * math.pi / length)
        for start in range(0, n, length):
            w = 1 + 0j
            for k in range(start, start + length // 2):
                u = a[k]
                v = a[k + length // 2] * w
                a[k] = u + v
                a[k + length // 2] = u - v
                w *= step
        length <<= 1
    return a


def _dft_magnitudes(frame: list) -> list:
    """크기 스펙트럼(0~나이키스트). 2의 거듭제곱이면 FFT, 아니면 직접 계산."""
    n = len(frame)
    half = n // 2 + 1
    if n and (n & (n - 1)) == 0:
        return [abs(v) for v in _fft(frame)[:half]]
    out = []
    for k in range(half):
        acc = 0j
        step = -2j * math.pi * k / n
        for i, v in enumerate(frame):
            acc += v * cmath.exp(step * i)
        out.append(abs(acc))
    return out


def _log_spectrum(frame: list, window: list) -> list:
    mags = _dft_magnitudes([v * w for v, w in zip(frame, window)])
    return [math.log10(m + _EPS) for m in mags]


def _distance(a: list, b: list) -> float:
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


def measure(samples: list, sample_rate: float,
            window: int = WINDOW,
            references: int = REFERENCE_WINDOWS) -> dict:
    """이음새가 곡 안의 다른 자리보다 얼마나 튀나.

    반환의 `seam_spectral`은 **비율**이다: 이음새 창의 스펙트럼 거리를 곡 내부
    창들끼리의 평균 거리로 나눈 값. 1 근처면 이음새가 곡 안의 아무 자리와
    다를 바 없다는 뜻이고, 크면 이음새에서 내용이 튄다는 뜻이다.

    절대 거리(`seam_distance`)도 같이 낸다 — 비율만 보면 원래 변화가 큰 곡에서
    이음새가 묻힐 수 있으므로, 판단 재료를 감추지 않는다.
    """
    out = {"seam_spectral": None, "seam_distance": None,
           "reference_distance": None, "seam_step": None,
           "window": window, "references_used": 0, "reason": None,
           "sample_rate": sample_rate}
    n = len(samples or [])
    if n < window * 2:
        out["reason"] = (f"창 두 개를 못 만든다(표본 {n} < {window * 2}) - "
                         f"이음새를 곡 내부와 비교할 수 없다")
        return out

    half = window // 2
    out["seam_step"] = round(abs(samples[-1] - samples[0]), 6)

    win = _hann(window)
    seam_frame = list(samples[-half:]) + list(samples[:half])
    seam_spec = _log_spectrum(seam_frame, win)

    # 기준 창: 곡 내부를 고르게 나눈 지점들. 이음새를 걸치지 않도록 끝을 비워둔다.
    span = n - window
    if span <= 0:
        out["reason"] = "곡 내부에서 기준 창을 못 만든다"
        return out
    count = max(2, min(references, span))
    starts = sorted({int(round(i * span / (count - 1)))
                     for i in range(count)})
    specs = [_log_spectrum(list(samples[s:s + window]), win) for s in starts]
    out["references_used"] = len(specs)
    if len(specs) < 2:
        out["reason"] = "기준 창이 2개 미만이라 곡 내부 변화량을 못 구한다"
        return out

    seam_d = sum(_distance(seam_spec, s) for s in specs) / len(specs)
    pairs = [(i, j) for i in range(len(specs)) for j in range(i + 1, len(specs))]
    ref_d = sum(_distance(specs[i], specs[j]) for i, j in pairs) / len(pairs)
    out["seam_distance"] = round(seam_d, 6)
    out["reference_distance"] = round(ref_d, 6)
    if ref_d <= _EPS:
        # 곡 내부가 완전히 균일하다(합성 시료 등). 나눌 수가 없다.
        out["reason"] = ("곡 내부 변화량이 0이라 비율을 낼 수 없다 - "
                         "절대 거리(seam_distance)로 보라")
        return out
    out["seam_spectral"] = round(seam_d / ref_d, 6)
    return out
