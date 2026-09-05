"""게이트된 라우드니스(LUFS) — ITU-R BS.1770-4를 그대로 옮긴 계산.

사전 등록: `docs/lufs-v0-design.md`. 08-25부터 "미측정"으로 선언해 둔 칸을
채운다 — **RMS를 LUFS라고 부르지 않는다**는 조항은 그대로고, 대신 표준의
K-가중 + 게이팅을 실제로 구현한다.

의존성 없음(표준 라이브러리만). 표본율마다 계수를 아날로그 원형에서 다시
계산하므로 48 kHz 밖에서도 맞다.

  from genesis import loudness
  loudness.integrated([[l0, l1, ...], [r0, r1, ...]], 48000)   # -14.3 같은 값
"""
from __future__ import annotations

import math

# 표준의 아날로그 원형 상수(BS.1770-4). 내가 고른 숫자가 아니다.
_SHELF_F0 = 1681.974450955533
_SHELF_G_DB = 3.999843853973347
_SHELF_Q = 0.7071752369554196
_HPF_F0 = 38.13547087602444
_HPF_Q = 0.5003270373238773

BLOCK_S = 0.400            # 블록 길이
STEP_S = 0.100             # 75% 겹침
ABSOLUTE_GATE_LUFS = -70.0
RELATIVE_GATE_LU = -10.0
OFFSET = -0.691            # 표준의 상수항

# 채널 가중치. 우리 자산은 모노/스테레오뿐이지만 정의는 표준대로 둔다.
CHANNEL_WEIGHTS = (1.0, 1.0, 1.0, 1.41, 1.41)


def shelf_coefficients(fs: float) -> tuple:
    """1단: 고역 셸빙. (b, a) 각각 3개짜리, a[0]=1로 정규화."""
    k = math.tan(math.pi * _SHELF_F0 / fs)
    vh = 10.0 ** (_SHELF_G_DB / 20.0)
    vb = vh ** 0.4996667741545416
    den = 1.0 + k / _SHELF_Q + k * k
    b = ((vh + vb * k / _SHELF_Q + k * k) / den,
         2.0 * (k * k - vh) / den,
         (vh - vb * k / _SHELF_Q + k * k) / den)
    a = (1.0,
         2.0 * (k * k - 1.0) / den,
         (1.0 - k / _SHELF_Q + k * k) / den)
    return b, a


def highpass_coefficients(fs: float) -> tuple:
    """2단: 고역 통과(RLB). 분자는 표준대로 (1, -2, 1)."""
    k = math.tan(math.pi * _HPF_F0 / fs)
    den = 1.0 + k / _HPF_Q + k * k
    a = (1.0,
         2.0 * (k * k - 1.0) / den,
         (1.0 - k / _HPF_Q + k * k) / den)
    return (1.0, -2.0, 1.0), a


def biquad(samples, b, a) -> list:
    """직접형 I. 상태는 0에서 시작한다(표준의 관례)."""
    x1 = x2 = y1 = y2 = 0.0
    out = []
    b0, b1, b2 = b
    _a0, a1, a2 = a
    for x0 in samples:
        y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        out.append(y0)
        x2, x1 = x1, x0
        y2, y1 = y1, y0
    return out


def k_weight(samples, fs: float) -> list:
    """K-가중 = 셸빙 → 고역통과. 순서가 바뀌면 값이 달라진다."""
    b, a = shelf_coefficients(fs)
    stage1 = biquad(samples, b, a)
    b, a = highpass_coefficients(fs)
    return biquad(stage1, b, a)


def _block_mean_squares(channel: list, fs: float) -> list:
    """400 ms 블록의 평균 제곱 목록(100 ms 간격). 꼬리의 짧은 조각은 버린다."""
    n = int(round(BLOCK_S * fs))
    step = int(round(STEP_S * fs))
    if n <= 0 or len(channel) < n:
        return []
    out = []
    for start in range(0, len(channel) - n + 1, step):
        window = channel[start:start + n]
        out.append(sum(v * v for v in window) / n)
    return out


def _loudness(zs: list, weights: tuple) -> float | None:
    total = sum(w * z for w, z in zip(weights, zs))
    if total <= 0:
        return None
    return OFFSET + 10.0 * math.log10(total)


def integrated(channels: list, fs: float) -> dict:
    """적분 라우드니스. 게이트를 통과한 블록이 없으면 값이 아니라 None.

    channels: 채널별 표본 목록(−1.0~1.0). 모노면 [ [..] ].
    반환: {"lufs": float|None, "blocks": 총 블록, "gated_blocks": 남은 블록,
           "reason": 값이 없을 때의 사유}
    """
    out = {"lufs": None, "blocks": 0, "gated_blocks": 0, "reason": None,
           "sample_rate": fs, "channels": len(channels)}
    if not channels or not channels[0]:
        out["reason"] = "표본이 없다"
        return out
    if fs <= 0:
        out["reason"] = "표본율이 0 이하다"
        return out

    weights = CHANNEL_WEIGHTS[:len(channels)]
    per_channel = [_block_mean_squares(k_weight(ch, fs), fs)
                   for ch in channels]
    counts = {len(z) for z in per_channel}
    if counts == {0}:
        out["reason"] = (f"400 ms 블록을 하나도 못 만든다 "
                         f"(길이 {len(channels[0]) / fs:.3f}초)")
        return out
    n_blocks = min(counts)
    out["blocks"] = n_blocks

    # 블록별 라우드니스 → 절대 게이트
    block_l, block_z = [], []
    for i in range(n_blocks):
        zs = [ch[i] for ch in per_channel]
        loud = _loudness(zs, weights)
        block_z.append(zs)
        block_l.append(loud)
    kept = [i for i, loud in enumerate(block_l)
            if loud is not None and loud > ABSOLUTE_GATE_LUFS]
    if not kept:
        out["reason"] = f"절대 게이트({ABSOLUTE_GATE_LUFS} LUFS)를 넘는 블록이 없다"
        return out

    # 상대 게이트 = 절대 게이트 통과분의 라우드니스 − 10 LU
    def mean_z(idxs):
        return [sum(block_z[i][c] for i in idxs) / len(idxs)
                for c in range(len(channels))]

    relative = _loudness(mean_z(kept), weights)
    if relative is None:
        out["reason"] = "상대 게이트 기준을 못 구했다"
        return out
    gate = relative + RELATIVE_GATE_LU
    final = [i for i in kept if block_l[i] > gate]
    if not final:
        out["reason"] = f"상대 게이트({gate:.2f} LUFS)를 넘는 블록이 없다"
        return out

    out["gated_blocks"] = len(final)
    value = _loudness(mean_z(final), weights)
    out["lufs"] = None if value is None else round(value, 3)
    if out["lufs"] is None:
        out["reason"] = "게이트 통과분의 에너지가 0이다"
    return out
