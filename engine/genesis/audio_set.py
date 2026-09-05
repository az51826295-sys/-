"""오디오 세트 층 — 곡 **집합**의 일관성을 잰다. 초안 §3 layer_set.audio

사전 등록: `docs/audio-set-layer-v0-design.md`.
낱개가 전부 통과해도 세트는 망한다. "일관되는가"는 취향이 아니라 **분산**이라
기계가 잘한다 — 그림 세트 층(`genesis/asset_set.py`)과 같은 근거다.

**판정하지 않는다.** 숫자만 내고 문턱은 전부 미동결이다.

다섯 규칙 중 셋을 잰다. 나머지 둘을 왜 비워두는지는 설계 §2에 있다:
`tempo_dispersion`은 BPM 배수 오검출이 입력을 오염시키고, `key_conflict`는
초안이 요구한 규칙표가 없다. 없는 것을 지어내지 않는다.
"""
from __future__ import annotations

from genesis import loop_seam

MIN_SET_N = 5           # 초안 §5 E6. 문턱이 아니라 등록된 적격성 조건
_HALF = loop_seam.WINDOW // 2


def _internal_specs(samples: list, references: int = None) -> list:
    """곡 내부 창들의 로그 스펙트럼. 루프 이음새와 같은 창·같은 규약을 쓴다."""
    refs = loop_seam.REFERENCE_WINDOWS if references is None else references
    win = loop_seam._hann(loop_seam.WINDOW)
    span = len(samples) - loop_seam.WINDOW
    if span <= 0:
        return []
    count = max(2, min(refs, span))
    starts = sorted({int(round(i * span / (count - 1))) for i in range(count)})
    return [loop_seam._log_spectrum(list(samples[s:s + loop_seam.WINDOW]), win)
            for s in starts]


def _mean_spectrum(specs: list) -> list:
    n = len(specs)
    return [sum(s[k] for s in specs) / n for k in range(len(specs[0]))]


def loudness_spread(lufs_values: list) -> dict:
    """세트 LUFS의 최대−최소(LU). 값이 없는 곡은 **빼고 세며 개수를 남긴다**.

    None을 0으로 섞으면 무음 한 곡이 세트 전체를 흔든다 — 그건 측정이 아니라
    사고다.
    """
    out = {"loudness_spread": None, "n_used": 0,
           "n_missing": sum(1 for v in lufs_values if v is None),
           "min": None, "max": None, "reason": None}
    usable = [v for v in lufs_values if v is not None]
    out["n_used"] = len(usable)
    if len(usable) < MIN_SET_N:
        out["reason"] = (f"쓸 수 있는 곡 {len(usable)} < 최소 {MIN_SET_N} - "
                         f"정렬 지표를 내지 않는다(적격성 E6)")
        return out
    out["min"], out["max"] = round(min(usable), 3), round(max(usable), 3)
    out["loudness_spread"] = round(max(usable) - min(usable), 3)
    return out


def transition_seam(a: list, b: list) -> dict:
    """A의 끝이 B의 시작으로 넘어갈 때 튀나. 루프 이음새와 같은 계산·같은 비율.

    기준은 A와 B의 **내부 창들을 합친 것**이다 — 두 곡 자신의 변화량으로
    정규화해야 "이 둘 기준으로 전환이 튀나"가 된다.
    """
    out = {"transition_seam": None, "seam_distance": None,
           "reference_distance": None, "reason": None}
    if len(a) < loop_seam.WINDOW or len(b) < loop_seam.WINDOW:
        out["reason"] = f"창({loop_seam.WINDOW})보다 짧은 곡이 있다"
        return out
    win = loop_seam._hann(loop_seam.WINDOW)
    seam = loop_seam._log_spectrum(list(a[-_HALF:]) + list(b[:_HALF]), win)
    specs = _internal_specs(a) + _internal_specs(b)
    if len(specs) < 2:
        out["reason"] = "기준 창이 2개 미만이라 내부 변화량을 못 구한다"
        return out
    seam_d = sum(loop_seam._distance(seam, s) for s in specs) / len(specs)
    pairs = [(i, j) for i in range(len(specs)) for j in range(i + 1, len(specs))]
    ref_d = sum(loop_seam._distance(specs[i], specs[j]) for i, j in pairs) / len(pairs)
    out["seam_distance"] = round(seam_d, 6)
    out["reference_distance"] = round(ref_d, 6)
    if ref_d <= 1e-12:
        out["reason"] = "두 곡의 내부 변화량이 0이라 비율을 낼 수 없다"
        return out
    out["transition_seam"] = round(seam_d / ref_d, 6)
    return out


def duplication(tracks: list, names: list | None = None) -> dict:
    """가장 닮은 두 곡과 그 거리. 거리를 그대로 낸다 — 0~1 점수로 바꾸지 않는다.

    작을수록 닮았다. 같은 곡을 두 번 넣으면 0에 가깝다.
    """
    names = names or [f"track{i}" for i in range(len(tracks))]
    out = {"min_distance": None, "closest_pair": None, "distances": [],
           "n_used": 0, "reason": None}
    means, used = [], []
    for name, samples in zip(names, tracks):
        specs = _internal_specs(samples)
        if len(specs) >= 1:
            means.append(_mean_spectrum(specs))
            used.append(name)
    out["n_used"] = len(used)
    if len(used) < 2:
        out["reason"] = "비교할 곡이 2개 미만이다"
        return out
    rows = []
    for i in range(len(used)):
        for j in range(i + 1, len(used)):
            rows.append({"pair": [used[i], used[j]],
                         "distance": round(loop_seam._distance(means[i],
                                                               means[j]), 6)})
    rows.sort(key=lambda r: r["distance"])
    out["distances"] = rows
    out["min_distance"] = rows[0]["distance"]
    out["closest_pair"] = rows[0]["pair"]
    return out


def measure_set(tracks: list, lufs_values: list | None = None,
                names: list | None = None) -> dict:
    """세트 하나의 지표 묶음. 순서는 **주어진 순서**를 쓴다.

    재생 순서는 스펙이 정하는 것이지 우리가 정렬하지 않는다.
    """
    names = names or [f"track{i}" for i in range(len(tracks))]
    out = {"n": len(tracks), "min_set_n": MIN_SET_N,
           "loudness": loudness_spread(lufs_values or []),
           "duplication": duplication(tracks, names),
           "transitions": [], "max_transition_seam": None,
           "worst_transition": None,
           "tempo_cv": None,
           "tempo_cv_reason": ("미측정 - BPM 배수 오검출(150↔75)이 구조적으로 "
                               "남아 있어, 오염된 입력으로 만든 분산은 분산이 "
                               "아니다(설계 §2)"),
           "key_conflict": None,
           "key_conflict_reason": ("미측정 - 초안이 요구한 조성 불협 규칙표가 "
                                   "없다. 없는 표를 지어내지 않는다")}
    for i in range(len(tracks) - 1):
        row = transition_seam(tracks[i], tracks[i + 1])
        row["pair"] = [names[i], names[i + 1]]
        out["transitions"].append(row)
    scored = [r for r in out["transitions"] if r["transition_seam"] is not None]
    if scored:
        worst = max(scored, key=lambda r: r["transition_seam"])
        out["max_transition_seam"] = worst["transition_seam"]
        out["worst_transition"] = worst["pair"]
    return out
